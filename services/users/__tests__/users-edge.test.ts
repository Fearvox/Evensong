import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, patch, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validUser = {
  email: 'edge@example.com',
  username: 'edgeuser',
  displayName: 'Edge User',
};

async function createUser(overrides = {}) {
  const res = await post(app, '/users', { ...validUser, ...overrides });
  return res.data.data;
}

describe('create validation edge cases', () => {
  test('rejects non-string email', async () => {
    const res = await post(app, '/users', { ...validUser, email: 42 });
    expect(res.status).toBe(400);
  });

  test('rejects non-string username', async () => {
    const res = await post(app, '/users', { ...validUser, username: true });
    expect(res.status).toBe(400);
  });

  test('rejects username at max boundary + 1', async () => {
    const res = await post(app, '/users', { ...validUser, username: 'a'.repeat(31) });
    expect(res.status).toBe(400);
  });

  test('accepts username at exact max boundary', async () => {
    const res = await post(app, '/users', { ...validUser, username: 'a'.repeat(30) });
    expect(res.status).toBe(201);
  });

  test('accepts username at exact min boundary', async () => {
    const res = await post(app, '/users', { ...validUser, username: 'abc' });
    expect(res.status).toBe(201);
  });

  test('creates user with timestamps', async () => {
    const user = await createUser();
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });
});

describe('pagination edge cases', () => {
  test('handles page beyond available data', async () => {
    await createUser();
    const res = await get(app, '/users?page=100&limit=10');
    expect(res.status).toBe(200);
    expect(res.data.data).toEqual([]);
    expect(res.data.total).toBe(1);
  });

  test('clamps limit to maximum 100', async () => {
    const res = await get(app, '/users?limit=200');
    expect(res.data.limit).toBe(100);
  });

  test('clamps limit minimum to 1', async () => {
    const res = await get(app, '/users?limit=0');
    expect(res.data.limit).toBe(1);
  });

  test('clamps page minimum to 1', async () => {
    const res = await get(app, '/users?page=0');
    expect(res.data.page).toBe(1);
  });
});

describe('update edge cases', () => {
  test('allows same email if same user', async () => {
    const user = await createUser();
    const res = await put(app, `/users/${user.id}`, { email: validUser.email });
    expect(res.status).toBe(200);
  });

  test('allows same username if same user', async () => {
    const user = await createUser();
    const res = await put(app, `/users/${user.id}`, { username: validUser.username });
    expect(res.status).toBe(200);
  });

  test('preserves other fields when updating one field', async () => {
    const user = await createUser();
    const res = await put(app, `/users/${user.id}`, { displayName: 'New Name' });
    expect(res.data.data.email).toBe(validUser.email);
    expect(res.data.data.username).toBe(validUser.username);
  });
});

describe('profile edge cases', () => {
  test('profile does not expose passwordHash', async () => {
    const user = await createUser();
    const res = await get(app, `/users/${user.id}/profile`);
    expect(res.data.data.passwordHash).toBeUndefined();
  });

  test('accountAge is 0 for newly created user', async () => {
    const user = await createUser();
    const res = await get(app, `/users/${user.id}/profile`);
    expect(res.data.data.accountAge).toBe(0);
  });
});

describe('invalid JSON handling', () => {
  test('rejects invalid JSON on create', async () => {
    const response = await app(new Request('http://test/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    }));
    expect(response.status).toBe(400);
  });
});
