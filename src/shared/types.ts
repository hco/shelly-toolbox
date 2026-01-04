import { z } from 'zod';

export const DeviceCapabilitySchema = z.object({
  type: z.enum(['switch', 'dimmer', 'sensor', 'meter']),
  id: z.string(),
  state: z.unknown(),
});

export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  ipAddress: z.union([z.ipv4(), z.ipv6()]),
  online: z.boolean(),
  lastSeen: z.iso.datetime(),
  capabilities: z.array(DeviceCapabilitySchema),
});

export const DeviceCommandSchema = z.object({
  capability: z.string(),
  action: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export type Device = z.infer<typeof DeviceSchema>;
export type DeviceCapability = z.infer<typeof DeviceCapabilitySchema>;
export type DeviceCommand = z.infer<typeof DeviceCommandSchema>;
