import { Router, json, parseBody, HttpError, generateId, now } from '../../shared/router';
import { Store } from '../../shared/store';
import { validate } from '../../shared/validation';
import type { Notification, NotificationType, NotificationStatus } from '../../shared/types';

const store = new Store<Notification>();

export function getStore() { return store; }
export function resetStore() { store.clear(); }

const VALID_TYPES: NotificationType[] = ['email', 'sms', 'push', 'in_app'];
const VALID_STATUSES: NotificationStatus[] = ['pending', 'sent', 'read', 'failed'];

const router = new Router();

// GET /notifications
router.get('/notifications', (req) => {
  const params = new URL(req.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')));
  const userId = params.get('userId');
  const status = params.get('status') as NotificationStatus | null;
  const type = params.get('type') as NotificationType | null;

  let items = store.getAll();
  if (userId) items = items.filter(n => n.userId === userId);
  if (status && VALID_STATUSES.includes(status)) items = items.filter(n => n.status === status);
  if (type && VALID_TYPES.includes(type)) items = items.filter(n => n.type === type);

  const total = items.length;
  const start = (page - 1) * limit;
  items = items.slice(start, start + limit);
  return json({ success: true, data: items, total, page, limit });
});

// POST /notifications
router.post('/notifications', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'userId', required: true, type: 'string' },
    { field: 'type', required: true, type: 'string' },
    { field: 'title', required: true, type: 'string', minLength: 1, maxLength: 200 },
    { field: 'message', required: true, type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  if (!VALID_TYPES.includes(body.type)) {
    return json({ success: false, errors: [`type must be one of: ${VALID_TYPES.join(', ')}`] }, 400);
  }

  const notification: Notification = {
    id: generateId(),
    userId: body.userId,
    type: body.type,
    title: body.title,
    message: body.message,
    status: 'pending',
    metadata: body.metadata || {},
    createdAt: now(),
    readAt: null,
  };
  store.create(notification);
  return json({ success: true, data: notification }, 201);
});

// GET /notifications/:id
router.get('/notifications/:id', (_req, params) => {
  const notification = store.get(params.id);
  if (!notification) throw new HttpError(404, 'Notification not found');
  return json({ success: true, data: notification });
});

// PUT /notifications/:id
router.put('/notifications/:id', async (req, params) => {
  const notification = store.get(params.id);
  if (!notification) throw new HttpError(404, 'Notification not found');

  const body = await parseBody<any>(req);
  const updates: Partial<Notification> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return json({ success: false, errors: [`status must be one of: ${VALID_STATUSES.join(', ')}`] }, 400);
    }
    updates.status = body.status;
  }
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.length === 0) {
      return json({ success: false, errors: ['title must be a non-empty string'] }, 400);
    }
    updates.title = body.title;
  }
  if (body.message !== undefined) {
    if (typeof body.message !== 'string' || body.message.length === 0) {
      return json({ success: false, errors: ['message must be a non-empty string'] }, 400);
    }
    updates.message = body.message;
  }

  const updated = store.update(params.id, updates);
  return json({ success: true, data: updated });
});

// DELETE /notifications/:id
router.delete('/notifications/:id', (_req, params) => {
  if (!store.has(params.id)) throw new HttpError(404, 'Notification not found');
  store.delete(params.id);
  return json({ success: true, data: { message: 'Notification deleted' } });
});

// POST /notifications/broadcast — send to multiple users
router.post('/notifications/broadcast', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'userIds', required: true, type: 'array' },
    { field: 'type', required: true, type: 'string' },
    { field: 'title', required: true, type: 'string', minLength: 1 },
    { field: 'message', required: true, type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
    return json({ success: false, errors: ['userIds must be a non-empty array'] }, 400);
  }

  if (!VALID_TYPES.includes(body.type)) {
    return json({ success: false, errors: [`type must be one of: ${VALID_TYPES.join(', ')}`] }, 400);
  }

  const created: Notification[] = [];
  for (const userId of body.userIds) {
    if (typeof userId !== 'string') continue;
    const notification: Notification = {
      id: generateId(),
      userId,
      type: body.type,
      title: body.title,
      message: body.message,
      status: 'pending',
      metadata: body.metadata || {},
      createdAt: now(),
      readAt: null,
    };
    store.create(notification);
    created.push(notification);
  }
  return json({ success: true, data: created, total: created.length }, 201);
});

// PATCH /notifications/:id/read
router.patch('/notifications/:id/read', (_req, params) => {
  const notification = store.get(params.id);
  if (!notification) throw new HttpError(404, 'Notification not found');

  if (notification.readAt) {
    return json({ success: true, data: notification });
  }

  const updated = store.update(params.id, {
    status: 'read',
    readAt: now(),
  });
  return json({ success: true, data: updated });
});

export function createApp() {
  return (req: Request) => router.handle(req);
}
