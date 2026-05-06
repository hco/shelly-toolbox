import { createHash } from 'crypto';
import { ShellyAuthHelper } from '../auth/shellyAuth.js';
import type { DeviceStrategy, DeviceOperationContext, SwitchControlParams, DeviceInfoResult, WifiApConfig } from './types.js';

/**
 * Strategy for Gen2/Gen3 Shelly devices
 * Uses RPC-based API with digest authentication
 */
export class Gen2Strategy implements DeviceStrategy {
  /**
   * Control a switch on the device (NEW: Actually sends RPC command)
   */
  async controlSwitch(ctx: DeviceOperationContext, params: SwitchControlParams): Promise<void> {
    const uri = '/rpc';
    const headers = await ShellyAuthHelper.getAuthHeaders(
      ctx.httpClient,
      ctx.device,
      ctx.password,
      uri,
      'POST'
    );

    if (!headers) {
      throw new Error(`Failed to authenticate with device ${ctx.device.name}`);
    }

    // Extract relay ID from capability ID (e.g., 'relay-0' -> 0)
    const relayId = parseInt(params.capabilityId.split('-')[1] || '0', 10);

    const response = await ctx.httpClient.post(
      `http://${ctx.device.ipAddress}/rpc`,
      {
        id: 1,
        method: 'Switch.Set',
        params: { id: relayId, on: params.on },
      },
      headers,
      10000
    );

    if (!response.ok) {
      throw new Error(`Switch control failed: ${response.status} ${response.text}`);
    }

    // Check for RPC error in response
    const result = response.data as { error?: { message?: string } };
    if (result?.error) {
      throw new Error(`Switch.Set failed: ${result.error.message}`);
    }
  }

  /**
   * Get device name using Shelly.GetDeviceInfo RPC
   */
  async getDeviceName(ctx: DeviceOperationContext): Promise<string | null> {
    const uri = '/rpc/Shelly.GetDeviceInfo';
    const headers = await ShellyAuthHelper.getAuthHeaders(
      ctx.httpClient,
      ctx.device,
      ctx.password,
      uri,
      'GET'
    );

    if (!headers) {
      return this.fallbackToShellyEndpoint(ctx);
    }

    try {
      const response = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}${uri}`,
        headers
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
   * Get comprehensive device information
   */
  async getDeviceInfo(ctx: DeviceOperationContext): Promise<DeviceInfoResult | null> {
    const uri = '/rpc/Shelly.GetDeviceInfo';
    const headers = await ShellyAuthHelper.getAuthHeaders(
      ctx.httpClient,
      ctx.device,
      ctx.password,
      uri,
      'GET'
    );

    if (!headers) {
      return null;
    }

    try {
      const response = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}${uri}`,
        headers
      );

      if (!response.ok) {
        return null;
      }

