import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import {
  AppShell,
  Badge,
  Container,
  Group,
  Tabs,
  Title,
  Text,
} from '@mantine/core';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useConnectionStatus } from '@/client/hooks/useConnectionStatus.js';
import { NotificationListener } from '@/client/components/NotificationToast.js';
import { trpc } from '@/client/utils/trpc.js';

function RootLayout() {
  const connectionStatus = useConnectionStatus();
  const versionQuery = trpc.getVersion.useQuery();

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
    <AppShell header={{ height: 60 }} footer={{ height: 40 }}>
      <NotificationListener />
      <AppShell.Header>
        <Container size="lg">
          <Group h={60} justify="space-between">
            <Group gap="xl">
              <Title order={3}>Shelly Toolbox</Title>
              <Tabs defaultValue="/" variant="subtle">
                <Tabs.List>
                  <Link to="/" style={{ textDecoration: 'none' }}>
                    {({ isActive }: { isActive: boolean }) => (
                      <Tabs.Tab value="/" data-active={isActive || undefined}>
                        Devices
                      </Tabs.Tab>
                    )}
                  </Link>
                  <Link to="/settings" style={{ textDecoration: 'none' }}>
                    {({ isActive }: { isActive: boolean }) => (
                      <Tabs.Tab
                        value="/settings"
                        data-active={isActive || undefined}
                      >
                        Settings
                      </Tabs.Tab>
                    )}
                  </Link>
                </Tabs.List>
              </Tabs>
            </Group>
            <Badge color={connectionColor} variant="dot">
              {connectionLabel}
            </Badge>
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg" pt="md">
          <Outlet />
        </Container>
      </AppShell.Main>
      <AppShell.Footer>
        <Container size="lg">
          <Group h={40} justify="center">
            <Text size="xs" c="dimmed">
              Version: {versionQuery.data?.version || 'loading...'}
            </Text>
          </Group>
        </Container>
      </AppShell.Footer>
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </AppShell>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
