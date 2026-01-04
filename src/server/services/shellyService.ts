import { EventEmitter } from 'events';
import type { Device, DeviceCommand } from '@/shared/types.js';
import { mdnsDiscovery, type MdnsDevice } from './mdnsDiscovery.js';

class ShellyService extends EventEmitter {
  private devices: Map<string, Device> = new Map();

  constructor() {
    super();
    this.setupMdnsListeners();
    mdnsDiscovery.start();
  }

  private setupMdnsListeners(): void {
    mdnsDiscovery.on('deviceFound', (mdnsDevice: MdnsDevice) => {
      const device = this.createDeviceFromMdns(mdnsDevice);
      this.devices.set(device.id, device);
      this.emit('deviceDiscovered', device);
      this.emit('devicesChanged');
    });

    mdnsDiscovery.on('deviceUpdated', (mdnsDevice: MdnsDevice) => {
      const existing = this.devices.get(mdnsDevice.id);
      if (existing) {
        existing.ipAddress = mdnsDevice.ipAddress;
        existing.lastSeen = new Date().toISOString();
        existing.online = true;
        this.emit('deviceUpdate', existing);
        this.emit('devicesChanged');
      }
    });

    mdnsDiscovery.on('deviceLost', (mdnsDevice: MdnsDevice) => {
      const existing = this.devices.get(mdnsDevice.id);
      if (existing) {
        existing.online = false;
        this.emit('deviceUpdate', existing);
        this.emit('devicesChanged');
      }
    });
  }

  private createDeviceFromMdns(mdnsDevice: MdnsDevice): Device {
    // Create a basic device with switch capability
    // Full capability detection would require HTTP calls to the device
    return {
      id: mdnsDevice.id,
      name: mdnsDevice.name,
      type: mdnsDevice.type,
      ipAddress: mdnsDevice.ipAddress,
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
  }

  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  async controlDevice(deviceId: string, command: DeviceCommand): Promise<void> {
    const device = this.devices.get(deviceId);
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
    // Restart mDNS browsing to find new devices
    mdnsDiscovery.restart();
    return { discovered: this.devices.size };
  }
}

export const shellyService = new ShellyService();
