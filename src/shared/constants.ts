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
