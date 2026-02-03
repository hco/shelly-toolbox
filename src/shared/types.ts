import { z } from 'zod';

export const DeviceCapabilitySchema = z.object({
  type: z.enum(['switch', 'dimmer', 'sensor', 'meter']),
  id: z.string(),
  state: z.unknown(),
});

export const AuthStatusSchema = z.enum([
  'unknown',           // Couldn't determine auth status
  'unprotected',       // No password set
  'correct_password',  // Protected with the configured password
  'different_password' // Protected with a different password
]);

export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  ipAddress: z.union([z.ipv4(), z.ipv6()]),
  online: z.boolean(),
  lastSeen: z.iso.datetime(),
  capabilities: z.array(DeviceCapabilitySchema),
  gen: z.union([z.literal(1), z.literal(2)]),
  authStatus: AuthStatusSchema,
  // WiFi AP configuration (only available for authenticated devices)
  apEnabled: z.boolean().optional(),
  apIsOpen: z.boolean().optional(),
  // Gen2+ device status (only available for authenticated Gen2 devices)
  ecoMode: z.boolean().optional(),
  wifiRssi: z.number().optional(), // dBm, e.g. -45
});

export type AuthStatus = z.infer<typeof AuthStatusSchema>;

export const DeviceCommandSchema = z.object({
  capability: z.string(),
  action: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export type Device = z.infer<typeof DeviceSchema>;
export type DeviceCapability = z.infer<typeof DeviceCapabilitySchema>;
export type DeviceCommand = z.infer<typeof DeviceCommandSchema>;

// Unprovisioned device (factory default Shelly broadcasting AP)
export const UnprovisionedDeviceSchema = z.object({
  ssid: z.string(),
  macAddress: z.string(),
  gen: z.union([z.literal(1), z.literal(2)]),
  signalStrength: z.number(),
  firstSeen: z.iso.datetime(),
});

export type UnprovisionedDevice = z.infer<typeof UnprovisionedDeviceSchema>;

// Notification system
export const NotificationTypeSchema = z.enum(['info', 'success', 'warning', 'error']);

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  message: z.string(),
  timestamp: z.iso.datetime(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export type NotificationType = z.infer<typeof NotificationTypeSchema>;
export type Notification = z.infer<typeof NotificationSchema>;

// Provisioning WiFi config
export const ProvisioningWifiSchema = z.object({
  ssid: z.string(),
  password: z.string(),
});

export type ProvisioningWifi = z.infer<typeof ProvisioningWifiSchema>;

// Provisioning status for tracking active provisioning
export const ProvisioningStatusSchema = z.enum([
  'idle',
  'connecting_to_ap',
  'configuring_wifi',
  'setting_password',
  'reconnecting',
  'waiting_for_device',
  'success',
  'failed',
]);

export type ProvisioningStatus = z.infer<typeof ProvisioningStatusSchema>;
