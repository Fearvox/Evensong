import {
  success,
  error,
  notFound,
  parseBody,
  getPathSegments,
  getQueryParams,
} from "../shared/http";
import {
  isNonEmptyString,
  isArray,
  isObject,
  validate,
  formatValidationErrors,
} from "../shared/validation";
import { analyticsStore } from "./store";
import type { EventInput } from "./store";

export async function handleRequest(req: Request): Promise<Response> {
  const method = req.method;
  const segments = getPathSegments(req.url);
  const params = getQueryParams(req.url);

  // All routes start with /analytics
  if (segments[0] !== "analytics") {
    return notFound("Route not found");
  }

  // GET /analytics/stats
  if (method === "GET" && segments[1] === "stats" && segments.length === 2) {
    return success(analyticsStore.stats());
  }

  // GET /analytics/funnel?steps=step1,step2&userId=
  if (method === "GET" && segments[1] === "funnel" && segments.length === 2) {
    const stepsParam = params.get("steps");
    if (!stepsParam || !stepsParam.trim()) {
      return error("steps query parameter is required (comma-separated event types)");
    }
    const steps = stepsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (steps.length === 0) {
      return error("steps must contain at least one event type");
    }
    const userId = params.get("userId") ?? undefined;
    return success(analyticsStore.funnel(steps, userId));
  }

  // GET /analytics/retention
  if (method === "GET" && segments[1] === "retention" && segments.length === 2) {
    return success(analyticsStore.retention());
  }

  // POST /analytics/events/batch
  if (method === "POST" && segments[1] === "events" && segments[2] === "batch" && segments.length === 3) {
    const body = await parseBody<{ events: unknown }>(req);
    if (!body || !isArray(body.events)) {
      return error("events must be a non-empty array");
    }
    const events = body.events as Array<Record<string, unknown>>;
    if (events.length === 0) {
      return error("events must be a non-empty array");
    }

    const inputs: EventInput[] = [];
    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      if (!isObject(evt) || !isNonEmptyString(evt.name)) {
        return error(`events[${i}].name is required and must be a non-empty string`);
      }
      inputs.push({
        name: evt.name as string,
        userId: typeof evt.userId === "string" ? evt.userId : undefined,
        sessionId: typeof evt.sessionId === "string" ? evt.sessionId : undefined,
        properties: isObject(evt.properties) ? (evt.properties as Record<string, unknown>) : undefined,
      });
    }

    const created = analyticsStore.trackBatch(inputs);
    return success(created, 201);
  }

  // GET /analytics/events/by-user/:userId
  if (method === "GET" && segments[1] === "events" && segments[2] === "by-user" && segments.length === 4) {
    const userId = segments[3];
    return success(analyticsStore.findByUserId(userId));
  }

  // GET /analytics/events/by-session/:sessionId
  if (method === "GET" && segments[1] === "events" && segments[2] === "by-session" && segments.length === 4) {
    const sessionId = segments[3];
    return success(analyticsStore.findBySessionId(sessionId));
  }

  // POST /analytics/events — track single event
  if (method === "POST" && segments[1] === "events" && segments.length === 2) {
    const body = await parseBody<{ name: unknown; userId?: unknown; sessionId?: unknown; properties?: unknown }>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      { field: "name", valid: isNonEmptyString(body.name), message: "name is required and must be a non-empty string" },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    const event = analyticsStore.trackEvent({
      name: body.name as string,
      userId: typeof body.userId === "string" ? body.userId : undefined,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      properties: isObject(body.properties) ? (body.properties as Record<string, unknown>) : undefined,
    });
    return success(event, 201);
  }

  // GET /analytics/events — list events with optional filters
  if (method === "GET" && segments[1] === "events" && segments.length === 2) {
    const userId = params.get("userId") ?? undefined;
    const sessionId = params.get("sessionId") ?? undefined;
    const eventType = params.get("eventType") ?? undefined;

    if (userId || sessionId || eventType) {
      return success(analyticsStore.filter({ userId, sessionId, eventType }));
    }
    return success(analyticsStore.getAll());
  }

  // GET /analytics/events/:id
  if (method === "GET" && segments[1] === "events" && segments.length === 3) {
    const id = segments[2];
    const event = analyticsStore.get(id);
    if (!event) return notFound("Event not found");
    return success(event);
  }

  // DELETE /analytics/events/:id
  if (method === "DELETE" && segments[1] === "events" && segments.length === 3) {
    const id = segments[2];
    const event = analyticsStore.get(id);
    if (!event) return notFound("Event not found");
    analyticsStore.remove(id);
    return success({ deleted: true });
  }

  return notFound("Route not found");
}
