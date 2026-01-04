import { useState } from 'react';
import {
  Button,
  Card,
  Group,
  PasswordInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { trpc } from '@/client/utils/trpc.js';

export function Settings() {
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: passwordData } = trpc.getShellyPassword.useQuery();
  const setPasswordMutation = trpc.setShellyPassword.useMutation();

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
