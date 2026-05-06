import { ShellyAuthHelper } from '../auth/shellyAuth.js';
import type { DeviceStrategy, DeviceOperationContext, SwitchControlParams, DeviceInfoResult, WifiApConfig } from './types.js';

/**
 * Strategy for Gen1 Shelly devices
 * Uses HTTP endpoints with basic authentication
 */
export class Gen1Strategy implements DeviceStrategy {
  /**
   * Control a switch on the device (NEW: Actually sends HTTP command)
   */
  async controlSwitch(ctx: DeviceOperationContext, params: SwitchControlParams): Promise<void> {
    const headers = { Authorization: ShellyAuthHelper.createBasicAuthHeader(ctx.password) };

    // Extract relay ID from capability ID (e.g., 'relay-0' -> 0)
    const relayId = parseInt(params.capabilityId.split('-')[1] || '0', 10);
    const turnAction = params.on ? 'on' : 'off';

    const response = await ctx.httpClient.get(
      `http://${ctx.device.ipAddress}/relay/${relayId}?turn=${turnAction}`,
      headers,
      10000
    );

    if (!response.ok) {
      throw new Error(`Switch control failed: ${response.status} ${response.text}`);
    }
  }

  /**
   * Get device name from /settings endpoint
   */
  async getDeviceName(ctx: DeviceOperationContext): Promise<string | null> {
    try {
      const credentials = Buffer.from(`admin:${ctx.password}`).toString('base64');
      const response = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}/settings`,
        { Authorization: `Basic ${credentials}` }
      );

      if (!response.ok) {
        return this.fallbackToShellyEndpoint(ctx);
      }

      const data = response.data as { name?: string };
      if (typeof data?.name === 'string' && data.name.length > 0) {
        return data.name;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get comprehensive device information from /status and /shelly endpoints
   */
  async getDeviceInfo(ctx: DeviceOperationContext): Promise<DeviceInfoResult | null> {
    try {
      const headers = { Authorization: ShellyAuthHelper.createBasicAuthHeader(ctx.password) };

      // Fetch /status for firmware version
      const statusResponse = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}/status`,
        headers
      );

      const name = await this.getDeviceName(ctx);

      if (statusResponse.ok) {
        const data = statusResponse.data as { update?: { old_version?: string } };
        return {
          name: name || undefined,
          firmwareVersion: data.update?.old_version,
        };
      }

      return name ? { name } : null;
    } catch {
      return null;
    }
  }

  /**
   * Get WiFi AP configuration from /settings/ap endpoint
   */
  async getWifiApConfig(ctx: DeviceOperationContext): Promise<WifiApConfig | null> {
    try {
      const credentials = Buffer.from(`admin:${ctx.password}`).toString('base64');
      const response = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}/settings/ap`,
        { Authorization: `Basic ${credentials}` }
      );

      if (!response.ok) {
        return null;
      }

      const data = response.data as { enabled?: boolean; key?: string };
      return {
        enabled: data.enabled === true,
        isOpen: !data.key || data.key === '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Enable or disable WiFi AP using /settings/ap endpoint
   */
  async setWifiApEnabled(ctx: DeviceOperationContext, enabled: boolean): Promise<void> {
    try {
      const credentials = Buffer.from(`admin:${ctx.password}`).toString('base64');
      const response = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}/settings/ap?enabled=${enabled ? '1' : '0'}`,
        { Authorization: `Basic ${credentials}` },
        10000
      );

      if (!response.ok) {
        throw new Error(`Failed to set WiFi AP: ${response.status} ${response.text}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting WiFi AP for ${ctx.device.name}`);
      }
      throw err;
    }
  }

  /**
   * Set WiFi AP password using /settings/ap endpoint
   */
  async setWifiApPassword(ctx: DeviceOperationContext, password: string): Promise<void> {
    try {
      const credentials = Buffer.from(`admin:${ctx.password}`).toString('base64');
      const response = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}/settings/ap?key=${encodeURIComponent(password)}`,
        { Authorization: `Basic ${credentials}` },
        10000
      );

      if (!response.ok) {
        throw new Error(`Failed to set WiFi AP password: ${response.status} ${response.text}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting WiFi AP password for ${ctx.device.name}`);
      }
      throw err;
    }
  }

  /**
   * Set device password using /settings/login endpoint
   */
  async setPassword(ctx: DeviceOperationContext, newPassword: string): Promise<void> {
    try {
      const params = new URLSearchParams({
        enabled: '1',
        username: 'admin',
        password: newPassword,
      });

      const response = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}/settings/login?${params.toString()}`,
        {},
        10000
      );

      if (!response.ok) {
        throw new Error(`Failed to set password: ${response.status} ${response.text}`);
      }

      const result = response.data as { enabled?: boolean };
      if (result?.enabled !== true) {
        throw new Error('Password was not enabled on device');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting password for ${ctx.device.name}`);
      }
      throw err;
    }
  }

  /**
   * Reboot the device using /reboot endpoint
   */
  async rebootDevice(ctx: DeviceOperationContext): Promise<void> {
    try {
      const headers = { Authorization: ShellyAuthHelper.createBasicAuthHeader(ctx.password) };
      const response = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}/reboot`,
        headers,
        10000
      );

      // Reboot may not return a response before disconnecting
      if (!response.ok && response.status !== 0) {
        throw new Error(`Failed to reboot device: ${response.status} ${response.text}`);
      }
    } catch (err) {
      // Ignore connection errors as the device is rebooting
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('fetch'))) {
        return; // Expected behavior during reboot
      }
      throw err;
    }
  }

  /**
   * Factory reset the device (placeholder - API TBD)
   */
  async factoryReset(_ctx: DeviceOperationContext): Promise<void> {
    // Gen1 factory reset typically requires /settings/factory_reset
    // This is a placeholder for future implementation
    throw new Error('Factory reset not yet implemented for Gen1 devices');
  }

  /**
   * Fetch device logs
   */
  async fetchLogs(_ctx: DeviceOperationContext): Promise<string[]> {
    // Gen1 devices don't have structured logs accessible via API
    return [];
  }

  /**
   * Fallback to /shelly endpoint for device name
   */
  private async fallbackToShellyEndpoint(ctx: DeviceOperationContext): Promise<string | null> {
    try {
      const response = await ctx.httpClient.get(`http://${ctx.device.ipAddress}/shelly`);

      if (!response.ok) {
        return null;
      }

      const data = response.data as { name?: string };
      if (typeof data?.name === 'string' && data.name.length > 0) {
        return data.name;
      }
      return null;
    } catch {
      return null;
    }
  }
}
