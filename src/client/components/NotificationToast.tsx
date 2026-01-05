import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { trpc } from '@/client/utils/trpc.js';
import type { Notification } from '@/shared/types';

const notificationColors: Record<Notification['type'], string> = {
  info: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
};

export function NotificationListener() {
  trpc.onNotifications.useSubscription(undefined, {
    onData(notification) {
      notifications.show({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        color: notificationColors[notification.type],
        autoClose: notification.type === 'error' ? false : 5000,
      });
    },
  });

  // Fetch recent notifications on mount (in case we missed any)
  const { data: recentNotifications } = trpc.getRecentNotifications.useQuery(
    { limit: 5 },
    { refetchOnWindowFocus: false }
  );

  useEffect(() => {
    // Show recent notifications that are less than 30 seconds old
    if (recentNotifications) {
      const now = Date.now();
      for (const notification of recentNotifications) {
        const age = now - new Date(notification.timestamp).getTime();
        if (age < 30000) {
          notifications.show({
            id: notification.id,
            title: notification.title,
            message: notification.message,
            color: notificationColors[notification.type],
            autoClose: notification.type === 'error' ? false : 5000,
          });
        }
      }
    }
  }, [recentNotifications]);

  return null;
}
