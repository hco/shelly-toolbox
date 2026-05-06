import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArchive, IconDownload, IconRocket } from '@tabler/icons-react';
import { ScriptImportModal } from './ScriptImportModal.js';
import { useEffect, useMemo, useState } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/trpc.js';
import { trpc } from '@/client/utils/trpc.js';
import type { Device, Script } from '@/shared/types.js';
import { ScriptEditor } from './ScriptEditor.js';
import { ScriptDeployModal } from './ScriptDeployModal.js';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type OnDeviceScriptsOutput = RouterOutputs['scripts']['listOnDevice'];

const DEFAULT_NEW_CODE = `// New Shelly script
// Try typing "Shelly." to explore the API.

print('Hello from Shelly!');
`;

export function Scripts() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployOpened, deploy] = useDisclosure(false);
  const [importOpened, importModal] = useDisclosure(false);

  const utils = trpc.useUtils();

  trpc.onDevices.useSubscription(undefined, {
    onData: (data) => setDevices(data as Device[]),
  });

  const scriptsQuery = trpc.scripts.list.useQuery();
  const selectedScriptQuery = trpc.scripts.get.useQuery(
    { id: selectedId ?? '' },
    { enabled: !!selectedId }
  );

  const createMutation = trpc.scripts.create.useMutation();
  const updateMutation = trpc.scripts.update.useMutation();
  const archiveMutation = trpc.scripts.archive.useMutation();

  useEffect(() => {
    if (!selectedScriptQuery.data) return;
    setName(selectedScriptQuery.data.name);
    setDescription(selectedScriptQuery.data.description ?? '');
    setCode(selectedScriptQuery.data.code);
    setDirty(false);
  }, [selectedScriptQuery.data]);

  const handleCreate = () => {
    setError(null);
    createMutation.mutate(
      { name: 'New Script', code: DEFAULT_NEW_CODE },
      {
        onSuccess(script) {
          utils.scripts.list.invalidate();
          setSelectedId(script.id);
        },
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const handleSave = () => {
    if (!selectedId) return;
    setError(null);
    updateMutation.mutate(
      { id: selectedId, name, description: description || null, code },
      {
        onSuccess() {
          setDirty(false);
          utils.scripts.list.invalidate();
          utils.scripts.get.invalidate({ id: selectedId });
          // Any on-device listings need refreshing because hashes may now match a new version.
          utils.scripts.listOnDevice.invalidate();
        },
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const handleArchive = () => {
    if (!selectedId) return;
    archiveMutation.mutate(
      { id: selectedId },
      {
        onSuccess() {
          setSelectedId(null);
          utils.scripts.list.invalidate();
        },
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const selectedScript = selectedScriptQuery.data;

  const deployableDevices = useMemo(
    () =>
      devices.filter(
        (d) => d.online && d.gen === 2 && d.authStatus === 'correct_password'
      ),
    [devices]
  );

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2}>Scripts</Title>
            <Text c="dimmed" size="sm">
              Author Shelly Gen2+ scripts once, deploy them to any device.
            </Text>
          </div>
          <Button
            variant="light"
            leftSection={<IconDownload size={16} />}
            onClick={importModal.open}
            disabled={deployableDevices.length === 0}
          >
            Import from device…
          </Button>
        </Group>

        {error && (
          <Alert color="red" variant="light" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder padding="sm" radius="sm">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={500}>Library</Text>
                  <Button size="xs" onClick={handleCreate} loading={createMutation.isPending}>
                    New
                  </Button>
                </Group>
                {scriptsQuery.isLoading ? (
                  <Loader size="sm" />
                ) : scriptsQuery.data?.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No scripts yet. Create one to get started.
                  </Text>
                ) : (
                  scriptsQuery.data?.map((s) => (
                    <ScriptListRow
                      key={s.id}
                      script={s}
                      selected={s.id === selectedId}
                      onClick={() => setSelectedId(s.id)}
                    />
                  ))
                )}
              </Stack>
            </Card>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 8 }}>
            {!selectedId ? (
              <Card withBorder padding="md" radius="sm">
                <Text c="dimmed">Select a script to edit, or create a new one.</Text>
              </Card>
            ) : !selectedScript ? (
              <Card withBorder padding="md" radius="sm">
                <Loader size="sm" />
              </Card>
            ) : (
              <Stack gap="md">
                <Card withBorder padding="md" radius="sm">
                  <Stack gap="sm">
                    <TextInput
                      label="Name"
                      value={name}
                      onChange={(e) => {
                        setName(e.currentTarget.value);
                        setDirty(true);
                      }}
                    />
                    <Textarea
                      label="Description"
                      autosize
                      minRows={1}
                      maxRows={4}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.currentTarget.value);
                        setDirty(true);
                      }}
                    />
                    <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 4 }}>
                      <ScriptEditor
                        value={code}
                        onChange={(v) => {
                          setCode(v);
                          setDirty(true);
                        }}
                      />
                    </Box>
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Badge variant="light" color="gray">
                          v{selectedScript.latestVersion}
                        </Badge>
                        {dirty && (
                          <Text size="xs" c="orange">
                            Unsaved changes
                          </Text>
                        )}
                      </Group>
                      <Group gap="xs">
                        <Tooltip label="Archive script">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={handleArchive}
                            loading={archiveMutation.isPending}
                          >
                            <IconArchive size={18} />
                          </ActionIcon>
                        </Tooltip>
                        <Button
                          leftSection={<IconRocket size={16} />}
                          variant="light"
                          onClick={deploy.open}
                          disabled={dirty || deployableDevices.length === 0}
                        >
                          Deploy to device
                        </Button>
                        <Button onClick={handleSave} loading={updateMutation.isPending} disabled={!dirty}>
                          Save
                        </Button>
                      </Group>
                    </Group>
                  </Stack>
                </Card>

                <OnDevicesSection
                  scriptId={selectedId}
                  devices={deployableDevices}
                />
              </Stack>
            )}
          </Grid.Col>
        </Grid>
      </Stack>

      {selectedScript && (
        <ScriptDeployModal
          opened={deployOpened}
          onClose={deploy.close}
          scriptId={selectedScript.id}
          scriptName={selectedScript.name}
          devices={devices}
        />
      )}

      <ScriptImportModal
        opened={importOpened}
        onClose={importModal.close}
        devices={devices}
        onImported={(id) => setSelectedId(id)}
      />
    </>
  );
}

