import { describe, test, expect, beforeEach } from "bun:test";
import { router, getProfile } from "../handlers";
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

async function registerAndGetToken(
  email = "profile@test.com",
  name = "Profile User",
  password = "password123",
): Promise<{ token: string; userId: string }> {
  const regRes = await router(
    req("POST", "/auth/register", { email, name, password }),
  );
  const regBody = await json(regRes);
  const userId = regBody.data.user.id;

  const loginRes = await router(
    req("POST", "/auth/login", { email, password }),
  );
  const loginBody = await json(loginRes);
  return { token: loginBody.data.token, userId };
}

// --- Tests ---

describe("Auth Handlers — Profile, Password Reset, Password Change", () => {
  beforeEach(() => resetStores());

  // =========================================================================
  // GET /auth/me (standalone getProfile)
  // =========================================================================

  describe("GET /auth/me", () => {
    test("returns current user profile via router", async () => {
      const { token } = await registerAndGetToken();
      const res = await router(
        req("GET", "/auth/me", undefined, { Authorization: `Bearer ${token}` }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.email).toBe("profile@test.com");
      expect(body.data.name).toBe("Profile User");
      expect(body.data.passwordHash).toBeUndefined();
    });

    test("standalone getProfile function works directly", async () => {
      const { token } = await registerAndGetToken();
      const r = req("GET", "/auth/me", undefined, { Authorization: `Bearer ${token}` });
      const res = await getProfile(r);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.email).toBe("profile@test.com");
    });

    test("rejects unauthenticated access with 401", async () => {
      const res = await router(req("GET", "/auth/me"));
      expect(res.status).toBe(401);
    });

    test("rejects expired/invalid token with 401", async () => {
      const res = await router(
        req("GET", "/auth/me", undefined, { Authorization: "Bearer fake_token" }),
      );
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /auth/profile (alias)
  // =========================================================================

  describe("GET /auth/profile", () => {
    test("returns same data as /auth/me", async () => {
      const { token } = await registerAndGetToken();
      const res = await router(
        req("GET", "/auth/profile", undefined, { Authorization: `Bearer ${token}` }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.email).toBe("profile@test.com");
      expect(body.data.passwordHash).toBeUndefined();
    });
  });

  // =========================================================================
  // PUT /auth/profile
  // =========================================================================

  describe("PUT /auth/profile", () => {
    test("updates user name", async () => {
      const { token } = await registerAndGetToken();
      const res = await router(
        req("PUT", "/auth/profile", { name: "New Name" }, { Authorization: `Bearer ${token}` }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.name).toBe("New Name");
    });

    test("rejects empty name with 400", async () => {
      const { token } = await registerAndGetToken();
      const res = await router(
        req("PUT", "/auth/profile", { name: "" }, { Authorization: `Bearer ${token}` }),
      );
      expect(res.status).toBe(400);
    });

    test("rejects whitespace-only name with 400", async () => {
      const { token } = await registerAndGetToken();
      const res = await router(
        req("PUT", "/auth/profile", { name: "   " }, { Authorization: `Bearer ${token}` }),
      );
      expect(res.status).toBe(400);
    });

    test("rejects unauthenticated update", async () => {
      const res = await router(req("PUT", "/auth/profile", { name: "Hacker" }));
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /auth/profile (deactivate)
  // =========================================================================

  describe("DELETE /auth/profile", () => {
    test("deactivates account and invalidates sessions", async () => {
      const { token } = await registerAndGetToken();
      const delRes = await router(
        req("DELETE", "/auth/profile", undefined, { Authorization: `Bearer ${token}` }),
      );
      expect(delRes.status).toBe(200);

      // Session should be invalid after deactivation
      const sessionRes = await router(
        req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token}` }),
      );
      expect(sessionRes.status).toBe(401);
    });

    test("prevents login after deactivation", async () => {
      const { token } = await registerAndGetToken("deact@test.com", "Deact", "password123");
      await router(
        req("DELETE", "/auth/profile", undefined, { Authorization: `Bearer ${token}` }),
      );

      const loginRes = await router(
        req("POST", "/auth/login", { email: "deact@test.com", password: "password123" }),
      );
      expect(loginRes.status).toBe(401);
      const body = await json(loginRes);
      expect(body.error).toContain("deactivated");
    });
  });

  // =========================================================================
  // POST /auth/reset-password
  // =========================================================================

  describe("POST /auth/reset-password", () => {
    test("returns reset token for existing email", async () => {
      await registerAndGetToken("reset@test.com", "Reset", "password123");
      const res = await router(
        req("POST", "/auth/reset-password", { email: "reset@test.com" }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.resetToken).toBeTruthy();
      expect(body.data.resetToken).toMatch(/^rst_/);
    });

    test("returns success even for non-existent email (no enumeration)", async () => {
      const res = await router(
        req("POST", "/auth/reset-password", { email: "nobody@example.com" }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      // Should NOT have resetToken for non-existent email
      expect(body.data.resetToken).toBeUndefined();
      expect(body.data.message).toContain("If the email exists");
    });

    test("rejects missing email with 400", async () => {
      const res = await router(req("POST", "/auth/reset-password", {}));
      expect(res.status).toBe(400);
    });

    test("rejects invalid email format", async () => {
      const res = await router(
        req("POST", "/auth/reset-password", { email: "not-email" }),
      );
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /auth/change-password (via reset token)
  // =========================================================================

  describe("POST /auth/change-password (reset token flow)", () => {
    test("resets password with valid token", async () => {
      await registerAndGetToken("change@test.com", "Change", "password123");

      // Get reset token
      const resetRes = await router(
        req("POST", "/auth/reset-password", { email: "change@test.com" }),
      );
      const { resetToken } = (await json(resetRes)).data;

      // Use reset token to change password
      const changeRes = await router(
        req("POST", "/auth/change-password", {
          token: resetToken,
          newPassword: "newpass12345",
        }),
      );
      expect(changeRes.status).toBe(200);

      // Old password should fail
      const oldLogin = await router(
        req("POST", "/auth/login", { email: "change@test.com", password: "password123" }),
      );
      expect(oldLogin.status).toBe(401);

      // New password should work
      const newLogin = await router(
        req("POST", "/auth/login", { email: "change@test.com", password: "newpass12345" }),
      );
      expect(newLogin.status).toBe(200);
    });

    test("rejects invalid reset token", async () => {
      const res = await router(
        req("POST", "/auth/change-password", {
          token: "invalid_token",
          newPassword: "newpass12345",
        }),
      );
      expect(res.status).toBe(400);
    });

    test("prevents reuse of reset token", async () => {
      await registerAndGetToken("reuse@test.com", "Reuse", "password123");

      const resetRes = await router(
        req("POST", "/auth/reset-password", { email: "reuse@test.com" }),
      );
      const { resetToken } = (await json(resetRes)).data;

      // First use — should succeed
      const first = await router(
        req("POST", "/auth/change-password", {
          token: resetToken,
          newPassword: "newpass12345",
        }),
      );
      expect(first.status).toBe(200);

      // Second use — should fail
      const second = await router(
        req("POST", "/auth/change-password", {
          token: resetToken,
          newPassword: "anotherpass1",
        }),
      );
      expect(second.status).toBe(400);
      const body = await json(second);
      expect(body.error).toContain("expired or already used");
    });

    test("invalidates all sessions after password reset", async () => {
      const { token } = await registerAndGetToken("inv@test.com", "Inv", "password123");

      const resetRes = await router(
        req("POST", "/auth/reset-password", { email: "inv@test.com" }),
      );
      const { resetToken } = (await json(resetRes)).data;

      await router(
        req("POST", "/auth/change-password", {
          token: resetToken,
          newPassword: "newpass12345",
        }),
      );

      // Old session should be invalid
      const sessionRes = await router(
        req("GET", "/auth/session", undefined, { Authorization: `Bearer ${token}` }),
      );
      expect(sessionRes.status).toBe(401);
    });

    test("rejects short new password (< 8 chars)", async () => {
      await registerAndGetToken("short@test.com", "Short", "password123");
      const resetRes = await router(
        req("POST", "/auth/reset-password", { email: "short@test.com" }),
      );
      const { resetToken } = (await json(resetRes)).data;

      const res = await router(
        req("POST", "/auth/change-password", {
          token: resetToken,
          newPassword: "short",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // POST /auth/change-password (authenticated flow)
  // =========================================================================

  describe("POST /auth/change-password (authenticated flow)", () => {
    test("changes password with current password", async () => {
      const { token } = await registerAndGetToken("auth@test.com", "Auth", "password123");
      const res = await router(
        req(
          "POST",
          "/auth/change-password",
          { currentPassword: "password123", newPassword: "updatedpass1" },
          { Authorization: `Bearer ${token}` },
        ),
      );
      expect(res.status).toBe(200);

      // New password should work
      const loginRes = await router(
        req("POST", "/auth/login", { email: "auth@test.com", password: "updatedpass1" }),
      );
      expect(loginRes.status).toBe(200);
    });

    test("rejects wrong current password", async () => {
      const { token } = await registerAndGetToken("wrong@test.com", "Wrong", "password123");
      const res = await router(
        req(
          "POST",
          "/auth/change-password",
          { currentPassword: "wrongcurrent", newPassword: "updatedpass1" },
          { Authorization: `Bearer ${token}` },
        ),
      );
      expect(res.status).toBe(401);
    });

    test("rejects missing current password", async () => {
      const { token } = await registerAndGetToken("miss@test.com", "Miss", "password123");
      const res = await router(
        req(
          "POST",
          "/auth/change-password",
          { newPassword: "updatedpass1" },
          { Authorization: `Bearer ${token}` },
        ),
      );
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /auth/sessions — list active sessions
  // =========================================================================

  describe("GET /auth/sessions", () => {
    test("lists active sessions for current user", async () => {
      await router(
        req("POST", "/auth/register", {
          email: "sess@test.com",
          name: "Sess",
          password: "password123",
        }),
      );
      // Create two login sessions
      const login1 = await router(
        req("POST", "/auth/login", { email: "sess@test.com", password: "password123" }),
      );
      const login2 = await router(
        req("POST", "/auth/login", { email: "sess@test.com", password: "password123" }),
      );
      const t2 = (await json(login2)).data.token;

      const res = await router(
        req("GET", "/auth/sessions", undefined, { Authorization: `Bearer ${t2}` }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      // Register creates 1 session + 2 logins = 3
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      // One session should be marked as current
      const current = body.data.find((s: any) => s.current === true);
      expect(current).toBeDefined();
    });

    test("rejects unauthenticated request", async () => {
      const res = await router(req("GET", "/auth/sessions"));
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /auth/sessions/:id — delete specific session
  // =========================================================================

  describe("DELETE /auth/sessions/:id", () => {
    test("deletes a specific session", async () => {
      await router(
        req("POST", "/auth/register", {
          email: "del@test.com",
          name: "Del",
          password: "password123",
        }),
      );
      const login1 = await router(
        req("POST", "/auth/login", { email: "del@test.com", password: "password123" }),
      );
      const login2 = await router(
        req("POST", "/auth/login", { email: "del@test.com", password: "password123" }),
      );
      const t1 = (await json(login1)).data.token;
      const t2 = (await json(login2)).data.token;

      // Get session list to find session 1's ID
      const listRes = await router(
        req("GET", "/auth/sessions", undefined, { Authorization: `Bearer ${t2}` }),
      );
      const sessions = (await json(listRes)).data;
      const nonCurrentSession = sessions.find((s: any) => !s.current);

      if (nonCurrentSession) {
        const delRes = await router(
          req("DELETE", `/auth/sessions/${nonCurrentSession.id}`, undefined, {
            Authorization: `Bearer ${t2}`,
          }),
        );
        expect(delRes.status).toBe(200);
      }
    });

    test("returns 404 for non-existent session", async () => {
      const { token } = await registerAndGetToken("no@test.com", "No", "password123");
      const res = await router(
        req("DELETE", "/auth/sessions/nonexistent-id", undefined, {
          Authorization: `Bearer ${token}`,
        }),
      );
      expect(res.status).toBe(404);
    });

    test("rejects unauthenticated deletion", async () => {
      const res = await router(req("DELETE", "/auth/sessions/some-id"));
      expect(res.status).toBe(401);
    });
  });
});