      const data = response.data as { name?: string; fw_id?: string; id?: string };
      return {
        name: data.name,
        firmwareVersion: data.fw_id,
        id: data.id,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get WiFi AP configuration using WiFi.GetConfig RPC
   */
  async getWifiApConfig(ctx: DeviceOperationContext): Promise<WifiApConfig | null> {
    const uri = '/rpc/WiFi.GetConfig';
    const headers = await ShellyAuthHelper.getAuthHeaders(
      ctx.httpClient,
      ctx.device,
      ctx.password,
      uri,
      'GET'
    );

    if (!headers) {
      return null;
    }

    try {
      const response = await ctx.httpClient.get(
        `http://${ctx.device.ipAddress}${uri}`,
        headers
      );

      if (!response.ok) {
        return null;
      }

      const data = response.data as { ap?: { enable?: boolean; is_open?: boolean } };
      if (data.ap) {
        return {
          enabled: data.ap.enable === true,
          isOpen: data.ap.is_open === true,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Enable or disable WiFi AP using WiFi.SetConfig RPC
   */
  async setWifiApEnabled(ctx: DeviceOperationContext, enabled: boolean): Promise<void> {
    const uri = '/rpc';
    const headers = await ShellyAuthHelper.getAuthHeaders(
      ctx.httpClient,
      ctx.device,
      ctx.password,
      uri,
      'POST'
    );

    if (!headers) {
      throw new Error('Failed to authenticate with device');
    }

    try {
      const response = await ctx.httpClient.post(
        `http://${ctx.device.ipAddress}/rpc`,
        {
          id: 1,
          method: 'WiFi.SetConfig',
          params: { config: { ap: { enable: enabled } } },
        },
        headers,
        10000
      );

      if (!response.ok) {
        throw new Error(`Failed to set WiFi AP: ${response.status} ${response.text}`);
      }

      const result = response.data as { error?: { message?: string } };
      if (result?.error) {
        throw new Error(`WiFi.SetConfig failed: ${result.error.message}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting WiFi AP for ${ctx.device.name}`);
      }
      throw err;
    }
  }

  /**
   * Set WiFi AP password using WiFi.SetConfig RPC
   */
  async setWifiApPassword(ctx: DeviceOperationContext, password: string): Promise<void> {
    const uri = '/rpc';
    const headers = await ShellyAuthHelper.getAuthHeaders(
      ctx.httpClient,
      ctx.device,
      ctx.password,
      uri,
      'POST'
    );

    if (!headers) {
      throw new Error('Failed to authenticate with device');
    }

    try {
      const response = await ctx.httpClient.post(
        `http://${ctx.device.ipAddress}/rpc`,
        {
          id: 1,
          method: 'WiFi.SetConfig',
          params: { config: { ap: { pass: password } } },
        },
        headers,
        10000
      );

      if (!response.ok) {
        throw new Error(`Failed to set WiFi AP password: ${response.status} ${response.text}`);
      }

      const result = response.data as { error?: { message?: string } };
      if (result?.error) {
        throw new Error(`WiFi.SetConfig failed: ${result.error.message}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting WiFi AP password for ${ctx.device.name}`);
      }
      throw err;
    }
  }

  /**
   * Set device password using Shelly.SetAuth RPC
   */
  async setPassword(ctx: DeviceOperationContext, newPassword: string): Promise<void> {
    // First, fetch device info to get the correct realm (device ID)
    const deviceInfo = await this.fetchDeviceIdForAuth(ctx);
    if (!deviceInfo) {
      throw new Error(`Could not fetch device info for ${ctx.device.name}`);
    }

    const username = 'admin';
    const realm = deviceInfo.id;
    const ha1 = createHash('sha256')
      .update(`${username}:${realm}:${newPassword}`)
      .digest('hex');

    try {
      const response = await ctx.httpClient.post(
        `http://${ctx.device.ipAddress}/rpc`,
        {
          id: 1,
          method: 'Shelly.SetAuth',
          params: { user: username, realm, ha1 },
        },
        {},
        10000
      );

      if (!response.ok) {
        throw new Error(`Failed to set password: ${response.status} ${response.text}`);
      }

      const result = response.data as { error?: { message?: string } };
      if (result?.error) {
        throw new Error(`Shelly.SetAuth failed: ${result.error.message}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Timeout setting password for ${ctx.device.name}`);
      }
      throw err;
    }
  }

  /**
   * Reboot the device using Shelly.Reboot RPC
   */
  async rebootDevice(ctx: DeviceOperationContext): Promise<void> {
    const uri = '/rpc';
    const headers = await ShellyAuthHelper.getAuthHeaders(
      ctx.httpClient,
      ctx.device,
      ctx.password,
      uri,
      'POST'
    );

    if (!headers) {
      throw new Error('Failed to authenticate with device');
    }

    try {
      const response = await ctx.httpClient.post(
        `http://${ctx.device.ipAddress}/rpc`,
        {
          id: 1,
          method: 'Shelly.Reboot',
        },
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
    // Gen2 factory reset API varies by device model
    // This is a placeholder for future implementation
    throw new Error('Factory reset not yet implemented for Gen2 devices');
  }

  /**
   * Fetch device logs (placeholder - API TBD)
   */
  async fetchLogs(_ctx: DeviceOperationContext): Promise<string[]> {
    // Gen2 devices may have logs via Shelly.GetLog or similar
    // This is a placeholder for future implementation
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

  /**
   * Fetch device ID from /shelly endpoint for authentication
   */
  private async fetchDeviceIdForAuth(ctx: DeviceOperationContext): Promise<{ id: string } | null> {
    try {
      const response = await ctx.httpClient.get(`http://${ctx.device.ipAddress}/shelly`);

      if (!response.ok) {
        return null;
      }

      const data = response.data as { id?: string };
      if (typeof data?.id === 'string') {
        return { id: data.id };
      }
      return null;
    } catch {
      return null;
    }
  }
}
