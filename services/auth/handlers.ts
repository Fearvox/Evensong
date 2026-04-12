// Auth service — HTTP request handlers
// Exports: register, login, getProfile (standalone), router (dispatcher)

import {
  success,
  error,
  notFound,
  unauthorized,
  conflict,
  serverError,
  parseBody,
  getPathSegments,
  json,
} from "../shared/http";
import {
  isValidEmail,
  isNonEmptyString,
  validate,
  formatValidationErrors,
} from "../shared/validation";
import type { ApiResponse, Session } from "../shared/types";
import {
  createUser,
  findUserByEmail,
  getUserById,
  updateUser,
  deactivateUser,
  userCount,
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
  hashPassword,
  verifyPassword,
  recordFailedAttempt,
  clearFailedAttempts,
  isAccountLocked,
  authStore,
} from "./store";
import type { AuthUser } from "./store";

// --- Helpers ---

/** Extract Bearer token from Authorization header */
function extractToken(req: Request): string | null {
  const header = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/** Authenticate request — returns user+session or a 401 Response */
async function authenticateRequest(
  req: Request,
): Promise<{ user: AuthUser; session: Session } | Response> {
  const token = extractToken(req);
  if (!token) return unauthorized("No token provided");

  const session = getSessionByToken(token);
  if (!session) return unauthorized("Invalid token");

  if (!isSessionValid(session)) {
    deleteSession(session.id);
    return unauthorized("Session expired");
  }

  const user = getUserById(session.userId);
  if (!user) return unauthorized("User not found");
  if (!user.active) return unauthorized("Account is deactivated");

  return { user, session };
}

/** Strip passwordHash from user before returning to client */
function safeUser(user: AuthUser): Omit<AuthUser, "passwordHash"> {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

// =============================================================================
// Standalone Route Handlers (exported individually + used by router)
// =============================================================================

/** POST /auth/register (or /users/register) — register a new user */
export async function register(req: Request): Promise<Response> {
  const body = await parseBody<{ email?: string; name?: string; password?: string }>(req);
  if (!body) return error("Invalid or missing request body");

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const errors = validate([
    { field: "email", valid: isNonEmptyString(email), message: "Email is required" },
    {
      field: "email",
      valid: !isNonEmptyString(email) || isValidEmail(email),
      message: "Invalid email format",
    },
    { field: "name", valid: isNonEmptyString(name), message: "Name is required" },
    { field: "password", valid: isNonEmptyString(password), message: "Password is required" },
    {
      field: "password",
      valid: !isNonEmptyString(password) || password.length >= 8,
      message: "Password must be at least 8 characters",
    },
  ]);

  if (errors.length > 0) {
    return error(formatValidationErrors(errors), 400);
  }

  const existing = findUserByEmail(email);
  if (existing) return conflict("Email already registered");

  const user = createUser(email, name, password);
  const session = createSession(user.id);

  return json(
    { success: true, data: { user: safeUser(user), token: session.token } } satisfies ApiResponse,
    201,
  );
}

/** POST /auth/login — authenticate and get a session token */
export async function login(req: Request): Promise<Response> {
  const body = await parseBody<{ email?: string; password?: string }>(req);
  if (!body) return error("Invalid or missing request body");

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return error("Email and password are required");
  }

  // Account lockout check
  if (isAccountLocked(email)) {
    return error("Account is locked due to too many failed attempts. Try again later.", 423);
  }

  const user = findUserByEmail(email);
  if (!user) {
    recordFailedAttempt(email);
    return unauthorized("Invalid credentials");
  }

  if (!user.active) {
    return unauthorized("Account is deactivated");
  }

  if (!verifyPassword(password, user.passwordHash)) {
    recordFailedAttempt(email);
    return unauthorized("Invalid credentials");
  }

  // Success — clear failed attempts and create session
  clearFailedAttempts(email);
  const session = createSession(user.id);

  return success({ token: session.token, user: safeUser(user) });
}

/** GET /auth/me — get current user profile via Bearer token */
export async function getProfile(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  return success(safeUser(auth.user));
}

// =============================================================================
// Internal Route Handlers (used by router only)
// =============================================================================

/** GET /auth/session — validate session and return user */
async function getSession(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  return success({ user: safeUser(auth.user) });
}

/** POST /auth/logout — invalidate current session */
async function logout(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  deleteSession(auth.session.id);
  return success({ message: "Logged out" });
}

/** POST /auth/refresh — refresh session token */
async function refresh(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const refreshed = refreshSession(auth.session);
  if (!refreshed) return error("Failed to refresh session");

  return success({ token: refreshed.token, expiresAt: refreshed.expiresAt });
}

/** POST /auth/reset-password — request a password reset token */
async function resetPassword(req: Request): Promise<Response> {
  const body = await parseBody<{ email?: string }>(req);
  if (!body) return error("Invalid or missing request body");

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!isValidEmail(email)) {
    return error("Valid email is required");
  }

  const user = findUserByEmail(email);
  if (!user) {
    // Don't reveal whether email exists
    return success({ message: "If the email exists, a reset token has been sent" });
  }

  const resetToken = createResetToken(user.id);
  return success({
    message: "If the email exists, a reset token has been sent",
    resetToken: resetToken.token,
  });
}

