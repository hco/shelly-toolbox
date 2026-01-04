import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import type { Context } from './context.js';
import { DeviceCommandSchema } from '@/shared/types.js';
import { shellyService } from './services/shellyService.js';
import type { Device } from '@/shared/types.js';

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
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
});

export type AppRouter = typeof appRouter;
