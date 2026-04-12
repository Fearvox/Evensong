import { describe, test, expect, beforeEach } from "bun:test";
import {
  createUser,
  findUserByEmail,
  getUserById,
  updateUser,
  deactivateUser,
  userCount,
  hashPassword,
  verifyPassword,
  createSession,
  getSessionByToken,
  isSessionValid,
  deleteSession,
  deleteUserSessions,
  refreshSession,
  sessionCount,
  activeSessionCount,
  createResetToken,
  getResetToken,
  isResetTokenValid,
  markResetTokenUsed,
  recordFailedAttempt,
  clearFailedAttempts,
  isAccountLocked,
  resetStores,
  authStore,
} from "../store";

describe("Auth Store", () => {
  beforeEach(() => resetStores());

  // =========================================================================
  // Password hashing
  // =========================================================================

  describe("password hashing", () => {
    test("hashPassword produces consistent output", () => {
      const hash1 = hashPassword("mypassword");
      const hash2 = hashPassword("mypassword");
      expect(hash1).toBe(hash2);
    });

    test("different passwords produce different hashes", () => {
      const hash1 = hashPassword("password1");
      const hash2 = hashPassword("password2");
      expect(hash1).not.toBe(hash2);
    });

    test("verifyPassword returns true for correct password", () => {
      const hash = hashPassword("secret");
      expect(verifyPassword("secret", hash)).toBe(true);
    });

    test("verifyPassword returns false for wrong password", () => {
      const hash = hashPassword("secret");
      expect(verifyPassword("wrong", hash)).toBe(false);
    });
  });

  // =========================================================================
  // User operations
  // =========================================================================

  describe("user operations", () => {
    test("createUser creates user with correct fields", () => {
      const user = createUser("test@example.com", "Test", "password123");
      expect(user.id).toBeTruthy();
      expect(user.email).toBe("test@example.com");
      expect(user.name).toBe("Test");
      expect(user.role).toBe("user");
      expect(user.active).toBe(true);
      expect(user.passwordHash).toBeTruthy();
      expect(user.createdAt).toBeTruthy();
      expect(user.updatedAt).toBeTruthy();
    });

    test("createUser normalizes email to lowercase", () => {
      const user = createUser("UPPER@TEST.COM", "Upper", "password123");
      expect(user.email).toBe("upper@test.com");
    });

    test("createUser trims name", () => {
      const user = createUser("trim@test.com", "  Trimmed  ", "password123");
      expect(user.name).toBe("Trimmed");
    });

    test("findUserByEmail finds existing user", () => {
      createUser("find@test.com", "Find", "password123");
      const found = findUserByEmail("find@test.com");
      expect(found).toBeDefined();
      expect(found!.email).toBe("find@test.com");
    });

    test("findUserByEmail is case-insensitive", () => {
      createUser("case@test.com", "Case", "password123");
      const found = findUserByEmail("CASE@TEST.COM");
      expect(found).toBeDefined();
    });

    test("findUserByEmail returns undefined for non-existent", () => {
      expect(findUserByEmail("nobody@test.com")).toBeUndefined();
    });

    test("getUserById returns user by ID", () => {
      const user = createUser("byid@test.com", "ById", "password123");
      const found = getUserById(user.id);
      expect(found).toBeDefined();
      expect(found!.email).toBe("byid@test.com");
    });

    test("getUserById returns undefined for bad ID", () => {
      expect(getUserById("nonexistent")).toBeUndefined();
    });

    test("updateUser updates fields", () => {
      const user = createUser("update@test.com", "Old Name", "password123");
      const updated = updateUser(user.id, { name: "New Name" });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe("New Name");
      // updatedAt should change
      expect(updated!.updatedAt).toBeTruthy();
    });

    test("updateUser returns undefined for non-existent user", () => {
      expect(updateUser("fake-id", { name: "X" })).toBeUndefined();
    });

    test("deactivateUser sets active to false", () => {
      const user = createUser("deact@test.com", "Deact", "password123");
      const deactivated = deactivateUser(user.id);
      expect(deactivated).toBeDefined();
      expect(deactivated!.active).toBe(false);
    });

    test("userCount returns correct count", () => {
      expect(userCount()).toBe(0);
      createUser("u1@test.com", "U1", "password123");
      createUser("u2@test.com", "U2", "password123");
      expect(userCount()).toBe(2);
    });
  });

  // =========================================================================
  // Session operations
  // =========================================================================

  describe("session operations", () => {
    test("createSession creates session with token and expiry", () => {
      const user = createUser("sess@test.com", "Sess", "password123");
      const session = createSession(user.id);
      expect(session.id).toBeTruthy();
      expect(session.userId).toBe(user.id);
      expect(session.token).toBeTruthy();
      expect(session.token).toMatch(/^tok_/);
      expect(session.expiresAt).toBeTruthy();
      expect(session.createdAt).toBeTruthy();
    });

    test("getSessionByToken finds session", () => {
      const user = createUser("token@test.com", "Token", "password123");
      const session = createSession(user.id);
      const found = getSessionByToken(session.token);
      expect(found).toBeDefined();
      expect(found!.id).toBe(session.id);
    });

    test("getSessionByToken returns undefined for invalid token", () => {
      expect(getSessionByToken("fake_token")).toBeUndefined();
    });

    test("isSessionValid returns true for fresh session", () => {
      const user = createUser("valid@test.com", "Valid", "password123");
      const session = createSession(user.id);
      expect(isSessionValid(session)).toBe(true);
    });

    test("isSessionValid returns false for expired session", () => {
      const expired = {
        id: "test",
        userId: "user",
        token: "tok_test",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      expect(isSessionValid(expired)).toBe(false);
    });

    test("deleteSession removes session", () => {
      const user = createUser("del@test.com", "Del", "password123");
      const session = createSession(user.id);
      expect(deleteSession(session.id)).toBe(true);
      expect(getSessionByToken(session.token)).toBeUndefined();
    });

    test("deleteSession returns false for non-existent", () => {
      expect(deleteSession("nonexistent")).toBe(false);
    });

    test("deleteUserSessions removes all sessions for a user", () => {
      const user = createUser("multi@test.com", "Multi", "password123");
      createSession(user.id);
      createSession(user.id);
      createSession(user.id);
      expect(sessionCount()).toBe(3);

      const deleted = deleteUserSessions(user.id);
      expect(deleted).toBe(3);
      expect(sessionCount()).toBe(0);
    });

    test("refreshSession returns new token", () => {
      const user = createUser("refresh@test.com", "Refresh", "password123");
      const session = createSession(user.id);
      const oldToken = session.token;

      const refreshed = refreshSession(session);
      expect(refreshed).toBeDefined();
      expect(refreshed!.token).not.toBe(oldToken);
    });

    test("sessionCount and activeSessionCount track correctly", () => {
      const user = createUser("count@test.com", "Count", "password123");
      createSession(user.id);
      createSession(user.id);
      expect(sessionCount()).toBe(2);
      expect(activeSessionCount()).toBe(2);
    });
  });

  // =========================================================================
  // Reset tokens
  // =========================================================================

  describe("reset token operations", () => {
    test("createResetToken generates token with expiry", () => {
      const user = createUser("rst@test.com", "Rst", "password123");
      const token = createResetToken(user.id);
      expect(token.id).toBeTruthy();
      expect(token.userId).toBe(user.id);
      expect(token.token).toMatch(/^rst_/);
      expect(token.used).toBe(false);
      expect(token.expiresAt).toBeTruthy();
    });

    test("getResetToken finds token by value", () => {
      const user = createUser("find-rst@test.com", "FindRst", "password123");
      const token = createResetToken(user.id);
      const found = getResetToken(token.token);
      expect(found).toBeDefined();
      expect(found!.id).toBe(token.id);
    });

    test("getResetToken returns undefined for invalid", () => {
      expect(getResetToken("fake_token")).toBeUndefined();
    });

    test("isResetTokenValid returns true for fresh token", () => {
      const user = createUser("valid-rst@test.com", "ValidRst", "password123");
      const token = createResetToken(user.id);
      expect(isResetTokenValid(token)).toBe(true);
    });

    test("isResetTokenValid returns false for used token", () => {
      const user = createUser("used-rst@test.com", "UsedRst", "password123");
      const token = createResetToken(user.id);
      markResetTokenUsed(token.id);
      const updated = getResetToken(token.token);
      expect(isResetTokenValid(updated!)).toBe(false);
    });

    test("isResetTokenValid returns false for expired token", () => {
      const expiredToken = {
        id: "test",
        userId: "user",
        token: "rst_test",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        used: false,
        createdAt: new Date().toISOString(),
      };
      expect(isResetTokenValid(expiredToken)).toBe(false);
    });
  });

  // =========================================================================
  // Login attempt tracking
  // =========================================================================

  describe("login attempt tracking", () => {
    test("recordFailedAttempt increments count", () => {
      const attempt = recordFailedAttempt("lock@test.com");
      expect(attempt.failedCount).toBe(1);
      expect(attempt.lockedUntil).toBeNull();

      const second = recordFailedAttempt("lock@test.com");
      expect(second.failedCount).toBe(2);
    });

    test("account locks after 5 failed attempts", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("lockme@test.com");
      }
      expect(isAccountLocked("lockme@test.com")).toBe(true);
    });

    test("account is not locked before 5 attempts", () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt("notlocked@test.com");
      }
      expect(isAccountLocked("notlocked@test.com")).toBe(false);
    });

    test("clearFailedAttempts resets count and unlocks", () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt("clear@test.com");
      }
      expect(isAccountLocked("clear@test.com")).toBe(true);

      clearFailedAttempts("clear@test.com");
      expect(isAccountLocked("clear@test.com")).toBe(false);
    });

    test("isAccountLocked returns false for unknown email", () => {
      expect(isAccountLocked("unknown@test.com")).toBe(false);
    });

    test("recordFailedAttempt normalizes email", () => {
      recordFailedAttempt("NORM@test.com");
      recordFailedAttempt("norm@test.com");
      // Should be 2 attempts for same normalized email
      const attempt = recordFailedAttempt("Norm@Test.Com");
      expect(attempt.failedCount).toBe(3);
    });
  });

  // =========================================================================
  // authStore singleton
  // =========================================================================

  describe("authStore singleton", () => {
    test("authStore.users references the same store", () => {
      createUser("singleton@test.com", "Singleton", "password123");
      expect(authStore.users.count()).toBe(1);
      const found = authStore.users.findOne((u) => u.email === "singleton@test.com");
      expect(found).toBeDefined();
    });

    test("authStore.sessions references the same store", () => {
      const user = createUser("sess-single@test.com", "SessSingle", "password123");
      createSession(user.id);
      expect(authStore.sessions.count()).toBe(1);
    });

    test("authStore.users.clear() works for test reset", () => {
      createUser("clear@test.com", "Clear", "password123");
      authStore.users.clear();
      expect(userCount()).toBe(0);
    });

    test("authStore.sessions.clear() works for test reset", () => {
      const user = createUser("clr-sess@test.com", "ClrSess", "password123");
      createSession(user.id);
      authStore.sessions.clear();
      expect(sessionCount()).toBe(0);
    });
  });

  // =========================================================================
  // resetStores
  // =========================================================================

  describe("resetStores", () => {
    test("clears all stores", () => {
      createUser("rst-all@test.com", "RstAll", "password123");
      const user = createUser("rst-all2@test.com", "RstAll2", "password123");
      createSession(user.id);
      createResetToken(user.id);
      recordFailedAttempt("rst-all@test.com");

      resetStores();

      expect(userCount()).toBe(0);
      expect(sessionCount()).toBe(0);
      expect(authStore.resetTokens.count()).toBe(0);
      expect(authStore.loginAttempts.count()).toBe(0);
    });
  });
});
