import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Progress,
  Stack,
  Text,
  Title,
  Tooltip,
  ActionIcon,
  Menu,
  Box,
  SimpleGrid,
} from '@mantine/core';
import { IconLock, IconWifi, IconWifiOff, IconKey, IconRefresh, IconReload, IconAlertTriangle, IconDots, IconLeaf, IconBolt, IconExternalLink, IconBluetooth, IconBluetoothOff, IconNetwork } from '@tabler/icons-react';
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

/** Convert RSSI (dBm) to a 0-100 percentage. Maps -90 dBm → 0%, -30 dBm → 100%. */
function rssiToPercent(rssi: number): number {
  return Math.min(Math.max(((rssi + 90) * 100) / 60, 0), 100);
}

function rssiColor(rssi: number): string {
  if (rssi >= -50) return 'green';
  if (rssi >= -65) return 'yellow';
  if (rssi >= -75) return 'orange';
  return 'red';
}

function rssiLabel(rssi: number): string {
  if (rssi >= -50) return 'Excellent';
  if (rssi >= -65) return 'Good';
  if (rssi >= -75) return 'Fair';
  return 'Weak';
}

export function DeviceList() {
  const [devices, setDevices] = useState<DevicesOutput>([] as DevicesOutput);
  const [hasInitialData, setHasInitialData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingPasswordFor, setSettingPasswordFor] = useState<string | null>(null);
  const [unprovisionedDevices, setUnprovisionedDevices] = useState<UnprovisionedDevice[]>([]);
  const [provisioningDevice, setProvisioningDevice] = useState<string | null>(null);

  const [togglingBleFor, setTogglingBleFor] = useState<string | null>(null);
  const [togglingApFor, setTogglingApFor] = useState<string | null>(null);
  const [settingApPasswordFor, setSettingApPasswordFor] = useState<string | null>(null);
  const [rebootingDevice, setRebootingDevice] = useState<string | null>(null);
  const [resettingDevice, setResettingDevice] = useState<string | null>(null);
  const [refreshingDevice, setRefreshingDevice] = useState<string | null>(null);

  const discoverDevicesMutation = trpc.discoverDevices.useMutation();
  const setDevicePasswordMutation = trpc.setDevicePassword.useMutation();
  const provisionDeviceMutation = trpc.provisionDevice.useMutation();
  const setBleEnabledMutation = trpc.setBleEnabled.useMutation();
  const setWifiApEnabledMutation = trpc.setWifiApEnabled.useMutation();
  const setWifiApPasswordMutation = trpc.setWifiApPassword.useMutation();
  const rebootDeviceMutation = trpc.rebootDevice.useMutation();
  const factoryResetDeviceMutation = trpc.factoryResetDevice.useMutation();
  const refreshDeviceStatusMutation = trpc.refreshDeviceStatus.useMutation();
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

  const handleToggleBle = (deviceId: string, currentEnabled: boolean) => {
    setTogglingBleFor(deviceId);
    setError(null);
    setBleEnabledMutation.mutate(
      { deviceId, enabled: !currentEnabled },
      {
        onSuccess() {
          setTogglingBleFor(null);
        },
        onError(err) {
          setError(err.message);
          setTogglingBleFor(null);
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

  const isInitialLoading =
    !hasInitialData || discoverDevicesMutation.status === 'pending';

  const renderDeviceCard = (device: DevicesOutput[number]) => {
    const securityConfig = AUTH_STATUS_CONFIG[device.authStatus];
    const hasWifiInfo = device.gen === 2 && device.wifiRssi !== undefined;
    const hasEthInfo = device.gen === 2 && device.ethConnected === true;
    const hasApInfo = device.authStatus === 'correct_password' && device.apEnabled !== undefined;

    return (
      <Card
        key={device.id}
        withBorder
        radius="md"
        padding="md"
        style={{
          borderLeft: `3px solid var(--mantine-color-${device.online ? 'green' : 'gray'}-4)`,
        }}
      >
        {/* Header: Name + Actions */}
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Text fw={600} size="sm" truncate>
              {device.name}
            </Text>
            <Text size="xs" c="dimmed">
              {device.type} &middot; {device.ipAddress}
              {device.firmwareVersion && <> &middot; fw {device.firmwareVersion}</>}
            </Text>
          </Box>
          <Group gap={4} wrap="nowrap">
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
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => handleRefreshStatus(device.id)}
                loading={refreshingDevice === device.id}
              >
                <IconRefresh size={14} />
              </ActionIcon>
            </Tooltip>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="sm">
                  <IconDots size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconExternalLink size={14} />}
                  component="a"
                  href={`http://${device.ipAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Web UI
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconReload size={14} />}
                  onClick={() => handleRebootDevice(device.id)}
                  disabled={!device.online || rebootingDevice === device.id}
                >
                  Reboot Device
                </Menu.Item>
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
          </Group>
        </Group>

        {/* Status badges row */}
        <Group gap={6} mt="sm" wrap="wrap">
          <Badge
            color={device.online ? 'green' : 'gray'}
            variant="light"
            size="sm"
          >
            {device.online ? 'Online' : 'Offline'}
          </Badge>
          {device.gen === 2 && device.ecoMode !== undefined && (
            <Tooltip label={device.ecoMode ? 'Eco mode enabled' : 'Eco mode disabled'}>
              <Badge
                color={device.ecoMode ? 'teal' : 'gray'}
                variant="light"
                size="sm"
                leftSection={device.ecoMode ? <IconLeaf size={10} /> : <IconBolt size={10} />}
              >
                {device.ecoMode ? 'Eco' : 'Perf'}
              </Badge>
            </Tooltip>
          )}
          {device.gen === 2 && device.bleEnabled !== undefined && (
            <Tooltip label={device.bleEnabled ? 'Click to disable Bluetooth' : 'Click to enable Bluetooth'}>
              <Badge
                color={device.bleEnabled ? 'blue' : 'gray'}
                variant="light"
                size="sm"
                leftSection={device.bleEnabled ? <IconBluetooth size={10} /> : <IconBluetoothOff size={10} />}
                style={{ cursor: 'pointer' }}
                onClick={() => handleToggleBle(device.id, device.bleEnabled!)}
                opacity={togglingBleFor === device.id ? 0.5 : 1}
              >
                {device.bleEnabled ? 'BLE' : 'No BLE'}
              </Badge>
            </Tooltip>
          )}
          <Tooltip label={securityConfig.tooltip}>
            <Badge
              color={securityConfig.color}
              variant={securityConfig.variant as 'light' | 'filled'}
              size="sm"
            >
              {securityConfig.label}
            </Badge>
          </Tooltip>
        </Group>

        {/* Detail row: Connection + AP info */}
        {(hasWifiInfo || hasEthInfo || hasApInfo) && (
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" mt="sm">
            {hasEthInfo && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>Connection</Text>
                <Group gap="xs" wrap="nowrap">
                  <IconNetwork size={14} color="var(--mantine-color-blue-5)" />
                  <Text size="xs">Ethernet</Text>
                </Group>
              </Box>
            )}
            {hasWifiInfo && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>WiFi Signal</Text>
                <Tooltip label={`${rssiLabel(device.wifiRssi!)} (${device.wifiRssi} dBm)`}>
                  <Group gap="xs" wrap="nowrap">
                    <Progress
                      value={rssiToPercent(device.wifiRssi!)}
                      size={6}
                      w={60}
                      color={rssiColor(device.wifiRssi!)}
                      radius="xl"
                    />
                    <Text size="xs" c="dimmed">
                      {device.wifiRssi} dBm
                    </Text>
                  </Group>
                </Tooltip>
              </Box>
            )}
            {hasApInfo && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>WiFi AP</Text>
                <Group gap={6} wrap="wrap">
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
                      size="sm"
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
                      variant="subtle"
                      color={device.apEnabled ? 'red' : 'green'}
                      size="xs"
                      onClick={() => handleToggleWifiAp(device.id, device.apEnabled!)}
                      loading={togglingApFor === device.id}
                    >
                      {device.apEnabled ? <IconWifiOff size={12} /> : <IconWifi size={12} />}
                    </ActionIcon>
                  </Tooltip>
                  {device.apEnabled && device.apIsOpen && (
                    <Tooltip label="Set AP password (same as device password)">
                      <ActionIcon
                        variant="filled"
                        color="orange"
                        size="xs"
                        onClick={() => handleSetWifiApPassword(device.id)}
                        loading={settingApPasswordFor === device.id}
                      >
                        <IconKey size={12} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Box>
            )}
          </SimpleGrid>
        )}

        {/* Footer: Last seen */}
        <Text size="xs" c="dimmed" mt="sm">
          Last seen {new Date(device.lastSeen).toLocaleString()}
        </Text>
      </Card>
    );
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
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
        <Card withBorder padding="sm" radius="md" bg="red.0">
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
        <Card withBorder radius="md" padding="lg">
          <Text c="dimmed" size="sm" ta="center">
            No devices discovered yet. Try running a discovery.
          </Text>
        </Card>
      )}

      {devices.length > 0 && (
        <Stack gap="sm">
          {devices.map(renderDeviceCard)}
        </Stack>
      )}

      {/* Unprovisioned Devices Section */}
      {autoProvisioningStatus?.enabled && unprovisionedDevices.length > 0 && (
        <>
          <div>
            <Title order={3} mt="lg">Unprovisioned Devices</Title>
            <Text c="dimmed" size="sm">
              Factory-default Shelly devices detected via WiFi. Configure them to join your network.
            </Text>
          </div>

          <Stack gap="sm">
            {unprovisionedDevices.map((device) => (
              <Card
                key={device.ssid}
                withBorder
                radius="md"
                padding="md"
                style={{
                  borderLeft: '3px solid var(--mantine-color-blue-4)',
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  <Box style={{ minWidth: 0, flex: 1 }}>
                    <Group gap="xs" wrap="nowrap">
                      <IconWifi size={16} style={{ flexShrink: 0 }} />
                      <Text fw={600} size="sm" truncate>{device.ssid}</Text>
                    </Group>
                    <Group gap="xs" mt={4}>
                      <Badge color="blue" variant="light" size="sm">
                        Gen{device.gen}
                      </Badge>
                      <Group gap="xs" wrap="nowrap">
                        <Progress
                          value={device.signalStrength}
                          size={6}
                          w={50}
                          radius="xl"
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
                    </Group>
                  </Box>
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
                </Group>
                <Text size="xs" c="dimmed" mt="xs">
                  First seen {new Date(device.firstSeen).toLocaleString()}
                </Text>
              </Card>
            ))}
          </Stack>

          {autoProvisioningStatus?.isProvisioning && autoProvisioningStatus.currentStatus && (
            <Card withBorder padding="sm" radius="md" bg="blue.0">
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
