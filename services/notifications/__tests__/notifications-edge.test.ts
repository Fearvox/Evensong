import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, patch, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validNotification = {
  userId: 'user-1',
  type: 'email' as const,
  title: 'Test Notification',
  message: 'This is a test notification.',
};

async function createNotification(overrides = {}) {
  const res = await post(app, '/notifications', { ...validNotification, ...overrides });
  return res.data.data;
}

describe('creation edge cases', () => {
  test('rejects title exceeding max length', async () => {
    const res = await post(app, '/notifications', { ...validNotification, title: 'a'.repeat(201) });
    expect(res.status).toBe(400);
  });

  test('accepts title at max length boundary', async () => {
    const res = await post(app, '/notifications', { ...validNotification, title: 'a'.repeat(200) });
    expect(res.status).toBe(201);
  });

  test('sets timestamps on creation', async () => {
    const n = await createNotification();
    expect(n.createdAt).toBeDefined();
    expect(n.readAt).toBeNull();
  });

  test('rejects non-string userId', async () => {
    const res = await post(app, '/notifications', { ...validNotification, userId: 123 });
    expect(res.status).toBe(400);
  });

  test('rejects non-string type', async () => {
    const res = await post(app, '/notifications', { ...validNotification, type: 123 });
    expect(res.status).toBe(400);
  });
});

describe('filter combinations', () => {
  test('filters by userId and status together', async () => {
    const n1 = await createNotification({ userId: 'user-1' });
    await put(app, `/notifications/${n1.id}`, { status: 'sent' });
    await createNotification({ userId: 'user-1', title: 'Other' });
    await createNotification({ userId: 'user-2', title: 'Other2' });
    const res = await get(app, '/notifications?userId=user-1&status=sent');
    expect(res.data.data.length).toBe(1);
  });

  test('filters by userId and type together', async () => {
    await createNotification({ userId: 'user-1', type: 'email' });
    await createNotification({ userId: 'user-1', type: 'sms', title: 'SMS' });
    const res = await get(app, '/notifications?userId=user-1&type=email');
    expect(res.data.data.length).toBe(1);
  });
});

describe('broadcast edge cases', () => {
  test('broadcast creates independent notifications', async () => {
    const res = await post(app, '/notifications/broadcast', {
      userIds: ['user-1', 'user-2'],
      type: 'push',
      title: 'Test',
      message: 'Broadcast message',
    });
    expect(res.data.data[0].id).not.toBe(res.data.data[1].id);
    expect(res.data.data[0].userId).toBe('user-1');
    expect(res.data.data[1].userId).toBe('user-2');
  });

  test('broadcast with metadata propagates to all', async () => {
    const res = await post(app, '/notifications/broadcast', {
      userIds: ['user-1', 'user-2'],
      type: 'email',
      title: 'Sale',
      message: 'Big sale!',
      metadata: { campaign: 'summer2024' },
    });
    expect(res.data.data[0].metadata.campaign).toBe('summer2024');
    expect(res.data.data[1].metadata.campaign).toBe('summer2024');
  });
});

describe('read marking edge cases', () => {
  test('sets readAt timestamp on first read', async () => {
    const n = await createNotification();
    const res = await patch(app, `/notifications/${n.id}/read`);
    expect(res.data.data.readAt).not.toBeNull();
    expect(res.data.data.status).toBe('read');
  });

  test('preserves original readAt on re-read', async () => {
    const n = await createNotification();
    const firstRead = await patch(app, `/notifications/${n.id}/read`);
    const secondRead = await patch(app, `/notifications/${n.id}/read`);
    expect(secondRead.data.data.readAt).toBe(firstRead.data.data.readAt);
  });
});

describe('update edge cases', () => {
  test('can update message field', async () => {
    const n = await createNotification();
    const res = await put(app, `/notifications/${n.id}`, { message: 'Updated message' });
    expect(res.data.data.message).toBe('Updated message');
  });

  test('preserves fields not in update payload', async () => {
    const n = await createNotification();
    const res = await put(app, `/notifications/${n.id}`, { title: 'New Title' });
    expect(res.data.data.message).toBe(validNotification.message);
    expect(res.data.data.userId).toBe(validNotification.userId);
  });
});

describe('delete edge cases', () => {
  test('deleting removes from listing', async () => {
    const n = await createNotification();
    await del(app, `/notifications/${n.id}`);
    const list = await get(app, '/notifications');
    expect(list.data.total).toBe(0);
  });
});
