// Shared HTTP utilities for all microservices

import type { ApiResponse, PaginatedResponse } from "./types";

export function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function success<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data };
  return json(body, status);
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): Response {
  const body: PaginatedResponse<T> = {
    success: true,
    data,
    total,
    page,
    pageSize,
  };
  return json(body, 200);
}

export function error(message: string, status = 400): Response {
  const body: ApiResponse = { success: false, error: message };
  return json(body, status);
}

export function notFound(message = "Not found"): Response {
  return error(message, 404);
}

export function unauthorized(message = "Unauthorized"): Response {
  return error(message, 401);
}

export function conflict(message: string): Response {
  return error(message, 409);
}

export function serverError(message = "Internal server error"): Response {
  return error(message, 500);
}

export async function parseBody<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function getPathSegments(url: string): string[] {
  const u = new URL(url);
  return u.pathname.split("/").filter(Boolean);
}

export function getQueryParams(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
