import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
  Table,
  ActionIcon,
} from '@mantine/core';
import { IconTrash, IconAlertCircle } from '@tabler/icons-react';
import { trpc } from '@/client/utils/trpc.js';
import { signIn } from '@/client/utils/auth.js';

export function Settings() {
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Provisioning WiFi state
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  // User creation state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [userError, setUserError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: passwordData } = trpc.getShellyPassword.useQuery();
  const setPasswordMutation = trpc.setShellyPassword.useMutation();

  const { data: provisioningWifi } = trpc.getProvisioningWifi.useQuery();
  const setProvisioningWifiMutation = trpc.setProvisioningWifi.useMutation();
  const { data: autoProvisioningStatus } = trpc.getAutoProvisioningStatus.useQuery();

  // Auth status and user management
  const { data: authStatus } = trpc.getAuthStatus.useQuery();
  const { data: users } = trpc.listUsers.useQuery();
  const createUserMutation = trpc.createUser.useMutation();
  const deleteUserMutation = trpc.deleteUser.useMutation();

  const handleSetPassword = () => {
    setPasswordMutation.mutate(
      { password: passwordInput || null },
      {
        onSuccess() {
          setPasswordInput('');
        },
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const handleClearPassword = () => {
    setPasswordMutation.mutate(
      { password: null },
      {
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const handleSetProvisioningWifi = () => {
    if (!wifiSsid) return;

    setProvisioningWifiMutation.mutate(
      { wifi: { ssid: wifiSsid, password: wifiPassword } },
      {
        onSuccess() {
          setWifiSsid('');
          setWifiPassword('');
        },
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const handleClearProvisioningWifi = () => {
    setProvisioningWifiMutation.mutate(
      { wifi: null },
      {
        onError(err) {
          setError(err.message);
        },
      }
    );
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) return;

    setUserError(null);

    createUserMutation.mutate(
      { email: newUserEmail, password: newUserPassword },
      {
        async onSuccess() {
          // If we're in setup mode, sign in as the new user
          if (authStatus?.setupMode) {
            const result = await signIn.email({
              email: newUserEmail,
              password: newUserPassword,
            });

            if (result.error) {
              setUserError('User created but auto-login failed: ' + result.error.message);
            }
          }

          setNewUserEmail('');
          setNewUserPassword('');
          utils.listUsers.invalidate();
          utils.getAuthStatus.invalidate();
        },
        onError(err) {
          setUserError(err.message);
        },
      }
    );
  };

  const handleDeleteUser = (userId: string) => {
    deleteUserMutation.mutate(
      { userId },
      {
        onSuccess() {
          utils.listUsers.invalidate();
          utils.getAuthStatus.invalidate();
        },
        onError(err) {
          setUserError(err.message);
        },
      }
    );
  };

  const currentUserId = authStatus?.user?.id;

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Settings</Title>
        <Text c="dimmed" size="sm">
          Configure your Shelly Toolbox preferences.
        </Text>
      </div>

      {/* User Management Card */}
      <Card withBorder padding="md" radius="sm">
        <Stack gap="sm">
          <Text fw={500}>User Management</Text>

          {authStatus?.setupMode && (
            <Alert icon={<IconAlertCircle size={16} />} color="blue">
              Welcome! Create your first user account to get started.
            </Alert>
          )}

          {/* User List */}
          {users && users.length > 0 && (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Email</Table.Th>
                  <Table.Th style={{ width: 50 }}></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((user) => (
                  <Table.Tr key={user.id}>
                    <Table.Td>
                      {user.email}
                      {user.id === currentUserId && (
                        <Text span size="xs" c="dimmed" ml="xs">
                          (you)
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={
                          user.id === currentUserId ||
                          users.length <= 1 ||
                          deleteUserMutation.isPending
                        }
                        title={
                          user.id === currentUserId
                            ? "Cannot delete your own account"
                            : users.length <= 1
                              ? "Cannot delete the last user"
                              : "Delete user"
                        }
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          {/* Create User Form */}
          <Text size="sm" fw={500} mt="sm">
            {authStatus?.setupMode ? 'Create First User' : 'Add New User'}
          </Text>
          <Stack gap="xs">
            <TextInput
              placeholder="Email"
              type="email"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.currentTarget.value)}
            />
            <Group gap="sm">
              <PasswordInput
                placeholder="Password (min 8 characters)"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                onClick={handleCreateUser}
                loading={createUserMutation.isPending}
                disabled={!newUserEmail || newUserPassword.length < 8}
              >
                {authStatus?.setupMode ? 'Create & Sign In' : 'Add User'}
              </Button>
            </Group>
          </Stack>

          {userError && (
            <Text c="red" size="sm">
              {userError}
            </Text>
          )}
        </Stack>
      </Card>

      <Card withBorder padding="md" radius="sm">
        <Stack gap="sm">
          <Text fw={500}>Expected Device Password</Text>
          <Text c="dimmed" size="sm">
            Set the password you want all your Shelly devices to use. Devices
            will be checked against this password.
          </Text>
          <Group gap="sm">
            <PasswordInput
              placeholder={
                passwordData?.hasPassword
                  ? 'Password configured (enter new to change)'
                  : 'Enter password'
              }
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              onClick={handleSetPassword}
              loading={setPasswordMutation.status === 'pending'}
              disabled={!passwordInput}
            >
              {passwordData?.hasPassword ? 'Update' : 'Set'}
            </Button>
            {passwordData?.hasPassword && (
              <Button
                variant="light"
                color="red"
                onClick={handleClearPassword}
                loading={setPasswordMutation.status === 'pending'}
              >
                Clear
              </Button>
            )}
          </Group>
        </Stack>
      </Card>

      {autoProvisioningStatus?.enabled && (
        <Card withBorder padding="md" radius="sm">
          <Stack gap="sm">
            <Text fw={500}>Provisioning WiFi</Text>
            <Text c="dimmed" size="sm">
              Configure the WiFi network that new Shelly devices should join when
              provisioned. This is used when setting up factory-default devices.
            </Text>
            {provisioningWifi ? (
              <Group gap="sm">
                <Text size="sm">
                  Configured: <strong>{provisioningWifi.ssid}</strong>
                </Text>
                <Button
                  variant="light"
                  color="red"
                  size="xs"
                  onClick={handleClearProvisioningWifi}
                  loading={setProvisioningWifiMutation.status === 'pending'}
                >
                  Clear
                </Button>
              </Group>
            ) : (
              <Stack gap="xs">
                <TextInput
                  placeholder="WiFi SSID"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.currentTarget.value)}
                />
                <Group gap="sm">
                  <PasswordInput
                    placeholder="WiFi Password"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    onClick={handleSetProvisioningWifi}
                    loading={setProvisioningWifiMutation.status === 'pending'}
                    disabled={!wifiSsid}
                  >
                    Save
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        </Card>
      )}

      {error && (
        <Card withBorder padding="sm" radius="sm" bg="red.0">
          <Text c="red.7" size="sm">
            {error}
          </Text>
        </Card>
      )}
    </Stack>
  );
}
