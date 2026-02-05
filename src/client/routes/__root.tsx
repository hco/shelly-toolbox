import { createRootRoute, Link, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import {
  AppShell,
  Badge,
  Button,
  Container,
  Group,
  Tabs,
  Title,
  Text,
  Loader,
  Center,
} from '@mantine/core';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useConnectionStatus } from '@/client/hooks/useConnectionStatus.js';
import { NotificationListener } from '@/client/components/NotificationToast.js';
import { trpc } from '@/client/utils/trpc.js';
import { signOut } from '@/client/utils/auth.js';
import { useEffect, useState } from 'react';

function RootLayout() {
  const connectionStatus = useConnectionStatus();
  const versionQuery = trpc.getVersion.useQuery();
  const authStatusQuery = trpc.getAuthStatus.useQuery();
  const navigate = useNavigate();
  const location = useLocation();
  const utils = trpc.useUtils();
  const [loggingOut, setLoggingOut] = useState(false);

  const isLoginPage = location.pathname === '/login';

  // Handle redirects based on auth status
  useEffect(() => {
    if (authStatusQuery.isLoading) return;

    const { setupMode, authenticated } = authStatusQuery.data || {};

    // In setup mode, redirect to settings to create first user
    if (setupMode && location.pathname !== '/settings') {
      navigate({ to: '/settings' });
      return;
    }

    // Not authenticated and not in setup mode -> redirect to login
    if (!setupMode && !authenticated && !isLoginPage) {
      navigate({ to: '/login' });
      return;
    }

    // Authenticated on login page -> redirect to home
    if (authenticated && isLoginPage) {
      navigate({ to: '/' });
      return;
    }
  }, [authStatusQuery.isLoading, authStatusQuery.data, location.pathname, navigate, isLoginPage]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      await utils.getAuthStatus.invalidate();
      navigate({ to: '/login' });
    } finally {
      setLoggingOut(false);
    }
  };

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

  // Show loading while checking auth
  if (authStatusQuery.isLoading) {
    return (
      <Center style={{ minHeight: '100vh' }}>
        <Loader size="lg" />
      </Center>
    );
  }

  // For login page, render without AppShell
  if (isLoginPage) {
    return (
      <>
        <Outlet />
        {import.meta.env.DEV && <TanStackRouterDevtools />}
      </>
    );
  }

  const isAuthenticated = authStatusQuery.data?.authenticated;
  const userEmail = authStatusQuery.data?.user?.email;

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
            <Group gap="md">
              <Badge color={connectionColor} variant="dot">
                {connectionLabel}
              </Badge>
              {isAuthenticated && (
                <Group gap="xs">
                  {userEmail && (
                    <Text size="sm" c="dimmed">
                      {userEmail}
                    </Text>
                  )}
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={handleLogout}
                    loading={loggingOut}
                  >
                    Logout
                  </Button>
                </Group>
              )}
            </Group>
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
