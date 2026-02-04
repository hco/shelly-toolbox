import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type { Device, DeviceCommand, AuthStatus, UnprovisionedDevice } from '@/shared/types.js';
import { mdnsDiscovery, type MdnsDevice } from './mdnsDiscovery.js';
import { configService } from './configService.js';
import { wifiScanService, type ShellyAccessPoint } from './wifiScanService.js';

class ShellyService extends EventEmitter {
  private devices: Map<string, Device> = new Map();
  private unprovisionedDevices: Map<string, UnprovisionedDevice> = new Map();
  private autoProvisioningEnabled = false;

  constructor() {
    super();
    this.setupMdnsListeners();
    mdnsDiscovery.start();
  }

  async enableAutoProvisioning(): Promise<boolean> {
    if (this.autoProvisioningEnabled) {
      return true;
    }

    const initialized = await wifiScanService.initialize();
    if (!initialized) {
      console.log('[ShellyService] Auto-provisioning not available (WiFi scanning unavailable)');
      return false;
    }

    this.setupWifiScanListeners();
    await wifiScanService.startScanning();
    this.autoProvisioningEnabled = true;
    console.log('[ShellyService] Auto-provisioning enabled');
    return true;
  }

  disableAutoProvisioning(): void {
    if (!this.autoProvisioningEnabled) {
      return;
    }

    wifiScanService.stopScanning();
    this.unprovisionedDevices.clear();
    this.autoProvisioningEnabled = false;
    this.emit('unprovisionedDevicesChanged');
    console.log('[ShellyService] Auto-provisioning disabled');
  }

  isAutoProvisioningEnabled(): boolean {
    return this.autoProvisioningEnabled;
  }

  private setupWifiScanListeners(): void {
    wifiScanService.on('shellyAPFound', (ap: ShellyAccessPoint) => {
      // Check if this device is already known (by MAC address)
      if (this.isDeviceAlreadyKnown(ap.macAddress)) {
        console.log(`[ShellyService] Shelly AP ${ap.ssid} matches known device, ignoring`);
        return;
      }

      const device = wifiScanService.toUnprovisionedDevice(ap);
      this.unprovisionedDevices.set(ap.ssid, device);
      this.emit('unprovisionedDeviceFound', device);
      this.emit('unprovisionedDevicesChanged');
      console.log(`[ShellyService] Found unprovisioned device: ${ap.ssid}`);
    });

    wifiScanService.on('shellyAPLost', (ap: ShellyAccessPoint) => {
      if (this.unprovisionedDevices.has(ap.ssid)) {
        this.unprovisionedDevices.delete(ap.ssid);
        this.emit('unprovisionedDeviceLost', ap);
        this.emit('unprovisionedDevicesChanged');
        console.log(`[ShellyService] Lost unprovisioned device: ${ap.ssid}`);
      }
    });
  }

  private isDeviceAlreadyKnown(macAddress: string): boolean {
    // Check if any known device has a matching MAC address (case insensitive)
    const normalizedMac = macAddress.toUpperCase();
    for (const device of this.devices.values()) {
      // Device ID often contains the MAC address
      if (device.id.toUpperCase().includes(normalizedMac)) {
        return true;
      }
    }
    return false;
  }

  getUnprovisionedDevices(): UnprovisionedDevice[] {
    return Array.from(this.unprovisionedDevices.values());
  }

  removeUnprovisionedDevice(ssid: string): void {
    if (this.unprovisionedDevices.has(ssid)) {
      this.unprovisionedDevices.delete(ssid);
      this.emit('unprovisionedDevicesChanged');
    }
  }

  private setupMdnsListeners(): void {
    mdnsDiscovery.on('deviceFound', (mdnsDevice: MdnsDevice) => {
      const device = this.createDeviceFromMdns(mdnsDevice);
      this.devices.set(device.id, device);
      this.emit('deviceDiscovered', device);
      this.emit('devicesChanged');

      // Fetch auth status asynchronously via /shelly endpoint
      this.fetchAuthStatus(device);
    });

    mdnsDiscovery.on('deviceUpdated', (mdnsDevice: MdnsDevice) => {
      const existing = this.devices.get(mdnsDevice.id);
      if (existing) {
        existing.ipAddress = mdnsDevice.ipAddress;
        existing.lastSeen = new Date().toISOString();
        existing.online = true;
        this.emit('deviceUpdate', existing);
        this.emit('devicesChanged');
      }
    });

    mdnsDiscovery.on('deviceLost', (mdnsDevice: MdnsDevice) => {
      const existing = this.devices.get(mdnsDevice.id);
      if (existing) {
        existing.online = false;
        this.emit('deviceUpdate', existing);
        this.emit('devicesChanged');
      }
    });
  }

