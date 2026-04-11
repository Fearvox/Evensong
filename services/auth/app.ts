import { Router, json, parseBody, HttpError, generateId, now } from '../../shared/router';
import { Store } from '../../shared/store';
import { validate, EMAIL_PATTERN } from '../../shared/validation';
import type { User, AuthSession } from '../../shared/types';

const users = new Store<User>();
const sessions = new Store<AuthSession>();

export function getStores() {
  return { users, sessions };
}

export function resetStores() {
  users.clear();
  sessions.clear();
}

function hashPassword(password: string): string {
  // Simple hash for demo — not production crypto
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) - hash + password.charCodeAt(i)) | 0;
  }
  return `hashed_${Math.abs(hash).toString(36)}`;
}

function generateToken(): string {
  return `tok_${crypto.randomUUID().replace(/-/g, '')}`;
}

const router = new Router();

// POST /auth/register
router.post('/auth/register', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'email', required: true, type: 'string', pattern: EMAIL_PATTERN },
    { field: 'username', required: true, type: 'string', minLength: 3, maxLength: 30 },
    { field: 'password', required: true, type: 'string', minLength: 8 },
    { field: 'displayName', required: true, type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const existing = users.findOne(u => u.email === body.email);
  if (existing) throw new HttpError(409, 'Email already registered');

  const existingUsername = users.findOne(u => u.username === body.username);
  if (existingUsername) throw new HttpError(409, 'Username already taken');

  const user: User = {
    id: generateId(),
    email: body.email,
    username: body.username,
    passwordHash: hashPassword(body.password),
    displayName: body.displayName,
    preferences: {},
    createdAt: now(),
    updatedAt: now(),
  };
  users.create(user);

  const session = createSession(user.id);
  const { passwordHash, ...safeUser } = user;
  return json({ success: true, data: { user: safeUser, token: session.token } }, 201);
});

// POST /auth/login
router.post('/auth/login', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'email', required: true, type: 'string' },
    { field: 'password', required: true, type: 'string' },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const user = users.findOne(u => u.email === body.email);
  if (!user) throw new HttpError(401, 'Invalid credentials');

  if (user.passwordHash !== hashPassword(body.password)) {
    throw new HttpError(401, 'Invalid credentials');
  }

  const session = createSession(user.id);
  const { passwordHash, ...safeUser } = user;
  return json({ success: true, data: { user: safeUser, token: session.token } });
});

// POST /auth/logout
router.post('/auth/logout', async (req) => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) throw new HttpError(401, 'No token provided');

  const session = sessions.findOne(s => s.token === token);
  if (!session) throw new HttpError(401, 'Invalid token');

  sessions.delete(session.id);
  return json({ success: true, data: { message: 'Logged out' } });
});

// GET /auth/sessions
router.get('/auth/sessions', (_req) => {
  const all = sessions.getAll().map(({ token, ...rest }) => rest);
  return json({ success: true, data: all });
});

// GET /auth/sessions/:id
router.get('/auth/sessions/:id', (_req, params) => {
  const session = sessions.get(params.id);
  if (!session) throw new HttpError(404, 'Session not found');
  const { token, ...safe } = session;
  return json({ success: true, data: safe });
});

// DELETE /auth/sessions/:id
router.delete('/auth/sessions/:id', (_req, params) => {
  if (!sessions.has(params.id)) throw new HttpError(404, 'Session not found');
  sessions.delete(params.id);
  return json({ success: true, data: { message: 'Session deleted' } });
});

// POST /auth/verify — verify a token
router.post('/auth/verify', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'token', required: true, type: 'string' },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const session = sessions.findOne(s => s.token === body.token);
  if (!session) return json({ success: true, data: { valid: false } });

  if (new Date(session.expiresAt) < new Date()) {
    sessions.delete(session.id);
    return json({ success: true, data: { valid: false, reason: 'expired' } });
  }

  const user = users.get(session.userId);
  if (!user) return json({ success: true, data: { valid: false, reason: 'user_not_found' } });

  const { passwordHash, ...safeUser } = user;
  return json({ success: true, data: { valid: true, user: safeUser } });
});

// POST /auth/change-password
router.post('/auth/change-password', async (req) => {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) throw new HttpError(401, 'No token provided');

  const session = sessions.findOne(s => s.token === token);
  if (!session) throw new HttpError(401, 'Invalid token');

  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'currentPassword', required: true, type: 'string' },
    { field: 'newPassword', required: true, type: 'string', minLength: 8 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const user = users.get(session.userId);
  if (!user) throw new HttpError(404, 'User not found');

  if (user.passwordHash !== hashPassword(body.currentPassword)) {
    throw new HttpError(401, 'Current password is incorrect');
  }

  users.update(user.id, {
    passwordHash: hashPassword(body.newPassword),
    updatedAt: now(),
  });

  // Invalidate all other sessions for this user
  const userSessions = sessions.find(s => s.userId === user.id && s.id !== session.id);
  userSessions.forEach(s => sessions.delete(s.id));

  return json({ success: true, data: { message: 'Password changed' } });
});

function createSession(userId: string): AuthSession {
  const session: AuthSession = {
    id: generateId(),
    userId,
    token: generateToken(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now(),
  };
  sessions.create(session);
  return session;
}

export function createApp() {
  return (req: Request) => router.handle(req);
}
