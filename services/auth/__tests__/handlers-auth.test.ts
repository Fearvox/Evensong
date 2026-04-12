import { describe, test, expect, beforeEach } from "bun:test";
import { router, register, login } from "../handlers";
import { resetStores, authStore } from "../store";

// --- Helpers ---

function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Request {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(`http://localhost:3001${path}`, opts);
}

async function json(r: Response): Promise<any> {
  return r.json();
}

async function registerUser(
  email = "test@example.com",
  name = "Test User",
  password = "password123",
) {
  return router(req("POST", "/auth/register", { email, name, password }));
}

async function loginUser(email = "test@example.com", password = "password123") {
  return router(req("POST", "/auth/login", { email, password }));
}

async function getToken(
  email = "test@example.com",
  name = "Test User",
  password = "password123",
): Promise<string> {
  await registerUser(email, name, password);
  const res = await loginUser(email, password);
  const body = await json(res);
  return body.data.token as string;
}

// --- Tests ---

describe("Auth Handlers — Registration, Login, Session, Logout", () => {
  beforeEach(() => resetStores());

  // =========================================================================
  // POST /auth/register
  // =========================================================================

  describe("POST /auth/register", () => {
    test("registers a new user and returns 201 with user + token", async () => {
      const res = await registerUser();
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe("test@example.com");
      expect(body.data.user.name).toBe("Test User");
      expect(body.data.user.role).toBe("user");
      expect(body.data.token).toBeTruthy();
      // Password must never leak
      expect(body.data.user.passwordHash).toBeUndefined();
    });

    test("rejects duplicate email with 409", async () => {
      await registerUser();
      const res = await registerUser();
      expect(res.status).toBe(409);
      const body = await json(res);
      expect(body.error).toContain("already registered");
    });

    test("rejects invalid email format with 400", async () => {
      const res = await registerUser("not-an-email", "Name", "password123");
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("email");
    });

    test("rejects missing fields with 400", async () => {
      const res = await router(req("POST", "/auth/register", {}));
      expect(res.status).toBe(400);
    });

    test("rejects short password (< 8 chars)", async () => {
      const res = await registerUser("a@b.com", "Name", "short");
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("8 characters");
    });

    test("rejects empty body", async () => {
      const r = new Request("http://localhost:3001/auth/register", { method: "POST" });
      const res = await router(r);
      expect(res.status).toBe(400);
    });

    test("normalizes email to lowercase", async () => {
      const res = await registerUser("TEST@Example.COM", "Test", "password123");
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.data.user.email).toBe("test@example.com");
    });

    test("trims whitespace from email and name", async () => {
      const res = await registerUser("  spaced@test.com  ", "  Spaced Name  ", "password123");
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.data.user.email).toBe("spaced@test.com");
      expect(body.data.user.name).toBe("Spaced Name");
    });

    test("case-insensitive duplicate detection", async () => {
      await registerUser("UPPER@test.com", "Upper", "password123");
      const res = await registerUser("upper@test.com", "Lower", "password123");
      expect(res.status).toBe(409);
    });

    test("works via /users/register path", async () => {
      const res = await router(
        req("POST", "/users/register", {
          email: "alt@path.com",
          name: "Alt Path",
          password: "password123",
        }),
      );
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.data.user.email).toBe("alt@path.com");
    });

    test("standalone register function works directly", async () => {
      const r = req("POST", "/users/register", {
        email: "standalone@test.com",
        name: "Standalone",
        password: "password123",
      });
      const res = await register(r);
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.data.user.email).toBe("standalone@test.com");
    });

    test("rejects malformed JSON body", async () => {
      const r = new Request("http://localhost:3001/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid json",
      });
      const res = await router(r);
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /auth/login
  // =========================================================================

  describe("POST /auth/login", () => {
    test("logs in with valid credentials and returns token + user", async () => {
      await registerUser();
      const res = await loginUser();
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
      expect(body.data.token).toBeTruthy();
      expect(body.data.user.email).toBe("test@example.com");
      expect(body.data.user.passwordHash).toBeUndefined();
    });

    test("rejects wrong password with 401", async () => {
      await registerUser();
      const res = await loginUser("test@example.com", "wrongpassword");
      expect(res.status).toBe(401);
      const body = await json(res);
      expect(body.error).toContain("Invalid credentials");
    });

    test("rejects non-existent email with 401", async () => {
      const res = await loginUser("nobody@example.com", "password123");
      expect(res.status).toBe(401);
    });

    test("rejects missing credentials with 400", async () => {
      const res = await router(req("POST", "/auth/login", {}));
      expect(res.status).toBe(400);
    });

    test("locks account after 5 failed attempts", async () => {
      await registerUser();
      for (let i = 0; i < 5; i++) {
        await loginUser("test@example.com", "wrong");
      }
      // Even correct password should fail while locked
      const res = await loginUser("test@example.com", "password123");
      // Locked returns 423 from our handler
      expect([401, 423]).toContain(res.status);
      const body = await json(res);
      expect(body.error).toContain("locked");
    });

    test("standalone login function works directly", async () => {
      await registerUser();
      const r = req("POST", "/auth/login", {
        email: "test@example.com",
        password: "password123",
      });
      const res = await login(r);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.token).toBeTruthy();
    });

    test("rejects login for deactivated account", async () => {
      const regRes = await registerUser("deact@test.com", "Deact", "password123");
      const regBody = await json(regRes);
      const userId = regBody.data.user.id;

      // Deactivate via store directly
      authStore.users.update(userId, { active: false });

      const res = await loginUser("deact@test.com", "password123");
      expect(res.status).toBe(401);
      const body = await json(res);
      expect(body.error).toContain("deactivated");
    });
  });

  // =========================================================================
  // GET /auth/session
  // =========================================================================

  describe("GET /auth/session", () => {
    test("returns user for valid session", async () => {
      const token = await getToken();
      const res = await router(
        req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token}` }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.user.email).toBe("test@example.com");
      expect(body.data.user.passwordHash).toBeUndefined();
    });

    test("rejects missing token with 401", async () => {
      const res = await router(req("GET", "/auth/session"));
      expect(res.status).toBe(401);
    });

    test("rejects invalid token with 401", async () => {
      const res = await router(
        req("GET", "/auth/session", undefined, { Authorization: "Bearer invalid_tok" }),
      );
      expect(res.status).toBe(401);
    });

    test("rejects non-Bearer auth scheme", async () => {
      const res = await router(
        req("GET", "/auth/session", undefined, { Authorization: "Basic abc123" }),
      );
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /auth/logout
  // =========================================================================

  describe("POST /auth/logout", () => {
    test("invalidates session on logout", async () => {
      const token = await getToken();
      const logoutRes = await router(
        req("POST", "/auth/logout", undefined, { Authorization: `Bearer ${token}` }),
      );
      expect(logoutRes.status).toBe(200);

      // Token should no longer work
      const sessionRes = await router(
        req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token}` }),
      );
      expect(sessionRes.status).toBe(401);
    });

    test("rejects logout without token", async () => {
      const res = await router(req("POST", "/auth/logout"));
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /auth/refresh
  // =========================================================================

  describe("POST /auth/refresh", () => {
    test("returns a new token on refresh", async () => {
      const token = await getToken();
      const res = await router(
        req("POST", "/auth/refresh", undefined, { Authorization: `Bearer ${token}` }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.token).toBeTruthy();
      expect(body.data.token).not.toBe(token);
      expect(body.data.expiresAt).toBeDefined();
    });
  });

  // =========================================================================
  // Multiple sessions
  // =========================================================================

  describe("concurrent sessions", () => {
    test("supports multiple sessions for the same user", async () => {
      await registerUser("multi@test.com", "Multi", "password123");
      const login1 = await loginUser("multi@test.com", "password123");
      const login2 = await loginUser("multi@test.com", "password123");
      const t1 = (await json(login1)).data.token;
      const t2 = (await json(login2)).data.token;

      expect(t1).not.toBe(t2);

      const s1 = await router(
        req("GET", "/auth/session", undefined, { Authorization: `Bearer ${t1}` }),
      );
      const s2 = await router(
        req("GET", "/auth/session", undefined, { Authorization: `Bearer ${t2}` }),
      );
      expect(s1.status).toBe(200);
      expect(s2.status).toBe(200);
    });
  });

  // =========================================================================
  // Routing edge cases
  // =========================================================================

  describe("routing", () => {
    test("returns 404 for unknown routes", async () => {
      const res = await router(req("GET", "/auth/nonexistent"));
      expect(res.status).toBe(404);
    });

    test("returns 404 for non-auth prefix", async () => {
      const res = await router(req("GET", "/users/list"));
      expect(res.status).toBe(404);
    });

    test("returns 404 for wrong HTTP method on known route", async () => {
      const res = await router(req("DELETE", "/auth/login"));
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Health & Stats
  // =========================================================================

  describe("GET /auth/health", () => {
    test("returns health status", async () => {
      const res = await router(req("GET", "/auth/health"));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.status).toBe("ok");
      expect(body.data.service).toBe("auth");
    });
  });

  describe("GET /auth/stats", () => {
    test("returns correct counts after operations", async () => {
      await registerUser("s1@test.com", "S1", "password123");
      await registerUser("s2@test.com", "S2", "password123");
      await loginUser("s1@test.com", "password123");

      const res = await router(req("GET", "/auth/stats"));
      const body = await json(res);
      expect(body.data.users).toBe(2);
      // 2 from register + 1 from login = 3 sessions
      expect(body.data.sessions).toBe(3);
      expect(body.data.activeSessions).toBe(3);
    });
  });
});
