// Notifications store — in-memory notification and template management

import { MemoryStore, generateId, now } from "../shared";
import type {
  Notification,
  NotificationType,
  NotificationChannel,
} from "../shared";

// Template with {{variable}} placeholders
export interface NotificationTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  createdAt: string;
}

// Stores
const notifications = new MemoryStore<Notification>();
const templates = new MemoryStore<NotificationTemplate>();

// --- Notification CRUD ---

export function createNotification(
  userId: string,
  type: NotificationType,
  channel: NotificationChannel,
  title: string,
  body: string,
): Notification {
  const notification: Notification = {
    id: generateId(),
    userId,
    type,
    channel,
    title: title.trim(),
    body: body.trim(),
    read: false,
    createdAt: now(),
  };
  return notifications.create(notification);
}

export function getNotification(id: string): Notification | undefined {
  return notifications.get(id);
}

export function getAllNotifications(): Notification[] {
  return notifications.getAll();
}

export function deleteNotification(id: string): boolean {
  return notifications.delete(id);
}

// --- Read / Unread ---

export function markAsRead(id: string): Notification | undefined {
  return notifications.update(id, { read: true });
}

export function markAsUnread(id: string): Notification | undefined {
  return notifications.update(id, { read: false });
}

export function bulkMarkAsRead(ids: string[]): number {
  let count = 0;
  for (const id of ids) {
    const result = notifications.update(id, { read: true });
    if (result) count++;
  }
  return count;
}

// --- Send ---

export function sendNotification(id: string): Notification | undefined {
  const notification = notifications.get(id);
  if (!notification) return undefined;
  if (notification.sentAt) return undefined; // already sent
  return notifications.update(id, { sentAt: now() });
}

// --- Filtering ---

export interface NotificationFilter {
  userId?: string;
  type?: NotificationType;
  channel?: NotificationChannel;
  read?: boolean;
}

export function filterNotifications(
  filter: NotificationFilter,
): Notification[] {
  return notifications.find((n) => {
    if (filter.userId !== undefined && n.userId !== filter.userId) return false;
    if (filter.type !== undefined && n.type !== filter.type) return false;
    if (filter.channel !== undefined && n.channel !== filter.channel)
      return false;
    if (filter.read !== undefined && n.read !== filter.read) return false;
    return true;
  });
}

// --- User-specific ---

export function getUserNotifications(userId: string): Notification[] {
  return notifications.find((n) => n.userId === userId);
}

export function getUnreadCount(userId: string): number {
  return notifications.find((n) => n.userId === userId && !n.read).length;
}

// --- Cleanup ---

export function deleteOldNotifications(daysOld: number): number {
  const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
  const old = notifications.find(
    (n) => new Date(n.createdAt).getTime() < cutoff,
  );
  for (const n of old) {
    notifications.delete(n.id);
  }
  return old.length;
}

// --- Templates ---

export function createTemplate(
  name: string,
  title: string,
  body: string,
): NotificationTemplate {
  const template: NotificationTemplate = {
    id: generateId(),
    name: name.trim(),
    title: title.trim(),
    body: body.trim(),
    createdAt: now(),
  };
  return templates.create(template);
}

export function getTemplateByName(
  name: string,
): NotificationTemplate | undefined {
  return templates.findOne((t) => t.name === name.trim());
}

export function applyTemplate(
  template: NotificationTemplate,
  variables: Record<string, string>,
): { title: string; body: string } {
  let title = template.title;
  let body = template.body;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    title = title.replaceAll(placeholder, value);
    body = body.replaceAll(placeholder, value);
  }
  return { title, body };
}

// --- Stats ---

export function getStats(): {
  total: number;
  byType: Record<string, number>;
  byChannel: Record<string, number>;
  sent: number;
  unsent: number;
  read: number;
  unread: number;
} {
  const all = notifications.getAll();
  const byType: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  let sent = 0;
  let unsent = 0;
  let read = 0;
  let unread = 0;

  for (const n of all) {
    byType[n.type] = (byType[n.type] || 0) + 1;
    byChannel[n.channel] = (byChannel[n.channel] || 0) + 1;
    if (n.sentAt) sent++;
    else unsent++;
    if (n.read) read++;
    else unread++;
  }

  return { total: all.length, byType, byChannel, sent, unsent, read, unread };
}

// --- Total count ---

export function notificationCount(): number {
  return notifications.count();
}

// --- Reset all stores (for testing) ---

export function resetStores(): void {
  notifications.clear();
  templates.clear();
}
