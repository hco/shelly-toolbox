import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import {
  SHELLY_AP_IP,
  PROVISIONING_RETRY_COUNT,
  PROVISIONING_STEP_TIMEOUT,
} from '@/shared/constants';
import type { ProvisioningStatus, UnprovisionedDevice } from '@/shared/types';
import { wifiConnectionService } from './wifiConnectionService';
import { notificationService } from './notificationService';
import { configService } from './configService';

interface ProvisioningState {
  ssid: string;
  status: ProvisioningStatus;
  step: string;
  retryCount: number;
  error?: string;
}

class ProvisioningService extends EventEmitter {
  private currentProvisioning: ProvisioningState | null = null;

  isProvisioning(): boolean {
    return this.currentProvisioning !== null;
  }

  getCurrentStatus(): ProvisioningState | null {
    return this.currentProvisioning;
  }

  async provisionDevice(device: UnprovisionedDevice): Promise<boolean> {
    if (this.currentProvisioning) {
      notificationService.warning(
        'Provisioning in progress',
        `Already provisioning ${this.currentProvisioning.ssid}`,
        { deviceSsid: device.ssid }
      );
      return false;
    }

    const provisioningWifi = configService.getProvisioningWifi();
    if (!provisioningWifi) {
      notificationService.error(
        'Configuration missing',
        'Please configure the target WiFi network in Settings before provisioning',
        { deviceSsid: device.ssid }
      );
      return false;
    }

    this.currentProvisioning = {
      ssid: device.ssid,
      status: 'idle',
      step: 'Starting',
      retryCount: 0,
    };

    this.emit('statusChanged', this.currentProvisioning);

    notificationService.info(
      'Provisioning started',
      `Starting provisioning for ${device.ssid}`,
      { deviceSsid: device.ssid }
    );

    let success = false;

    try {
      // Step 1: Save current WiFi connection
      await this.executeStep('connecting_to_ap', 'Saving current connection', async () => {
        await wifiConnectionService.saveCurrentConnection();
      });

      // Step 2: Connect to Shelly AP
      success = await this.executeStepWithRetry('connecting_to_ap', 'Connecting to Shelly AP', async () => {
        const connected = await wifiConnectionService.connectToOpenNetwork(device.ssid);
        if (!connected) {
          throw new Error('Failed to connect to Shelly AP');
        }
      });

      if (!success) {
        throw new Error('Failed to connect to Shelly AP after retries');
      }

      // Step 3: Configure WiFi on Shelly
      success = await this.executeStepWithRetry('configuring_wifi', 'Configuring WiFi on device', async () => {
        await this.configureDeviceWifi(provisioningWifi.ssid, provisioningWifi.password);
      });

      if (!success) {
        throw new Error('Failed to configure WiFi on device after retries');
      }

      // Step 4: Set device password (if configured)
      const shellyPassword = configService.getShellyPassword();
      if (shellyPassword) {
        success = await this.executeStepWithRetry('setting_password', 'Setting device password', async () => {
          await this.setDevicePassword(shellyPassword, device.gen);
        });

        if (!success) {
          // Password setting failed but WiFi is configured - warn but continue
          notificationService.warning(
            'Password not set',
            `WiFi configured but failed to set password on ${device.ssid}`,
            { deviceSsid: device.ssid }
          );
        }
      }

      // Step 5: Reconnect to original WiFi
      await this.executeStep('reconnecting', 'Reconnecting to original network', async () => {
        await wifiConnectionService.disconnect();
        await wifiConnectionService.reconnectToSaved();
      });

      // Step 6: Wait for device to appear on network
      await this.executeStep('waiting_for_device', 'Waiting for device to join network', async () => {
        // Give the device time to connect to the configured network
        await new Promise((resolve) => setTimeout(resolve, 10000));
      });

      // Success!
      this.updateStatus('success', 'Provisioning complete');

      notificationService.success(
        'Provisioning complete',
        `${device.ssid} has been configured and should appear in the device list shortly`,
        { deviceSsid: device.ssid }
      );

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateStatus('failed', errorMessage);

      notificationService.error(
        'Provisioning failed',
        `Failed to provision ${device.ssid}: ${errorMessage}`,
        { deviceSsid: device.ssid, error: errorMessage }
      );

      // Try to restore original connection
      try {
        await wifiConnectionService.reconnectToSaved();
      } catch {
        notificationService.error(
          'Connection restore failed',
          'Could not reconnect to original WiFi network. Please reconnect manually.',
          { deviceSsid: device.ssid }
        );
      }

      return false;
    } finally {
      this.currentProvisioning = null;
      this.emit('statusChanged', null);
    }
  }

