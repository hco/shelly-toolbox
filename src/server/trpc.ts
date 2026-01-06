import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import type { Context } from './context.js';
import {
  DeviceCommandSchema,
  ProvisioningWifiSchema,
} from '@/shared/types.js';
import { shellyService } from './services/shellyService.js';
import { configService } from './services/configService.js';
import { notificationService } from './services/notificationService.js';
import { provisioningService } from './services/provisioningService.js';
import type { Device, UnprovisionedDevice, Notification } from '@/shared/types.js';

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  // Password configuration
  getShellyPassword: t.procedure.query(() => {
    const password = configService.getShellyPassword();
    return { hasPassword: password !== null };
  }),

  setShellyPassword: t.procedure
    .input(z.object({ password: z.string().nullable() }))
    .mutation(async ({ input }) => {
      configService.setShellyPassword(input.password);
      // Re-check auth status for all devices with new password
      await shellyService.recheckAllAuthStatus();
      return { success: true };
    }),

  setDevicePassword: t.procedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      const password = configService.getShellyPassword();
      if (!password) {
        throw new Error('No password configured. Please set a password in Settings first.');
      }
      await shellyService.setDevicePassword(input.deviceId, password);
      return { success: true };
    }),

  // WiFi AP management
  setWifiApEnabled: t.procedure
    .input(z.object({ deviceId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      await shellyService.setWifiApEnabled(input.deviceId, input.enabled);
      return { success: true };
    }),

  setWifiApPassword: t.procedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      await shellyService.setWifiApPassword(input.deviceId);
      return { success: true };
    }),

  controlDevice: t.procedure
    .input(
      z.object({
        deviceId: z.string(),
        command: DeviceCommandSchema,
      })
    )
    .mutation(async ({ input }) => {
      await shellyService.controlDevice(input.deviceId, input.command);
      return { success: true };
    }),

  discoverDevices: t.procedure.mutation(async () => {
    return shellyService.startDiscovery();
  }),

  onDevices: t.procedure.subscription(() => {
    return observable<Device[]>((emit) => {
      emit.next(shellyService.getDevices());

      const handler = () => emit.next(shellyService.getDevices());
      shellyService.on('devicesChanged', handler);

      return () => shellyService.off('devicesChanged', handler);
    });
  }),

  onDeviceUpdate: t.procedure
    .input(z.object({ deviceId: z.string() }))
    .subscription(({ input }) => {
      return observable<Device>((emit) => {
        const handler = (device: Device) => {
          if (device.id === input.deviceId) {
            emit.next(device);
          }
        };
        shellyService.on('deviceUpdate', handler);
        return () => shellyService.off('deviceUpdate', handler);
      });
    }),

  onDeviceDiscovered: t.procedure.subscription(() => {
    return observable<Device>((emit) => {
      const handler = (device: Device) => emit.next(device);
      shellyService.on('deviceDiscovered', handler);
      return () => shellyService.off('deviceDiscovered', handler);
    });
  }),

  // Provisioning WiFi configuration
  getProvisioningWifi: t.procedure.query(() => {
    const wifi = configService.getProvisioningWifi();
    return wifi ? { ssid: wifi.ssid, hasPassword: true } : null;
  }),

  setProvisioningWifi: t.procedure
    .input(z.object({ wifi: ProvisioningWifiSchema.nullable() }))
    .mutation(({ input }) => {
      configService.setProvisioningWifi(input.wifi);
      return { success: true };
    }),

  // Auto-provisioning status
  getAutoProvisioningStatus: t.procedure.query(() => {
    return {
      enabled: shellyService.isAutoProvisioningEnabled(),
      isProvisioning: provisioningService.isProvisioning(),
      currentStatus: provisioningService.getCurrentStatus(),
    };
  }),

  // Unprovisioned devices
  onUnprovisionedDevices: t.procedure.subscription(() => {
    return observable<UnprovisionedDevice[]>((emit) => {
      emit.next(shellyService.getUnprovisionedDevices());

      const handler = () => emit.next(shellyService.getUnprovisionedDevices());
      shellyService.on('unprovisionedDevicesChanged', handler);

      return () => shellyService.off('unprovisionedDevicesChanged', handler);
    });
  }),

  // Provision a device
  provisionDevice: t.procedure
    .input(z.object({ ssid: z.string() }))
    .mutation(async ({ input }) => {
      const devices = shellyService.getUnprovisionedDevices();
      const device = devices.find((d) => d.ssid === input.ssid);

      if (!device) {
        throw new Error(`Unprovisioned device with SSID "${input.ssid}" not found`);
      }

      const success = await provisioningService.provisionDevice(device);

      if (success) {
        // Remove from unprovisioned list
        shellyService.removeUnprovisionedDevice(input.ssid);
      }

      return { success };
    }),

  // Notifications
  onNotifications: t.procedure.subscription(() => {
    return observable<Notification>((emit) => {
      const handler = (notification: Notification) => emit.next(notification);
      notificationService.on('notification', handler);

      return () => notificationService.off('notification', handler);
    });
  }),

  getRecentNotifications: t.procedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ input }) => {
      return notificationService.getRecent(input?.limit);
    }),
});

export type AppRouter = typeof appRouter;
