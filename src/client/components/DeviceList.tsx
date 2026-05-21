import { useMemo, useState } from 'react';
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
  TextInput,
  SegmentedControl,
  UnstyledButton,
} from '@mantine/core';
import {
  IconLock,
  IconLockOpen,
  IconWifi,
  IconWifiOff,
  IconKey,
  IconRefresh,
  IconReload,
  IconAlertTriangle,
  IconDots,
  IconLeaf,
  IconExternalLink,
  IconBluetooth,
  IconBluetoothOff,
  IconCloud,
  IconCloudOff,
  IconNetwork,
  IconSearch,
  IconChevronDown,
  IconChevronRight,
  IconX,
  IconFilter,
} from '@tabler/icons-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/trpc.js';
import { trpc } from '@/client/utils/trpc.js';
import type { AuthStatus, UnprovisionedDevice } from '@/shared/types.js';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type DevicesOutput = RouterOutputs['onDevices'];
type Device = DevicesOutput[number];

type GroupBy = 'gen' | 'type' | 'firmware' | 'none';
type TriState = 'any' | 'on' | 'off';

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

/** Cycle a tri-state filter: any → on → off → any */
function cycleTri(s: TriState): TriState {
  return s === 'any' ? 'on' : s === 'on' ? 'off' : 'any';
}

function groupKey(device: Device, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'gen':
      return `Gen ${device.gen}`;
    case 'type':
      return device.type || 'Unknown';
    case 'firmware':
      return device.firmwareVersion ?? 'Unknown firmware';
    case 'none':
      return 'All devices';
  }
}

/** Sort group keys so newer/higher values come first when meaningful. */
function compareGroupKeys(a: string, b: string, groupBy: GroupBy): number {
  if (groupBy === 'gen') {
    const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return nb - na;
  }
  if (groupBy === 'firmware') {
    if (a === 'Unknown firmware') return 1;
    if (b === 'Unknown firmware') return -1;
    return b.localeCompare(a, undefined, { numeric: true });
  }
  return a.localeCompare(b);
}

/** Hue derived from a group key, used to tint group headers consistently. */
function groupHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/** Compact relative-time string: "12s ago", "5m ago", "3h ago", "2d ago" */
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type ChipTone = 'soft' | 'warn';

function StatChip({
  icon,
  label,
  color = 'gray',
  tone = 'soft',
  onClick,
  loading,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  color?: string;
  tone?: ChipTone;
  onClick?: () => void;
  loading?: boolean;
  tooltip?: string;
}) {
  const interactive = !!onClick && !loading;
  const bg =
    tone === 'warn'
      ? `var(--mantine-color-${color}-1)`
      : `var(--mantine-color-${color}-0)`;
  const border = `1px solid var(--mantine-color-${color}-${tone === 'warn' ? 4 : 2})`;
  const fg = `var(--mantine-color-${color}-${tone === 'warn' ? 9 : 8})`;

  const content = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '0 8px',
        height: 24,
        boxSizing: 'border-box',
        borderRadius: 6,
        backgroundColor: bg,
        border,
        color: fg,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.15,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        cursor: interactive ? 'pointer' : 'default',
        opacity: loading ? 0.5 : 1,
        transition: 'background-color 140ms, border-color 140ms',
        userSelect: 'none',
      }}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
      <span>{label}</span>
    </span>
  );

  return tooltip ? (
    <Tooltip label={tooltip} withinPortal>
      {content}
    </Tooltip>
  ) : (
    content
  );
}

