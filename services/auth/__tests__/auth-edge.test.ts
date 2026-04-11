import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStores, getStores } from '../app';
import { post, get, del, request } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStores());

const validUser = {
  email: 'edge@example.com',
  username: 'edgeuser',
  password: 'password123',
  displayName: 'Edge User',
};

describe('register validation edge cases', () => {
  test('rejects non-string email', async () => {
    const res = await post(app, '/auth/register', { ...validUser, email: 123 });
    expect(res.status).toBe(400);
  });

  test('rejects non-string password', async () => {
    const res = await post(app, '/auth/register', { ...validUser, password: 12345678 });
    expect(res.status).toBe(400);
  });

  test('rejects username with max length exceeded', async () => {
    const res = await post(app, '/auth/register', { ...validUser, username: 'a'.repeat(31) });
    expect(res.status).toBe(400);
  });

  test('accepts username at exact max length', async () => {
    const res = await post(app, '/auth/register', { ...validUser, username: 'a'.repeat(30) });
    expect(res.status).toBe(201);
  });

  test('accepts password at exact min length', async () => {
    const res = await post(app, '/auth/register', { ...validUser, password: '12345678' });
    expect(res.status).toBe(201);
  });

  test('rejects email without domain', async () => {
    const res = await post(app, '/auth/register', { ...validUser, email: 'user@' });
    expect(res.status).toBe(400);
  });

  test('rejects email with spaces', async () => {
    const res = await post(app, '/auth/register', { ...validUser, email: 'user @example.com' });
    expect(res.status).toBe(400);
  });
});

describe('login edge cases', () => {
  test('login creates unique tokens per session', async () => {
    await post(app, '/auth/register', validUser);
    const l1 = await post(app, '/auth/login', { email: validUser.email, password: validUser.password });
    const l2 = await post(app, '/auth/login', { email: validUser.email, password: validUser.password });
    expect(l1.data.data.token).not.toBe(l2.data.data.token);
  });

  test('rejects login with empty password', async () => {
    const res = await post(app, '/auth/login', { email: 'test@example.com', password: '' });
    expect(res.status).toBe(400);
  });

  test('rejects login with empty email', async () => {
    const res = await post(app, '/auth/login', { email: '', password: 'password' });
    expect(res.status).toBe(400);
  });
});

describe('session management edge cases', () => {
  test('multiple registrations create separate sessions', async () => {
    await post(app, '/auth/register', validUser);
    await post(app, '/auth/register', {
      email: 'other@example.com',
      username: 'otheruser',
      password: 'password123',
      displayName: 'Other',
    });
    const sessions = await get(app, '/auth/sessions');
    expect(sessions.data.data.length).toBe(2);
  });

  test('deleting session makes verify fail for that token', async () => {
    const reg = await post(app, '/auth/register', validUser);
    const token = reg.data.data.token;
    const sessions = await get(app, '/auth/sessions');
    await del(app, `/auth/sessions/${sessions.data.data[0].id}`);
    const verify = await post(app, '/auth/verify', { token });
    expect(verify.data.data.valid).toBe(false);
  });
});

describe('verify edge cases', () => {
  test('verify with empty string token', async () => {
    const res = await post(app, '/auth/verify', { token: '' });
    expect(res.status).toBe(400);
  });

  test('verify returns user data on success', async () => {
    const reg = await post(app, '/auth/register', validUser);
    const res = await post(app, '/auth/verify', { token: reg.data.data.token });
    expect(res.data.data.user.email).toBe(validUser.email);
    expect(res.data.data.user.displayName).toBe(validUser.displayName);
  });
});

describe('change-password edge cases', () => {
  test('rejects missing currentPassword field', async () => {
    const reg = await post(app, '/auth/register', validUser);
    const res = await post(app, '/auth/change-password', {
      newPassword: 'newpassword123',
    }, { Authorization: `Bearer ${reg.data.data.token}` });
    expect(res.status).toBe(400);
  });

  test('rejects missing newPassword field', async () => {
    const reg = await post(app, '/auth/register', validUser);
    const res = await post(app, '/auth/change-password', {
      currentPassword: 'password123',
    }, { Authorization: `Bearer ${reg.data.data.token}` });
    expect(res.status).toBe(400);
  });
});

describe('invalid JSON handling', () => {
  test('rejects invalid JSON body on register', async () => {
    const response = await app(new Request('http://test/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json',
    }));
    expect(response.status).toBe(400);
  });

  test('rejects invalid JSON body on login', async () => {
    const response = await app(new Request('http://test/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    }));
    expect(response.status).toBe(400);
  });
});
