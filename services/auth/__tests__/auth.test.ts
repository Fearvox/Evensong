import { describe, it, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { resetStores } from "../store";

function req(method: string, path: string, body?: unknown, headers?: Record<string, string>): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(`http://localhost:3001${path}`, opts);
}

async function json(r: Response) {
  return r.json();
}

async function register(email = "test@example.com", name = "Test User", password = "password123") {
  return handleRequest(req("POST", "/auth/register", { email, name, password }));
}

async function login(email = "test@example.com", password = "password123") {
  return handleRequest(req("POST", "/auth/login", { email, password }));
}

async function getToken(email = "test@example.com", name = "Test User", password = "password123") {
  await register(email, name, password);
  const res = await login(email, password);
  const body = await json(res);
  return body.data.token as string;
}

describe("Auth Service", () => {
  beforeEach(() => resetStores());

  // --- Registration ---

  describe("POST /auth/register", () => {
    it("registers a new user", async () => {
      const res = await register();
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe("test@example.com");
      expect(body.data.user.name).toBe("Test User");
      expect(body.data.token).toMatch(/^tok_/);
      expect(body.data.user.passwordHash).toBeUndefined();
    });

    it("rejects duplicate email", async () => {
      await register();
      const res = await register();
      expect(res.status).toBe(409);
      const body = await json(res);
      expect(body.error).toContain("already registered");
    });

    it("rejects invalid email format", async () => {
      const res = await register("not-an-email", "Name", "password123");
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("email");
    });

    it("rejects missing fields", async () => {
      const res = await handleRequest(req("POST", "/auth/register", {}));
      expect(res.status).toBe(400);
    });

    it("rejects short password", async () => {
      const res = await register("a@b.com", "Name", "short");
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("8 characters");
    });

    it("rejects empty body", async () => {
      const res = await handleRequest(new Request("http://localhost:3001/auth/register", { method: "POST" }));
      expect(res.status).toBe(400);
    });

    it("normalizes email to lowercase", async () => {
      const res = await register("TEST@Example.COM", "Test", "password123");
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.data.user.email).toBe("test@example.com");
    });
  });

  // --- Login ---

  describe("POST /auth/login", () => {
    it("logs in with valid credentials", async () => {
      await register();
      const res = await login();
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
      expect(body.data.token).toMatch(/^tok_/);
      expect(body.data.user.email).toBe("test@example.com");
    });

    it("rejects wrong password", async () => {
      await register();
      const res = await login("test@example.com", "wrongpassword");
      expect(res.status).toBe(401);
      const body = await json(res);
      expect(body.error).toContain("Invalid credentials");
    });

    it("rejects non-existent email", async () => {
      const res = await login("nobody@example.com", "password123");
      expect(res.status).toBe(401);
    });

    it("rejects missing credentials", async () => {
      const res = await handleRequest(req("POST", "/auth/login", {}));
      expect(res.status).toBe(400);
    });

    it("locks account after 5 failed attempts", async () => {
      await register();
      for (let i = 0; i < 5; i++) {
        await login("test@example.com", "wrong");
      }
      const res = await login("test@example.com", "password123");
      expect(res.status).toBe(401);
      const body = await json(res);
      expect(body.error).toContain("locked");
    });
  });

  // --- Session ---

  describe("GET /auth/session", () => {
    it("returns user for valid session", async () => {
      const token = await getToken();
      const res = await handleRequest(req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token}` }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.user.email).toBe("test@example.com");
    });

    it("rejects missing token", async () => {
      const res = await handleRequest(req("GET", "/auth/session"));
      expect(res.status).toBe(401);
    });

    it("rejects invalid token", async () => {
      const res = await handleRequest(req("GET", "/auth/session", undefined, { Authorization: "Bearer invalid_tok" }));
      expect(res.status).toBe(401);
    });
  });

  // --- Logout ---

  describe("POST /auth/logout", () => {
    it("invalidates session on logout", async () => {
      const token = await getToken();
      const logoutRes = await handleRequest(req("POST", "/auth/logout", undefined, { Authorization: `Bearer ${token}` }));
      expect(logoutRes.status).toBe(200);

      const sessionRes = await handleRequest(req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token}` }));
      expect(sessionRes.status).toBe(401);
    });
  });

  // --- Refresh ---

  describe("POST /auth/refresh", () => {
    it("returns a new token on refresh", async () => {
      const token = await getToken();
      const res = await handleRequest(req("POST", "/auth/refresh", undefined, { Authorization: `Bearer ${token}` }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.token).toMatch(/^tok_/);
      expect(body.data.token).not.toBe(token);
      expect(body.data.expiresAt).toBeDefined();
    });
  });

  // --- Password Reset ---

  describe("POST /auth/password-reset", () => {
    it("returns reset token for existing email", async () => {
      await register();
      const res = await handleRequest(req("POST", "/auth/password-reset", { email: "test@example.com" }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.resetToken).toMatch(/^rst_/);
    });

    it("returns success even for non-existent email", async () => {
      const res = await handleRequest(req("POST", "/auth/password-reset", { email: "nobody@example.com" }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.resetToken).toBeUndefined();
    });
  });

  describe("POST /auth/password-reset/confirm", () => {
    it("resets password with valid token", async () => {
      await register();
      const resetRes = await handleRequest(req("POST", "/auth/password-reset", { email: "test@example.com" }));
      const { resetToken } = (await json(resetRes)).data;

      const confirmRes = await handleRequest(req("POST", "/auth/password-reset/confirm", { token: resetToken, newPassword: "newpassword123" }));
      expect(confirmRes.status).toBe(200);

      // Old password should fail
      const oldLogin = await login("test@example.com", "password123");
      expect(oldLogin.status).toBe(401);

      // New password should work
      const newLogin = await login("test@example.com", "newpassword123");
      expect(newLogin.status).toBe(200);
    });

    it("rejects invalid reset token", async () => {
      const res = await handleRequest(req("POST", "/auth/password-reset/confirm", { token: "invalid", newPassword: "newpassword123" }));
      expect(res.status).toBe(400);
    });

    it("rejects short new password", async () => {
      await register();
      const resetRes = await handleRequest(req("POST", "/auth/password-reset", { email: "test@example.com" }));
      const { resetToken } = (await json(resetRes)).data;
      const res = await handleRequest(req("POST", "/auth/password-reset/confirm", { token: resetToken, newPassword: "short" }));
      expect(res.status).toBe(400);
    });
  });

  // --- Health & Stats ---

  describe("GET /auth/health", () => {
    it("returns health status", async () => {
      const res = await handleRequest(req("GET", "/auth/health"));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.status).toBe("ok");
      expect(body.data.service).toBe("auth");
    });
  });

  describe("GET /auth/stats", () => {
    it("returns correct counts", async () => {
      await register();
      const res = await handleRequest(req("GET", "/auth/stats"));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.users).toBe(1);
      expect(body.data.sessions).toBe(1); // register creates a session
      expect(body.data.activeSessions).toBe(1);
    });
  });
});
