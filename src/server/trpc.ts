import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Context } from './context.js';
import {
  DeviceCommandSchema,
  ProvisioningWifiSchema,
} from '@/shared/types.js';
import { shellyService } from './services/shellyService.js';
import { configService } from './services/configService.js';
import { notificationService } from './services/notificationService.js';
import { provisioningService } from './services/provisioningService.js';
import { authService } from './services/authService.js';
import { scriptService } from './services/scriptService.js';
import type { Device, UnprovisionedDevice, Notification, AppAuthStatus, AppUser } from '@/shared/types.js';

const t = initTRPC.context<Context>().create();

// Middleware that requires authentication (unless in setup mode)
const requireAuth = t.middleware(({ ctx, next }) => {
  // Allow access in setup mode (no users exist yet)
  if (authService.isSetupMode()) {
    return next({ ctx });
  }

  // Otherwise, require authentication
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      session: ctx.session,
    },
  });
});

const protectedProcedure = t.procedure.use(requireAuth);

// Get version from version.txt file (created during Docker build)
let appVersion = 'dev';
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const versionPath = join(__dirname, '../../version.txt');
  appVersion = readFileSync(versionPath, 'utf-8').trim();
} catch {
  // In development, use git command or default to 'dev'
  appVersion = 'dev';
}