function ScriptListRow({
  script,
  selected,
  onClick,
}: {
  script: Script;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      withBorder={false}
      padding="xs"
      radius="sm"
      bg={selected ? 'var(--mantine-color-blue-0)' : undefined}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <Group justify="space-between" gap="xs">
        <Text fw={500} size="sm" lineClamp={1}>
          {script.name}
        </Text>
        <Badge size="xs" variant="light" color="gray">
          v{script.latestVersion}
        </Badge>
      </Group>
      {script.description && (
        <Text size="xs" c="dimmed" lineClamp={1}>
          {script.description}
        </Text>
      )}
    </Card>
  );
}

function OnDevicesSection({
  scriptId,
  devices,
}: {
  scriptId: string;
  devices: Device[];
}) {
  return (
    <Card withBorder padding="md" radius="sm">
      <Stack gap="sm">
        <Text fw={500}>On devices</Text>
        {devices.length === 0 ? (
          <Text size="sm" c="dimmed">
            No online, authenticated Gen2 devices.
          </Text>
        ) : (
          devices.map((d) => (
            <DeviceRow key={d.id} device={d} scriptId={scriptId} />
          ))
        )}
      </Stack>
    </Card>
  );
}

function DeviceRow({ device, scriptId }: { device: Device; scriptId: string }) {
  const utils = trpc.useUtils();
  const query = trpc.scripts.listOnDevice.useQuery({ deviceId: device.id });
  const deployMutation = trpc.scripts.deploy.useMutation();
  const importMutation = trpc.scripts.import.useMutation();
  const [expandUnmanaged, setExpandUnmanaged] = useState(false);

  if (query.isLoading) {
    return (
      <Group gap="xs">
        <Text size="sm" style={{ flex: 1 }}>{device.name}</Text>
        <Loader size="xs" />
      </Group>
    );
  }

  if (query.error) {
    return (
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" style={{ flex: 1 }}>{device.name}</Text>
        <Text size="xs" c="red">{query.error.message}</Text>
      </Group>
    );
  }

  const scripts: OnDeviceScriptsOutput = query.data ?? [];
  const matched = scripts.filter((s) => s.match?.scriptId === scriptId);
  const unmanaged = scripts.filter((s) => s.match === null);

  const handleUpdate = (shellyScriptId: number) => {
    deployMutation.mutate(
      {
        deviceId: device.id,
        scriptId,
        enable: true,
        start: true,
        targetShellyScriptId: shellyScriptId,
      },
      {
        onSuccess() {
          utils.scripts.listOnDevice.invalidate({ deviceId: device.id });
        },
      }
    );
  };

  const handleImport = (shellyScriptId: number) => {
    importMutation.mutate(
      { deviceId: device.id, shellyScriptId },
      {
        onSuccess() {
          utils.scripts.list.invalidate();
          utils.scripts.listOnDevice.invalidate();
        },
      }
    );
  };

  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={500} style={{ flex: 1 }}>{device.name}</Text>
        {matched.length === 0 ? (
          <Badge size="xs" variant="light" color="gray">Not deployed</Badge>
        ) : (
          matched.map((m) =>
            m.match ? (
              <Group key={m.shellyScriptId} gap="xs">
                {m.match.updateAvailable ? (
                  <>
                    <Badge size="xs" color="orange" variant="light">
                      v{m.match.version} → v{m.match.latestVersion}
                    </Badge>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => handleUpdate(m.shellyScriptId)}
                      loading={deployMutation.isPending}
                    >
                      Update
                    </Button>
                  </>
                ) : (
                  <Badge size="xs" color="green" variant="light">
                    Up to date (v{m.match.version})
                  </Badge>
                )}
              </Group>
            ) : null
          )
        )}
        {unmanaged.length > 0 && (
          <Tooltip label={`${unmanaged.length} unmanaged script(s) on this device`}>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setExpandUnmanaged((v) => !v)}
            >
              <IconDownload size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <Collapse in={expandUnmanaged}>
        <Stack gap={2} pl="md">
          {unmanaged.map((s) => (
            <Group key={s.shellyScriptId} gap="xs">
              <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                {s.name} (#{s.shellyScriptId})
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                leftSection={<IconDownload size={12} />}
                onClick={() => handleImport(s.shellyScriptId)}
                loading={importMutation.isPending}
              >
                Import
              </Button>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Stack>
  );
}

