import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, patch, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validNotification = {
  userId: 'user-1',
  type: 'email' as const,
  title: 'Welcome',
  message: 'Welcome to our platform!',
};

async function createNotification(overrides = {}) {
  const res = await post(app, '/notifications', { ...validNotification, ...overrides });
  return res.data.data;
}

describe('POST /notifications', () => {
  test('creates a notification', async () => {
    const res = await post(app, '/notifications', validNotification);
    expect(res.status).toBe(201);
    expect(res.data.data.userId).toBe('user-1');
    expect(res.data.data.type).toBe('email');
    expect(res.data.data.status).toBe('pending');
    expect(res.data.data.readAt).toBeNull();
  });

  test('validates required fields', async () => {
    const res = await post(app, '/notifications', {});
    expect(res.status).toBe(400);
    expect(res.data.errors.length).toBeGreaterThanOrEqual(4);
  });

  test('validates notification type', async () => {
    const res = await post(app, '/notifications', { ...validNotification, type: 'fax' });
    expect(res.status).toBe(400);
  });

  test('validates title min length', async () => {
    const res = await post(app, '/notifications', { ...validNotification, title: '' });
    expect(res.status).toBe(400);
  });

  test('validates message min length', async () => {
    const res = await post(app, '/notifications', { ...validNotification, message: '' });
    expect(res.status).toBe(400);
  });

  test('creates with metadata', async () => {
    const res = await post(app, '/notifications', { ...validNotification, metadata: { priority: 'high' } });
    expect(res.data.data.metadata.priority).toBe('high');
  });

  test('defaults metadata to empty object', async () => {
    const res = await post(app, '/notifications', validNotification);
    expect(res.data.data.metadata).toEqual({});
  });

  test('accepts all valid types', async () => {
    for (const type of ['email', 'sms', 'push', 'in_app']) {
      resetStore();
      const res = await post(app, '/notifications', { ...validNotification, type });
      expect(res.status).toBe(201);
    }
  });
});

describe('GET /notifications', () => {
  test('lists all notifications', async () => {
    await createNotification();
    await createNotification({ title: 'Second' });
    const res = await get(app, '/notifications');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
  });

  test('filters by userId', async () => {
    await createNotification({ userId: 'user-1' });
    await createNotification({ userId: 'user-2' });
    const res = await get(app, '/notifications?userId=user-1');
    expect(res.data.data.length).toBe(1);
  });

  test('filters by status', async () => {
    const n = await createNotification();
    await put(app, `/notifications/${n.id}`, { status: 'sent' });
    await createNotification({ title: 'Other' });
    const res = await get(app, '/notifications?status=sent');
    expect(res.data.data.length).toBe(1);
  });

  test('filters by type', async () => {
    await createNotification({ type: 'email' });
    await createNotification({ type: 'sms', title: 'SMS' });
    const res = await get(app, '/notifications?type=sms');
    expect(res.data.data.length).toBe(1);
  });

  test('paginates results', async () => {
    for (let i = 0; i < 5; i++) await createNotification({ title: `N${i}` });
    const res = await get(app, '/notifications?page=1&limit=3');
    expect(res.data.data.length).toBe(3);
    expect(res.data.total).toBe(5);
  });

  test('returns empty list', async () => {
    const res = await get(app, '/notifications');
    expect(res.data.data).toEqual([]);
  });
});

describe('GET /notifications/:id', () => {
  test('gets notification by id', async () => {
    const n = await createNotification();
    const res = await get(app, `/notifications/${n.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.title).toBe('Welcome');
  });

  test('returns 404 for missing notification', async () => {
    const res = await get(app, '/notifications/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PUT /notifications/:id', () => {
  test('updates status', async () => {
    const n = await createNotification();
    const res = await put(app, `/notifications/${n.id}`, { status: 'sent' });
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('sent');
  });

  test('updates title', async () => {
    const n = await createNotification();
    const res = await put(app, `/notifications/${n.id}`, { title: 'Updated Title' });
    expect(res.data.data.title).toBe('Updated Title');
  });

  test('validates invalid status', async () => {
    const n = await createNotification();
    const res = await put(app, `/notifications/${n.id}`, { status: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('validates empty title', async () => {
    const n = await createNotification();
    const res = await put(app, `/notifications/${n.id}`, { title: '' });
    expect(res.status).toBe(400);
  });

  test('validates empty message', async () => {
    const n = await createNotification();
    const res = await put(app, `/notifications/${n.id}`, { message: '' });
    expect(res.status).toBe(400);
  });

  test('returns 404 for missing notification', async () => {
    const res = await put(app, '/notifications/nonexistent', { status: 'sent' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /notifications/:id', () => {
  test('deletes a notification', async () => {
    const n = await createNotification();
    const res = await del(app, `/notifications/${n.id}`);
    expect(res.status).toBe(200);
    const check = await get(app, `/notifications/${n.id}`);
    expect(check.status).toBe(404);
  });

  test('returns 404 for missing notification', async () => {
    const res = await del(app, '/notifications/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /notifications/broadcast', () => {
  test('broadcasts to multiple users', async () => {
    const res = await post(app, '/notifications/broadcast', {
      userIds: ['user-1', 'user-2', 'user-3'],
      type: 'push',
      title: 'System Update',
      message: 'New features available!',
    });
    expect(res.status).toBe(201);
    expect(res.data.data.length).toBe(3);
    expect(res.data.total).toBe(3);
  });

  test('validates required fields', async () => {
    const res = await post(app, '/notifications/broadcast', {});
    expect(res.status).toBe(400);
  });

  test('validates userIds is non-empty array', async () => {
    const res = await post(app, '/notifications/broadcast', {
      userIds: [],
      type: 'email',
      title: 'Test',
      message: 'Test message',
    });
    expect(res.status).toBe(400);
  });

  test('validates notification type', async () => {
    const res = await post(app, '/notifications/broadcast', {
      userIds: ['user-1'],
      type: 'telegram',
      title: 'Test',
      message: 'Test message',
    });
    expect(res.status).toBe(400);
  });

  test('skips non-string userIds', async () => {
    const res = await post(app, '/notifications/broadcast', {
      userIds: ['user-1', 123, 'user-2'],
      type: 'email',
      title: 'Test',
      message: 'Test message',
    });
    expect(res.data.data.length).toBe(2);
  });
});

describe('PATCH /notifications/:id/read', () => {
  test('marks notification as read', async () => {
    const n = await createNotification();
    const res = await patch(app, `/notifications/${n.id}/read`);
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('read');
    expect(res.data.data.readAt).toBeDefined();
    expect(res.data.data.readAt).not.toBeNull();
  });

  test('idempotent - marking already-read notification', async () => {
    const n = await createNotification();
    await patch(app, `/notifications/${n.id}/read`);
    const res = await patch(app, `/notifications/${n.id}/read`);
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('read');
  });

  test('returns 404 for missing notification', async () => {
    const res = await patch(app, '/notifications/nonexistent/read');
    expect(res.status).toBe(404);
  });
});