  private createDeviceFromMdns(mdnsDevice: MdnsDevice): Device {
    // Create a basic device with switch capability
    // Full capability detection would require HTTP calls to the device
    return {
      id: mdnsDevice.id,
      name: mdnsDevice.name,
      type: mdnsDevice.type,
      ipAddress: mdnsDevice.ipAddress,
      online: true,
      lastSeen: new Date().toISOString(),
      capabilities: [
        {
          type: 'switch',
          id: 'relay-0',
          state: { on: false },
        },
      ],
      gen: mdnsDevice.gen,
      authStatus: 'unknown', // Will be fetched asynchronously
    };
  }

  private async fetchAuthStatus(device: Device): Promise<void> {
    console.log(`[Auth] Fetching auth status for ${device.name} (${device.ipAddress})`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      // The /shelly endpoint is available on ALL Shelly devices (Gen1, Gen2, Gen3, Gen4)
      // and returns device info including generation and auth status
      const response = await fetch(`http://${device.ipAddress}/shelly`, {
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timeout);

      console.log(`[Auth] /shelly response status: ${response.status}`);

      let authStatus: AuthStatus = 'unknown';
      let detectedGen: 1 | 2 = device.gen;
      let authEnabled = false;

      if (response.ok) {
        const data = await response.json();
        console.log(`[Auth] /shelly response:`, data);

        // Update generation from actual device response
        if (typeof data.gen === 'number') {
          detectedGen = data.gen >= 2 ? 2 : 1;
        }

        // Extract firmware version from /shelly response
        // Gen2+: "ver" field, Gen1: "fw" field
        const fw = data.ver || data.fw;
        if (typeof fw === 'string') {
          device.firmwareVersion = fw;
        }

        // Gen2+ devices have auth_en field in /shelly response
        if ('auth_en' in data) {
          authEnabled = data.auth_en === true;
        } else {
          // Gen1 device - check /settings for auth status
          const gen1Auth = await this.checkGen1AuthEnabled(device.ipAddress);
          authEnabled = gen1Auth === true;
        }

        if (!authEnabled) {
          authStatus = 'unprotected';
        } else {
          // Auth is enabled - test if configured password works
          authStatus = await this.testConfiguredPassword(device.ipAddress, detectedGen);
        }
      } else if (response.status === 401) {
        // 401 means auth is required - test configured password
        authStatus = await this.testConfiguredPassword(device.ipAddress, detectedGen);
      }

      console.log(`[Auth] Final: gen=${detectedGen}, authStatus=${authStatus} for ${device.name}`);

      // Update device with auth status and corrected generation
      const existingDevice = this.devices.get(device.id);
      if (existingDevice) {
        existingDevice.authStatus = authStatus;
        existingDevice.gen = detectedGen;
        if (device.firmwareVersion) {
          existingDevice.firmwareVersion = device.firmwareVersion;
        }
        this.emit('deviceUpdate', existingDevice);
        this.emit('devicesChanged');

        // If we can authenticate, fetch device name, WiFi AP config, and Gen2 status in parallel
        if (authStatus === 'correct_password') {
          const fetches: Promise<void>[] = [
            this.fetchDeviceName(existingDevice),
            this.fetchWifiApConfig(existingDevice),
          ];
          if (detectedGen === 2) {
            fetches.push(this.fetchGen2Status(existingDevice));
          }
          await Promise.all(fetches);
        }
      }
    } catch (err) {
      console.error(`[Auth] Failed to fetch auth status for device ${device.id}:`, err);
    }
  }

  private async fetchDeviceName(device: Device): Promise<void> {
    const password = configService.getShellyPassword();
    if (!password) return;

    try {
      console.log(`[Device Name] Fetching device name for ${device.name} (${device.ipAddress})`);
      let deviceName: string | null = null;

      if (device.gen === 2) {
        deviceName = await this.fetchGen2DeviceName(device.ipAddress, password);
      } else {
        deviceName = await this.fetchGen1DeviceName(device.ipAddress, password);
      }

      if (deviceName && deviceName !== device.name) {
        console.log(`[Device Name] Updating device name from "${device.name}" to "${deviceName}"`);
        device.name = deviceName;
        this.emit('deviceUpdate', device);
        this.emit('devicesChanged');
      } else if (deviceName) {
        console.log(`[Device Name] Device name "${deviceName}" matches current name`);
      }
    } catch (err) {
      console.error(`[Device Name] Failed to fetch device name for ${device.name}:`, err);
    }
  }

  private async fetchGen2DeviceName(
    ipAddress: string,
    password: string
  ): Promise<string | null> {
    // Gen2 uses Shelly.GetDeviceInfo RPC with digest auth
    const authHeader = await this.getGen2AuthHeader(ipAddress, password, '/rpc/Shelly.GetDeviceInfo');
    if (!authHeader) {
      // Fallback: try /shelly endpoint which might be accessible
      return this.fetchDeviceNameFromShellyEndpoint(ipAddress);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`http://${ipAddress}/rpc/Shelly.GetDeviceInfo`, {
        signal: controller.signal,
        headers: { Authorization: authHeader },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return this.fetchDeviceNameFromShellyEndpoint(ipAddress);
      }

      const data = await response.json();
      // Response structure: { name: "Kitchen Light", id: "...", ... }
      if (typeof data.name === 'string' && data.name.length > 0) {
        return data.name;
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async fetchGen1DeviceName(
    ipAddress: string,
    password: string
  ): Promise<string | null> {
    // Gen1 uses /settings with basic auth
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const credentials = Buffer.from(`admin:${password}`).toString('base64');
      const response = await fetch(`http://${ipAddress}/settings`, {
        signal: controller.signal,
        headers: { Authorization: `Basic ${credentials}` },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return this.fetchDeviceNameFromShellyEndpoint(ipAddress);
      }

      const data = await response.json();
      // Response structure: { name: "Kitchen Light", device: {...}, ... }
      if (typeof data.name === 'string' && data.name.length > 0) {
        return data.name;
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async fetchDeviceNameFromShellyEndpoint(ipAddress: string): Promise<string | null> {
    // Fallback: try /shelly endpoint which is often accessible without auth
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`http://${ipAddress}/shelly`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      // The /shelly endpoint might have name in different places
      if (typeof data.name === 'string' && data.name.length > 0) {
        return data.name;
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async fetchWifiApConfig(device: Device): Promise<void> {
    const password = configService.getShellyPassword();
    if (!password) return;

    try {
      console.log(`[WiFi AP] Fetching AP config for ${device.name}`);
      let apConfig: { enabled: boolean; isOpen: boolean } | null = null;

      if (device.gen === 2) {
        apConfig = await this.fetchGen2WifiApConfig(device.ipAddress, password);
      } else {
        apConfig = await this.fetchGen1WifiApConfig(device.ipAddress, password);
      }

      if (apConfig) {
        device.apEnabled = apConfig.enabled;
        device.apIsOpen = apConfig.isOpen;
        console.log(`[WiFi AP] ${device.name}: enabled=${apConfig.enabled}, isOpen=${apConfig.isOpen}`);
        this.emit('deviceUpdate', device);
        this.emit('devicesChanged');
      }
    } catch (err) {
      console.error(`[WiFi AP] Failed to fetch AP config for ${device.name}:`, err);
    }
  }

  private async fetchGen2Status(device: Device): Promise<void> {
    const password = configService.getShellyPassword();
    if (!password) return;

    try {
      console.log(`[Gen2 Status] Fetching eco mode, WiFi RSSI, and BLE config for ${device.name}`);

      const [ecoMode, wifiRssi, bleEnabled] = await Promise.all([
        this.fetchGen2EcoMode(device.ipAddress, password),
        this.fetchGen2WifiRssi(device.ipAddress, password),
        this.fetchGen2BleConfig(device.ipAddress, password),
      ]);

      let changed = false;
      if (ecoMode !== null) {
        device.ecoMode = ecoMode;
        changed = true;
      }
      if (wifiRssi !== null) {
        device.wifiRssi = wifiRssi;
        changed = true;
      }
      if (bleEnabled !== null) {
        device.bleEnabled = bleEnabled;
        changed = true;
      }

      if (changed) {
        console.log(`[Gen2 Status] ${device.name}: ecoMode=${ecoMode}, wifiRssi=${wifiRssi}, bleEnabled=${bleEnabled}`);
        this.emit('deviceUpdate', device);
        this.emit('devicesChanged');
      }
    } catch (err) {
      console.error(`[Gen2 Status] Failed to fetch status for ${device.name}:`, err);
    }
  }

  private async fetchGen2EcoMode(
    ipAddress: string,
    password: string
  ): Promise<boolean | null> {
    const authHeader = await this.getGen2AuthHeader(ipAddress, password, '/rpc/Sys.GetConfig');
    if (!authHeader) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`http://${ipAddress}/rpc/Sys.GetConfig`, {
        signal: controller.signal,
        headers: { Authorization: authHeader },
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      // Response structure: { device: { name, eco_mode, ... }, ... }
      if (data.device && typeof data.device.eco_mode === 'boolean') {
        return data.device.eco_mode;
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async fetchGen2WifiRssi(
    ipAddress: string,
    password: string
  ): Promise<number | null> {
    const authHeader = await this.getGen2AuthHeader(ipAddress, password, '/rpc/WiFi.GetStatus');
    if (!authHeader) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`http://${ipAddress}/rpc/WiFi.GetStatus`, {
        signal: controller.signal,
        headers: { Authorization: authHeader },
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      // Response structure: { sta_ip: "...", status: "got ip", ssid: "...", rssi: -45 }
      if (typeof data.rssi === 'number') {
        return data.rssi;
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async fetchGen2BleConfig(
    ipAddress: string,
    password: string
  ): Promise<boolean | null> {
    const authHeader = await this.getGen2AuthHeader(ipAddress, password, '/rpc/BLE.GetConfig');
    if (!authHeader) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`http://${ipAddress}/rpc/BLE.GetConfig`, {
        signal: controller.signal,
        headers: { Authorization: authHeader },
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      // Response structure: { enable: true/false }
      if (typeof data.enable === 'boolean') {
        return data.enable;
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async fetchGen2WifiApConfig(
    ipAddress: string,
    password: string
  ): Promise<{ enabled: boolean; isOpen: boolean } | null> {
    // Gen2 uses WiFi.GetConfig RPC with digest auth
    const authHeader = await this.getGen2AuthHeader(ipAddress, password, '/rpc/WiFi.GetConfig');
    if (!authHeader) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`http://${ipAddress}/rpc/WiFi.GetConfig`, {
        signal: controller.signal,
        headers: { Authorization: authHeader },
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      // Response structure: { ap: { ssid, is_open, enable, ... }, sta: {...}, ... }
      if (data.ap) {
        return {
          enabled: data.ap.enable === true,
          isOpen: data.ap.is_open === true,
        };
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async fetchGen1WifiApConfig(
    ipAddress: string,
    password: string
  ): Promise<{ enabled: boolean; isOpen: boolean } | null> {
    // Gen1 uses /settings/ap with basic auth
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const credentials = Buffer.from(`admin:${password}`).toString('base64');
      const response = await fetch(`http://${ipAddress}/settings/ap`, {
        signal: controller.signal,
        headers: { Authorization: `Basic ${credentials}` },
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json();
      // Response structure: { enabled, ssid, key }
      return {
        enabled: data.enabled === true,
        isOpen: !data.key || data.key === '',
      };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async getGen2AuthHeader(
    ipAddress: string,
    password: string,
    uri: string
  ): Promise<string | null> {
    // Get auth challenge
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const initialResponse = await fetch(`http://${ipAddress}${uri}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (initialResponse.status !== 401) return null;

      const wwwAuth = initialResponse.headers.get('WWW-Authenticate');
      if (!wwwAuth) return null;

      const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
      const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
      if (!nonceMatch || !realmMatch) return null;

      const nonce = nonceMatch[1];
      const realm = realmMatch[1];
      const username = 'admin';
      const nc = '00000001';
      const cnonce = Math.random().toString(36).substring(2, 10);

      const ha1 = createHash('sha256')
        .update(`${username}:${realm}:${password}`)
        .digest('hex');
      const ha2 = createHash('sha256').update(`GET:${uri}`).digest('hex');
      const digestResponse = createHash('sha256')
        .update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
        .digest('hex');

      return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", nc=${nc}, cnonce="${cnonce}", qop=auth, response="${digestResponse}", algorithm=SHA-256`;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async checkGen1AuthEnabled(ipAddress: string): Promise<boolean | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${ipAddress}/settings`, {
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timeout);

      if (response.status === 401 || response.status === 302) {
        return true;
      } else if (response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          return data.login?.enabled === true;
        } catch {
          return true;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async testConfiguredPassword(ipAddress: string, gen: 1 | 2): Promise<AuthStatus> {
    const password = configService.getShellyPassword();
    if (!password) {
      // No password configured - we know it's protected but can't verify
      return 'different_password';
    }

    try {
      if (gen === 2) {
        return await this.testGen2Password(ipAddress, password);
      } else {
        return await this.testGen1Password(ipAddress, password);
      }
    } catch (err) {
      console.error(`[Auth] Failed to test password for ${ipAddress}:`, err);
      return 'different_password';
    }
  }

  private async testGen2Password(ipAddress: string, password: string): Promise<AuthStatus> {
    // Gen2 uses Digest authentication with SHA256
    // We need to test the password by making an authenticated request.
    // Some Gen2 devices allow unauthenticated access to Shelly.GetDeviceInfo,
    // so we use WiFi.GetConfig which always requires auth.
    const uri = '/rpc/WiFi.GetConfig';

    // First, make a request to get the auth challenge
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const initialResponse = await fetch(
        `http://${ipAddress}${uri}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      console.log(`[Auth] Gen2 password test for ${ipAddress}: initial response ${initialResponse.status}`);

      // If we don't get a 401, the endpoint might not require auth or something is wrong
      // In this case, we can't verify the password, so return different_password
      if (initialResponse.status !== 401) {
        console.log(`[Auth] Gen2 password test: expected 401 for ${uri}, got ${initialResponse.status}`);
        return 'different_password';
      }

      // Parse WWW-Authenticate header for digest auth
      const wwwAuth = initialResponse.headers.get('WWW-Authenticate');
      if (!wwwAuth) {
        console.log('[Auth] Gen2 password test: no WWW-Authenticate header');
        return 'different_password';
      }

      const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
      const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
      if (!nonceMatch || !realmMatch) {
        console.log('[Auth] Gen2 password test: failed to parse nonce/realm');
        return 'different_password';
      }

      const nonce = nonceMatch[1];
      const realm = realmMatch[1];
      const username = 'admin';
      const nc = '00000001';
      const cnonce = Math.random().toString(36).substring(2, 10);

      // Calculate digest response
      // HA1 = SHA256(username:realm:password)
      const ha1 = createHash('sha256')
        .update(`${username}:${realm}:${password}`)
        .digest('hex');
      // HA2 = SHA256(method:uri)
      const ha2 = createHash('sha256').update(`GET:${uri}`).digest('hex');
      // response = SHA256(HA1:nonce:nc:cnonce:auth:HA2)
      const digestResponse = createHash('sha256')
        .update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
        .digest('hex');

      const authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", nc=${nc}, cnonce="${cnonce}", qop=auth, response="${digestResponse}", algorithm=SHA-256`;

      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 5000);

      const authResponse = await fetch(
        `http://${ipAddress}${uri}`,
        {
          signal: controller2.signal,
          headers: { Authorization: authHeader },
        }
      );
      clearTimeout(timeout2);

      console.log(`[Auth] Gen2 password test: authenticated request returned ${authResponse.status}`);

      if (authResponse.ok) {
        console.log(`[Auth] Gen2 password test: SUCCESS for ${ipAddress}`);
        return 'correct_password';
      }

      console.log(`[Auth] Gen2 password test: FAILED for ${ipAddress} - wrong password`);
      return 'different_password';
    } catch (err) {
      console.error(`[Auth] Gen2 password test exception for ${ipAddress}:`, err);
      return 'different_password';
    }
  }

  private async testGen1Password(ipAddress: string, password: string): Promise<AuthStatus> {
    // Gen1 uses Basic authentication with username "admin"
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const credentials = Buffer.from(`admin:${password}`).toString('base64');
      const response = await fetch(`http://${ipAddress}/settings`, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { Authorization: `Basic ${credentials}` },
      });
      clearTimeout(timeout);

      if (response.ok) {
        return 'correct_password';
      }
      return 'different_password';
    } catch {
      return 'different_password';
    }
  }

  async getDeviceInfo(deviceId: string): Promise<{ name?: string; id?: string; firmwareVersion?: string }> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const password = configService.getShellyPassword();

    try {
      if (device.gen === 2) {
        return await this.fetchGen2DeviceInfoFull(device.ipAddress, password);
      } else {
        return await this.fetchGen1DeviceInfoFull(device.ipAddress, password);
      }
    } catch (err) {
      console.error(`[DeviceInfo] Failed to fetch info for ${device.name}:`, err);
      // Return what we know from the local state
      return { name: device.name, id: device.id };
    }
  }

  private async fetchGen2DeviceInfoFull(
    ipAddress: string,
    password: string | null
  ): Promise<{ name?: string; id?: string; firmwareVersion?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      let response: Response;
      if (password) {
        const authHeader = await this.getGen2AuthHeader(ipAddress, password, '/rpc/Shelly.GetDeviceInfo');
        response = await fetch(`http://${ipAddress}/rpc/Shelly.GetDeviceInfo`, {
          signal: controller.signal,
          headers: authHeader ? { Authorization: authHeader } : {},
        });
      } else {
        response = await fetch(`http://${ipAddress}/rpc/Shelly.GetDeviceInfo`, {
          signal: controller.signal,
        });
      }
      clearTimeout(timeout);

      if (!response.ok) return {};

      const data = await response.json();
      return {
        name: data.name || undefined,
        id: data.id || undefined,
        firmwareVersion: data.ver || undefined,
      };
    } catch {
      clearTimeout(timeout);
      return {};
    }
  }

  private async fetchGen1DeviceInfoFull(
    ipAddress: string,
    password: string | null
  ): Promise<{ name?: string; id?: string; firmwareVersion?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const headers: Record<string, string> = {};
      if (password) {
        headers.Authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
      }

      const response = await fetch(`http://${ipAddress}/settings`, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);

      if (!response.ok) return {};

      const data = await response.json();
      return {
        name: data.name || undefined,
        id: data.device?.hostname || undefined,
        firmwareVersion: data.fw || undefined,
      };
    } catch {
      clearTimeout(timeout);
      return {};
    }
  }

  async rebootDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }
    if (!device.online) {
      throw new Error(`Device ${device.name} is offline`);
    }

    const password = configService.getShellyPassword();

    if (device.gen === 2) {
      const authHeader = password
        ? await this.getGen2PostAuthHeader(device.ipAddress, password, '/rpc')
        : null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`http://${device.ipAddress}/rpc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify({ id: 1, method: 'Shelly.Reboot' }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Reboot failed: ${response.status} ${text}`);
        }
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Timeout rebooting ${device.name}`);
        }
        throw err;
      }
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const headers: Record<string, string> = {};
        if (password) {
          headers.Authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
        }
        const response = await fetch(`http://${device.ipAddress}/reboot`, {
          signal: controller.signal,
          headers,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Reboot failed: ${response.status} ${text}`);
        }
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Timeout rebooting ${device.name}`);
        }
        throw err;
      }
    }

    console.log(`[Device] Rebooted ${device.name}`);
  }

  async factoryResetDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }
    if (!device.online) {
      throw new Error(`Device ${device.name} is offline`);
    }

    const password = configService.getShellyPassword();

    if (device.gen === 2) {
      const authHeader = password
        ? await this.getGen2PostAuthHeader(device.ipAddress, password, '/rpc')
        : null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`http://${device.ipAddress}/rpc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify({ id: 1, method: 'Shelly.FactoryReset' }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Factory reset failed: ${response.status} ${text}`);
        }
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Timeout factory resetting ${device.name}`);
        }
        throw err;
      }
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const headers: Record<string, string> = {};
        if (password) {
          headers.Authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
        }
        const response = await fetch(
          `http://${device.ipAddress}/settings?factory_reset=true`,
          { signal: controller.signal, headers }
        );
        clearTimeout(timeout);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Factory reset failed: ${response.status} ${text}`);
        }
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Timeout factory resetting ${device.name}`);
        }
        throw err;
      }
    }

    console.log(`[Device] Factory reset ${device.name}`);
    // Remove from local state since it will come back as a new device
    this.devices.delete(deviceId);
    this.emit('devicesChanged');
  }

  async refreshDeviceStatus(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    await this.fetchAuthStatus(device);
  }

  // Re-check auth status for all devices (called when password config changes)
  async recheckAllAuthStatus(): Promise<void> {
    const devices = Array.from(this.devices.values());
    await Promise.all(devices.map((device) => this.fetchAuthStatus(device)));
  }

  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  async controlDevice(deviceId: string, command: DeviceCommand): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const capability = device.capabilities.find(
      (c) => c.id === command.capability
    );
    if (!capability) {
      throw new Error(`Capability ${command.capability} not found`);
    }

    if (command.action === 'toggle' && capability.type === 'switch') {
      const currentState = capability.state as { on: boolean };
      capability.state = { on: !currentState.on };
    } else if (command.action === 'set' && command.parameters) {
      capability.state = {
        ...(capability.state as Record<string, unknown>),
        ...command.parameters,
      };
    }

    device.lastSeen = new Date().toISOString();

    this.emit('deviceUpdate', device);
    this.emit('devicesChanged');
  }

  async startDiscovery(): Promise<{ discovered: number }> {
    // Restart mDNS browsing to find new devices
    mdnsDiscovery.restart();
    return { discovered: this.devices.size };
  }

  async setDevicePassword(deviceId: string, password: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    if (!device.online) {
      throw new Error(`Device ${device.name} is offline`);
    }

    if (device.authStatus !== 'unprotected') {
      throw new Error(`Device ${device.name} is already protected or status unknown`);
    }

    console.log(`[Auth] Setting password for ${device.name} (Gen${device.gen})`);

    if (device.gen === 2) {
      await this.setGen2Password(device, password);
    } else {
      await this.setGen1Password(device, password);
    }

    // Re-fetch auth status to confirm the password was set
    await this.fetchAuthStatus(device);
  }

  private async setGen2Password(device: Device, password: string): Promise<void> {
    // Gen2+ uses Shelly.SetAuth RPC method
    // First, fetch device info to get the correct realm (auth_domain or id)
    const deviceInfo = await this.fetchGen2DeviceInfo(device.ipAddress);
    if (!deviceInfo) {
      throw new Error(`Could not fetch device info for ${device.name}`);
    }

    // The realm is the full device ID like "shellyplus1pm-a8032abc1234"
    const username = 'admin';
    const realm = deviceInfo.id;
    const ha1 = createHash('sha256')
      .update(`${username}:${realm}:${password}`)
      .digest('hex');

    console.log(`[Auth] Setting password with realm="${realm}" for ${device.name}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`http://${device.ipAddress}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          method: 'Shelly.SetAuth',
          params: { user: username, realm, ha1 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to set password: ${response.status} ${text}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(`Shelly.SetAuth failed: ${result.error.message || JSON.stringify(result.error)}`);
      }

      console.log(`[Auth] Successfully set password for Gen2+ device ${device.name}`);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting password for ${device.name}`);
      }
      throw err;
    }
  }

  private async fetchGen2DeviceInfo(ipAddress: string): Promise<{ id: string } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`http://${ipAddress}/shelly`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      // The /shelly endpoint returns { id: "shellyplus1pm-a8032abc1234", ... }
      if (typeof data.id === 'string') {
        return { id: data.id };
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  private async setGen1Password(device: Device, password: string): Promise<void> {
    // Gen1 uses /settings/login endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const params = new URLSearchParams({
        enabled: '1',
        username: 'admin',
        password: password,
      });

      const response = await fetch(
        `http://${device.ipAddress}/settings/login?${params.toString()}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to set password: ${response.status} ${text}`);
      }

      const result = await response.json();
      if (result.enabled !== true) {
        throw new Error('Password was not enabled on device');
      }

      console.log(`[Auth] Successfully set password for Gen1 device ${device.name}`);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting password for ${device.name}`);
      }
      throw err;
    }
  }

  async setBleEnabled(deviceId: string, enabled: boolean): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    if (!device.online) {
      throw new Error(`Device ${device.name} is offline`);
    }

    if (device.gen !== 2) {
      throw new Error(`BLE configuration is only available for Gen2+ devices`);
    }

    if (device.authStatus !== 'correct_password') {
      throw new Error(`Cannot manage BLE: device ${device.name} is not authenticated`);
    }

    const password = configService.getShellyPassword();
    if (!password) {
      throw new Error('No password configured');
    }

    console.log(`[BLE] Setting BLE enabled=${enabled} for ${device.name}`);

    const authHeader = await this.getGen2PostAuthHeader(device.ipAddress, password, '/rpc');
    if (!authHeader) {
      throw new Error('Failed to authenticate with device');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`http://${device.ipAddress}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          id: 1,
          method: 'BLE.SetConfig',
          params: { config: { enable: enabled } },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to set BLE config: ${response.status} ${text}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(`BLE.SetConfig failed: ${result.error.message || JSON.stringify(result.error)}`);
      }

      console.log(`[BLE] Successfully set BLE enabled=${enabled} for ${device.name}`);

      // Update local state
      device.bleEnabled = enabled;
      this.emit('deviceUpdate', device);
      this.emit('devicesChanged');
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting BLE config for ${device.name}`);
      }
      throw err;
    }
  }

  async setWifiApEnabled(deviceId: string, enabled: boolean): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    if (!device.online) {
      throw new Error(`Device ${device.name} is offline`);
    }

    if (device.authStatus !== 'correct_password') {
      throw new Error(`Cannot manage WiFi AP: device ${device.name} is not authenticated`);
    }

    const password = configService.getShellyPassword();
    if (!password) {
      throw new Error('No password configured');
    }

    console.log(`[WiFi AP] Setting AP enabled=${enabled} for ${device.name}`);

    if (device.gen === 2) {
      await this.setGen2WifiApEnabled(device, password, enabled);
    } else {
      await this.setGen1WifiApEnabled(device, password, enabled);
    }

    // Refresh AP config
    await this.fetchWifiApConfig(device);
  }

  private async setGen2WifiApEnabled(device: Device, password: string, enabled: boolean): Promise<void> {
    // Gen2 uses WiFi.SetConfig RPC with digest auth (POST method)
    const authHeader = await this.getGen2PostAuthHeader(device.ipAddress, password, '/rpc');
    if (!authHeader) {
      throw new Error('Failed to authenticate with device');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`http://${device.ipAddress}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          id: 1,
          method: 'WiFi.SetConfig',
          params: { config: { ap: { enable: enabled } } },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to set WiFi AP: ${response.status} ${text}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(`WiFi.SetConfig failed: ${result.error.message || JSON.stringify(result.error)}`);
      }

      console.log(`[WiFi AP] Successfully set AP enabled=${enabled} for Gen2 device ${device.name}`);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting WiFi AP for ${device.name}`);
      }
      throw err;
    }
  }

  private async setGen1WifiApEnabled(device: Device, password: string, enabled: boolean): Promise<void> {
    // Gen1 uses /settings/ap endpoint with basic auth
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const credentials = Buffer.from(`admin:${password}`).toString('base64');
      const response = await fetch(
        `http://${device.ipAddress}/settings/ap?enabled=${enabled ? '1' : '0'}`,
        {
          signal: controller.signal,
          headers: { Authorization: `Basic ${credentials}` },
        }
      );
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to set WiFi AP: ${response.status} ${text}`);
      }

      console.log(`[WiFi AP] Successfully set AP enabled=${enabled} for Gen1 device ${device.name}`);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting WiFi AP for ${device.name}`);
      }
      throw err;
    }
  }

  async setWifiApPassword(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    if (!device.online) {
      throw new Error(`Device ${device.name} is offline`);
    }

    if (device.authStatus !== 'correct_password') {
      throw new Error(`Cannot manage WiFi AP: device ${device.name} is not authenticated`);
    }

    const password = configService.getShellyPassword();
    if (!password) {
      throw new Error('No password configured');
    }

    console.log(`[WiFi AP] Setting AP password for ${device.name}`);

    if (device.gen === 2) {
      await this.setGen2WifiApPassword(device, password);
    } else {
      await this.setGen1WifiApPassword(device, password);
    }

    // Refresh AP config
    await this.fetchWifiApConfig(device);
  }

  private async setGen2WifiApPassword(device: Device, password: string): Promise<void> {
    // Gen2 uses WiFi.SetConfig RPC with digest auth (POST method)
    const authHeader = await this.getGen2PostAuthHeader(device.ipAddress, password, '/rpc');
    if (!authHeader) {
      throw new Error('Failed to authenticate with device');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`http://${device.ipAddress}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          id: 1,
          method: 'WiFi.SetConfig',
          params: { config: { ap: { pass: password } } },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to set WiFi AP password: ${response.status} ${text}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(`WiFi.SetConfig failed: ${result.error.message || JSON.stringify(result.error)}`);
      }

      console.log(`[WiFi AP] Successfully set AP password for Gen2 device ${device.name}`);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting WiFi AP password for ${device.name}`);
      }
      throw err;
    }
  }

  private async setGen1WifiApPassword(device: Device, password: string): Promise<void> {
    // Gen1 uses /settings/ap endpoint with basic auth
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const credentials = Buffer.from(`admin:${password}`).toString('base64');
      const response = await fetch(
        `http://${device.ipAddress}/settings/ap?key=${encodeURIComponent(password)}`,
        {
          signal: controller.signal,
          headers: { Authorization: `Basic ${credentials}` },
        }
      );
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to set WiFi AP password: ${response.status} ${text}`);
      }

      console.log(`[WiFi AP] Successfully set AP password for Gen1 device ${device.name}`);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting WiFi AP password for ${device.name}`);
      }
      throw err;
    }
  }

  private async getGen2PostAuthHeader(
    ipAddress: string,
    password: string,
    uri: string
  ): Promise<string | null> {
    // Get auth challenge with POST method
    // Use WiFi.GetConfig which always requires authentication
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const initialResponse = await fetch(`http://${ipAddress}${uri}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, method: 'WiFi.GetConfig' }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (initialResponse.status !== 401) {
        console.log(`[Auth] getGen2PostAuthHeader: expected 401, got ${initialResponse.status}`);
        return null;
      }

      const wwwAuth = initialResponse.headers.get('WWW-Authenticate');
      if (!wwwAuth) return null;

      const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
      const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
      if (!nonceMatch || !realmMatch) return null;

      const nonce = nonceMatch[1];
      const realm = realmMatch[1];
      const username = 'admin';
      const nc = '00000001';
      const cnonce = Math.random().toString(36).substring(2, 10);

      const ha1 = createHash('sha256')
        .update(`${username}:${realm}:${password}`)
        .digest('hex');
      const ha2 = createHash('sha256').update(`POST:${uri}`).digest('hex');
      const digestResponse = createHash('sha256')
        .update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)
        .digest('hex');

      return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", nc=${nc}, cnonce="${cnonce}", qop=auth, response="${digestResponse}", algorithm=SHA-256`;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }
}

export const shellyService = new ShellyService();
