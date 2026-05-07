import { EventEmitter } from 'events';
import { Bonjour, type Service, type Browser } from 'bonjour-service';

export interface MdnsDevice {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  port: number;
  gen: number;
}

class MdnsDiscovery extends EventEmitter {
  private bonjour: Bonjour;
  private browser: Browser | null = null;
  private discoveredDevices = new Map<string, MdnsDevice>();

  constructor() {
    super();
    this.bonjour = new Bonjour();
  }

  start(): void {
    if (this.browser) {
      return; // Already browsing
    }

    this.browser = this.bonjour.find({ type: 'shelly' }, (service) => {
      this.handleServiceFound(service);
    });

    this.browser.on('down', (service) => {
      this.handleServiceLost(service);
    });
  }

  stop(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
  }

  restart(): void {
    this.stop();
    this.discoveredDevices.clear();
    this.start();
  }

  getDiscoveredDevices(): MdnsDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  private handleServiceFound(service: Service): void {
    const ipAddress = service.addresses?.find((addr) => this.isIPv4(addr));
    if (!ipAddress) {
      return; // Skip if no IPv4 address
    }

    const device = this.parseService(service, ipAddress);
    if (!device) {
      return;
    }

    const existing = this.discoveredDevices.get(device.id);
    if (existing) {
      // Device already known, update IP if changed
      if (existing.ipAddress !== device.ipAddress) {
        this.discoveredDevices.set(device.id, device);
        this.emit('deviceUpdated', device);
      }
      return;
    }

    this.discoveredDevices.set(device.id, device);
    this.emit('deviceFound', device);
  }

  private handleServiceLost(service: Service): void {
    const id = this.extractDeviceId(service);
    if (id && this.discoveredDevices.has(id)) {
      const device = this.discoveredDevices.get(id)!;
      this.discoveredDevices.delete(id);
      this.emit('deviceLost', device);
    }
  }

  private parseService(service: Service, ipAddress: string): MdnsDevice | null {
    const id = this.extractDeviceId(service);
    if (!id) {
      return null;
    }

    // Shelly mDNS names are like "shellyplus1-aabbcc", "shelly1-AABBCC", or "shellyXg4-..."
    // Heuristic only — the authoritative gen comes from the device's /shelly endpoint.
    const nameLower = service.name.toLowerCase();
    const explicitGenMatch = nameLower.match(/g(\d+)(?:-|$)/);
    let gen: number;
    if (explicitGenMatch) {
      gen = parseInt(explicitGenMatch[1], 10);
    } else if (
      nameLower.includes('plus') ||
      nameLower.includes('pro') ||
      nameLower.includes('mini') ||
      nameLower.includes('blu')
    ) {
      gen = 2;
    } else {
      gen = 1;
    }

    const type = this.formatDeviceType(service.name);

    return {
      id,
      name: service.name,
      type,
      ipAddress,
      port: service.port || 80,
      gen,
    };
  }

  private extractDeviceId(service: Service): string | null {
    // Service name format: "shellyXXX-AABBCC" where AABBCC is the device ID
    const match = service.name.match(/shelly[^-]+-([a-fA-F0-9]+)/i);
    return match ? match[1].toLowerCase() : null;
  }

  private formatDeviceType(serviceName: string): string {
    // Convert e.g. "shellyplus1-aabbcc" to "Shelly Plus 1", "shellyi4g3-..." to "Shelly I4 Gen3"
    const match = serviceName.match(/^(shelly[^-]+)/i);
    if (!match) return serviceName;

    let rest = match[1].toLowerCase().replace(/^shelly/, '');

    // Trailing generation marker, e.g. "g3", "g4"
    let genSuffix = '';
    const genMatch = rest.match(/g(\d+)$/);
    if (genMatch) {
      genSuffix = ` Gen${genMatch[1]}`;
      rest = rest.slice(0, -genMatch[0].length);
    }

    const parts: string[] = ['Shelly'];
    for (const prefix of ['plus', 'pro', 'mini', 'blu']) {
      if (rest.startsWith(prefix)) {
        parts.push(prefix.charAt(0).toUpperCase() + prefix.slice(1));
        rest = rest.slice(prefix.length);
        break;
      }
    }

    if (rest) {
      parts.push(rest.toUpperCase());
    }

    return parts.join(' ') + genSuffix;
  }

  private isIPv4(address: string): boolean {
    return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address);
  }
}

export const mdnsDiscovery = new MdnsDiscovery();