  private updateStatus(status: ProvisioningStatus, step: string): void {
    if (this.currentProvisioning) {
      this.currentProvisioning.status = status;
      this.currentProvisioning.step = step;
      this.emit('statusChanged', this.currentProvisioning);
    }
  }

  private async executeStep(
    status: ProvisioningStatus,
    step: string,
    action: () => Promise<void>
  ): Promise<void> {
    this.updateStatus(status, step);
    await action();
  }

  private async executeStepWithRetry(
    status: ProvisioningStatus,
    step: string,
    action: () => Promise<void>
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= PROVISIONING_RETRY_COUNT; attempt++) {
      this.updateStatus(status, `${step} (attempt ${attempt}/${PROVISIONING_RETRY_COUNT})`);

      if (this.currentProvisioning) {
        this.currentProvisioning.retryCount = attempt;
      }

      try {
        await Promise.race([
          action(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Step timeout')), PROVISIONING_STEP_TIMEOUT)
          ),
        ]);
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Provisioning] ${step} failed (attempt ${attempt}): ${errorMessage}`);

        if (attempt < PROVISIONING_RETRY_COUNT) {
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    return false;
  }

  private async configureDeviceWifi(ssid: string, password: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVISIONING_STEP_TIMEOUT);

    try {
      const response = await fetch(`http://${SHELLY_AP_IP}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          method: 'WiFi.SetConfig',
          params: {
            config: {
              sta: {
                ssid,
                pass: password,
                enable: true,
              },
            },
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`WiFi.SetConfig failed: ${response.status} ${text}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(`WiFi.SetConfig error: ${result.error.message || JSON.stringify(result.error)}`);
      }

      console.log('[Provisioning] WiFi configured successfully');
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Timeout configuring WiFi');
      }
      throw err;
    }
  }

  private async setDevicePassword(password: string, gen: 1 | 2): Promise<void> {
    if (gen === 2) {
      await this.setGen2Password(password);
    } else {
      await this.setGen1Password(password);
    }
  }

  private async setGen2Password(password: string): Promise<void> {
    // First get device info to get the realm
    const controller1 = new AbortController();
    const timeout1 = setTimeout(() => controller1.abort(), PROVISIONING_STEP_TIMEOUT);

    let deviceId: string;
    try {
      const infoResponse = await fetch(`http://${SHELLY_AP_IP}/shelly`, {
        signal: controller1.signal,
      });
      clearTimeout(timeout1);

      if (!infoResponse.ok) {
        throw new Error('Could not fetch device info');
      }

      const info = await infoResponse.json();
      deviceId = info.id;
    } catch (err) {
      clearTimeout(timeout1);
      throw err;
    }

    // Calculate HA1 for digest auth
    const username = 'admin';
    const ha1 = createHash('sha256')
      .update(`${username}:${deviceId}:${password}`)
      .digest('hex');

    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), PROVISIONING_STEP_TIMEOUT);

    try {
      const response = await fetch(`http://${SHELLY_AP_IP}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          method: 'Shelly.SetAuth',
          params: { user: username, realm: deviceId, ha1 },
        }),
        signal: controller2.signal,
      });
      clearTimeout(timeout2);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Shelly.SetAuth failed: ${response.status} ${text}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(`Shelly.SetAuth error: ${result.error.message || JSON.stringify(result.error)}`);
      }

      console.log('[Provisioning] Password set successfully (Gen2)');
    } catch (err) {
      clearTimeout(timeout2);
      throw err;
    }
  }

  private async setGen1Password(password: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVISIONING_STEP_TIMEOUT);

    try {
      const params = new URLSearchParams({
        enabled: '1',
        username: 'admin',
        password: password,
      });

      const response = await fetch(
        `http://${SHELLY_AP_IP}/settings/login?${params.toString()}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to set password: ${response.status} ${text}`);
      }

      const result = await response.json();
      if (result.enabled !== true) {
        throw new Error('Password was not enabled on device');
      }

      console.log('[Provisioning] Password set successfully (Gen1)');
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
}

// Singleton instance
export const provisioningService = new ProvisioningService();