function FilterChip({
  state,
  onClick,
  icon,
  label,
  color,
}: {
  state: TriState;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  const isActive = state !== 'any';
  const isOn = state === 'on';
  const tooltip =
    state === 'any'
      ? `Click to show only devices with ${label} ON`
      : isOn
      ? `Showing only ${label} ON · click to switch to OFF only`
      : `Showing only ${label} OFF · click to clear`;

  // Status indicator stays in a fixed-width slot so the chip never resizes.
  let statusText = 'ANY';
  let statusBg = 'var(--mantine-color-gray-2)';
  let statusFg = 'var(--mantine-color-gray-7)';
  if (state === 'on') {
    statusText = 'ON';
    statusBg = `var(--mantine-color-${color}-6)`;
    statusFg = 'white';
  } else if (state === 'off') {
    statusText = 'OFF';
    statusBg = 'var(--mantine-color-gray-7)';
    statusFg = 'white';
  }

  return (
    <Tooltip label={tooltip} withinPortal>
      <UnstyledButton
        onClick={onClick}
        aria-label={`Filter by ${label}: ${statusText.toLowerCase()}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 5px 0 12px',
          height: 32,
          boxSizing: 'border-box',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          transition: 'border-color 160ms ease, background-color 160ms ease, color 160ms ease',
          border: `1px solid var(--mantine-color-${
            isActive ? color : 'gray'
          }-${isActive ? 4 : 3})`,
          backgroundColor: isActive
            ? `var(--mantine-color-${color}-0)`
            : 'var(--mantine-color-body)',
          color: isActive
            ? `var(--mantine-color-${color}-8)`
            : 'var(--mantine-color-gray-7)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
        <span>{label}</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 22,
            boxSizing: 'border-box',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            backgroundColor: statusBg,
            color: statusFg,
            transition: 'background-color 160ms ease, color 160ms ease',
            flexShrink: 0,
          }}
        >
          {statusText}
        </span>
      </UnstyledButton>
    </Tooltip>
  );
}

export function DeviceList() {
  const [devices, setDevices] = useState<DevicesOutput>([] as DevicesOutput);
  const [hasInitialData, setHasInitialData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingPasswordFor, setSettingPasswordFor] = useState<string | null>(null);
  const [unprovisionedDevices, setUnprovisionedDevices] = useState<UnprovisionedDevice[]>([]);
  const [provisioningDevice, setProvisioningDevice] = useState<string | null>(null);

  const [togglingBleFor, setTogglingBleFor] = useState<string | null>(null);
  const [togglingCloudFor, setTogglingCloudFor] = useState<string | null>(null);
  const [togglingApFor, setTogglingApFor] = useState<string | null>(null);
  const [settingApPasswordFor, setSettingApPasswordFor] = useState<string | null>(null);
  const [rebootingDevice, setRebootingDevice] = useState<string | null>(null);
  const [resettingDevice, setResettingDevice] = useState<string | null>(null);
  const [refreshingDevice, setRefreshingDevice] = useState<string | null>(null);

  // View controls
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [search, setSearch] = useState('');
  const [filterAp, setFilterAp] = useState<TriState>('any');
  const [filterPwd, setFilterPwd] = useState<TriState>('any');
  const [filterBle, setFilterBle] = useState<TriState>('any');
  const [filterCloud, setFilterCloud] = useState<TriState>('any');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const discoverDevicesMutation = trpc.discoverDevices.useMutation();
  const setDevicePasswordMutation = trpc.setDevicePassword.useMutation();
  const provisionDeviceMutation = trpc.provisionDevice.useMutation();
  const setBleEnabledMutation = trpc.setBleEnabled.useMutation();
  const setCloudEnabledMutation = trpc.setCloudEnabled.useMutation();
  const setWifiApEnabledMutation = trpc.setWifiApEnabled.useMutation();
  const setWifiApPasswordMutation = trpc.setWifiApPassword.useMutation();
  const rebootDeviceMutation = trpc.rebootDevice.useMutation();
  const factoryResetDeviceMutation = trpc.factoryResetDevice.useMutation();
  const refreshDeviceStatusMutation = trpc.refreshDeviceStatus.useMutation();
  const refreshAllOnlineDevicesMutation = trpc.refreshAllOnlineDevices.useMutation();
  const { data: passwordData } = trpc.getShellyPassword.useQuery();
  const { data: autoProvisioningStatus } = trpc.getAutoProvisioningStatus.useQuery();
  const { data: provisioningWifi } = trpc.getProvisioningWifi.useQuery();

  trpc.onUnprovisionedDevices.useSubscription(undefined, {
    onData(data) {
      setUnprovisionedDevices(data);
    },
  });

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

  const handleDiscoverDevices = () => {
    setError(null);
    discoverDevicesMutation.mutate(undefined, {
      onError(err) {
        setError(err.message);
      },
    });
  };

  const handleRefreshAllOnline = () => {
    setError(null);
    refreshAllOnlineDevicesMutation.mutate(undefined, {
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

  const handleToggleCloud = (deviceId: string, currentEnabled: boolean) => {
    setTogglingCloudFor(deviceId);
    setError(null);
    setCloudEnabledMutation.mutate(
      { deviceId, enabled: !currentEnabled },
      {
        onSuccess() {
          setTogglingCloudFor(null);
        },
        onError(err) {
          setError(err.message);
          setTogglingCloudFor(null);
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

  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch('');
    setFilterAp('any');
    setFilterPwd('any');
    setFilterBle('any');
    setFilterCloud('any');
  };

  const isInitialLoading =
    !hasInitialData || discoverDevicesMutation.status === 'pending';

  // Filter pipeline
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (q) {
        const hay = `${d.name} ${d.id} ${d.ipAddress} ${d.type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterAp !== 'any') {
        const want = filterAp === 'on';
        if (d.apEnabled === undefined) return false;
        if (d.apEnabled !== want) return false;
      }
      if (filterPwd !== 'any') {
        const wantProtected = filterPwd === 'on';
        const isProtected =
          d.authStatus === 'correct_password' ||
          d.authStatus === 'different_password';
        if (isProtected !== wantProtected) return false;
      }
      if (filterBle !== 'any') {
        const want = filterBle === 'on';
        if (d.bleEnabled === undefined) return false;
        if (d.bleEnabled !== want) return false;
      }
      if (filterCloud !== 'any') {
        const want = filterCloud === 'on';
        if (d.cloudEnabled === undefined) return false;
        if (d.cloudEnabled !== want) return false;
      }
      return true;
    });
  }, [devices, search, filterAp, filterPwd, filterBle, filterCloud]);

  // Group pipeline
  const grouped = useMemo(() => {
    const map = new Map<string, Device[]>();
    for (const d of filtered) {
      const key = groupKey(d, groupBy);
      const arr = map.get(key);
      if (arr) arr.push(d);
      else map.set(key, [d]);
    }
    return Array.from(map.entries())
      .map(([key, list]) => ({
        key,
        devices: list.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => compareGroupKeys(a.key, b.key, groupBy));
  }, [filtered, groupBy]);

  const totalCount = devices.length;
  const filteredCount = filtered.length;
  const onlineCount = devices.filter((d) => d.online).length;
  const filtersActive =
    !!search ||
    filterAp !== 'any' ||
    filterPwd !== 'any' ||
    filterBle !== 'any' ||
    filterCloud !== 'any';

  const renderDeviceCard = (device: Device) => {
    const accent = device.online ? 'teal' : 'gray';

    const isUnprotected = device.authStatus === 'unprotected';
    const isAuthenticated = device.authStatus === 'correct_password';
    const hasWifiInfo = device.gen >= 2 && device.wifiRssi !== undefined;
    const hasEthInfo = device.gen >= 2 && device.ethConnected === true;
    const hasApInfo = (isAuthenticated || isUnprotected) && device.apEnabled !== undefined;
    const apOpen = !!(device.apEnabled && device.apIsOpen);

    // Security chip is clickable when we can fix the issue inline.
    const securityClickable =
      isUnprotected && device.online && !!passwordData?.hasPassword;

    let securityChip: React.ReactNode = null;
    if (device.authStatus === 'unknown') {
      securityChip = (
        <StatChip
          icon={<IconLock size={11} />}
          label="Auth unknown"
          color="gray"
          tooltip={AUTH_STATUS_CONFIG.unknown.tooltip}
        />
      );
    } else if (isUnprotected) {
      securityChip = (
        <StatChip
          icon={<IconLockOpen size={11} />}
          label="No password"
          color="orange"
          tone="warn"
          loading={settingPasswordFor === device.id}
          onClick={
            securityClickable
              ? () => handleSetDevicePassword(device.id)
              : undefined
          }
          tooltip={
            securityClickable
              ? 'Click to set the configured password on this device'
              : passwordData?.hasPassword
              ? AUTH_STATUS_CONFIG.unprotected.tooltip
              : 'No password configured — set one in Settings to fix'
          }
        />
      );
    } else if (device.authStatus === 'correct_password') {
      securityChip = (
        <StatChip
          icon={<IconLock size={11} />}
          label="Protected"
          color="teal"
          tooltip={AUTH_STATUS_CONFIG.correct_password.tooltip}
        />
      );
    } else {
      securityChip = (
        <StatChip
          icon={<IconKey size={11} />}
          label="Other password"
          color="yellow"
          tone="warn"
          tooltip={AUTH_STATUS_CONFIG.different_password.tooltip}
        />
      );
    }

    return (
      <Card
        key={device.id}
        withBorder
        radius="md"
        padding="md"
        className="device-card"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderLeft: `3px solid var(--mantine-color-${
            device.online ? accent : 'gray'
          }-${device.online ? 5 : 3})`,
          transition: 'transform 160ms ease, box-shadow 160ms ease',
        }}
      >
        {/* Header: dot + name + actions */}
        <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Group gap={8} wrap="nowrap" align="center">
              <Box
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: device.online
                    ? `var(--mantine-color-${accent}-5)`
                    : 'var(--mantine-color-gray-4)',
                  flexShrink: 0,
                  animation: device.online ? 'devicePulse 2.4s ease-in-out infinite' : undefined,
                }}
              />
              <Text fw={650} size="sm" truncate style={{ letterSpacing: -0.1 }}>
                {device.name}
              </Text>
            </Group>
            <Text
              size="xs"
              c="dimmed"
              mt={4}
              truncate
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {device.type} &middot; {device.ipAddress}
              {device.firmwareVersion && <> &middot; fw {device.firmwareVersion}</>}
            </Text>
          </Box>
          <Group gap={2} wrap="nowrap">
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
                {securityClickable && (
                  <Menu.Item
                    leftSection={<IconLock size={14} />}
                    color="orange"
                    onClick={() => handleSetDevicePassword(device.id)}
                    disabled={settingPasswordFor === device.id}
                  >
                    Set device password
                  </Menu.Item>
                )}
                {hasApInfo && (
                  <Menu.Item
                    leftSection={
                      device.apEnabled ? (
                        <IconWifiOff size={14} />
                      ) : (
                        <IconWifi size={14} />
                      )
                    }
                    onClick={() => handleToggleWifiAp(device.id, device.apEnabled!)}
                    disabled={togglingApFor === device.id}
                  >
                    {device.apEnabled ? 'Disable WiFi AP' : 'Enable WiFi AP'}
                  </Menu.Item>
                )}
                {hasApInfo && apOpen && (
                  <Menu.Item
                    leftSection={<IconKey size={14} />}
                    color="orange"
                    onClick={() => handleSetWifiApPassword(device.id)}
                    disabled={settingApPasswordFor === device.id}
                  >
                    Set AP password
                  </Menu.Item>
                )}
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

        {/* Unified stat strip — same shape for every card */}
        <Group gap={5} mt="sm" wrap="wrap">
          <StatChip
            icon={
              <Box
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: device.online
                    ? `var(--mantine-color-${accent}-6)`
                    : 'var(--mantine-color-gray-5)',
                }}
              />
            }
            label={device.online ? 'Online' : 'Offline'}
            color={device.online ? accent : 'gray'}
          />
          {securityChip}
          {hasEthInfo && (
            <StatChip
              icon={<IconNetwork size={11} />}
              label="Ethernet"
              color="indigo"
              tooltip="Connected via Ethernet"
            />
          )}
          {hasWifiInfo && (
            <StatChip
              icon={<IconWifi size={11} />}
              label={`${device.wifiRssi} dBm`}
              color={rssiColor(device.wifiRssi!)}
              tooltip={`WiFi signal: ${rssiLabel(device.wifiRssi!)} (${device.wifiRssi} dBm)`}
            />
          )}
          {device.gen >= 2 && device.bleEnabled !== undefined && (
            <StatChip
              icon={
                device.bleEnabled ? (
                  <IconBluetooth size={11} />
                ) : (
                  <IconBluetoothOff size={11} />
                )
              }
              label={device.bleEnabled ? 'BLE' : 'BLE off'}
              color={device.bleEnabled ? 'blue' : 'gray'}
              loading={togglingBleFor === device.id}
              onClick={() => handleToggleBle(device.id, device.bleEnabled!)}
              tooltip={
                device.bleEnabled
                  ? 'Bluetooth enabled — click to disable'
                  : 'Bluetooth disabled — click to enable'
              }
            />
          )}
          {device.gen >= 2 && device.cloudEnabled !== undefined && (
            <StatChip
              icon={
                device.cloudEnabled ? (
                  <IconCloud size={11} />
                ) : (
                  <IconCloudOff size={11} />
                )
              }
              label={device.cloudEnabled ? 'Cloud' : 'Cloud off'}
              color={device.cloudEnabled ? 'cyan' : 'gray'}
              loading={togglingCloudFor === device.id}
              onClick={() => handleToggleCloud(device.id, device.cloudEnabled!)}
              tooltip={
                device.cloudEnabled
                  ? 'Registered with Shelly Cloud — click to disconnect this device from the cloud'
                  : 'Not connected to Shelly Cloud — click to enable'
              }
            />
          )}
          {hasApInfo && (
            <StatChip
              icon={
                device.apEnabled ? (
                  <IconWifi size={11} />
                ) : (
                  <IconWifiOff size={11} />
                )
              }
              label={
                !device.apEnabled
                  ? 'AP off'
                  : apOpen
                  ? 'AP open'
                  : 'AP secured'
              }
              color={!device.apEnabled ? 'gray' : apOpen ? 'orange' : 'teal'}
              tone={apOpen ? 'warn' : 'soft'}
              loading={togglingApFor === device.id}
              onClick={() => handleToggleWifiAp(device.id, device.apEnabled!)}
              tooltip={
                !device.apEnabled
                  ? 'WiFi AP disabled — click to enable'
                  : apOpen
                  ? 'WiFi AP enabled with no password — click to disable, or set a password from the menu'
                  : 'WiFi AP enabled and password-protected — click to disable'
              }
            />
          )}
          {device.gen >= 2 && device.ecoMode === true && (
            <StatChip
              icon={<IconLeaf size={11} />}
              label="Eco"
              color="teal"
              tooltip="Eco mode enabled"
            />
          )}
        </Group>

        {/* Footer: relative last-seen */}
        <Text
          size="xs"
          c="dimmed"
          mt="sm"
          style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11 }}
        >
          {device.online ? 'Last seen' : 'Last seen'} {relativeTime(device.lastSeen)}
        </Text>
      </Card>
    );
  };

  return (
    <Stack gap="md">
      <style>{`
        @keyframes devicePulse {
          0%, 100% { box-shadow: 0 0 0 4px var(--mantine-color-teal-1); }
          50% { box-shadow: 0 0 0 6px var(--mantine-color-teal-2); }
        }
        .device-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px -12px rgba(0, 0, 0, 0.12);
        }
        .group-header-sticky {
          position: sticky;
          top: 0;
          z-index: 5;
          backdrop-filter: saturate(140%) blur(8px);
          -webkit-backdrop-filter: saturate(140%) blur(8px);
        }
      `}</style>

      <Group justify="space-between" wrap="wrap" gap="sm" align="flex-end">
        <div>
          <Title order={2}>Devices</Title>
          <Text c="dimmed" size="sm">
            <Text span fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {onlineCount}
            </Text>{' '}
            online &middot;{' '}
            <Text span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {totalCount}
            </Text>{' '}
            total
            {filtersActive && (
              <>
                {' '}
                &middot;{' '}
                <Text span fw={600} c="violet.6" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {filteredCount}
                </Text>{' '}
                shown
              </>
            )}
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip label={onlineCount === 0 ? 'No online devices to refresh' : `Re-fetch status for ${onlineCount} online ${onlineCount === 1 ? 'device' : 'devices'}`}>
            <Button
              variant="default"
              leftSection={<IconRefresh size={14} />}
              onClick={handleRefreshAllOnline}
              loading={refreshAllOnlineDevicesMutation.status === 'pending'}
              disabled={onlineCount === 0}
            >
              Refresh online
            </Button>
          </Tooltip>
          <Button onClick={handleDiscoverDevices} loading={isInitialLoading}>
            Discover devices
          </Button>
        </Group>
      </Group>

      {/* Toolbar: search + group + filters */}
      <Card withBorder radius="md" padding="sm">
        <Stack gap="xs">
          {/* Row 1: search + group-by */}
          <Group gap="sm" wrap="wrap" align="center">
            <TextInput
              placeholder="Search name, IP, type…"
              leftSection={<IconSearch size={14} />}
              rightSection={
                search ? (
                  <ActionIcon variant="subtle" color="gray" size="xs" onClick={() => setSearch('')}>
                    <IconX size={12} />
                  </ActionIcon>
                ) : null
              }
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              size="sm"
              style={{ flex: '1 1 240px', minWidth: 220 }}
            />
            <Group gap={8} wrap="nowrap" align="center">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.5 }}>
                Group by
              </Text>
              <SegmentedControl
                size="xs"
                value={groupBy}
                onChange={(v) => setGroupBy(v as GroupBy)}
                data={[
                  { value: 'none', label: 'None' },
                  { value: 'gen', label: 'Generation' },
                  { value: 'type', label: 'Type' },
                  { value: 'firmware', label: 'Firmware' },
                ]}
              />
            </Group>
          </Group>
          {/* Row 2: filters */}
          <Group gap={8} wrap="wrap" align="center">
            <Group gap={6} wrap="nowrap" align="center">
              <IconFilter size={14} color="var(--mantine-color-gray-6)" />
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.5 }}>
                Filters
              </Text>
            </Group>
            <FilterChip
              state={filterAp}
              onClick={() => setFilterAp(cycleTri(filterAp))}
              icon={<IconWifi size={12} />}
              label="AP"
              color="orange"
            />
            <FilterChip
              state={filterPwd}
              onClick={() => setFilterPwd(cycleTri(filterPwd))}
              icon={<IconLock size={12} />}
              label="Password"
              color="green"
            />
            <FilterChip
              state={filterBle}
              onClick={() => setFilterBle(cycleTri(filterBle))}
              icon={<IconBluetooth size={12} />}
              label="BLE"
              color="blue"
            />
            <FilterChip
              state={filterCloud}
              onClick={() => setFilterCloud(cycleTri(filterCloud))}
              icon={<IconCloud size={12} />}
              label="Cloud"
              color="cyan"
            />
            {filtersActive && (
              <Tooltip label="Clear filters and search">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="md"
                  onClick={clearFilters}
                  aria-label="Clear filters"
                >
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Stack>
      </Card>

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

      {hasInitialData && devices.length > 0 && filtered.length === 0 && (
        <Card withBorder radius="md" padding="lg">
          <Stack gap="xs" align="center">
            <IconFilter size={24} color="var(--mantine-color-gray-5)" />
            <Text c="dimmed" size="sm" ta="center">
              No devices match the current filters.
            </Text>
            <Button variant="subtle" size="xs" onClick={clearFilters}>
              Clear filters
            </Button>
          </Stack>
        </Card>
      )}

      {groupBy === 'none' && grouped.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {grouped[0].devices.map(renderDeviceCard)}
        </SimpleGrid>
      )}

      {groupBy !== 'none' &&
        grouped.map((group) => {
          const collapsed = collapsedGroups.has(group.key);
          const hue = groupHue(group.key);
          return (
            <Box key={group.key}>
              <UnstyledButton
                onClick={() => toggleGroupCollapsed(group.key)}
                className="group-header-sticky"
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 10,
                  marginBottom: 10,
                  background: `linear-gradient(90deg,
                    hsla(${hue}, 80%, 96%, 0.92) 0%,
                    hsla(${hue}, 80%, 99%, 0.85) 100%)`,
                  border: `1px solid hsla(${hue}, 60%, 80%, 0.6)`,
                  cursor: 'pointer',
                }}
              >
                {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
                <Text fw={700} size="sm" style={{ letterSpacing: 0.2, color: `hsl(${hue}, 50%, 25%)` }}>
                  {group.key}
                </Text>
                <Badge
                  size="sm"
                  radius="sm"
                  variant="filled"
                  style={{
                    background: `hsl(${hue}, 55%, 45%)`,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {group.devices.length}
                </Badge>
                <Box style={{ flex: 1 }} />
                <Text size="xs" c="dimmed">
                  {group.devices.filter((d) => d.online).length} online
                </Text>
              </UnstyledButton>

              {!collapsed && (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                  {group.devices.map(renderDeviceCard)}
                </SimpleGrid>
              )}
            </Box>
          );
        })}

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
                  {' · '}
                  Last seen {relativeTime(device.lastSeen)}
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
