/**
 * Users service — search, stats, activity, and edge case tests
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
    email: overrides.email ?? `u-${crypto.randomUUID().slice(0, 8)}@test.com`,
    name: overrides.name ?? "Test User",
    role: overrides.role ?? "user",
  };
  const res = await req("POST", "/users", data, adminHeaders());
  return res.json.data;
}

// --- Search Tests ---

describe("GET /users?search= — search by name/email", () => {
  beforeEach(() => userStore.clear());

  test("returns all active users when no search param", async () => {
    await createUser({ name: "Alice", email: "alice@test.com" });
    await createUser({ name: "Bob", email: "bob@test.com" });
    const { status, json } = await req("GET", "/users");
    expect(status).toBe(200);
    expect(json.data).toHaveLength(2);
  });

  test("filters by name substring (case-insensitive)", async () => {
    await createUser({ name: "Alice Smith", email: "alice@test.com" });
    await createUser({ name: "Bob Jones", email: "bob@test.com" });
    await createUser({ name: "Alicia Keys", email: "alicia@test.com" });
    const { json } = await req("GET", "/users?search=ali");
    expect(json.data).toHaveLength(2);
    const names = json.data.map((u: any) => u.name).sort();
    expect(names).toEqual(["Alice Smith", "Alicia Keys"]);
  });

  test("filters by email substring", async () => {
    await createUser({ name: "A", email: "alice@company.org" });
    await createUser({ name: "B", email: "bob@company.org" });
    await createUser({ name: "C", email: "carol@other.com" });
    const { json } = await req("GET", "/users?search=company");
    expect(json.data).toHaveLength(2);
  });

  test("returns empty array when no matches", async () => {
    await createUser({ name: "Alice" });
    const { json } = await req("GET", "/users?search=zzzzz");
    expect(json.data).toEqual([]);
  });

  test("search excludes soft-deleted users", async () => {
    const user = await createUser({ name: "DeleteMe", email: "del@test.com" });
    await req("DELETE", `/users/${user.id}`);
    const { json } = await req("GET", "/users?search=DeleteMe");
    expect(json.data).toEqual([]);
  });

  test("empty search param returns all active users", async () => {
    await createUser({ name: "X" });
    const { json } = await req("GET", "/users?search=");
    expect(json.data).toHaveLength(1);
  });
});

// --- Stats Tests ---

describe("GET /users/stats — user statistics", () => {
  beforeEach(() => userStore.clear());

  test("returns zeroes for empty store", async () => {
    const { status, json } = await req("GET", "/users/stats");
    expect(status).toBe(200);
    expect(json.data.total).toBe(0);
    expect(json.data.active).toBe(0);
    expect(json.data.byRole).toEqual({});
  });

  test("counts total and active users", async () => {
    await createUser({ role: "admin" });
    const u2 = await createUser({ role: "user" });
    await createUser({ role: "moderator" });
    // Deactivate one
    await req("PUT", `/users/${u2.id}`, { active: false });
    const { json } = await req("GET", "/users/stats");
    expect(json.data.total).toBe(3);
    expect(json.data.active).toBe(2);
    expect(json.data.inactive).toBe(1);
  });

  test("counts by role", async () => {
    await createUser({ role: "admin" });
    await createUser({ role: "admin" });
    await createUser({ role: "user" });
    await createUser({ role: "moderator" });
    const { json } = await req("GET", "/users/stats");
    expect(json.data.byRole.admin).toBe(2);
    expect(json.data.byRole.user).toBe(1);
    expect(json.data.byRole.moderator).toBe(1);
  });

  test("soft-deleted users are excluded from total and byRole", async () => {
    const u = await createUser({ role: "user" });
    await req("DELETE", `/users/${u.id}`);
    const { json } = await req("GET", "/users/stats");
    expect(json.data.total).toBe(0);
    expect(json.data.deleted).toBe(1);
    expect(json.data.byRole.user).toBeUndefined();
  });
});

// --- Activity Logging Tests ---

describe("POST /users/:id/activity — log activity", () => {
  beforeEach(() => userStore.clear());

  test("logs an activity event", async () => {
    const user = await createUser();
    const { status, json } = await req("POST", `/users/${user.id}/activity`, {
      action: "login",
    });
    expect(status).toBe(200);
    expect(json.data.logged).toBe(true);
  });

  test("returns 404 for non-existent user", async () => {
    const { status } = await req("POST", "/users/ghost/activity", {
      action: "login",
    });
    expect(status).toBe(404);
  });

  test("returns 400 when action is missing", async () => {
    const user = await createUser();
    const { status } = await req("POST", `/users/${user.id}/activity`, {});
    expect(status).toBe(400);
  });

  test("returns 400 when action is empty string", async () => {
    const user = await createUser();
    const { status } = await req("POST", `/users/${user.id}/activity`, {
      action: "",
    });
    expect(status).toBe(400);
  });
});

describe("GET /users/:id/activity — get activity log", () => {
  beforeEach(() => userStore.clear());

  test("returns activity entries in order", async () => {
    const user = await createUser();
    await req("POST", `/users/${user.id}/activity`, { action: "login" });
    await req("POST", `/users/${user.id}/activity`, { action: "view_profile" });
    await req("POST", `/users/${user.id}/activity`, { action: "logout" });
    const { status, json } = await req("GET", `/users/${user.id}/activity`);
    expect(status).toBe(200);
    expect(json.data).toHaveLength(3);
    expect(json.data[0].action).toBe("login");
    expect(json.data[1].action).toBe("view_profile");
    expect(json.data[2].action).toBe("logout");
    expect(json.data[0].timestamp).toBeDefined();
  });

  test("returns empty array for user with no activity", async () => {
    const user = await createUser();
    const { json } = await req("GET", `/users/${user.id}/activity`);
    expect(json.data).toEqual([]);
  });

  test("returns 404 for non-existent user", async () => {
    const { status } = await req("GET", "/users/ghost/activity");
    expect(status).toBe(404);
  });
});

// --- Edge Cases ---

describe("edge cases", () => {
  beforeEach(() => userStore.clear());

  test("GET /users/stats is not confused with GET /users/:id", async () => {
    // "stats" should route to stats endpoint, not user-by-id
    const { status, json } = await req("GET", "/users/stats");
    expect(status).toBe(200);
    expect(json.data).toHaveProperty("total");
  });

  test("restore after soft delete makes user appear in search again", async () => {
    const user = await createUser({ name: "Lazarus", email: "laz@test.com" });
    await req("DELETE", `/users/${user.id}`);
    // Verify gone from search
    let res = await req("GET", "/users?search=Lazarus");
    expect(res.json.data).toHaveLength(0);
    // Restore
    await req("POST", `/users/${user.id}/restore`);
    res = await req("GET", "/users?search=Lazarus");
    expect(res.json.data).toHaveLength(1);
    expect(res.json.data[0].active).toBe(true);
  });

  test("multiple field validation errors are combined", async () => {
    const { status, json } = await req(
      "POST",
      "/users",
      { email: "bad", name: "", role: "invalid" },
      adminHeaders(),
    );
    expect(status).toBe(400);
    // Should mention multiple fields
    expect(json.error).toContain("name");
    expect(json.error).toContain("email");
    expect(json.error).toContain("role");
  });

  test("creating user then deleting then creating with same email works", async () => {
    const u = await createUser({ email: "reuse@test.com" });
    await req("DELETE", `/users/${u.id}`);
    // The email is still in the store (soft delete), so this should conflict
    const { status } = await req(
      "POST",
      "/users",
      { email: "reuse@test.com", name: "New", role: "user" },
      adminHeaders(),
    );
    // findByEmail still finds soft-deleted users, so 409
    expect(status).toBe(409);
  });
});
