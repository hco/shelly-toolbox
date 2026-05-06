import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/client/utils/trpc.js';
import type { Device, OnDeviceScript } from '@/shared/types.js';

interface Props {
  opened: boolean;
  onClose: () => void;
  scriptId: string;
  scriptName: string;
  devices: Device[];
}

export function ScriptDeployModal({ opened, onClose, scriptId, scriptName, devices }: Props) {
  const utils = trpc.useUtils();

  const deployableDevices = useMemo(
    () =>
      devices.filter(
        (d) => d.online && d.gen === 2 && d.authStatus === 'correct_password'
      ),
    [devices]
  );

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [enable, setEnable] = useState(true);
  const [start, setStart] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setDeviceId((current) => current ?? deployableDevices[0]?.id ?? null);
      setError(null);
    }
  }, [opened, deployableDevices]);

  const onDeviceScriptsQuery = trpc.scripts.listOnDevice.useQuery(
    { deviceId: deviceId ?? '' },
    { enabled: opened && !!deviceId }
  );

  const existingMatch: OnDeviceScript | undefined = onDeviceScriptsQuery.data?.find(
    (s) => s.match?.scriptId === scriptId
  );

  const deployMutation = trpc.scripts.deploy.useMutation();

  const handleSubmit = () => {
    if (!deviceId) return;
    setError(null);
    deployMutation.mutate(
      {
        deviceId,
        scriptId,
        enable,
        start,
        targetShellyScriptId: existingMatch?.shellyScriptId,
      },
      {
        onSuccess() {
          utils.scripts.listOnDevice.invalidate({ deviceId });
          onClose();
        },
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Deploy "${scriptName}"`}>
      <Stack gap="md">
        {deployableDevices.length === 0 ? (
          <Alert color="yellow">
            No online, authenticated Gen2 devices available.
          </Alert>
        ) : (
          <Select
            label="Device"
            data={deployableDevices.map((d) => ({ value: d.id, label: d.name }))}
            value={deviceId}
            onChange={setDeviceId}
            searchable
          />
        )}

        {deviceId && onDeviceScriptsQuery.isLoading && (
          <Text size="sm" c="dimmed">
            Checking existing scripts on device…
          </Text>
        )}

        {deviceId && onDeviceScriptsQuery.data && (
          <Text size="sm" c="dimmed">
            {existingMatch
              ? `Will overwrite existing script "${existingMatch.name}" (slot #${existingMatch.shellyScriptId}).`
              : 'Will create a new script on the device.'}
          </Text>
        )}

        <Checkbox
          label="Enable on boot"
          checked={enable}
          onChange={(e) => setEnable(e.currentTarget.checked)}
        />
        <Checkbox
          label="Start after upload"
          checked={start}
          onChange={(e) => setStart(e.currentTarget.checked)}
        />

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={deployMutation.isPending}
            disabled={!deviceId || deployableDevices.length === 0}
          >
            Deploy
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
