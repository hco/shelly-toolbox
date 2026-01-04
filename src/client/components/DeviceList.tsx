import { useState } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/trpc.js';
import { trpc } from '@/client/utils/trpc.js';
import type { AuthStatus } from '@/shared/types.js';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type DevicesOutput = RouterOutputs['onDevices'];

const AUTH_STATUS_CONFIG: Record<
  AuthStatus,
  { color: string; label: string; tooltip: string; variant: string }
> = {
  unknown: {
    color: 'gray',
    label: 'Unknown',
    tooltip: 'Could not determine security status',
    variant: 'light',
  },
  unprotected: {
    color: 'orange',
    label: 'No password',
    tooltip:
      'This device has no password protection. Anyone on your network can control it.',
    variant: 'filled',
  },
  correct_password: {
    color: 'green',
    label: 'Protected',
    tooltip: 'This device is protected with your configured password',
    variant: 'light',
  },
  different_password: {
    color: 'yellow',
    label: 'Different password',
    tooltip:
      'This device is protected but uses a different password than configured',
    variant: 'filled',
  },
};

export function DeviceList() {
  const [devices, setDevices] = useState<DevicesOutput>([] as DevicesOutput);
  const [hasInitialData, setHasInitialData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discoverDevicesMutation = trpc.discoverDevices.useMutation();

  trpc.onDevices.useSubscription(undefined, {
    onStarted() {
      setError(null);
    },
    onData(data) {
      setDevices(data);
      setHasInitialData(true);
    },
    onError(err) {
      setError(err.message);
    },
  });

  const handleDiscoverDevices = () => {
    setError(null);
    discoverDevicesMutation.mutate(undefined, {
      onError(err) {
        setError(err.message);
      },
    });
  };

  const isInitialLoading =
    !hasInitialData || discoverDevicesMutation.status === 'pending';

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={2}>Devices</Title>
          <Text c="dimmed" size="sm">
            Live list of Shelly devices discovered on your local network.
          </Text>
        </div>
        <Button onClick={handleDiscoverDevices} loading={isInitialLoading}>
          Discover devices
        </Button>
      </Group>

      {error && (
        <Card withBorder padding="sm" radius="sm" bg="red.0">
          <Text c="red.7" size="sm">
            {error}
          </Text>
        </Card>
      )}

      {!hasInitialData && !error && (
        <Center py="xl">
          <Loader />
        </Center>
      )}

      {hasInitialData && devices.length === 0 && !error && (
        <Card withBorder radius="sm">
          <Text c="dimmed" size="sm">
            No devices discovered yet. Try running a discovery.
          </Text>
        </Card>
      )}

      {devices.length > 0 && (
        <Card withBorder radius="sm">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>IP</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Security</Table.Th>
                <Table.Th>Last seen</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {devices.map((device) => (
                <Table.Tr key={device.id}>
                  <Table.Td>{device.name}</Table.Td>
                  <Table.Td>{device.type}</Table.Td>
                  <Table.Td>{device.ipAddress}</Table.Td>
                  <Table.Td>
                    <Badge color={device.online ? 'green' : 'gray'}>
                      {device.online ? 'Online' : 'Offline'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {(() => {
                      const config = AUTH_STATUS_CONFIG[device.authStatus];
                      return (
                        <Tooltip label={config.tooltip}>
                          <Badge
                            color={config.color}
                            variant={config.variant as 'light' | 'filled'}
                          >
                            {config.label}
                          </Badge>
                        </Tooltip>
                      );
                    })()}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {new Date(device.lastSeen).toLocaleString()}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Anchor
                      href={`http://${device.ipAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="xs" variant="light">
                        Open
                      </Button>
                    </Anchor>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </Stack>
  );
}
