import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { Notification, NotificationType } from '@/shared/types';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  context?: Record<string, unknown>;
}

class NotificationService extends EventEmitter {
  private notifications: Notification[] = [];
  private maxStoredNotifications = 100;

  notify(input: NotificationInput): Notification {
    const notification: Notification = {
      id: randomUUID(),
      type: input.type,
      title: input.title,
      message: input.message,
      timestamp: new Date().toISOString(),
      context: input.context,
    };

    this.notifications.unshift(notification);

    // Trim old notifications
    if (this.notifications.length > this.maxStoredNotifications) {
      this.notifications = this.notifications.slice(0, this.maxStoredNotifications);
    }

    this.emit('notification', notification);
    return notification;
  }

  info(title: string, message: string, context?: Record<string, unknown>): Notification {
    return this.notify({ type: 'info', title, message, context });
  }

  success(title: string, message: string, context?: Record<string, unknown>): Notification {
    return this.notify({ type: 'success', title, message, context });
  }

  warning(title: string, message: string, context?: Record<string, unknown>): Notification {
    return this.notify({ type: 'warning', title, message, context });
  }

  error(title: string, message: string, context?: Record<string, unknown>): Notification {
    return this.notify({ type: 'error', title, message, context });
  }

  getRecent(limit = 20): Notification[] {
    return this.notifications.slice(0, limit);
  }

  getAll(): Notification[] {
    return [...this.notifications];
  }

  clear(): void {
    this.notifications = [];
  }
}

// Singleton instance
export const notificationService = new NotificationService();
