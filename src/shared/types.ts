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
  gen: z.number().int().min(1).max(9),
  authStatus: AuthStatusSchema,
  // WiFi AP configuration (only available for authenticated devices)
  apEnabled: z.boolean().optional(),
  apIsOpen: z.boolean().optional(),
  // Gen2+ device status (only available for authenticated Gen2 devices)
  ecoMode: z.boolean().optional(),
  wifiRssi: z.number().optional(), // dBm, e.g. -45
  ethConnected: z.boolean().optional(),
  bleEnabled: z.boolean().optional(),
  // Device info (fetched from /shelly endpoint)
  firmwareVersion: z.string().optional(),
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
  gen: z.number().int().min(1).max(9),
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

// Auth types
export const AppUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export type AppUser = z.infer<typeof AppUserSchema>;

export const AppAuthStatusSchema = z.object({
  setupMode: z.boolean(),
  authenticated: z.boolean(),
  user: AppUserSchema.nullable(),
});

export type AppAuthStatus = z.infer<typeof AppAuthStatusSchema>;

// === Script management ===

export const ScriptSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  latestVersion: z.number().int().positive(),
});

export type Script = z.infer<typeof ScriptSchema>;

export const ScriptWithCodeSchema = ScriptSchema.extend({
  code: z.string(),
});

export type ScriptWithCode = z.infer<typeof ScriptWithCodeSchema>;

// A script as it appears on a Shelly device, enriched with toolbox-resolution metadata.
export const OnDeviceScriptSchema = z.object({
  shellyScriptId: z.number().int(),
  name: z.string(),
  enable: z.boolean(),
  running: z.boolean(),
  match: z
    .object({
      scriptId: z.string(),
      scriptName: z.string(),
      version: z.number().int().positive(),
      latestVersion: z.number().int().positive(),
      updateAvailable: z.boolean(),
    })
    .nullable(),
});

export type OnDeviceScript = z.infer<typeof OnDeviceScriptSchema>;
