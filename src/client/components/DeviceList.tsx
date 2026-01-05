import { useState } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Progress,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import { IconLock, IconWifi } from '@tabler/icons-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/trpc.js';
import { trpc } from '@/client/utils/trpc.js';
import type { AuthStatus, UnprovisionedDevice } from '@/shared/types.js';

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
  const [settingPasswordFor, setSettingPasswordFor] = useState<string | null>(null);
  const [unprovisionedDevices, setUnprovisionedDevices] = useState<UnprovisionedDevice[]>([]);
  const [provisioningDevice, setProvisioningDevice] = useState<string | null>(null);

  const discoverDevicesMutation = trpc.discoverDevices.useMutation();
  const setDevicePasswordMutation = trpc.setDevicePassword.useMutation();
  const provisionDeviceMutation = trpc.provisionDevice.useMutation();
  const { data: passwordData } = trpc.getShellyPassword.useQuery();
  const { data: autoProvisioningStatus } = trpc.getAutoProvisioningStatus.useQuery();
  const { data: provisioningWifi } = trpc.getProvisioningWifi.useQuery();

  // Subscribe to unprovisioned devices
  trpc.onUnprovisionedDevices.useSubscription(undefined, {
    onData(data) {
      setUnprovisionedDevices(data);
    },
  });

  const handleSetDevicePassword = (deviceId: string) => {
    setSettingPasswordFor(deviceId);
    setError(null);
    setDevicePasswordMutation.mutate(
      { deviceId },
      {
        onSuccess() {
          setSettingPasswordFor(null);
        },
        onError(err) {
          setError(err.message);
          setSettingPasswordFor(null);
        },
      }
    );
  };

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

  const handleProvisionDevice = (ssid: string) => {
    setProvisioningDevice(ssid);
    setError(null);
    provisionDeviceMutation.mutate(
      { ssid },
      {
        onSuccess() {
          setProvisioningDevice(null);
        },
        onError(err) {
          setError(err.message);
          setProvisioningDevice(null);
        },
      }
    );
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
                    <Group gap="xs">
                      {device.authStatus === 'unprotected' && device.online && (
                        <Tooltip
                          label={
                            passwordData?.hasPassword
                              ? 'Set configured password on this device'
                              : 'Configure a password in Settings first'
                          }
                        >
                          <ActionIcon
                            variant="filled"
                            color="orange"
                            size="sm"
                            onClick={() => handleSetDevicePassword(device.id)}
                            loading={settingPasswordFor === device.id}
                            disabled={!passwordData?.hasPassword}
                          >
                            <IconLock size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Anchor
                        href={`http://${device.ipAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="xs" variant="light">
                          Open
                        </Button>
                      </Anchor>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {/* Unprovisioned Devices Section */}
      {autoProvisioningStatus?.enabled && unprovisionedDevices.length > 0 && (
        <>
          <Group justify="space-between" mt="lg">
            <div>
              <Title order={3}>Unprovisioned Devices</Title>
              <Text c="dimmed" size="sm">
                Factory-default Shelly devices detected via WiFi. Configure them to join your network.
              </Text>
            </div>
          </Group>

          <Card withBorder radius="sm">
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>SSID</Table.Th>
                  <Table.Th>Generation</Table.Th>
                  <Table.Th>Signal</Table.Th>
                  <Table.Th>First seen</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {unprovisionedDevices.map((device) => (
                  <Table.Tr key={device.ssid}>
                    <Table.Td>
                      <Group gap="xs">
                        <IconWifi size={16} />
                        <Text fw={500}>{device.ssid}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge color="blue" variant="light">
                        Gen{device.gen}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Progress
                          value={device.signalStrength}
                          size="sm"
                          w={60}
                          color={
                            device.signalStrength > 70
                              ? 'green'
                              : device.signalStrength > 40
                              ? 'yellow'
                              : 'red'
                          }
                        />
                        <Text size="xs" c="dimmed">
                          {device.signalStrength}%
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {new Date(device.firstSeen).toLocaleString()}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Tooltip
                        label={
                          provisioningWifi
                            ? `Configure to join "${provisioningWifi.ssid}"`
                            : 'Configure target WiFi in Settings first'
                        }
                      >
                        <Button
                          size="xs"
                          color="blue"
                          onClick={() => handleProvisionDevice(device.ssid)}
                          loading={provisioningDevice === device.ssid}
                          disabled={!provisioningWifi || autoProvisioningStatus?.isProvisioning}
                        >
                          Provision
                        </Button>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>

          {autoProvisioningStatus?.isProvisioning && autoProvisioningStatus.currentStatus && (
            <Card withBorder padding="sm" radius="sm" bg="blue.0">
              <Group gap="sm">
                <Loader size="sm" />
                <Text size="sm">
                  {autoProvisioningStatus.currentStatus.step}
                </Text>
              </Group>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}
