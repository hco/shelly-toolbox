import type { Device } from '@/shared/types.js';
import type { ShellyHttpClient } from '../http/ShellyHttpClient.js';

/**
 * Context object passed to all device operations
 */
export interface DeviceOperationContext {
  device: Device;
  password: string;
  httpClient: ShellyHttpClient;
}

/**
 * Parameters for controlling a switch
 */
export interface SwitchControlParams {
  capabilityId: string; // e.g., 'relay-0'
  on: boolean;
}

/**
 * Result from fetching device information
 */
export interface DeviceInfoResult {
  name?: string;
  firmwareVersion?: string;
  id?: string;
}

/**
 * WiFi AP configuration
 */
export interface WifiApConfig {
  enabled: boolean;
  isOpen: boolean;
}

/**
 * Strategy interface for device-specific operations
 * Implementations exist for Gen1 and Gen2 devices
 */
export interface DeviceStrategy {
  /**
   * Control a switch relay on the device
   * @param ctx Operation context
   * @param params Switch control parameters
   * @throws Error if the operation fails
   */
  controlSwitch(ctx: DeviceOperationContext, params: SwitchControlParams): Promise<void>;

  /**
   * Get the device name from the device
   * @param ctx Operation context
   * @returns Device name or null if unavailable
   */
  getDeviceName(ctx: DeviceOperationContext): Promise<string | null>;

  /**
   * Get comprehensive device information (name, firmware, id, etc.)
   * @param ctx Operation context
   * @returns Device info or null if unavailable
   */
  getDeviceInfo(ctx: DeviceOperationContext): Promise<DeviceInfoResult | null>;

  /**
   * Get WiFi AP configuration from the device
   * @param ctx Operation context
   * @returns WiFi AP config or null if unavailable
   */
  getWifiApConfig(ctx: DeviceOperationContext): Promise<WifiApConfig | null>;

  /**
   * Enable or disable the WiFi AP on the device
   * @param ctx Operation context
   * @param enabled Whether to enable or disable the AP
   * @throws Error if the operation fails
   */
  setWifiApEnabled(ctx: DeviceOperationContext, enabled: boolean): Promise<void>;

  /**
   * Set the WiFi AP password on the device
   * @param ctx Operation context
   * @param password The password to set for the AP
   * @throws Error if the operation fails
   */
  setWifiApPassword(ctx: DeviceOperationContext, password: string): Promise<void>;

  /**
   * Set the device authentication password
   * @param ctx Operation context
   * @param newPassword The new password to set
   * @throws Error if the operation fails
   */
  setPassword(ctx: DeviceOperationContext, newPassword: string): Promise<void>;

  /**
   * Reboot the device
   * @param ctx Operation context
   * @throws Error if the operation fails
   */
  rebootDevice(ctx: DeviceOperationContext): Promise<void>;

  /**
   * Factory reset the device to default settings
   * @param ctx Operation context
   * @throws Error if the operation fails
   */
  factoryReset(ctx: DeviceOperationContext): Promise<void>;

  /**
   * Fetch device logs
   * @param ctx Operation context
   * @returns Array of log entries
   */
  fetchLogs(ctx: DeviceOperationContext): Promise<string[]>;
}
