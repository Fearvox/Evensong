/**
 * Users service — CRUD + validation handler tests
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { userStore } from "../store";

// --- Helpers ---

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  const h: Record<string, string> = { "Content-Type": "application/json", ...headers };
  const init: RequestInit = { method, headers: h };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await handleRequest(new Request(`http://localhost:3002${path}`, init));
  return { status: res.status, json: (await res.json()) as any };
}

function adminHeaders(): Record<string, string> {
  return { "x-role": "admin" };
}

async function createUser(
  overrides: Partial<{ email: string; name: string; role: string }> = {},
) {
  const data = {
    email: overrides.email ?? `user-${Date.now()}@test.com`,
    name: overrides.name ?? "Test User",
    role: overrides.role ?? "user",
  };
  const res = await req("POST", "/users", data, adminHeaders());
  return res;
}

// --- Tests ---

describe("POST /users — create user", () => {
  beforeEach(() => userStore.clear());

  test("creates a user with valid data and admin role", async () => {
    const { status, json } = await createUser({
      email: "alice@example.com",
      name: "Alice",
      role: "admin",
    });
    expect(status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.email).toBe("alice@example.com");
    expect(json.data.name).toBe("Alice");
    expect(json.data.role).toBe("admin");
    expect(json.data.active).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.createdAt).toBeDefined();
  });

  test("returns 400 when body is missing", async () => {
    const res = await handleRequest(
      new Request("http://localhost:3002/users", {
        method: "POST",
        headers: { "x-role": "admin" },
      }),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 when name is empty", async () => {
    const { status, json } = await req(
      "POST",
      "/users",
      { email: "a@b.com", name: "", role: "user" },
      adminHeaders(),
    );
    expect(status).toBe(400);
    expect(json.error).toContain("name");
  });

  test("returns 400 when email is invalid", async () => {
    const { status, json } = await req(
      "POST",
      "/users",
      { email: "not-an-email", name: "X", role: "user" },
      adminHeaders(),
    );
    expect(status).toBe(400);
    expect(json.error).toContain("email");
  });

  test("returns 400 when role is invalid", async () => {
    const { status, json } = await req(
      "POST",
      "/users",
      { email: "x@y.com", name: "X", role: "superuser" },
      adminHeaders(),
    );
    expect(status).toBe(400);
    expect(json.error).toContain("role");
  });

  test("returns 409 for duplicate email", async () => {
    await createUser({ email: "dup@test.com" });
    const { status, json } = await createUser({ email: "dup@test.com" });
    expect(status).toBe(409);
    expect(json.error).toContain("Email already exists");
  });

  test("duplicate email check is case-insensitive", async () => {
    await createUser({ email: "Case@Test.com" });
    const { status } = await createUser({ email: "case@test.com" });
    expect(status).toBe(409);
  });

  test("creates users with all valid roles", async () => {
    for (const role of ["admin", "user", "moderator"]) {
      const { status, json } = await createUser({
        email: `${role}@test.com`,
        role,
      });
      expect(status).toBe(201);
      expect(json.data.role).toBe(role);
    }
  });
});

describe("GET /users/:id — get user by id", () => {
  beforeEach(() => userStore.clear());

  test("returns user by id", async () => {
    const created = await createUser({ name: "Bob", email: "bob@test.com" });
    const id = created.json.data.id;
    const { status, json } = await req("GET", `/users/${id}`);
    expect(status).toBe(200);
    expect(json.data.name).toBe("Bob");
    expect(json.data.email).toBe("bob@test.com");
  });

  test("returns 404 for non-existent id", async () => {
    const { status, json } = await req("GET", "/users/nonexistent-id");
    expect(status).toBe(404);
    expect(json.success).toBe(false);
  });
});

describe("PUT /users/:id — update user", () => {
  beforeEach(() => userStore.clear());

  test("updates user name", async () => {
    const { json: created } = await createUser({ name: "Original" });
    const id = created.data.id;
    const { status, json } = await req("PUT", `/users/${id}`, { name: "Updated" });
    expect(status).toBe(200);
    expect(json.data.name).toBe("Updated");
  });

  test("updates user role", async () => {
    const { json: created } = await createUser({ role: "user" });
    const id = created.data.id;
    const { status, json } = await req("PUT", `/users/${id}`, { role: "moderator" });
    expect(status).toBe(200);
    expect(json.data.role).toBe("moderator");
  });

  test("updates user active status", async () => {
    const { json: created } = await createUser();
    const id = created.data.id;
    const { status, json } = await req("PUT", `/users/${id}`, { active: false });
    expect(status).toBe(200);
    expect(json.data.active).toBe(false);
  });

  test("returns 404 for non-existent user", async () => {
    const { status } = await req("PUT", "/users/no-such-id", { name: "X" });
    expect(status).toBe(404);
  });

  test("returns 400 for empty name", async () => {
    const { json: created } = await createUser();
    const { status, json } = await req("PUT", `/users/${created.data.id}`, { name: "" });
    expect(status).toBe(400);
    expect(json.error).toContain("name");
  });

  test("returns 400 for invalid role", async () => {
    const { json: created } = await createUser();
    const { status } = await req("PUT", `/users/${created.data.id}`, { role: "king" });
    expect(status).toBe(400);
  });

  test("returns 400 for non-boolean active", async () => {
    const { json: created } = await createUser();
    const { status } = await req("PUT", `/users/${created.data.id}`, { active: "yes" });
    expect(status).toBe(400);
  });

  test("returns 400 when body is missing", async () => {
    const { json: created } = await createUser();
    const res = await handleRequest(
      new Request(`http://localhost:3002/users/${created.data.id}`, {
        method: "PUT",
      }),
    );
    expect(res.status).toBe(400);
  });

  test("preserves unchanged fields", async () => {
    const { json: created } = await createUser({
      name: "Keep",
      email: "keep@test.com",
      role: "user",
    });
    const id = created.data.id;
    const { json } = await req("PUT", `/users/${id}`, { role: "admin" });
    expect(json.data.name).toBe("Keep");
    expect(json.data.email).toBe("keep@test.com");
    expect(json.data.role).toBe("admin");
  });
});

describe("DELETE /users/:id — soft delete", () => {
  beforeEach(() => userStore.clear());

  test("soft deletes a user (sets active=false)", async () => {
    const { json: created } = await createUser();
    const id = created.data.id;
    const { status, json } = await req("DELETE", `/users/${id}`);
    expect(status).toBe(200);
    expect(json.data.active).toBe(false);

    // Verify user still exists in store
    const { json: fetched } = await req("GET", `/users/${id}`);
    expect(fetched.data.active).toBe(false);
  });

  test("returns 404 for non-existent user", async () => {
    const { status } = await req("DELETE", "/users/ghost");
    expect(status).toBe(404);
  });
});

describe("POST /users/:id/restore — restore soft-deleted user", () => {
  beforeEach(() => userStore.clear());

  test("restores a soft-deleted user", async () => {
    const { json: created } = await createUser();
    const id = created.data.id;
    await req("DELETE", `/users/${id}`);
    const { status, json } = await req("POST", `/users/${id}/restore`);
    expect(status).toBe(200);
    expect(json.data.active).toBe(true);
  });

  test("returns 404 for non-existent user", async () => {
    const { status } = await req("POST", "/users/ghost/restore");
    expect(status).toBe(404);
  });
});

describe("routing — unknown routes", () => {
  test("returns 404 for unknown path", async () => {
    const { status } = await req("GET", "/unknown");
    expect(status).toBe(404);
  });

  test("returns 404 for PATCH method", async () => {
    const { status } = await req("PATCH", "/users/some-id");
    expect(status).toBe(404);
  });
});
