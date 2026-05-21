import { EventEmitter } from 'events';
import dbus from 'dbus-next';
import {
  WIFI_SCAN_INTERVAL,
  SHELLY_AP_PATTERN_GEN1,
  SHELLY_AP_PATTERN_GEN2,
} from '@/shared/constants.js';
import type { UnprovisionedDevice } from '@/shared/types';

const NM_SERVICE = 'org.freedesktop.NetworkManager';
const NM_PATH = '/org/freedesktop/NetworkManager';
const NM_INTERFACE = 'org.freedesktop.NetworkManager';
const NM_DEVICE_INTERFACE = 'org.freedesktop.NetworkManager.Device';
const NM_WIRELESS_INTERFACE = 'org.freedesktop.NetworkManager.Device.Wireless';
const NM_AP_INTERFACE = 'org.freedesktop.NetworkManager.AccessPoint';

// Device type enum from NetworkManager
const NM_DEVICE_TYPE_WIFI = 2;

export interface AccessPointInfo {
  ssid: string;
  strength: number;
  path: string;
}

export interface ShellyAccessPoint extends AccessPointInfo {
  macAddress: string;
  gen: number;
}

class WifiScanService extends EventEmitter {
  private bus: dbus.MessageBus | null = null;
  private wirelessDevicePath: string | null = null;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private knownShellyAPs = new Map<string, ShellyAccessPoint>();
  private isAvailable = false;
  private isScanning = false;

  async initialize(): Promise<boolean> {
    // Only works on Linux
    if (process.platform !== 'linux') {
      console.log('[WifiScan] Not running on Linux, WiFi scanning disabled');
      return false;
    }

    try {
      this.bus = dbus.systemBus();
      await this.findWirelessDevice();

      if (!this.wirelessDevicePath) {
        console.log('[WifiScan] No wireless device found');
        return false;
      }

      this.isAvailable = true;
      console.log(`[WifiScan] Initialized with device: ${this.wirelessDevicePath}`);
      return true;
    } catch (error) {
      console.error('[WifiScan] Failed to initialize:', error);
      return false;
    }
  }

  private async findWirelessDevice(): Promise<void> {
    if (!this.bus) return;

    const nmProxy = await this.bus.getProxyObject(NM_SERVICE, NM_PATH);
    const nmInterface = nmProxy.getInterface(NM_INTERFACE);

    const devicePaths: string[] = await nmInterface.GetDevices();

    for (const devicePath of devicePaths) {
      const deviceProxy = await this.bus.getProxyObject(NM_SERVICE, devicePath);
      const propsInterface = deviceProxy.getInterface('org.freedesktop.DBus.Properties');
      const deviceType = await propsInterface.Get(NM_DEVICE_INTERFACE, 'DeviceType');

      if (deviceType.value === NM_DEVICE_TYPE_WIFI) {
        this.wirelessDevicePath = devicePath;
        return;
      }
    }
  }

  async startScanning(): Promise<void> {
    if (!this.isAvailable) {
      console.log('[WifiScan] Service not available, cannot start scanning');
      return;
    }

    console.log('[WifiScan] Starting periodic WiFi scanning');

    // Initial scan
    await this.scan();

    // Set up periodic scanning
    this.scanInterval = setInterval(async () => {
      await this.scan();
    }, WIFI_SCAN_INTERVAL);
  }

  stopScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      console.log('[WifiScan] Stopped periodic WiFi scanning');
    }
  }

  async scan(): Promise<ShellyAccessPoint[]> {
    if (!this.bus || !this.wirelessDevicePath || this.isScanning) {
      return [];
    }

    this.isScanning = true;

    try {
      const wirelessProxy = await this.bus.getProxyObject(NM_SERVICE, this.wirelessDevicePath);
      const wirelessInterface = wirelessProxy.getInterface(NM_WIRELESS_INTERFACE);

      // Request a new scan
      await wirelessInterface.RequestScan({});

      // Wait a bit for scan to complete
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get all access points
      const apPaths: string[] = await wirelessInterface.GetAllAccessPoints();
      const accessPoints: AccessPointInfo[] = [];

      for (const apPath of apPaths) {
        try {
          const apProxy = await this.bus.getProxyObject(NM_SERVICE, apPath);
          const propsInterface = apProxy.getInterface('org.freedesktop.DBus.Properties');

          const ssidVariant = await propsInterface.Get(NM_AP_INTERFACE, 'Ssid');
          const strengthVariant = await propsInterface.Get(NM_AP_INTERFACE, 'Strength');

          // SSID is returned as byte array
          const ssidBytes: number[] = ssidVariant.value;
          const ssid = Buffer.from(ssidBytes).toString('utf8');
          const strength: number = strengthVariant.value;

          if (ssid) {
            accessPoints.push({ ssid, strength, path: apPath });
          }
        } catch {
          // Skip APs we can't read
        }
      }

      // Filter for Shelly APs
      const shellyAPs = this.filterShellyAPs(accessPoints);

      // Track changes
      this.updateKnownAPs(shellyAPs);

      return shellyAPs;
    } catch (error) {
      console.error('[WifiScan] Scan failed:', error);
      return [];
    } finally {
      this.isScanning = false;
    }
  }

  private filterShellyAPs(accessPoints: AccessPointInfo[]): ShellyAccessPoint[] {
    const shellyAPs: ShellyAccessPoint[] = [];

    for (const ap of accessPoints) {
      let gen: number | null = null;
      let macAddress = '';

      if (SHELLY_AP_PATTERN_GEN2.test(ap.ssid)) {
        gen = 2;
        // Extract MAC from end of SSID (12 hex chars)
        const match = ap.ssid.match(/-([A-F0-9]{12})$/);
        macAddress = match ? match[1] : '';
      } else if (SHELLY_AP_PATTERN_GEN1.test(ap.ssid)) {
        gen = 1;
        // Extract ID from end of SSID (6 hex chars)
        const match = ap.ssid.match(/-([a-f0-9]{6})$/i);
        macAddress = match ? match[1].toUpperCase() : '';
      }

      if (gen !== null) {
        shellyAPs.push({
          ...ap,
          macAddress,
          gen,
        });
      }
    }

    return shellyAPs;
  }

  private updateKnownAPs(currentAPs: ShellyAccessPoint[]): void {
    const currentSSIDs = new Set(currentAPs.map((ap) => ap.ssid));
    const previousSSIDs = new Set(this.knownShellyAPs.keys());

    // Check for new APs
    for (const ap of currentAPs) {
      if (!previousSSIDs.has(ap.ssid)) {
        this.knownShellyAPs.set(ap.ssid, ap);
        this.emit('shellyAPFound', ap);
      } else {
        // Update existing AP (signal strength may have changed)
        this.knownShellyAPs.set(ap.ssid, ap);
        this.emit('shellyAPSeen', ap);
      }
    }

    // Check for lost APs
    for (const ssid of previousSSIDs) {
      if (!currentSSIDs.has(ssid)) {
        const lostAP = this.knownShellyAPs.get(ssid);
        this.knownShellyAPs.delete(ssid);
        if (lostAP) {
          this.emit('shellyAPLost', lostAP);
        }
      }
    }

    // Emit updated list
    if (currentAPs.length > 0 || previousSSIDs.size > 0) {
      this.emit('shellyAPsChanged', this.getKnownShellyAPs());
    }
  }

  getKnownShellyAPs(): ShellyAccessPoint[] {
    return Array.from(this.knownShellyAPs.values());
  }

  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  toUnprovisionedDevice(ap: ShellyAccessPoint): UnprovisionedDevice {
    const now = new Date().toISOString();
    return {
      ssid: ap.ssid,
      macAddress: ap.macAddress,
      gen: ap.gen,
      signalStrength: ap.strength,
      firstSeen: now,
      lastSeen: now,
    };
  }

  async destroy(): Promise<void> {
    this.stopScanning();
    if (this.bus) {
      this.bus.disconnect();
      this.bus = null;
    }
    this.knownShellyAPs.clear();
    this.isAvailable = false;
  }
}

// Singleton instance
export const wifiScanService = new WifiScanService();
