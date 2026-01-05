import { EventEmitter } from 'events';
import dbus from 'dbus-next';
import { SHELLY_AP_IP } from '@/shared/constants';

const NM_SERVICE = 'org.freedesktop.NetworkManager';
const NM_PATH = '/org/freedesktop/NetworkManager';
const NM_INTERFACE = 'org.freedesktop.NetworkManager';
const NM_DEVICE_INTERFACE = 'org.freedesktop.NetworkManager.Device';
const NM_WIRELESS_INTERFACE = 'org.freedesktop.NetworkManager.Device.Wireless';
const NM_AP_INTERFACE = 'org.freedesktop.NetworkManager.AccessPoint';
const NM_ACTIVE_CONN_INTERFACE = 'org.freedesktop.NetworkManager.Connection.Active';

const NM_DEVICE_TYPE_WIFI = 2;

interface SavedConnection {
  connectionPath: string;
  activeConnectionPath: string;
}

class WifiConnectionService extends EventEmitter {
  private bus: dbus.MessageBus | null = null;
  private wirelessDevicePath: string | null = null;
  private savedConnection: SavedConnection | null = null;
  private isAvailable = false;

  async initialize(): Promise<boolean> {
    if (process.platform !== 'linux') {
      console.log('[WifiConnection] Not running on Linux, service disabled');
      return false;
    }

    try {
      this.bus = dbus.systemBus();
      await this.findWirelessDevice();

      if (!this.wirelessDevicePath) {
        console.log('[WifiConnection] No wireless device found');
        return false;
      }

      this.isAvailable = true;
      console.log(`[WifiConnection] Initialized with device: ${this.wirelessDevicePath}`);
      return true;
    } catch (error) {
      console.error('[WifiConnection] Failed to initialize:', error);
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

  async saveCurrentConnection(): Promise<void> {
    if (!this.bus || !this.wirelessDevicePath) return;

    try {
      const deviceProxy = await this.bus.getProxyObject(NM_SERVICE, this.wirelessDevicePath);
      const propsInterface = deviceProxy.getInterface('org.freedesktop.DBus.Properties');

      const activeConnVariant = await propsInterface.Get(NM_DEVICE_INTERFACE, 'ActiveConnection');
      const activeConnectionPath: string = activeConnVariant.value;

      if (activeConnectionPath && activeConnectionPath !== '/') {
        const activeConnProxy = await this.bus.getProxyObject(NM_SERVICE, activeConnectionPath);
        const activeConnProps = activeConnProxy.getInterface('org.freedesktop.DBus.Properties');
        const connVariant = await activeConnProps.Get(NM_ACTIVE_CONN_INTERFACE, 'Connection');

        this.savedConnection = {
          connectionPath: connVariant.value,
          activeConnectionPath,
        };

        console.log(`[WifiConnection] Saved current connection: ${this.savedConnection.connectionPath}`);
      }
    } catch (error) {
      console.error('[WifiConnection] Failed to save current connection:', error);
    }
  }

  async connectToOpenNetwork(ssid: string): Promise<boolean> {
    if (!this.bus || !this.wirelessDevicePath) {
      return false;
    }

    try {
      // Find the access point for this SSID
      const apPath = await this.findAccessPointBySSID(ssid);
      if (!apPath) {
        console.error(`[WifiConnection] Access point not found for SSID: ${ssid}`);
        return false;
      }

      // Create connection settings for an open network
      const connectionSettings = {
        connection: {
          id: new dbus.Variant('s', `Shelly-Provisioning-${ssid}`),
          type: new dbus.Variant('s', '802-11-wireless'),
          autoconnect: new dbus.Variant('b', false),
        },
        '802-11-wireless': {
          ssid: new dbus.Variant('ay', Buffer.from(ssid)),
          mode: new dbus.Variant('s', 'infrastructure'),
        },
        ipv4: {
          method: new dbus.Variant('s', 'auto'),
        },
        ipv6: {
          method: new dbus.Variant('s', 'ignore'),
        },
      };

      const nmProxy = await this.bus.getProxyObject(NM_SERVICE, NM_PATH);
      const nmInterface = nmProxy.getInterface(NM_INTERFACE);

      // AddAndActivateConnection2 for temporary connection
      const [, activeConnectionPath] = await nmInterface.AddAndActivateConnection2(
        connectionSettings,
        this.wirelessDevicePath,
        apPath,
        { persist: new dbus.Variant('s', 'volatile') }
      );

      console.log(`[WifiConnection] Connecting to ${ssid}...`);

      // Wait for connection to establish
      const connected = await this.waitForConnection(activeConnectionPath, 15000);

      if (connected) {
        console.log(`[WifiConnection] Connected to ${ssid}`);

        // Verify we can reach the Shelly AP IP
        const reachable = await this.waitForIPReachable(SHELLY_AP_IP, 10000);
        if (reachable) {
          console.log(`[WifiConnection] Shelly AP reachable at ${SHELLY_AP_IP}`);
          return true;
        } else {
          console.error(`[WifiConnection] Cannot reach ${SHELLY_AP_IP}`);
        }
      }

      return false;
    } catch (error) {
      console.error(`[WifiConnection] Failed to connect to ${ssid}:`, error);
      return false;
    }
  }

  private async findAccessPointBySSID(ssid: string): Promise<string | null> {
    if (!this.bus || !this.wirelessDevicePath) return null;

    const wirelessProxy = await this.bus.getProxyObject(NM_SERVICE, this.wirelessDevicePath);
    const wirelessInterface = wirelessProxy.getInterface(NM_WIRELESS_INTERFACE);
    const apPaths: string[] = await wirelessInterface.GetAllAccessPoints();

    for (const apPath of apPaths) {
      try {
        const apProxy = await this.bus.getProxyObject(NM_SERVICE, apPath);
        const propsInterface = apProxy.getInterface('org.freedesktop.DBus.Properties');
        const ssidVariant = await propsInterface.Get(NM_AP_INTERFACE, 'Ssid');
        const apSSID = Buffer.from(ssidVariant.value).toString('utf8');

        if (apSSID === ssid) {
          return apPath;
        }
      } catch {
        // Skip APs we can't read
      }
    }

    return null;
  }

  private async waitForConnection(activeConnectionPath: string, timeoutMs: number): Promise<boolean> {
    if (!this.bus) return false;

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const activeConnProxy = await this.bus.getProxyObject(NM_SERVICE, activeConnectionPath);
        const propsInterface = activeConnProxy.getInterface('org.freedesktop.DBus.Properties');
        const stateVariant = await propsInterface.Get(NM_ACTIVE_CONN_INTERFACE, 'State');
        const state: number = stateVariant.value;

        // NM_ACTIVE_CONNECTION_STATE_ACTIVATED = 2
        if (state === 2) {
          return true;
        }

        // NM_ACTIVE_CONNECTION_STATE_DEACTIVATED = 4
        if (state === 4) {
          return false;
        }
      } catch {
        // Connection may have been removed
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return false;
  }

  private async waitForIPReachable(ip: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const http = await import('http');

    while (Date.now() - startTime < timeoutMs) {
      try {
        const reachable = await new Promise<boolean>((resolve) => {
          const req = http.get(`http://${ip}/shelly`, { timeout: 2000 }, (res) => {
            resolve(res.statusCode !== undefined);
          });
          req.on('error', () => resolve(false));
          req.on('timeout', () => {
            req.destroy();
            resolve(false);
          });
        });

        if (reachable) {
          return true;
        }
      } catch {
        // Not reachable yet
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return false;
  }

  async reconnectToSaved(): Promise<boolean> {
    if (!this.bus || !this.savedConnection) {
      console.log('[WifiConnection] No saved connection to restore');
      return false;
    }

    try {
      const nmProxy = await this.bus.getProxyObject(NM_SERVICE, NM_PATH);
      const nmInterface = nmProxy.getInterface(NM_INTERFACE);

      // Activate the saved connection
      const activeConnectionPath = await nmInterface.ActivateConnection(
        this.savedConnection.connectionPath,
        this.wirelessDevicePath,
        '/'
      );

      console.log('[WifiConnection] Reconnecting to saved network...');

      const connected = await this.waitForConnection(activeConnectionPath, 15000);

      if (connected) {
        console.log('[WifiConnection] Reconnected to saved network');
        this.savedConnection = null;
        return true;
      }

      return false;
    } catch (error) {
      console.error('[WifiConnection] Failed to reconnect:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.bus || !this.wirelessDevicePath) return;

    try {
      const deviceProxy = await this.bus.getProxyObject(NM_SERVICE, this.wirelessDevicePath);
      const deviceInterface = deviceProxy.getInterface(NM_DEVICE_INTERFACE);
      await deviceInterface.Disconnect();
      console.log('[WifiConnection] Disconnected from current network');
    } catch (error) {
      console.error('[WifiConnection] Failed to disconnect:', error);
    }
  }

  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  hasSavedConnection(): boolean {
    return this.savedConnection !== null;
  }

  async destroy(): Promise<void> {
    if (this.bus) {
      this.bus.disconnect();
      this.bus = null;
    }
    this.savedConnection = null;
    this.isAvailable = false;
  }
}

// Singleton instance
export const wifiConnectionService = new WifiConnectionService();
