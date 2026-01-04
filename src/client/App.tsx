import { AppShell, Badge, Container, Group, Text, Title } from '@mantine/core';
import { DeviceList } from '@/client/components/DeviceList.js';
import { useConnectionStatus } from '@/client/hooks/useConnectionStatus.js';

export function App() {
  const connectionStatus = useConnectionStatus();

  const connectionColor =
    connectionStatus === 'connected'
      ? 'green'
      : connectionStatus === 'connecting'
        ? 'yellow'
        : 'red';

  const connectionLabel =
    connectionStatus === 'connected'
      ? 'Connected'
      : connectionStatus === 'connecting'
        ? 'Connecting'
        : 'Disconnected';

  return (
    <AppShell>
      <AppShell.Header>
        <Container size="lg">
          <Group h="4rem" justify="space-between">
            <div>
              <Title order={3}>Shelly Toolbox</Title>
              <Text c="dimmed">Local Shelly device manager</Text>
            </div>
            <Badge color={connectionColor} variant="dot">
              {connectionLabel}
            </Badge>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg" pt="md">
          <DeviceList />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