/** POST /auth/change-password — change password via reset token or current auth */
async function changePassword(req: Request): Promise<Response> {
  const body = await parseBody<{
    token?: string;
    newPassword?: string;
    currentPassword?: string;
  }>(req);
  if (!body) return error("Invalid or missing request body");

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!isNonEmptyString(newPassword) || newPassword.length < 8) {
    return error("New password must be at least 8 characters");
  }

  // Path 1: Reset token flow
  const tokenValue = typeof body.token === "string" ? body.token : "";
  if (isNonEmptyString(tokenValue)) {
    const resetToken = getResetToken(tokenValue);
    if (!resetToken) return error("Invalid reset token", 400);

    if (!isResetTokenValid(resetToken)) {
      return error("Reset token is expired or already used", 400);
    }

    const user = getUserById(resetToken.userId);
    if (!user) return error("User not found", 400);

    updateUser(user.id, { passwordHash: hashPassword(newPassword) });
    markResetTokenUsed(resetToken.id);
    deleteUserSessions(user.id);

    return success({ message: "Password has been reset" });
  }

  // Path 2: Authenticated change (must provide currentPassword)
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!isNonEmptyString(currentPassword)) {
    return error("Current password is required");
  }

  if (!verifyPassword(currentPassword, auth.user.passwordHash)) {
    return unauthorized("Current password is incorrect");
  }

  updateUser(auth.user.id, { passwordHash: hashPassword(newPassword) });
  return success({ message: "Password changed successfully" });
}

/** GET /auth/sessions — list active sessions for current user */
async function listSessions(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const userSessions = authStore.sessions
    .find((s) => s.userId === auth.user.id)
    .filter((s) => new Date(s.expiresAt).getTime() > Date.now())
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.id === auth.session.id,
    }));

  return success(userSessions);
}

/** DELETE /auth/sessions/:id — delete a specific session */
async function deleteSpecificSession(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const segments = getPathSegments(req.url);
  const sessionId = segments[segments.length - 1];

  if (!sessionId) {
    return error("Session ID is required", 400);
  }

  const targetSession = authStore.sessions.get(sessionId);
  if (!targetSession) {
    return notFound("Session not found");
  }

  if (targetSession.userId !== auth.user.id) {
    return unauthorized("Cannot delete another user's session");
  }

  deleteSession(sessionId);
  return success({ message: "Session deleted" });
}

/** PUT /auth/profile — update profile name */
async function updateProfile(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const body = await parseBody<{ name?: string }>(req);
  if (!body) return error("Invalid or missing request body");

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!isNonEmptyString(name)) return error("Name is required");

  const updated = updateUser(auth.user.id, { name });
  if (!updated) return notFound("User not found");

  return success(safeUser(updated));
}

/** DELETE /auth/profile — deactivate account */
async function deleteProfile(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const deactivated = deactivateUser(auth.user.id);
  if (!deactivated) return notFound("User not found");

  deleteUserSessions(auth.user.id);
  return success({ message: "Account deactivated" });
}

/** GET /auth/health */
function health(): Response {
  return success({ status: "ok", service: "auth", timestamp: new Date().toISOString() });
}

/** GET /auth/stats */
function stats(): Response {
  return success({
    users: userCount(),
    sessions: sessionCount(),
    activeSessions: activeSessionCount(),
  });
}

// =============================================================================
// Router — dispatches all auth routes
// =============================================================================

export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const path = url.pathname;
  const segments = getPathSegments(req.url);

  try {
    // --- Registration (accepts both /auth/register and /users/register) ---
    if (method === "POST" && (path === "/auth/register" || path === "/users/register")) {
      return register(req);
    }

    // --- All other routes require /auth prefix ---
    if (segments[0] !== "auth") {
      return notFound("Route not found");
    }

    const route = segments[1] || "";
    const subRoute = segments[2] || "";

    // Health & stats
    if (method === "GET" && route === "health") return health();
    if (method === "GET" && route === "stats") return stats();

    // Auth flow
    if (method === "POST" && route === "login") return login(req);
    if (method === "POST" && route === "logout") return logout(req);
    if (method === "POST" && route === "refresh") return refresh(req);
    if (method === "GET" && route === "session") return getSession(req);
    if (method === "GET" && route === "me") return getProfile(req);

    // Password management
    if (method === "POST" && route === "reset-password") return resetPassword(req);
    if (method === "POST" && route === "change-password") return changePassword(req);

    // Session management
    if (method === "GET" && route === "sessions" && !subRoute) return listSessions(req);
    if (method === "DELETE" && route === "sessions" && subRoute) return deleteSpecificSession(req);

    // Profile management
    if (method === "GET" && route === "profile") return getProfile(req);
    if (method === "PUT" && route === "profile") return updateProfile(req);
    if (method === "DELETE" && route === "profile") return deleteProfile(req);

    return notFound("Route not found");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return serverError(message);
  }
}
