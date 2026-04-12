// Auth store — in-memory user, session, and security tracking

import { MemoryStore, generateId, now } from "../shared";
import type { User, Session } from "../shared";

// Extended auth user with password hash
export interface AuthUser extends User {
  passwordHash: string;
}

// Password reset token
export interface ResetToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

// Login attempt tracking
export interface LoginAttempt {
  id: string;
  email: string;
  failedCount: number;
  lockedUntil: string | null;
  lastAttemptAt: string;
}

// Stores
const users = new MemoryStore<AuthUser>();
const sessions = new MemoryStore<Session>();
const resetTokens = new MemoryStore<ResetToken>();
const loginAttempts = new MemoryStore<LoginAttempt>();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_DURATION_MS = 60 * 60 * 1000; // 1 hour

// --- Password hashing (btoa-based, not production crypto) ---

export function hashPassword(password: string): string {
  return btoa(password + ":auth-salt-v1");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// --- User operations ---

export function createUser(email: string, name: string, password: string): AuthUser {
  const user: AuthUser = {
    id: generateId(),
    email: email.trim().toLowerCase(),
    name: name.trim(),
    role: "user",
    active: true,
    passwordHash: hashPassword(password),
    createdAt: now(),
    updatedAt: now(),
  };
  return users.create(user);
}

export function findUserByEmail(email: string): AuthUser | undefined {
  return users.findOne((u) => u.email === email.trim().toLowerCase());
}

export function getUserById(id: string): AuthUser | undefined {
  return users.get(id);
}

export function updateUser(id: string, updates: Partial<AuthUser>): AuthUser | undefined {
  return users.update(id, { ...updates, updatedAt: now() });
}

export function deactivateUser(id: string): AuthUser | undefined {
  return users.update(id, { active: false, updatedAt: now() });
}

export function userCount(): number {
  return users.count();
}

// --- Session operations ---

function generateToken(): string {
  return `tok_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createSession(userId: string): Session {
  const session: Session = {
    id: generateId(),
    userId,
    token: generateToken(),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    createdAt: now(),
  };
  return sessions.create(session);
}

export function getSessionByToken(token: string): Session | undefined {
  return sessions.findOne((s) => s.token === token);
}

export function isSessionValid(session: Session): boolean {
  return new Date(session.expiresAt).getTime() > Date.now();
}

export function deleteSession(id: string): boolean {
  return sessions.delete(id);
}

export function deleteUserSessions(userId: string): number {
  const userSessions = sessions.find((s) => s.userId === userId);
  for (const s of userSessions) {
    sessions.delete(s.id);
  }
  return userSessions.length;
}

export function refreshSession(session: Session): Session | undefined {
  return sessions.update(session.id, {
    token: generateToken(),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
  });
}

export function sessionCount(): number {
  return sessions.count();
}

export function activeSessionCount(): number {
  return sessions.find((s) => new Date(s.expiresAt).getTime() > Date.now()).length;
}

// --- Password reset ---

export function createResetToken(userId: string): ResetToken {
  const token: ResetToken = {
    id: generateId(),
    userId,
    token: `rst_${crypto.randomUUID().replace(/-/g, "")}`,
    expiresAt: new Date(Date.now() + RESET_TOKEN_DURATION_MS).toISOString(),
    used: false,
    createdAt: now(),
  };
  return resetTokens.create(token);
}

export function getResetToken(token: string): ResetToken | undefined {
  return resetTokens.findOne((t) => t.token === token);
}

export function isResetTokenValid(token: ResetToken): boolean {
  return !token.used && new Date(token.expiresAt).getTime() > Date.now();
}

export function markResetTokenUsed(id: string): void {
  resetTokens.update(id, { used: true });
}

// --- Login attempt tracking ---

export function recordFailedAttempt(email: string): LoginAttempt {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = loginAttempts.findOne((a) => a.email === normalizedEmail);

  if (existing) {
    const newCount = existing.failedCount + 1;
    const lockedUntil =
      newCount >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MS).toISOString()
        : existing.lockedUntil;

    const updated = loginAttempts.update(existing.id, {
      failedCount: newCount,
      lockedUntil,
      lastAttemptAt: now(),
    });
    return updated!;
  }

  return loginAttempts.create({
    id: generateId(),
    email: normalizedEmail,
    failedCount: 1,
    lockedUntil: null,
    lastAttemptAt: now(),
  });
}

export function clearFailedAttempts(email: string): void {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = loginAttempts.findOne((a) => a.email === normalizedEmail);
  if (existing) {
    loginAttempts.update(existing.id, {
      failedCount: 0,
      lockedUntil: null,
    });
  }
}

export function isAccountLocked(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  const attempt = loginAttempts.findOne((a) => a.email === normalizedEmail);
  if (!attempt || !attempt.lockedUntil) return false;
  return new Date(attempt.lockedUntil).getTime() > Date.now();
}

// --- Reset all stores (for testing) ---

export function resetStores(): void {
  users.clear();
  sessions.clear();
  resetTokens.clear();
  loginAttempts.clear();
}

// --- Singleton store object (for integration tests and external access) ---

export const authStore = {
  users,
  sessions,
  resetTokens,
  loginAttempts,
} as const;
