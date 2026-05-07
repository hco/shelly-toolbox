import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useMemo } from 'react';
import { trpc } from '@/client/utils/trpc.js';
import type { Device } from '@/shared/types.js';

interface Props {
  opened: boolean;
  onClose: () => void;
  devices: Device[];
  onImported?: (scriptId: string) => void;
}

export function ScriptImportModal({ opened, onClose, devices, onImported }: Props) {
  const deployableDevices = useMemo(
    () =>
      devices.filter(
        (d) =>
          d.online &&
          d.gen === 2 &&
          (d.authStatus === 'correct_password' || d.authStatus === 'unprotected')
      ),
    [devices]
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Import script from device" size="lg">
      <Stack gap="md">
        {deployableDevices.length === 0 ? (
          <Alert color="yellow">
            No online, authenticated Gen2 devices available.
          </Alert>
        ) : (
          deployableDevices.map((d) => (
            <DeviceImportSection
              key={d.id}
              device={d}
              opened={opened}
              onImported={(scriptId) => {
                onImported?.(scriptId);
                onClose();
              }}
            />
          ))
        )}
      </Stack>
    </Modal>
  );
}

function DeviceImportSection({
  device,
  opened,
  onImported,
}: {
  device: Device;
  opened: boolean;
  onImported: (scriptId: string) => void;
}) {
  const utils = trpc.useUtils();
  const query = trpc.scripts.listOnDevice.useQuery(
    { deviceId: device.id },
    { enabled: opened }
  );
  const importMutation = trpc.scripts.import.useMutation();

  const handleImport = (shellyScriptId: number) => {
    importMutation.mutate(
      { deviceId: device.id, shellyScriptId },
      {
        onSuccess(script) {
          utils.scripts.list.invalidate();
          utils.scripts.listOnDevice.invalidate();
          onImported(script.id);
        },
      }
    );
  };

  const unmanaged = (query.data ?? []).filter((s) => s.match === null);

  return (
    <Stack gap={4}>
      <Text fw={500} size="sm">
        {device.name}
      </Text>
      {query.isLoading ? (
        <Loader size="xs" />
      ) : query.error ? (
        <Text size="xs" c="red">
          {query.error.message}
        </Text>
      ) : unmanaged.length === 0 ? (
        <Text size="xs" c="dimmed">
          No unmanaged scripts.
        </Text>
      ) : (
        unmanaged.map((s) => (
          <Group key={s.shellyScriptId} gap="xs" wrap="nowrap">
            <Text size="sm" style={{ flex: 1 }}>
              {s.name}{' '}
              <Text component="span" size="xs" c="dimmed">
                (#{s.shellyScriptId}, {s.running ? 'running' : 'stopped'})
              </Text>
            </Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconDownload size={14} />}
              onClick={() => handleImport(s.shellyScriptId)}
              loading={importMutation.isPending}
            >
              Import
            </Button>
          </Group>
        ))
      )}
    </Stack>
  );
}
