import { useState } from 'react';
import {
  Button,
  Card,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { trpc } from '@/client/utils/trpc.js';

export function Settings() {
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Provisioning WiFi state
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  const { data: passwordData } = trpc.getShellyPassword.useQuery();
  const setPasswordMutation = trpc.setShellyPassword.useMutation();

  const { data: provisioningWifi } = trpc.getProvisioningWifi.useQuery();
  const setProvisioningWifiMutation = trpc.setProvisioningWifi.useMutation();
  const { data: autoProvisioningStatus } = trpc.getAutoProvisioningStatus.useQuery();

  const handleSetPassword = () => {
    setPasswordMutation.mutate(
      { password: passwordInput || null },
      {
        onSuccess() {
          setPasswordInput('');
        },
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const handleClearPassword = () => {
    setPasswordMutation.mutate(
      { password: null },
      {
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const handleSetProvisioningWifi = () => {
    if (!wifiSsid) return;

    setProvisioningWifiMutation.mutate(
      { wifi: { ssid: wifiSsid, password: wifiPassword } },
      {
        onSuccess() {
          setWifiSsid('');
          setWifiPassword('');
        },
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const handleClearProvisioningWifi = () => {
    setProvisioningWifiMutation.mutate(
      { wifi: null },
      {
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Settings</Title>
        <Text c="dimmed" size="sm">
          Configure your Shelly Toolbox preferences.
        </Text>
      </div>

      <Card withBorder padding="md" radius="sm">
        <Stack gap="sm">
          <Text fw={500}>Expected Device Password</Text>
          <Text c="dimmed" size="sm">
            Set the password you want all your Shelly devices to use. Devices
            will be checked against this password.
          </Text>
          <Group gap="sm">
            <PasswordInput
              placeholder={
                passwordData?.hasPassword
                  ? 'Password configured (enter new to change)'
                  : 'Enter password'
              }
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              onClick={handleSetPassword}
              loading={setPasswordMutation.status === 'pending'}
              disabled={!passwordInput}
            >
              {passwordData?.hasPassword ? 'Update' : 'Set'}
            </Button>
            {passwordData?.hasPassword && (
              <Button
                variant="light"
                color="red"
                onClick={handleClearPassword}
                loading={setPasswordMutation.status === 'pending'}
              >
                Clear
              </Button>
            )}
          </Group>
        </Stack>
      </Card>

      {autoProvisioningStatus?.enabled && (
        <Card withBorder padding="md" radius="sm">
          <Stack gap="sm">
            <Text fw={500}>Provisioning WiFi</Text>
            <Text c="dimmed" size="sm">
              Configure the WiFi network that new Shelly devices should join when
              provisioned. This is used when setting up factory-default devices.
            </Text>
            {provisioningWifi ? (
              <Group gap="sm">
                <Text size="sm">
                  Configured: <strong>{provisioningWifi.ssid}</strong>
                </Text>
                <Button
                  variant="light"
                  color="red"
                  size="xs"
                  onClick={handleClearProvisioningWifi}
                  loading={setProvisioningWifiMutation.status === 'pending'}
                >
                  Clear
                </Button>
              </Group>
            ) : (
              <Stack gap="xs">
                <TextInput
                  placeholder="WiFi SSID"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.currentTarget.value)}
                />
                <Group gap="sm">
                  <PasswordInput
                    placeholder="WiFi Password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    onClick={handleSetProvisioningWifi}
                    loading={setProvisioningWifiMutation.status === 'pending'}
                    disabled={!wifiSsid}
                  >
                    Save
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        </Card>
      )}

      {error && (
        <Card withBorder padding="sm" radius="sm" bg="red.0">
          <Text c="red.7" size="sm">
            {error}
          </Text>
        </Card>
      )}
    </Stack>
  );
}
