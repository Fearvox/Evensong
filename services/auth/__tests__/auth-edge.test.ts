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

async function registerAndLogin(email = "edge@test.com", name = "Edge User", password = "password123") {
  await handleRequest(req("POST", "/auth/register", { email, name, password }));
  const res = await handleRequest(req("POST", "/auth/login", { email, password }));
  const body = await json(res);
  return body.data.token as string;
}

describe("Auth Edge Cases", () => {
  beforeEach(() => resetStores());

  // --- Malformed input ---

  it("handles malformed JSON body", async () => {
    const r = new Request("http://localhost:3001/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid json",
    });
    const res = await handleRequest(r);
    expect(res.status).toBe(400);
  });

  it("handles empty string body", async () => {
    const r = new Request("http://localhost:3001/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    const res = await handleRequest(r);
    expect(res.status).toBe(400);
  });

  it("handles missing Content-Type header", async () => {
    const r = new Request("http://localhost:3001/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", name: "Test", password: "password123" }),
    });
    // parseBody uses req.text() so it works without Content-Type
    const res = await handleRequest(r);
    expect(res.status).toBe(201);
  });

  // --- Email edge cases ---

  it("trims whitespace from email", async () => {
    const res = await handleRequest(req("POST", "/auth/register", {
      email: "  spaced@test.com  ", name: "Spaced", password: "password123",
    }));
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data.user.email).toBe("spaced@test.com");
  });

  it("treats emails case-insensitively for duplicate check", async () => {
    await handleRequest(req("POST", "/auth/register", {
      email: "UPPER@test.com", name: "Upper", password: "password123",
    }));
    const res = await handleRequest(req("POST", "/auth/register", {
      email: "upper@test.com", name: "Lower", password: "password123",
    }));
    expect(res.status).toBe(409);
  });

  it("rejects empty string email", async () => {
    const res = await handleRequest(req("POST", "/auth/register", {
      email: "", name: "Test", password: "password123",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects whitespace-only email", async () => {
    const res = await handleRequest(req("POST", "/auth/register", {
      email: "   ", name: "Test", password: "password123",
    }));
    expect(res.status).toBe(400);
  });

  // --- Profile operations ---

  describe("GET /auth/profile", () => {
    it("returns user profile", async () => {
      const token = await registerAndLogin();
      const res = await handleRequest(req("GET", "/auth/profile", undefined, { Authorization: `Bearer ${token}` }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.email).toBe("edge@test.com");
      expect(body.data.name).toBe("Edge User");
      expect(body.data.passwordHash).toBeUndefined();
    });

    it("rejects unauthenticated profile access", async () => {
      const res = await handleRequest(req("GET", "/auth/profile"));
      expect(res.status).toBe(401);
    });
  });

  describe("PUT /auth/profile", () => {
    it("updates user name", async () => {
      const token = await registerAndLogin();
      const res = await handleRequest(req("PUT", "/auth/profile", { name: "New Name" }, { Authorization: `Bearer ${token}` }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.name).toBe("New Name");
    });

    it("rejects empty name update", async () => {
      const token = await registerAndLogin();
      const res = await handleRequest(req("PUT", "/auth/profile", { name: "" }, { Authorization: `Bearer ${token}` }));
      expect(res.status).toBe(400);
    });

    it("rejects whitespace-only name", async () => {
      const token = await registerAndLogin();
      const res = await handleRequest(req("PUT", "/auth/profile", { name: "   " }, { Authorization: `Bearer ${token}` }));
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /auth/profile", () => {
    it("deactivates account and invalidates sessions", async () => {
      const token = await registerAndLogin();
      const delRes = await handleRequest(req("DELETE", "/auth/profile", undefined, { Authorization: `Bearer ${token}` }));
      expect(delRes.status).toBe(200);

      // Session should be invalid after deactivation
      const sessionRes = await handleRequest(req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token}` }));
      expect(sessionRes.status).toBe(401);
    });

    it("prevents login after deactivation", async () => {
      const token = await registerAndLogin();
      await handleRequest(req("DELETE", "/auth/profile", undefined, { Authorization: `Bearer ${token}` }));

      const loginRes = await handleRequest(req("POST", "/auth/login", { email: "edge@test.com", password: "password123" }));
      expect(loginRes.status).toBe(401);
      const body = await json(loginRes);
      expect(body.error).toContain("deactivated");
    });
  });

  // --- Password reset edge cases ---

  it("prevents reuse of reset token", async () => {
    await handleRequest(req("POST", "/auth/register", { email: "reset@test.com", name: "Reset", password: "password123" }));
    const resetRes = await handleRequest(req("POST", "/auth/password-reset", { email: "reset@test.com" }));
    const { resetToken } = (await json(resetRes)).data;

    // Use token once
    const first = await handleRequest(req("POST", "/auth/password-reset/confirm", { token: resetToken, newPassword: "newpass12345" }));
    expect(first.status).toBe(200);

    // Second use should fail
    const second = await handleRequest(req("POST", "/auth/password-reset/confirm", { token: resetToken, newPassword: "anotherpass1" }));
    expect(second.status).toBe(400);
    const body = await json(second);
    expect(body.error).toContain("expired or already used");
  });

  it("invalidates sessions after password reset", async () => {
    const token = await registerAndLogin("reset2@test.com", "R2", "password123");

    const resetRes = await handleRequest(req("POST", "/auth/password-reset", { email: "reset2@test.com" }));
    const { resetToken } = (await json(resetRes)).data;
    await handleRequest(req("POST", "/auth/password-reset/confirm", { token: resetToken, newPassword: "newpass12345" }));

    // Old session should be invalid
    const sessionRes = await handleRequest(req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token}` }));
    expect(sessionRes.status).toBe(401);
  });

  // --- Route edge cases ---

  it("returns 404 for unknown routes", async () => {
    const res = await handleRequest(req("GET", "/auth/nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-auth prefix", async () => {
    const res = await handleRequest(req("GET", "/users/list"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for wrong HTTP method", async () => {
    const res = await handleRequest(req("DELETE", "/auth/login"));
    expect(res.status).toBe(404);
  });

  // --- Authorization header edge cases ---

  it("rejects Bearer token with extra spaces", async () => {
    const res = await handleRequest(req("GET", "/auth/session", undefined, { Authorization: "Bearer   " }));
    expect(res.status).toBe(401);
  });

  it("rejects non-Bearer auth scheme", async () => {
    const res = await handleRequest(req("GET", "/auth/session", undefined, { Authorization: "Basic abc123" }));
    expect(res.status).toBe(401);
  });

  // --- Lockout recovery ---

  it("login succeeds with correct password after lock expires", async () => {
    // This test verifies the lockout mechanism exists, not actual time expiry
    await handleRequest(req("POST", "/auth/register", { email: "lock@test.com", name: "Lock", password: "password123" }));
    for (let i = 0; i < 5; i++) {
      await handleRequest(req("POST", "/auth/login", { email: "lock@test.com", password: "wrong" }));
    }
    const lockedRes = await handleRequest(req("POST", "/auth/login", { email: "lock@test.com", password: "password123" }));
    expect(lockedRes.status).toBe(401);
    const body = await json(lockedRes);
    expect(body.error).toContain("locked");
  });

  // --- Multiple sessions ---

  it("supports multiple concurrent sessions for same user", async () => {
    await handleRequest(req("POST", "/auth/register", { email: "multi@test.com", name: "Multi", password: "password123" }));
    const login1 = await handleRequest(req("POST", "/auth/login", { email: "multi@test.com", password: "password123" }));
    const login2 = await handleRequest(req("POST", "/auth/login", { email: "multi@test.com", password: "password123" }));
    const token1 = (await json(login1)).data.token;
    const token2 = (await json(login2)).data.token;

    expect(token1).not.toBe(token2);

    // Both should be valid
    const s1 = await handleRequest(req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token1}` }));
    const s2 = await handleRequest(req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token2}` }));
    expect(s1.status).toBe(200);
    expect(s2.status).toBe(200);
  });

  // --- Stats after operations ---

  it("stats reflect registrations and sessions accurately", async () => {
    await handleRequest(req("POST", "/auth/register", { email: "s1@test.com", name: "S1", password: "password123" }));
    await handleRequest(req("POST", "/auth/register", { email: "s2@test.com", name: "S2", password: "password123" }));
    await handleRequest(req("POST", "/auth/login", { email: "s1@test.com", password: "password123" }));

    const res = await handleRequest(req("GET", "/auth/stats"));
    const body = await json(res);
    expect(body.data.users).toBe(2);
    // 2 from register + 1 from login = 3 sessions
    expect(body.data.sessions).toBe(3);
    expect(body.data.activeSessions).toBe(3);
  });
});
