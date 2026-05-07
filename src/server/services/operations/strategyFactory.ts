import type { Device } from '@/shared/types.js';
import type { DeviceStrategy } from './types.js';
import { Gen1Strategy } from './Gen1Strategy.js';
import { Gen2Strategy } from './Gen2Strategy.js';

/**
 * Factory for creating device-specific strategy instances
 * Eliminates Gen1/Gen2 branching throughout the codebase
 */
export class StrategyFactory {
  private static gen1Strategy = new Gen1Strategy();
  private static gen2Strategy = new Gen2Strategy();

  /**
   * Get the appropriate strategy for a device based on its generation
   * @param device The device to get a strategy for
   * @returns DeviceStrategy instance (Gen1 or Gen2)
   */
  static getStrategy(device: Device): DeviceStrategy {
    return device.gen >= 2 ? this.gen2Strategy : this.gen1Strategy;
  }
}
