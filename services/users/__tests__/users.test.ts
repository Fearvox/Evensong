import { describe, it, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { userStore } from "../store";

const BASE = "http://localhost:3002";

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(`${BASE}${path}`, opts);
}

async function json(r: Response) {
  return r.json();
}

async function createUser(name = "Alice", email = "alice@test.com", role = "user") {
  const res = await handleRequest(req("POST", "/users", { name, email, role }));
  return { res, data: await json(res) };
}

describe("Users Service — CRUD", () => {
  beforeEach(() => userStore.clear());

  it("POST /users — creates a user", async () => {
    const { res, data } = await createUser();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe("Alice");
    expect(data.data.email).toBe("alice@test.com");
    expect(data.data.role).toBe("user");
    expect(data.data.active).toBe(true);
    expect(data.data.id).toBeDefined();
  });

  it("GET /users/:id — retrieves a user", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("GET", `/users/${created.data.id}`));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.email).toBe("alice@test.com");
  });

  it("GET /users/:id — 404 for non-existent", async () => {
    const res = await handleRequest(req("GET", "/users/no-such-id"));
    expect(res.status).toBe(404);
  });

  it("PUT /users/:id — updates a user", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("PUT", `/users/${created.data.id}`, { name: "Bob" }));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.name).toBe("Bob");
    expect(data.data.email).toBe("alice@test.com");
  });

  it("PUT /users/:id — updates email with duplicate check", async () => {
    await createUser("Alice", "alice@test.com");
    const { data: bob } = await createUser("Bob", "bob@test.com");
    const res = await handleRequest(req("PUT", `/users/${bob.data.id}`, { email: "alice@test.com" }));
    expect(res.status).toBe(409);
  });

  it("PUT /users/:id — 404 for non-existent", async () => {
    const res = await handleRequest(req("PUT", "/users/no-such-id", { name: "X" }));
    expect(res.status).toBe(404);
  });

  it("DELETE /users/:id — soft deletes", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("DELETE", `/users/${created.data.id}`));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.deletedAt).toBeDefined();
    expect(data.data.active).toBe(false);
  });

  it("DELETE /users/:id — 404 for non-existent", async () => {
    const res = await handleRequest(req("DELETE", "/users/no-such-id"));
    expect(res.status).toBe(404);
  });

  it("POST /users/:id/restore — restores deleted user", async () => {
    const { data: created } = await createUser();
    await handleRequest(req("DELETE", `/users/${created.data.id}`));
    const res = await handleRequest(req("POST", `/users/${created.data.id}/restore`));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.active).toBe(true);
    expect(data.data.deletedAt).toBeUndefined();
  });
});

describe("Users Service — List & Pagination", () => {
  beforeEach(() => userStore.clear());

  it("GET /users — lists users with pagination", async () => {
    for (let i = 0; i < 5; i++) await createUser(`User${i}`, `u${i}@test.com`);
    const res = await handleRequest(req("GET", "/users?page=1&pageSize=2"));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.length).toBe(2);
    expect(data.total).toBe(5);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(2);
  });

  it("GET /users?role=admin — filters by role", async () => {
    await createUser("Admin", "admin@test.com", "admin");
    await createUser("User", "user@test.com", "user");
    const res = await handleRequest(req("GET", "/users?role=admin"));
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.data[0].role).toBe("admin");
  });

  it("GET /users?active=false — filters by active status", async () => {
    const { data: created } = await createUser();
    await handleRequest(req("PUT", `/users/${created.data.id}`, { active: false }));
    const res = await handleRequest(req("GET", "/users?active=false"));
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.data[0].active).toBe(false);
  });

  it("GET /users — excludes soft-deleted users", async () => {
    const { data: created } = await createUser();
    await createUser("Bob", "bob@test.com");
    await handleRequest(req("DELETE", `/users/${created.data.id}`));
    const res = await handleRequest(req("GET", "/users"));
    const data = await json(res);
    expect(data.total).toBe(1);
  });
});

describe("Users Service — Search", () => {
  beforeEach(() => userStore.clear());

  it("GET /users/search?q=ali — searches by name", async () => {
    await createUser("Alice", "alice@test.com");
    await createUser("Bob", "bob@test.com");
    const res = await handleRequest(req("GET", "/users/search?q=ali"));
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.data[0].name).toBe("Alice");
  });

  it("GET /users/search?q=bob@test — searches by email", async () => {
    await createUser("Alice", "alice@test.com");
    await createUser("Bob", "bob@test.com");
    const res = await handleRequest(req("GET", "/users/search?q=bob@test"));
    const data = await json(res);
    expect(data.data.length).toBe(1);
  });

  it("GET /users/search?q= — returns empty for blank query", async () => {
    await createUser();
    const res = await handleRequest(req("GET", "/users/search?q="));
    const data = await json(res);
    expect(data.data.length).toBe(0);
  });
});

describe("Users Service — Activity", () => {
  beforeEach(() => userStore.clear());

  it("POST /users/:id/activity — logs activity", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("POST", `/users/${created.data.id}/activity`, { action: "login" }));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.logged).toBe(true);
  });

  it("GET /users/:id/activity — retrieves activity log", async () => {
    const { data: created } = await createUser();
    await handleRequest(req("POST", `/users/${created.data.id}/activity`, { action: "login" }));
    await handleRequest(req("POST", `/users/${created.data.id}/activity`, { action: "purchase" }));
    const res = await handleRequest(req("GET", `/users/${created.data.id}/activity`));
    const data = await json(res);
    expect(data.data.length).toBe(2);
    expect(data.data[0].action).toBe("login");
    expect(data.data[1].action).toBe("purchase");
  });
});

describe("Users Service — Bulk & Stats", () => {
  beforeEach(() => userStore.clear());

  it("POST /users/bulk/activate — activates multiple users", async () => {
    const { data: u1 } = await createUser("A", "a@test.com");
    const { data: u2 } = await createUser("B", "b@test.com");
    await handleRequest(req("PUT", `/users/${u1.data.id}`, { active: false }));
    await handleRequest(req("PUT", `/users/${u2.data.id}`, { active: false }));
    const res = await handleRequest(req("POST", "/users/bulk/activate", { ids: [u1.data.id, u2.data.id] }));
    const data = await json(res);
    expect(data.data.activated).toBe(2);
  });

  it("POST /users/bulk/deactivate — deactivates multiple users", async () => {
    const { data: u1 } = await createUser("A", "a@test.com");
    const { data: u2 } = await createUser("B", "b@test.com");
    const res = await handleRequest(req("POST", "/users/bulk/deactivate", { ids: [u1.data.id, u2.data.id] }));
    const data = await json(res);
    expect(data.data.deactivated).toBe(2);
  });

  it("GET /users/stats — returns user statistics", async () => {
    await createUser("Admin", "admin@test.com", "admin");
    await createUser("User1", "u1@test.com", "user");
    await createUser("User2", "u2@test.com", "user");
    const res = await handleRequest(req("GET", "/users/stats"));
    const data = await json(res);
    expect(data.data.total).toBe(3);
    expect(data.data.active).toBe(3);
    expect(data.data.byRole.admin).toBe(1);
    expect(data.data.byRole.user).toBe(2);
  });

  it("GET /users/health — returns health status", async () => {
    const res = await handleRequest(req("GET", "/users/health"));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.status).toBe("ok");
  });
});
