import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStores, getStores } from '../app';
import { post, get, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStores());

const validUser = {
  email: 'test@example.com',
  username: 'testuser',
  password: 'password123',
  displayName: 'Test User',
};

describe('POST /auth/register', () => {
  test('registers a new user', async () => {
    const res = await post(app, '/auth/register', validUser);
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.user.email).toBe('test@example.com');
    expect(res.data.data.user.username).toBe('testuser');
    expect(res.data.data.token).toMatch(/^tok_/);
    expect(res.data.data.user.passwordHash).toBeUndefined();
  });

  test('rejects duplicate email', async () => {
    await post(app, '/auth/register', validUser);
    const res = await post(app, '/auth/register', { ...validUser, username: 'other' });
    expect(res.status).toBe(409);
    expect(res.data.error).toContain('Email already registered');
  });

  test('rejects duplicate username', async () => {
    await post(app, '/auth/register', validUser);
    const res = await post(app, '/auth/register', { ...validUser, email: 'other@example.com' });
    expect(res.status).toBe(409);
    expect(res.data.error).toContain('Username already taken');
  });

  test('validates required fields', async () => {
    const res = await post(app, '/auth/register', {});
    expect(res.status).toBe(400);
    expect(res.data.errors.length).toBeGreaterThanOrEqual(4);
  });

  test('validates email format', async () => {
    const res = await post(app, '/auth/register', { ...validUser, email: 'notanemail' });
    expect(res.status).toBe(400);
    expect(res.data.errors.some((e: string) => e.includes('email'))).toBe(true);
  });

  test('validates username min length', async () => {
    const res = await post(app, '/auth/register', { ...validUser, username: 'ab' });
    expect(res.status).toBe(400);
    expect(res.data.errors.some((e: string) => e.includes('username'))).toBe(true);
  });

  test('validates password min length', async () => {
    const res = await post(app, '/auth/register', { ...validUser, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.data.errors.some((e: string) => e.includes('password'))).toBe(true);
  });

  test('rejects empty body', async () => {
    const response = await app(new Request('http://test/auth/register', { method: 'POST' }));
    expect(response.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await post(app, '/auth/register', validUser);
  });

  test('logs in with valid credentials', async () => {
    const res = await post(app, '/auth/login', { email: 'test@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.token).toMatch(/^tok_/);
    expect(res.data.data.user.email).toBe('test@example.com');
  });

  test('rejects invalid email', async () => {
    const res = await post(app, '/auth/login', { email: 'wrong@example.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.data.error).toContain('Invalid credentials');
  });

  test('rejects invalid password', async () => {
    const res = await post(app, '/auth/login', { email: 'test@example.com', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.data.error).toContain('Invalid credentials');
  });

  test('validates required fields', async () => {
    const res = await post(app, '/auth/login', {});
    expect(res.status).toBe(400);
    expect(res.data.errors).toBeDefined();
  });
});

describe('POST /auth/logout', () => {
  test('logs out with valid token', async () => {
    const reg = await post(app, '/auth/register', validUser);
    const token = reg.data.data.token;
    const res = await post(app, '/auth/logout', {}, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.data.data.message).toBe('Logged out');
  });

  test('rejects missing token', async () => {
    const res = await post(app, '/auth/logout', {});
    expect(res.status).toBe(401);
  });

  test('rejects invalid token', async () => {
    const res = await post(app, '/auth/logout', {}, { Authorization: 'Bearer invalid_token' });
    expect(res.status).toBe(401);
  });

  test('cannot logout twice with same token', async () => {
    const reg = await post(app, '/auth/register', validUser);
    const token = reg.data.data.token;
    await post(app, '/auth/logout', {}, { Authorization: `Bearer ${token}` });
    const res = await post(app, '/auth/logout', {}, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/sessions', () => {
  test('lists all sessions', async () => {
    await post(app, '/auth/register', validUser);
    await post(app, '/auth/login', { email: 'test@example.com', password: 'password123' });
    const res = await get(app, '/auth/sessions');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
    // Token should not be exposed in listing
    expect(res.data.data[0].token).toBeUndefined();
  });
});

describe('GET /auth/sessions/:id', () => {
  test('gets session by id', async () => {
    const reg = await post(app, '/auth/register', validUser);
    const sessions = await get(app, '/auth/sessions');
    const sessionId = sessions.data.data[0].id;
    const res = await get(app, `/auth/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.userId).toBeDefined();
    expect(res.data.data.token).toBeUndefined();
  });

  test('returns 404 for missing session', async () => {
    const res = await get(app, '/auth/sessions/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /auth/sessions/:id', () => {
  test('deletes a session', async () => {
    await post(app, '/auth/register', validUser);
    const sessions = await get(app, '/auth/sessions');
    const sessionId = sessions.data.data[0].id;
    const res = await del(app, `/auth/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    const check = await get(app, `/auth/sessions/${sessionId}`);
    expect(check.status).toBe(404);
  });

  test('returns 404 for missing session', async () => {
    const res = await del(app, '/auth/sessions/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /auth/verify', () => {
  test('verifies a valid token', async () => {
    const reg = await post(app, '/auth/register', validUser);
    const token = reg.data.data.token;
    const res = await post(app, '/auth/verify', { token });
    expect(res.status).toBe(200);
    expect(res.data.data.valid).toBe(true);
    expect(res.data.data.user.email).toBe('test@example.com');
  });

  test('rejects invalid token', async () => {
    const res = await post(app, '/auth/verify', { token: 'invalid_token' });
    expect(res.status).toBe(200);
    expect(res.data.data.valid).toBe(false);
  });

  test('validates required token field', async () => {
    const res = await post(app, '/auth/verify', {});
    expect(res.status).toBe(400);
    expect(res.data.errors).toBeDefined();
  });
});

describe('POST /auth/change-password', () => {
  let token: string;

  beforeEach(async () => {
    const reg = await post(app, '/auth/register', validUser);
    token = reg.data.data.token;
  });

  test('changes password successfully', async () => {
    const res = await post(app, '/auth/change-password', {
      currentPassword: 'password123',
      newPassword: 'newpassword456',
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.data.data.message).toBe('Password changed');

    // Login with new password
    const login = await post(app, '/auth/login', { email: 'test@example.com', password: 'newpassword456' });
    expect(login.status).toBe(200);
  });

  test('rejects wrong current password', async () => {
    const res = await post(app, '/auth/change-password', {
      currentPassword: 'wrongpassword',
      newPassword: 'newpassword456',
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(401);
  });

  test('validates new password length', async () => {
    const res = await post(app, '/auth/change-password', {
      currentPassword: 'password123',
      newPassword: 'short',
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
  });

  test('rejects missing auth token', async () => {
    const res = await post(app, '/auth/change-password', {
      currentPassword: 'password123',
      newPassword: 'newpassword456',
    });
    expect(res.status).toBe(401);
  });

  test('old password no longer works after change', async () => {
    await post(app, '/auth/change-password', {
      currentPassword: 'password123',
      newPassword: 'newpassword456',
    }, { Authorization: `Bearer ${token}` });

    const login = await post(app, '/auth/login', { email: 'test@example.com', password: 'password123' });
    expect(login.status).toBe(401);
  });

  test('invalidates other sessions on password change', async () => {
    // Create a second session
    const login2 = await post(app, '/auth/login', { email: 'test@example.com', password: 'password123' });
    const token2 = login2.data.data.token;

    await post(app, '/auth/change-password', {
      currentPassword: 'password123',
      newPassword: 'newpassword456',
    }, { Authorization: `Bearer ${token}` });

    // Second token should be invalidated
    const verify = await post(app, '/auth/verify', { token: token2 });
    expect(verify.data.data.valid).toBe(false);
  });
});

describe('routing', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await get(app, '/auth/unknown');
    expect(res.status).toBe(404);
  });

  test('returns 404 for wrong method', async () => {
    const res = await get(app, '/auth/register');
    expect(res.status).toBe(404);
  });
});
