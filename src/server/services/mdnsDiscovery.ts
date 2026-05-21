import { EventEmitter } from 'events';
import { Bonjour, type Service, type Browser } from 'bonjour-service';

export interface MdnsDevice {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  port: number;
  gen: number;
  // User-assigned name from a friendly-name announcement, when this record
  // wasn't the technical "shellyXXX-MAC" one. Undefined for technical records.
  friendlyName?: string;
}

interface MdnsRecord {
  type: string;
  name?: string;
  data?: unknown;
  ttl?: number;
}

interface MdnsResponsePacket {
  answers?: MdnsRecord[];
  additionals?: MdnsRecord[];
}

interface MdnsLike {
  on(event: 'response', listener: (packet: MdnsResponsePacket) => void): void;
  removeListener(event: 'response', listener: (packet: MdnsResponsePacket) => void): void;
}

class MdnsDiscovery extends EventEmitter {
  private bonjour: Bonjour;
  private browser: Browser | null = null;
  private discoveredDevices = new Map<string, MdnsDevice>();
  private responseListener: ((packet: MdnsResponsePacket) => void) | null = null;

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

    // bonjour-service only emits `up` on the *first* sighting and `txt-update`
    // when TXT records change. Devices that quietly re-announce themselves
    // never produce another event, so we tap the underlying multicast-dns
    // stream to refresh liveness on every response packet.
    const mdns = this.getRawMdns();
    if (mdns && !this.responseListener) {
      this.responseListener = (packet) => this.handleRawResponse(packet);
      mdns.on('response', this.responseListener);
    }
  }

  stop(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    const mdns = this.getRawMdns();
    if (mdns && this.responseListener) {
      mdns.removeListener('response', this.responseListener);
      this.responseListener = null;
    }
  }

  private getRawMdns(): MdnsLike | null {
    const server = (this.bonjour as unknown as { server?: { mdns?: MdnsLike } }).server;
    return server?.mdns ?? null;
  }

  private handleRawResponse(packet: MdnsResponsePacket): void {
    const records = [...(packet.answers ?? []), ...(packet.additionals ?? [])];
    const seenIds = new Set<string>();
    for (const rec of records) {
      if (!rec || rec.ttl === 0) continue;
      const candidates: string[] = [];
      if (typeof rec.name === 'string') candidates.push(rec.name);
      if (typeof rec.data === 'string') candidates.push(rec.data);
      for (const candidate of candidates) {
        const id = this.matchTechnicalName(candidate);
        if (id && this.discoveredDevices.has(id)) {
          seenIds.add(id);
        }
      }
    }
    for (const id of seenIds) {
      this.emit('deviceSeen', id);
    }
  }

  restart(): void {
    this.stop();
    this.start();
  }

  /**
   * Send a fresh PTR query so currently-alive devices reply. Responses flow
   * through the raw-response listener which emits `deviceSeen` per matching id.
   */
  requery(): void {
    this.browser?.update();
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
    // Shelly devices announce two _shelly._tcp records: one keyed by the
    // technical hostname ("shellyi4g3-AABBCC") and one keyed by the user's
    // configured device name ("Saal Taster Terasse"). Both records share the
    // same SRV target (host), so we can recover the device id from the host
    // when the service name itself doesn't carry it.
    const isTechnicalName = this.matchTechnicalName(service.name) !== null;
    const technicalSource = isTechnicalName ? service.name : service.host || '';
    const id = this.matchTechnicalName(technicalSource);
    if (!id) {
      return null;
    }

    // Shelly mDNS names are like "shellyplus1-aabbcc", "shelly1-AABBCC", or "shellyXg4-..."
    // Heuristic only — the authoritative gen comes from the device's /shelly endpoint.
    const techLower = technicalSource.toLowerCase();
    const explicitGenMatch = techLower.match(/g(\d+)(?:-|$|\.)/);
    let gen: number;
    if (explicitGenMatch) {
      gen = parseInt(explicitGenMatch[1], 10);
    } else if (
      techLower.includes('plus') ||
      techLower.includes('pro') ||
      techLower.includes('mini') ||
      techLower.includes('blu')
    ) {
      gen = 2;
    } else {
      gen = 1;
    }

    const type = this.formatDeviceType(technicalSource);

    return {
      id,
      name: service.name,
      type,
      ipAddress,
      port: service.port || 80,
      gen,
      friendlyName: isTechnicalName ? undefined : service.name,
    };
  }

  private extractDeviceId(service: Service): string | null {
    // Try the service instance name first; fall back to the SRV target so we
    // still recognise the friendly-name record as belonging to a known device.
    return (
      this.matchTechnicalName(service.name) ||
      this.matchTechnicalName(service.host || '')
    );
  }

  private matchTechnicalName(value: string): string | null {
    // Technical Shelly identifier: "shellyXXX-AABBCC" (optionally followed by
    // ".local" when it comes from a hostname).
    const match = value.match(/shelly[^-]+-([a-fA-F0-9]+)/i);
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
