import { EventEmitter } from 'events';
import type { Device, DeviceCommand } from '@/shared/types.js';

class ShellyService extends EventEmitter {
  private devices: Device[] = [
    {
      id: 'shelly-1',
      name: 'Living Room Light',
      type: 'Shelly 1',
      ipAddress: '192.168.1.100',
      online: true,
      lastSeen: new Date().toISOString(),
      capabilities: [
        {
          type: 'switch',
          id: 'relay-0',
          state: { on: false },
        },
      ],
    },
    {
      id: 'shelly-2',
      name: 'Kitchen Dimmer',
      type: 'Shelly Dimmer 2',
      ipAddress: '192.168.1.101',
      online: true,
      lastSeen: new Date().toISOString(),
      capabilities: [
        {
          type: 'dimmer',
          id: 'light-0',
          state: { on: true, brightness: 75 },
        },
      ],
    },
    {
      id: 'shelly-3',
      name: 'Bedroom Sensor',
      type: 'Shelly H&T',
      ipAddress: '192.168.1.102',
      online: false,
      lastSeen: new Date(Date.now() - 3600000).toISOString(),
      capabilities: [
        {
          type: 'sensor',
          id: 'temp-0',
          state: { temperature: 22.5, humidity: 45 },
        },
      ],
    },
  ];

  getDevices(): Device[] {
    return this.devices;
  }

  async controlDevice(deviceId: string, command: DeviceCommand): Promise<void> {
    const device = this.devices.find((d) => d.id === deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const capability = device.capabilities.find(
      (c) => c.id === command.capability
    );
    if (!capability) {
      throw new Error(`Capability ${command.capability} not found`);
    }

    if (command.action === 'toggle' && capability.type === 'switch') {
      const currentState = capability.state as { on: boolean };
      capability.state = { on: !currentState.on };
    } else if (command.action === 'set' && command.parameters) {
      capability.state = {
        ...(capability.state as Record<string, unknown>),
        ...command.parameters,
      };
    }

    device.lastSeen = new Date().toISOString();

    this.emit('deviceUpdate', device);
    this.emit('devicesChanged');
  }

  async startDiscovery(): Promise<{ discovered: number }> {
    setTimeout(() => {
      const newDevice: Device = {
        id: `shelly-${Date.now()}`,
        name: 'New Discovered Device',
        type: 'Shelly 1',
        ipAddress: `192.168.1.${100 + this.devices.length}`,
        online: true,
        lastSeen: new Date().toISOString(),
        capabilities: [
          {
            type: 'switch',
            id: 'relay-0',
            state: { on: false },
          },
        ],
      };

      this.devices.push(newDevice);
      this.emit('deviceDiscovered', newDevice);
      this.emit('devicesChanged');
    }, 2000);

    return { discovered: 0 };
  }
}

export const shellyService = new ShellyService();
