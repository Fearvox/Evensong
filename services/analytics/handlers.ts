import {
  success,
  error,
  notFound,
  paginated,
  parseBody,
  getPathSegments,
  getQueryParams,
} from "../shared/http";
import {
  isNonEmptyString,
  isArray,
  isObject,
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

  // GET /analytics/health
  if (method === "GET" && segments[1] === "health" && segments.length === 2) {
    return success({ status: "ok", service: "analytics" });
  }

  // GET /analytics/stats
  if (method === "GET" && segments[1] === "stats" && segments.length === 2) {
    return success(analyticsStore.stats());
  }

  // GET /analytics/aggregate?eventType=...
  if (method === "GET" && segments[1] === "aggregate" && segments.length === 2) {
    const eventType = params.get("eventType");
    if (!eventType) {
      return error("eventType query parameter is required");
    }
    return success(analyticsStore.aggregate(eventType));
  }

  // GET /analytics/top?limit=N
  if (method === "GET" && segments[1] === "top" && segments.length === 2) {
    const limitParam = params.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 10;
    return success(analyticsStore.topEventTypes(limit));
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

  // GET /analytics/retention?eventA=...&eventB=...&days=N
  if (method === "GET" && segments[1] === "retention" && segments.length === 2) {
    const eventA = params.get("eventA");
    const eventB = params.get("eventB");
    if (!eventA || !eventB) {
      return error("eventA and eventB query parameters are required");
    }
    const daysParam = params.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 30;
    return success(analyticsStore.retentionCount(eventA, eventB, days));
  }

  // GET /analytics/user/:userId
  if (method === "GET" && segments[1] === "user" && segments.length === 3) {
    const userId = segments[2];
    return success(analyticsStore.findByUserId(userId));
  }

  // GET /analytics/session/:sessionId
  if (method === "GET" && segments[1] === "session" && segments.length === 3) {
    const sessionId = segments[2];
    return success(analyticsStore.findBySessionId(sessionId));
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
      if (!isObject(evt) || !isNonEmptyString(evt.eventType)) {
        return error(`events[${i}].eventType is required and must be a non-empty string`);
      }
      inputs.push({
        eventType: evt.eventType as string,
        userId: typeof evt.userId === "string" ? evt.userId : undefined,
        sessionId: typeof evt.sessionId === "string" ? evt.sessionId : undefined,
        properties: isObject(evt.properties) ? (evt.properties as Record<string, unknown>) : undefined,
      });
    }

    const created = analyticsStore.trackBatch(inputs);
    return success(created, 201);
  }

  // DELETE /analytics/events — bulk delete with filter (must check before GET /events/:id)
  if (method === "DELETE" && segments[1] === "events" && segments.length === 2) {
    const eventType = params.get("eventType") ?? undefined;
    const before = params.get("before") ?? undefined;

    if (!eventType && !before) {
      return error("At least one filter (eventType or before) is required");
    }

    const deleted = analyticsStore.deleteBulk({ eventType, before });
    return success({ deleted });
  }

  // POST /analytics/events — track single event
  if (method === "POST" && segments[1] === "events" && segments.length === 2) {
    const body = await parseBody<{ eventType: unknown; userId?: unknown; sessionId?: unknown; properties?: unknown }>(req);
    if (!body) return error("Invalid or missing request body");

    if (!isNonEmptyString(body.eventType)) {
      return error("eventType is required and must be a non-empty string");
    }

    const event = analyticsStore.trackEvent({
      eventType: body.eventType as string,
      userId: typeof body.userId === "string" ? body.userId : undefined,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      properties: isObject(body.properties) ? (body.properties as Record<string, unknown>) : undefined,
    });
    return success(event, 201);
  }

  // GET /analytics/events — list events with optional filters and pagination
  if (method === "GET" && segments[1] === "events" && segments.length === 2) {
    const userId = params.get("userId") ?? undefined;
    const sessionId = params.get("sessionId") ?? undefined;
    const eventType = params.get("eventType") ?? undefined;
    const from = params.get("from") ?? undefined;
    const to = params.get("to") ?? undefined;
    const pageParam = params.get("page");
    const pageSizeParam = params.get("pageSize");

    let events = analyticsStore.getAll();

    // Apply filters
    if (userId || sessionId || eventType || from || to) {
      events = analyticsStore.filterExtended({ userId, sessionId, eventType, from, to });
    }

    const total = events.length;

    // Apply pagination if requested
    if (pageParam !== null || pageSizeParam !== null) {
      const page = pageParam ? parseInt(pageParam, 10) : 1;
      const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 20;
      const start = (page - 1) * pageSize;
      const pageEvents = events.slice(start, start + pageSize);
      return paginated(pageEvents, total, page, pageSize);
    }

    return success(events);
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
