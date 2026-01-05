export const SERVER_PORT = 3001;
export const VITE_DEV_PORT = 5174;

export const DEVICE_TYPES = {
  SWITCH: 'switch',
  DIMMER: 'dimmer',
  SENSOR: 'sensor',
  METER: 'meter',
} as const;

export const DEVICE_DISCOVERY_TIMEOUT = 30000;
export const DEVICE_PING_INTERVAL = 60000;

// Auto-provisioning feature
export const WIFI_SCAN_INTERVAL = 30000; // 30 seconds between WiFi scans
export const PROVISIONING_RETRY_COUNT = 3;
export const PROVISIONING_STEP_TIMEOUT = 10000; // 10 seconds per step
export const SHELLY_AP_IP = '192.168.33.1'; // Default IP when connected to Shelly AP

// SSID patterns for factory default Shelly devices
// Gen1: shelly*-XXXXXX (lowercase, 6-char hex ID)
// Gen2+: Shelly*-XXXXXXXXXXXX (uppercase S, 12-char hex MAC)
export const SHELLY_AP_PATTERN_GEN1 = /^shelly.+-[a-f0-9]{6}$/i;
export const SHELLY_AP_PATTERN_GEN2 = /^Shelly.+-[A-F0-9]{12}$/;
