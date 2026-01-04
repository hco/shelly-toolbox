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
