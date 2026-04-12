import { describe, it, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { userStore } from "../store";

const BASE = "http://localhost:3002";

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(`${BASE}${path}`, opts);
}

function raw(method: string, path: string, rawBody: string): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

async function json(r: Response) {
  return r.json();
}

async function createUser(name = "Alice", email = "alice@test.com", role = "user") {
  const res = await handleRequest(req("POST", "/users", { name, email, role }));
  return { res, data: await json(res) };
}

describe("Edge — Validation", () => {
  beforeEach(() => userStore.clear());

  it("POST /users — missing name", async () => {
    const res = await handleRequest(req("POST", "/users", { email: "a@b.com", role: "user" }));
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("name");
  });

  it("POST /users — invalid email", async () => {
    const res = await handleRequest(req("POST", "/users", { name: "A", email: "not-email", role: "user" }));
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("email");
  });

  it("POST /users — invalid role", async () => {
    const res = await handleRequest(req("POST", "/users", { name: "A", email: "a@b.com", role: "superadmin" }));
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("role");
  });

  it("POST /users — duplicate email returns 409", async () => {
    await createUser("Alice", "dup@test.com");
    const res = await handleRequest(req("POST", "/users", { name: "Bob", email: "dup@test.com", role: "user" }));
    expect(res.status).toBe(409);
  });

  it("POST /users — empty body", async () => {
    const res = await handleRequest(new Request(`${BASE}/users`, { method: "POST" }));
    expect(res.status).toBe(400);
  });

  it("POST /users — malformed JSON", async () => {
    const res = await handleRequest(raw("POST", "/users", "{bad json"));
    expect(res.status).toBe(400);
  });

  it("PUT /users/:id — empty name string", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("PUT", `/users/${created.data.id}`, { name: "" }));
    expect(res.status).toBe(400);
  });

  it("PUT /users/:id — invalid active type", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("PUT", `/users/${created.data.id}`, { active: "yes" }));
    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("boolean");
  });

  it("PUT /users/:id — invalid email on update", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("PUT", `/users/${created.data.id}`, { email: "bad" }));
    expect(res.status).toBe(400);
  });

  it("PUT /users/:id — invalid role on update", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("PUT", `/users/${created.data.id}`, { role: "king" }));
    expect(res.status).toBe(400);
  });
});

describe("Edge — Delete & Restore", () => {
  beforeEach(() => userStore.clear());

  it("DELETE already deleted user returns 400", async () => {
    const { data: created } = await createUser();
    await handleRequest(req("DELETE", `/users/${created.data.id}`));
    const res = await handleRequest(req("DELETE", `/users/${created.data.id}`));
    expect(res.status).toBe(400);
  });

  it("Restore non-deleted user returns 400", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("POST", `/users/${created.data.id}/restore`));
    expect(res.status).toBe(400);
  });

  it("Restore non-existent user returns 404", async () => {
    const res = await handleRequest(req("POST", "/users/no-id/restore"));
    expect(res.status).toBe(404);
  });
});

describe("Edge — Pagination", () => {
  beforeEach(() => userStore.clear());

  it("page=0 treated as page=1", async () => {
    await createUser();
    const res = await handleRequest(req("GET", "/users?page=0"));
    const data = await json(res);
    expect(data.page).toBe(1);
  });

  it("negative pageSize treated as 1", async () => {
    await createUser();
    const res = await handleRequest(req("GET", "/users?pageSize=-5"));
    const data = await json(res);
    expect(data.pageSize).toBe(1);
    expect(data.data.length).toBe(1);
  });

  it("huge page number returns empty data", async () => {
    await createUser();
    const res = await handleRequest(req("GET", "/users?page=9999"));
    const data = await json(res);
    expect(data.data.length).toBe(0);
    expect(data.total).toBe(1);
  });

  it("non-numeric page defaults to 1", async () => {
    await createUser();
    const res = await handleRequest(req("GET", "/users?page=abc"));
    const data = await json(res);
    expect(data.page).toBe(1);
  });
});

describe("Edge — Activity", () => {
  beforeEach(() => userStore.clear());

  it("POST activity for non-existent user returns 404", async () => {
    const res = await handleRequest(req("POST", "/users/no-id/activity", { action: "login" }));
    expect(res.status).toBe(404);
  });

  it("POST activity with missing action returns 400", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("POST", `/users/${created.data.id}/activity`, {}));
    expect(res.status).toBe(400);
  });

  it("GET activity for non-existent user returns 404", async () => {
    const res = await handleRequest(req("GET", "/users/no-id/activity"));
    expect(res.status).toBe(404);
  });

  it("GET activity for user with no activity returns empty", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("GET", `/users/${created.data.id}/activity`));
    const data = await json(res);
    expect(data.data.length).toBe(0);
  });
});

describe("Edge — Bulk Operations", () => {
  beforeEach(() => userStore.clear());

  it("bulk activate with empty ids array returns 400", async () => {
    const res = await handleRequest(req("POST", "/users/bulk/activate", { ids: [] }));
    expect(res.status).toBe(400);
  });

  it("bulk deactivate with missing ids returns 400", async () => {
    const res = await handleRequest(req("POST", "/users/bulk/deactivate", {}));
    expect(res.status).toBe(400);
  });

  it("bulk activate with non-existent ids returns 0 affected", async () => {
    const res = await handleRequest(req("POST", "/users/bulk/activate", { ids: ["fake1", "fake2"] }));
    const data = await json(res);
    expect(data.data.activated).toBe(0);
  });

  it("bulk skips soft-deleted users", async () => {
    const { data: created } = await createUser();
    await handleRequest(req("DELETE", `/users/${created.data.id}`));
    const res = await handleRequest(req("POST", "/users/bulk/activate", { ids: [created.data.id] }));
    const data = await json(res);
    expect(data.data.activated).toBe(0);
  });
});

describe("Edge — Routing", () => {
  beforeEach(() => userStore.clear());

  it("unknown route returns 404", async () => {
    const res = await handleRequest(req("GET", "/unknown"));
    expect(res.status).toBe(404);
  });

  it("PATCH method not supported returns 404", async () => {
    const res = await handleRequest(req("PATCH", "/users"));
    expect(res.status).toBe(404);
  });

  it("search is case-insensitive", async () => {
    await createUser("Alice", "alice@test.com");
    const res = await handleRequest(req("GET", "/users/search?q=ALICE"));
    const data = await json(res);
    expect(data.data.length).toBe(1);
  });

  it("search excludes deleted users", async () => {
    const { data: created } = await createUser();
    await handleRequest(req("DELETE", `/users/${created.data.id}`));
    const res = await handleRequest(req("GET", "/users/search?q=alice"));
    const data = await json(res);
    expect(data.data.length).toBe(0);
  });

  it("PUT user can update own email to same email", async () => {
    const { data: created } = await createUser();
    const res = await handleRequest(req("PUT", `/users/${created.data.id}`, { email: "alice@test.com" }));
    expect(res.status).toBe(200);
  });
});
