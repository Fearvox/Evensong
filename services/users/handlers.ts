import {
  success,
  error,
  notFound,
  unauthorized,
  conflict,
  parseBody,
  getPathSegments,
  getQueryParams,
} from "../shared/http";
import {
  isNonEmptyString,
  isValidEmail,
  isInEnum,
  isArray,
  validate,
  formatValidationErrors,
} from "../shared/validation";
import { userStore } from "./store";
import type { User } from "../shared/types";

const VALID_ROLES = ["admin", "user", "moderator"] as const;

export async function handleRequest(req: Request): Promise<Response> {
  const method = req.method;
  const segments = getPathSegments(req.url);
  const params = getQueryParams(req.url);

  // All routes require /users prefix
  if (segments[0] !== "users") {
    return notFound("Route not found");
  }

  // Health check: GET /users/health
  if (method === "GET" && segments[1] === "health" && segments.length === 2) {
    return success({ status: "ok", service: "users" });
  }

  // Stats: GET /users/stats
  if (method === "GET" && segments[1] === "stats" && segments.length === 2) {
    return success(userStore.stats());
  }

  // Search: GET /users/search?q=term
  if (method === "GET" && segments[1] === "search" && segments.length === 2) {
    const q = params.get("q") ?? "";
    if (!q.trim()) {
      return success([]);
    }
    return success(userStore.search(q));
  }

  // Bulk activate: POST /users/bulk/activate
  if (
    method === "POST" &&
    segments[1] === "bulk" &&
    segments[2] === "activate" &&
    segments.length === 3
  ) {
    const body = await parseBody<{ ids: unknown }>(req);
    if (!body || !isArray(body.ids)) {
      return error("ids must be a non-empty array");
    }
    const ids = body.ids as string[];
    if (ids.length === 0) {
      return error("ids must be a non-empty array");
    }
    const count = userStore.bulkActivate(ids);
    return success({ activated: count });
  }

  // Bulk deactivate: POST /users/bulk/deactivate
  if (
    method === "POST" &&
    segments[1] === "bulk" &&
    segments[2] === "deactivate" &&
    segments.length === 3
  ) {
    const body = await parseBody<{ ids: unknown }>(req);
    if (!body || !isArray(body.ids)) {
      return error("ids must be a non-empty array");
    }
    const ids = body.ids as string[];
    if (ids.length === 0) {
      return error("ids must be a non-empty array");
    }
    const count = userStore.bulkDeactivate(ids);
    return success({ deactivated: count });
  }

  // Activity log: POST /users/:id/activity
  if (method === "POST" && segments[2] === "activity" && segments.length === 3) {
    const id = segments[1];
    const user = userStore.get(id);
    if (!user) return notFound("User not found");
    const body = await parseBody<{ action: unknown }>(req);
    if (!body || !isNonEmptyString(body.action)) {
      return error("action is required and must be a non-empty string");
    }
    userStore.logActivity(id, body.action as string);
    return success({ logged: true });
  }

  // Activity log: GET /users/:id/activity
  if (method === "GET" && segments[2] === "activity" && segments.length === 3) {
    const id = segments[1];
    const user = userStore.get(id);
    if (!user) return notFound("User not found");
    return success(userStore.getActivity(id));
  }

  // Restore: POST /users/:id/restore
  if (method === "POST" && segments[2] === "restore" && segments.length === 3) {
    const id = segments[1];
    const user = userStore.get(id);
    if (!user) return notFound("User not found");
    if (!user.deletedAt) return error("User is not deleted", 400);
    const restored = userStore.restore(id);
    return success(restored);
  }

  // Create user: POST /users (requires x-role: admin)
  if (method === "POST" && segments.length === 1) {
    const callerRole = req.headers.get("x-role");
    if (callerRole !== "admin") {
      return unauthorized("Admin role required");
    }

    const body = await parseBody<{
      name: unknown;
      email: unknown;
      role: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      {
        field: "name",
        valid: isNonEmptyString(body.name),
        message: "name is required",
      },
      {
        field: "email",
        valid: isValidEmail(body.email),
        message: "valid email is required",
      },
      {
        field: "role",
        valid: isInEnum(body.role, VALID_ROLES),
        message: "role must be admin, user, or moderator",
      },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    const existing = userStore.findByEmail(body.email as string);
    if (existing) return conflict("Email already exists");

    const user = userStore.create({
      name: body.name as string,
      email: body.email as string,
      role: body.role as User["role"],
    });
    return success(user, 201);
  }

  // List users: GET /users (supports ?search= for name/email filtering)
  if (method === "GET" && segments.length === 1) {
    const searchQuery = params.get("search");

    // If search param is provided and non-empty, return filtered results
    if (searchQuery && searchQuery.trim()) {
      return success(userStore.search(searchQuery));
    }

    // Otherwise return all active users
    return success(userStore.getActive());
  }

  // Get user: GET /users/:id
  if (method === "GET" && segments.length === 2) {
    const id = segments[1];
    const user = userStore.get(id);
    if (!user) return notFound("User not found");
    return success(user);
  }

  // Update user: PUT /users/:id
  if (method === "PUT" && segments.length === 2) {
    const id = segments[1];
    const user = userStore.get(id);
    if (!user) return notFound("User not found");

    const body = await parseBody<{
      name?: unknown;
      email?: unknown;
      role?: unknown;
      active?: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const updates: Partial<Pick<User, "name" | "email" | "role" | "active">> = {};

    if (body.name !== undefined) {
      if (!isNonEmptyString(body.name))
        return error("name must be a non-empty string");
      updates.name = body.name as string;
    }
    if (body.email !== undefined) {
      if (!isValidEmail(body.email))
        return error("valid email is required");
      const existing = userStore.findByEmail(body.email as string);
      if (existing && existing.id !== id)
        return conflict("Email already exists");
      updates.email = body.email as string;
    }
    if (body.role !== undefined) {
      if (!isInEnum(body.role, VALID_ROLES))
        return error("role must be admin, user, or moderator");
      updates.role = body.role as User["role"];
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean")
        return error("active must be a boolean");
      updates.active = body.active;
    }

    const updated = userStore.update(id, updates);
    return success(updated);
  }

  // Soft delete: DELETE /users/:id
  if (method === "DELETE" && segments.length === 2) {
    const id = segments[1];
    const user = userStore.get(id);
    if (!user) return notFound("User not found");
    if (user.deletedAt) return error("User already deleted", 400);
    const deleted = userStore.softDelete(id);
    return success(deleted);
  }

  return notFound("Route not found");
}
