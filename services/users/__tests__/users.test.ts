import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore, getStore } from '../app';
import { post, get, put, patch, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validUser = {
  email: 'john@example.com',
  username: 'johndoe',
  displayName: 'John Doe',
};

async function createUser(overrides = {}) {
  const res = await post(app, '/users', { ...validUser, ...overrides });
  return res.data.data;
}

describe('POST /users', () => {
  test('creates a user', async () => {
    const res = await post(app, '/users', validUser);
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.email).toBe('john@example.com');
    expect(res.data.data.username).toBe('johndoe');
    expect(res.data.data.id).toBeDefined();
    expect(res.data.data.passwordHash).toBeUndefined();
  });

  test('rejects duplicate email', async () => {
    await post(app, '/users', validUser);
    const res = await post(app, '/users', { ...validUser, username: 'other' });
    expect(res.status).toBe(409);
  });

  test('rejects duplicate username', async () => {
    await post(app, '/users', validUser);
    const res = await post(app, '/users', { ...validUser, email: 'other@example.com' });
    expect(res.status).toBe(409);
  });

  test('validates required fields', async () => {
    const res = await post(app, '/users', {});
    expect(res.status).toBe(400);
    expect(res.data.errors.length).toBeGreaterThanOrEqual(3);
  });

  test('validates email format', async () => {
    const res = await post(app, '/users', { ...validUser, email: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('validates username length', async () => {
    const res = await post(app, '/users', { ...validUser, username: 'ab' });
    expect(res.status).toBe(400);
  });

  test('creates user with empty preferences by default', async () => {
    const res = await post(app, '/users', validUser);
    expect(res.data.data.preferences).toEqual({});
  });

  test('creates user with provided preferences', async () => {
    const res = await post(app, '/users', { ...validUser, preferences: { theme: 'dark' } });
    expect(res.data.data.preferences).toEqual({ theme: 'dark' });
  });
});

describe('GET /users', () => {
  test('lists all users', async () => {
    await createUser();
    await createUser({ email: 'jane@example.com', username: 'janedoe' });
    const res = await get(app, '/users');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
    expect(res.data.total).toBe(2);
  });

  test('returns empty list when no users', async () => {
    const res = await get(app, '/users');
    expect(res.status).toBe(200);
    expect(res.data.data).toEqual([]);
    expect(res.data.total).toBe(0);
  });

  test('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await createUser({ email: `user${i}@example.com`, username: `user${i}` });
    }
    const res = await get(app, '/users?page=2&limit=2');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
    expect(res.data.total).toBe(5);
    expect(res.data.page).toBe(2);
  });

  test('does not expose passwordHash', async () => {
    await createUser();
    const res = await get(app, '/users');
    expect(res.data.data[0].passwordHash).toBeUndefined();
  });
});

describe('GET /users/:id', () => {
  test('gets a user by id', async () => {
    const user = await createUser();
    const res = await get(app, `/users/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.email).toBe('john@example.com');
  });

  test('returns 404 for missing user', async () => {
    const res = await get(app, '/users/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PUT /users/:id', () => {
  test('updates user fields', async () => {
    const user = await createUser();
    const res = await put(app, `/users/${user.id}`, { displayName: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.data.data.displayName).toBe('Updated Name');
  });

  test('updates email', async () => {
    const user = await createUser();
    const res = await put(app, `/users/${user.id}`, { email: 'newemail@example.com' });
    expect(res.status).toBe(200);
    expect(res.data.data.email).toBe('newemail@example.com');
  });

  test('rejects duplicate email on update', async () => {
    const user1 = await createUser();
    await createUser({ email: 'taken@example.com', username: 'taken' });
    const res = await put(app, `/users/${user1.id}`, { email: 'taken@example.com' });
    expect(res.status).toBe(409);
  });

  test('rejects duplicate username on update', async () => {
    const user1 = await createUser();
    await createUser({ email: 'taken@example.com', username: 'taken' });
    const res = await put(app, `/users/${user1.id}`, { username: 'taken' });
    expect(res.status).toBe(409);
  });

  test('returns 404 for missing user', async () => {
    const res = await put(app, '/users/nonexistent', { displayName: 'Test' });
    expect(res.status).toBe(404);
  });

  test('validates email format on update', async () => {
    const user = await createUser();
    const res = await put(app, `/users/${user.id}`, { email: 'bad-email' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /users/:id', () => {
  test('deletes a user', async () => {
    const user = await createUser();
    const res = await del(app, `/users/${user.id}`);
    expect(res.status).toBe(200);
    const check = await get(app, `/users/${user.id}`);
    expect(check.status).toBe(404);
  });

  test('returns 404 for missing user', async () => {
    const res = await del(app, '/users/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /users/:id/profile', () => {
  test('gets user profile with account age', async () => {
    const user = await createUser();
    const res = await get(app, `/users/${user.id}/profile`);
    expect(res.status).toBe(200);
    expect(res.data.data.accountAge).toBeDefined();
    expect(typeof res.data.data.accountAge).toBe('number');
    expect(res.data.data.hasPreferences).toBe(false);
  });

  test('hasPreferences is true when preferences exist', async () => {
    const user = await createUser({ preferences: { theme: 'dark' } });
    const res = await get(app, `/users/${user.id}/profile`);
    expect(res.data.data.hasPreferences).toBe(true);
  });

  test('returns 404 for missing user', async () => {
    const res = await get(app, '/users/nonexistent/profile');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /users/:id/preferences', () => {
  test('updates user preferences', async () => {
    const user = await createUser();
    const res = await patch(app, `/users/${user.id}/preferences`, { theme: 'dark', lang: 'en' });
    expect(res.status).toBe(200);
    expect(res.data.data.preferences.theme).toBe('dark');
    expect(res.data.data.preferences.lang).toBe('en');
  });

  test('merges with existing preferences', async () => {
    const user = await createUser({ preferences: { theme: 'light' } });
    const res = await patch(app, `/users/${user.id}/preferences`, { lang: 'fr' });
    expect(res.data.data.preferences.theme).toBe('light');
    expect(res.data.data.preferences.lang).toBe('fr');
  });

  test('returns 404 for missing user', async () => {
    const res = await patch(app, '/users/nonexistent/preferences', { theme: 'dark' });
    expect(res.status).toBe(404);
  });

  test('rejects non-object body', async () => {
    const user = await createUser();
    const res = await patch(app, `/users/${user.id}/preferences`, [1, 2, 3]);
    expect(res.status).toBe(400);
  });
});

describe('routing', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await get(app, '/unknown');
    expect(res.status).toBe(404);
  });
});
