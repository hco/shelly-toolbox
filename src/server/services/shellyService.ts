import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type { Device, DeviceCommand, AuthStatus } from '@/shared/types.js';
import { mdnsDiscovery, type MdnsDevice } from './mdnsDiscovery.js';
import { configService } from './configService.js';

class ShellyService extends EventEmitter {
  private devices: Map<string, Device> = new Map();

  constructor() {
    super();
    this.setupMdnsListeners();
    mdnsDiscovery.start();
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
        this.emit('deviceUpdate', existingDevice);
        this.emit('devicesChanged');
      }
    } catch (err) {
      console.error(`[Auth] Failed to fetch auth status for device ${device.id}:`, err);
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
    // First, make a request to get the auth challenge
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const initialResponse = await fetch(
        `http://${ipAddress}/rpc/Shelly.GetDeviceInfo`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (initialResponse.ok) {
        // No auth required or already authenticated
        return 'correct_password';
      }

      if (initialResponse.status !== 401) {
        return 'different_password';
      }

      // Parse WWW-Authenticate header for digest auth
      const wwwAuth = initialResponse.headers.get('WWW-Authenticate');
      if (!wwwAuth) {
        return 'different_password';
      }

      const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
      const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
      if (!nonceMatch || !realmMatch) {
        return 'different_password';
      }

      const nonce = nonceMatch[1];
      const realm = realmMatch[1];
      const username = 'admin';
      const uri = '/rpc/Shelly.GetDeviceInfo';
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
        `http://${ipAddress}/rpc/Shelly.GetDeviceInfo`,
        {
          signal: controller2.signal,
          headers: { Authorization: authHeader },
        }
      );
      clearTimeout(timeout2);

      if (authResponse.ok) {
        return 'correct_password';
      }
      return 'different_password';
    } catch {
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
}

export const shellyService = new ShellyService();
