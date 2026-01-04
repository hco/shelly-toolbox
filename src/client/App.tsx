import { AppShell, Container, Group, Text, Title } from '@mantine/core';
import { DeviceList } from '@/client/components/DeviceList.js';

export function App() {
  return (
    <AppShell>
      <AppShell.Header>
        <Container size="lg">
          <Group h="4rem" justify="space-between">
            <Title order={3}>Shelly Toolbox</Title>
            <Text c="dimmed">Local Shelly device manager</Text>
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

