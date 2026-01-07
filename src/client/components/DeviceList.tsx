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
  Modal,
  Menu,
} from '@mantine/core';
import { IconLock, IconWifi, IconWifiOff, IconKey, IconRefresh, IconInfoCircle, IconReload, IconAlertTriangle, IconDots } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
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

  const [togglingApFor, setTogglingApFor] = useState<string | null>(null);
  const [settingApPasswordFor, setSettingApPasswordFor] = useState<string | null>(null);
  const [rebootingDevice, setRebootingDevice] = useState<string | null>(null);
  const [resettingDevice, setResettingDevice] = useState<string | null>(null);
  const [refreshingDevice, setRefreshingDevice] = useState<string | null>(null);
  const [deviceInfoModalOpened, { open: openDeviceInfo, close: closeDeviceInfo }] = useDisclosure(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const discoverDevicesMutation = trpc.discoverDevices.useMutation();
  const setDevicePasswordMutation = trpc.setDevicePassword.useMutation();
  const provisionDeviceMutation = trpc.provisionDevice.useMutation();
  const setWifiApEnabledMutation = trpc.setWifiApEnabled.useMutation();
  const setWifiApPasswordMutation = trpc.setWifiApPassword.useMutation();
  const rebootDeviceMutation = trpc.rebootDevice.useMutation();
  const factoryResetDeviceMutation = trpc.factoryResetDevice.useMutation();
  const refreshDeviceStatusMutation = trpc.refreshDeviceStatus.useMutation();
  const { data: passwordData } = trpc.getShellyPassword.useQuery();
  const { data: autoProvisioningStatus } = trpc.getAutoProvisioningStatus.useQuery();
  const { data: provisioningWifi } = trpc.getProvisioningWifi.useQuery();
  const { data: deviceInfo, refetch: refetchDeviceInfo } = trpc.getDeviceInfo.useQuery(
    { deviceId: selectedDeviceId || '' },
    { enabled: !!selectedDeviceId }
  );

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

  const handleToggleWifiAp = (deviceId: string, currentEnabled: boolean) => {
    setTogglingApFor(deviceId);
    setError(null);
    setWifiApEnabledMutation.mutate(
      { deviceId, enabled: !currentEnabled },
      {
        onSuccess() {
          setTogglingApFor(null);
        },
        onError(err) {
          setError(err.message);
          setTogglingApFor(null);
        },
      }
    );
  };

  const handleSetWifiApPassword = (deviceId: string) => {
    setSettingApPasswordFor(deviceId);
    setError(null);
    setWifiApPasswordMutation.mutate(
      { deviceId },
      {
        onSuccess() {
          setSettingApPasswordFor(null);
        },
        onError(err) {
          setError(err.message);
          setSettingApPasswordFor(null);
        },
      }
    );
  };

  const handleRebootDevice = (deviceId: string) => {
    setRebootingDevice(deviceId);
    setError(null);
    rebootDeviceMutation.mutate(
      { deviceId },
      {
        onSuccess() {
          setRebootingDevice(null);
        },
        onError(err) {
          setError(err.message);
          setRebootingDevice(null);
        },
      }
    );
  };

  const handleFactoryReset = (deviceId: string) => {
    setResettingDevice(deviceId);
    setError(null);
    factoryResetDeviceMutation.mutate(
      { deviceId },
      {
        onSuccess() {
          setResettingDevice(null);
        },
        onError(err) {
          setError(err.message);
          setResettingDevice(null);
        },
      }
    );
  };

  const handleRefreshStatus = (deviceId: string) => {
    setRefreshingDevice(deviceId);
    setError(null);
    refreshDeviceStatusMutation.mutate(
      { deviceId },
      {
        onSuccess() {
          setRefreshingDevice(null);
        },
        onError(err) {
          setError(err.message);
          setRefreshingDevice(null);
        },
      }
    );
  };

  const handleShowDeviceInfo = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    openDeviceInfo();
    refetchDeviceInfo();
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
                <Table.Th>WiFi AP</Table.Th>
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
                    {device.authStatus === 'correct_password' && device.apEnabled !== undefined ? (
                      <Group gap="xs">
                        <Tooltip
                          label={
                            device.apEnabled
                              ? device.apIsOpen
                                ? 'AP is enabled but has no password'
                                : 'AP is enabled and protected'
                              : 'AP is disabled'
                          }
                        >
                          <Badge
                            color={
                              !device.apEnabled
                                ? 'gray'
                                : device.apIsOpen
                                ? 'orange'
                                : 'green'
                            }
                            variant={device.apEnabled && device.apIsOpen ? 'filled' : 'light'}
                          >
                            {device.apEnabled ? (device.apIsOpen ? 'Open' : 'Protected') : 'Disabled'}
                          </Badge>
                        </Tooltip>
                        <Tooltip label={device.apEnabled ? 'Disable WiFi AP' : 'Enable WiFi AP'}>
                          <ActionIcon
                            variant="light"
                            color={device.apEnabled ? 'red' : 'green'}
                            size="sm"
                            onClick={() => handleToggleWifiAp(device.id, device.apEnabled!)}
                            loading={togglingApFor === device.id}
                          >
                            {device.apEnabled ? <IconWifiOff size={14} /> : <IconWifi size={14} />}
                          </ActionIcon>
                        </Tooltip>
                        {device.apEnabled && device.apIsOpen && (
                          <Tooltip label="Set AP password (same as device password)">
                            <ActionIcon
                              variant="filled"
                              color="orange"
                              size="sm"
                              onClick={() => handleSetWifiApPassword(device.id)}
                              loading={settingApPasswordFor === device.id}
                            >
                              <IconKey size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">
                        {device.authStatus === 'correct_password' ? 'Loading...' : '-'}
                      </Text>
                    )}
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
                      <Tooltip label="Refresh device status">
                        <ActionIcon
                          variant="light"
                          size="sm"
                          onClick={() => handleRefreshStatus(device.id)}
                          loading={refreshingDevice === device.id}
                        >
                          <IconRefresh size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="light" size="sm">
                            <IconDots size={14} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconInfoCircle size={14} />}
                            onClick={() => handleShowDeviceInfo(device.id)}
                          >
                            Device Info
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconReload size={14} />}
                            onClick={() => handleRebootDevice(device.id)}
                            disabled={!device.online || rebootingDevice === device.id}
                          >
                            Reboot Device
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            leftSection={<IconAlertTriangle size={14} />}
                            color="red"
                            onClick={() => handleFactoryReset(device.id)}
                            disabled={!device.online || resettingDevice === device.id}
                          >
                            Factory Reset
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
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

      {/* Device Info Modal */}
      <Modal
        opened={deviceInfoModalOpened}
        onClose={closeDeviceInfo}
        title="Device Information"
        size="md"
      >
        {deviceInfo ? (
          <Stack gap="md">
            {deviceInfo.name && (
              <div>
                <Text size="sm" c="dimmed">Device Name</Text>
                <Text fw={500}>{deviceInfo.name}</Text>
              </div>
            )}
            {deviceInfo.id && (
              <div>
                <Text size="sm" c="dimmed">Device ID</Text>
                <Text fw={500}>{deviceInfo.id}</Text>
              </div>
            )}
            {deviceInfo.firmwareVersion && (
              <div>
                <Text size="sm" c="dimmed">Firmware Version</Text>
                <Text fw={500}>{deviceInfo.firmwareVersion}</Text>
              </div>
            )}
            {!deviceInfo.name && !deviceInfo.id && !deviceInfo.firmwareVersion && (
              <Text c="dimmed" size="sm">No device information available</Text>
            )}
          </Stack>
        ) : (
          <Center py="xl">
            <Loader />
          </Center>
        )}
      </Modal>
    </Stack>
  );
}