export const appRouter = t.router({
  // === Auth endpoints (public) ===
  getAuthStatus: t.procedure.query(({ ctx }): AppAuthStatus => {
    const setupMode = authService.isSetupMode();
    return {
      setupMode,
      authenticated: !!ctx.user,
      user: ctx.user
        ? {
            id: ctx.user.id,
            email: ctx.user.email,
            name: ctx.user.name,
            createdAt: new Date(ctx.user.createdAt),
          }
        : null,
    };
  }),

  // === User management (protected) ===
  listUsers: protectedProcedure.query((): AppUser[] => {
    return authService.listUsers();
  }),

  createUser: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8, 'Password must be at least 8 characters'),
      })
    )
    .mutation(async ({ input }) => {
      // Use email as the name (better-auth requires a name)
      const user = await authService.createUser(input.email, input.password, input.email);
      return user;
    }),

  deleteUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ input, ctx }) => {
      // Prevent deleting own account
      if (ctx.user && ctx.user.id === input.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete your own account',
        });
      }

      // Prevent deleting last user
      if (authService.getUserCount() <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete the last user',
        });
      }

      authService.deleteUser(input.userId);
      return { success: true };
    }),

  // === Version info (public) ===
  getVersion: t.procedure.query(() => {
    return { version: appVersion };
  }),

  // === Password configuration (protected) ===
  getShellyPassword: protectedProcedure.query(() => {
    const password = configService.getShellyPassword();
    return { hasPassword: password !== null };
  }),

  setShellyPassword: protectedProcedure
    .input(z.object({ password: z.string().nullable() }))
    .mutation(async ({ input }) => {
      configService.setShellyPassword(input.password);
      // Re-check auth status for all devices with new password
      await shellyService.recheckAllAuthStatus();
      return { success: true };
    }),

  setDevicePassword: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      const password = configService.getShellyPassword();
      if (!password) {
        throw new Error('No password configured. Please set a password in Settings first.');
      }
      await shellyService.setDevicePassword(input.deviceId, password);
      return { success: true };
    }),

  // BLE management (protected)
  setBleEnabled: protectedProcedure
    .input(z.object({ deviceId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      await shellyService.setBleEnabled(input.deviceId, input.enabled);
      return { success: true };
    }),

  // Cloud management (protected)
  setCloudEnabled: protectedProcedure
    .input(z.object({ deviceId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      await shellyService.setCloudEnabled(input.deviceId, input.enabled);
      return { success: true };
    }),

  // WiFi AP management (protected)
  setWifiApEnabled: protectedProcedure
    .input(z.object({ deviceId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      await shellyService.setWifiApEnabled(input.deviceId, input.enabled);
      return { success: true };
    }),

  setWifiApPassword: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      await shellyService.setWifiApPassword(input.deviceId);
      return { success: true };
    }),

  controlDevice: protectedProcedure
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

  getDeviceInfo: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .query(async ({ input }) => {
      return shellyService.getDeviceInfo(input.deviceId);
    }),

  rebootDevice: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      await shellyService.rebootDevice(input.deviceId);
      return { success: true };
    }),

  factoryResetDevice: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      await shellyService.factoryResetDevice(input.deviceId);
      return { success: true };
    }),

  refreshDeviceStatus: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input }) => {
      await shellyService.refreshDeviceStatus(input.deviceId);
      return { success: true };
    }),

  discoverDevices: protectedProcedure.mutation(async () => {
    return shellyService.startDiscovery();
  }),

  onDevices: protectedProcedure.subscription(() => {
    return observable<Device[]>((emit) => {
      emit.next(shellyService.getDevices());

      const handler = () => emit.next(shellyService.getDevices());
      shellyService.on('devicesChanged', handler);

      return () => shellyService.off('devicesChanged', handler);
    });
  }),

  onDeviceUpdate: protectedProcedure
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

  onDeviceDiscovered: protectedProcedure.subscription(() => {
    return observable<Device>((emit) => {
      const handler = (device: Device) => emit.next(device);
      shellyService.on('deviceDiscovered', handler);
      return () => shellyService.off('deviceDiscovered', handler);
    });
  }),

  // Provisioning WiFi configuration (protected)
  getProvisioningWifi: protectedProcedure.query(() => {
    const wifi = configService.getProvisioningWifi();
    return wifi ? { ssid: wifi.ssid, hasPassword: true } : null;
  }),

  setProvisioningWifi: protectedProcedure
    .input(z.object({ wifi: ProvisioningWifiSchema.nullable() }))
    .mutation(({ input }) => {
      configService.setProvisioningWifi(input.wifi);
      return { success: true };
    }),

  // Auto-provisioning status (protected)
  getAutoProvisioningStatus: protectedProcedure.query(() => {
    return {
      enabled: shellyService.isAutoProvisioningEnabled(),
      isProvisioning: provisioningService.isProvisioning(),
      currentStatus: provisioningService.getCurrentStatus(),
    };
  }),

  // Unprovisioned devices (protected)
  onUnprovisionedDevices: protectedProcedure.subscription(() => {
    return observable<UnprovisionedDevice[]>((emit) => {
      emit.next(shellyService.getUnprovisionedDevices());

      const handler = () => emit.next(shellyService.getUnprovisionedDevices());
      shellyService.on('unprovisionedDevicesChanged', handler);

      return () => shellyService.off('unprovisionedDevicesChanged', handler);
    });
  }),

  // Provision a device (protected)
  provisionDevice: protectedProcedure
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

  // Notifications (protected)
  onNotifications: protectedProcedure.subscription(() => {
    return observable<Notification>((emit) => {
      const handler = (notification: Notification) => emit.next(notification);
      notificationService.on('notification', handler);

      return () => notificationService.off('notification', handler);
    });
  }),

  getRecentNotifications: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ input }) => {
      return notificationService.getRecent(input?.limit);
    }),

  // === Script management ===
  scripts: t.router({
    list: protectedProcedure
      .input(z.object({ includeArchived: z.boolean().optional() }).optional())
      .query(({ input }) => scriptService.listScripts(input?.includeArchived ?? false)),

    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        const script = scriptService.getScript(input.id);
        if (!script) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Script not found' });
        }
        return script;
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(200),
          description: z.string().max(2000).nullable().optional(),
          code: z.string().max(100_000),
        })
      )
      .mutation(({ input }) =>
        scriptService.createScript({
          name: input.name,
          description: input.description ?? null,
          code: input.code,
        })
      ),

    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().min(1).max(200).optional(),
          description: z.string().max(2000).nullable().optional(),
          code: z.string().max(100_000).optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...rest } = input;
        return scriptService.updateScript(id, rest);
      }),

    archive: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => {
        scriptService.archiveScript(input.id);
        return { success: true };
      }),

    unarchive: protectedProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => {
        scriptService.unarchiveScript(input.id);
        return { success: true };
      }),

    listOnDevice: protectedProcedure
      .input(z.object({ deviceId: z.string() }))
      .query(({ input }) => shellyService.getDeviceScripts(input.deviceId)),

    deploy: protectedProcedure
      .input(
        z.object({
          deviceId: z.string(),
          scriptId: z.string(),
          enable: z.boolean(),
          start: z.boolean(),
          targetShellyScriptId: z.number().int().optional(),
        })
      )
      .mutation(({ input }) =>
        shellyService.deployScriptToDevice(input.deviceId, input.scriptId, {
          enable: input.enable,
          start: input.start,
          targetShellyScriptId: input.targetShellyScriptId,
        })
      ),

    import: protectedProcedure
      .input(z.object({ deviceId: z.string(), shellyScriptId: z.number().int() }))
      .mutation(({ input }) =>
        shellyService.importDeviceScript(input.deviceId, input.shellyScriptId)
      ),

    controlOnDevice: protectedProcedure
      .input(
        z.object({
          deviceId: z.string(),
          shellyScriptId: z.number().int(),
          action: z.enum(['start', 'stop', 'delete']),
        })
      )
      .mutation(async ({ input }) => {
        await shellyService.controlDeviceScript(
          input.deviceId,
          input.shellyScriptId,
          input.action
        );
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
