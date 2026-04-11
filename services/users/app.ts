import { Router, json, parseBody, HttpError, generateId, now } from '../../shared/router';
import { Store } from '../../shared/store';
import { validate, EMAIL_PATTERN } from '../../shared/validation';
import type { User } from '../../shared/types';

const store = new Store<User>();

export function getStore() { return store; }
export function resetStore() { store.clear(); }

const router = new Router();

// GET /users
router.get('/users', (req) => {
  const params = new URL(req.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')));
  const all = store.getAll();
  const start = (page - 1) * limit;
  const items = all.slice(start, start + limit).map(stripPassword);
  return json({ success: true, data: items, total: all.length, page, limit });
});

// POST /users
router.post('/users', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'email', required: true, type: 'string', pattern: EMAIL_PATTERN },
    { field: 'username', required: true, type: 'string', minLength: 3, maxLength: 30 },
    { field: 'displayName', required: true, type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  if (store.findOne(u => u.email === body.email)) {
    throw new HttpError(409, 'Email already exists');
  }
  if (store.findOne(u => u.username === body.username)) {
    throw new HttpError(409, 'Username already exists');
  }

  const user: User = {
    id: generateId(),
    email: body.email,
    username: body.username,
    passwordHash: '',
    displayName: body.displayName,
    preferences: body.preferences || {},
    createdAt: now(),
    updatedAt: now(),
  };
  store.create(user);
  return json({ success: true, data: stripPassword(user) }, 201);
});

// GET /users/:id
router.get('/users/:id', (_req, params) => {
  const user = store.get(params.id);
  if (!user) throw new HttpError(404, 'User not found');
  return json({ success: true, data: stripPassword(user) });
});

// PUT /users/:id
router.put('/users/:id', async (req, params) => {
  if (!store.has(params.id)) throw new HttpError(404, 'User not found');

  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'email', type: 'string', pattern: EMAIL_PATTERN },
    { field: 'username', type: 'string', minLength: 3, maxLength: 30 },
    { field: 'displayName', type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  if (body.email) {
    const existing = store.findOne(u => u.email === body.email && u.id !== params.id);
    if (existing) throw new HttpError(409, 'Email already exists');
  }
  if (body.username) {
    const existing = store.findOne(u => u.username === body.username && u.id !== params.id);
    if (existing) throw new HttpError(409, 'Username already exists');
  }

  const updated = store.update(params.id, {
    ...(body.email && { email: body.email }),
    ...(body.username && { username: body.username }),
    ...(body.displayName && { displayName: body.displayName }),
    updatedAt: now(),
  });
  return json({ success: true, data: stripPassword(updated!) });
});

// DELETE /users/:id
router.delete('/users/:id', (_req, params) => {
  if (!store.has(params.id)) throw new HttpError(404, 'User not found');
  store.delete(params.id);
  return json({ success: true, data: { message: 'User deleted' } });
});

// GET /users/:id/profile — full profile with stats
router.get('/users/:id/profile', (_req, params) => {
  const user = store.get(params.id);
  if (!user) throw new HttpError(404, 'User not found');
  const { passwordHash, ...safe } = user;
  const profile = {
    ...safe,
    accountAge: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
    hasPreferences: Object.keys(user.preferences).length > 0,
  };
  return json({ success: true, data: profile });
});

// PATCH /users/:id/preferences
router.patch('/users/:id/preferences', async (req, params) => {
  const user = store.get(params.id);
  if (!user) throw new HttpError(404, 'User not found');

  const body = await parseBody<any>(req);
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Preferences must be an object');
  }

  const updated = store.update(params.id, {
    preferences: { ...user.preferences, ...body },
    updatedAt: now(),
  });
  return json({ success: true, data: stripPassword(updated!) });
});

function stripPassword(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash, ...safe } = user;
  return safe;
}

export function createApp() {
  return (req: Request) => router.handle(req);
}
