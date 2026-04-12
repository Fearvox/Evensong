import { describe, test, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { analyticsStore } from "../store";

beforeEach(() => analyticsStore.clear());

const BASE = "http://localhost:3007";

async function req(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await handleRequest(new Request(`${BASE}${path}`, opts));
  return { status: res.status, data: await res.json() };
}

async function trackEvent(overrides: Record<string, unknown> = {}) {
  const r = await req("POST", "/analytics/events", { eventType: "page_view", userId: "u1", ...overrides });
  return r.data.data;
}

describe("POST /analytics/events", () => {
  test("tracks a single event", async () => {
    const r = await req("POST", "/analytics/events", { eventType: "click", userId: "u1", sessionId: "s1" });
    expect(r.status).toBe(201);
    expect(r.data.data.eventType).toBe("click");
    expect(r.data.data.userId).toBe("u1");
    expect(r.data.data.sessionId).toBe("s1");
    expect(r.data.data.id).toBeDefined();
    expect(r.data.data.timestamp).toBeDefined();
  });

  test("tracks event with properties", async () => {
    const r = await req("POST", "/analytics/events", {
      eventType: "purchase",
      properties: { amount: 99, item: "widget" },
    });
    expect(r.data.data.properties.amount).toBe(99);
    expect(r.data.data.properties.item).toBe("widget");
  });

  test("tracks event without optional fields", async () => {
    const r = await req("POST", "/analytics/events", { eventType: "ping" });
    expect(r.status).toBe(201);
    expect(r.data.data.userId).toBeUndefined();
    expect(r.data.data.sessionId).toBeUndefined();
    expect(r.data.data.properties).toEqual({});
  });

  test("rejects missing eventType", async () => {
    const r = await req("POST", "/analytics/events", {});
    expect(r.status).toBe(400);
    expect(r.data.error).toContain("eventType");
  });

  test("rejects empty body", async () => {
    const res = await handleRequest(new Request(`${BASE}/analytics/events`, { method: "POST" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /analytics/events/batch", () => {
  test("tracks multiple events", async () => {
    const r = await req("POST", "/analytics/events/batch", {
      events: [
        { eventType: "a", userId: "u1" },
        { eventType: "b", userId: "u2" },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.data.data).toHaveLength(2);
    expect(r.data.data[0].eventType).toBe("a");
    expect(r.data.data[1].eventType).toBe("b");
  });

  test("rejects non-array events", async () => {
    const r = await req("POST", "/analytics/events/batch", { events: "not-array" });
    expect(r.status).toBe(400);
  });

  test("rejects empty events array", async () => {
    const r = await req("POST", "/analytics/events/batch", { events: [] });
    expect(r.status).toBe(400);
  });

  test("validates each event in batch", async () => {
    const r = await req("POST", "/analytics/events/batch", {
      events: [{ eventType: "ok" }, { notEventType: true }],
    });
    expect(r.status).toBe(400);
  });
});

describe("GET /analytics/events", () => {
  test("lists all events with pagination", async () => {
    await trackEvent({ eventType: "a" });
    await trackEvent({ eventType: "b" });
    await trackEvent({ eventType: "c" });
    const r = await req("GET", "/analytics/events?page=1&pageSize=2");
    expect(r.status).toBe(200);
    expect(r.data.data).toHaveLength(2);
    expect(r.data.total).toBe(3);
    expect(r.data.page).toBe(1);
  });

  test("filters by eventType", async () => {
    await trackEvent({ eventType: "click" });
    await trackEvent({ eventType: "view" });
    const r = await req("GET", "/analytics/events?eventType=click");
    expect(r.data.data).toHaveLength(1);
    expect(r.data.data[0].eventType).toBe("click");
  });

  test("filters by userId", async () => {
    await trackEvent({ userId: "u1" });
    await trackEvent({ userId: "u2" });
    const r = await req("GET", "/analytics/events?userId=u1");
    expect(r.data.data).toHaveLength(1);
  });

  test("filters by sessionId", async () => {
    await trackEvent({ sessionId: "s1" });
    await trackEvent({ sessionId: "s2" });
    const r = await req("GET", "/analytics/events?sessionId=s1");
    expect(r.data.data).toHaveLength(1);
  });
});

describe("GET /analytics/events/:id", () => {
  test("returns event by id", async () => {
    const event = await trackEvent();
    const r = await req("GET", `/analytics/events/${event.id}`);
    expect(r.status).toBe(200);
    expect(r.data.data.id).toBe(event.id);
  });

  test("returns 404 for unknown id", async () => {
    const r = await req("GET", "/analytics/events/nonexistent");
    expect(r.status).toBe(404);
  });
});

describe("GET /analytics/aggregate", () => {
  test("aggregates by event type", async () => {
    await trackEvent({ eventType: "click", userId: "u1" });
    await trackEvent({ eventType: "click", userId: "u2" });
    await trackEvent({ eventType: "click", userId: "u1" });
    const r = await req("GET", "/analytics/aggregate?eventType=click");
    expect(r.data.data.count).toBe(3);
    expect(r.data.data.uniqueUsers).toBe(2);
  });

  test("returns zeros for non-existent event type", async () => {
    const r = await req("GET", "/analytics/aggregate?eventType=nonexistent");
    expect(r.data.data.count).toBe(0);
    expect(r.data.data.uniqueUsers).toBe(0);
  });

  test("requires eventType parameter", async () => {
    const r = await req("GET", "/analytics/aggregate");
    expect(r.status).toBe(400);
  });
});

describe("GET /analytics/funnel", () => {
  test("calculates 2-step funnel", async () => {
    await trackEvent({ eventType: "signup", userId: "u1" });
    await trackEvent({ eventType: "purchase", userId: "u1" });
    await trackEvent({ eventType: "signup", userId: "u2" });
    const r = await req("GET", "/analytics/funnel?steps=signup,purchase");
    expect(r.data.data).toHaveLength(2);
    expect(r.data.data[0]).toEqual({ step: "signup", users: 2 });
    expect(r.data.data[1]).toEqual({ step: "purchase", users: 1 });
  });

  test("calculates 3-step funnel", async () => {
    await trackEvent({ eventType: "visit", userId: "u1" });
    await trackEvent({ eventType: "signup", userId: "u1" });
    await trackEvent({ eventType: "purchase", userId: "u1" });
    await trackEvent({ eventType: "visit", userId: "u2" });
    await trackEvent({ eventType: "signup", userId: "u2" });
    await trackEvent({ eventType: "visit", userId: "u3" });
    const r = await req("GET", "/analytics/funnel?steps=visit,signup,purchase");
    expect(r.data.data[0].users).toBe(3);
    expect(r.data.data[1].users).toBe(2);
    expect(r.data.data[2].users).toBe(1);
  });

  test("single step funnel", async () => {
    await trackEvent({ eventType: "click", userId: "u1" });
    const r = await req("GET", "/analytics/funnel?steps=click");
    expect(r.data.data).toHaveLength(1);
    expect(r.data.data[0].users).toBe(1);
  });

  test("funnel with no completions", async () => {
    await trackEvent({ eventType: "visit", userId: "u1" });
    const r = await req("GET", "/analytics/funnel?steps=signup,purchase");
    expect(r.data.data[0].users).toBe(0);
    expect(r.data.data[1].users).toBe(0);
  });

  test("requires steps parameter", async () => {
    const r = await req("GET", "/analytics/funnel");
    expect(r.status).toBe(400);
  });
});

describe("GET /analytics/health", () => {
  test("returns health status", async () => {
    const r = await req("GET", "/analytics/health");
    expect(r.status).toBe(200);
    expect(r.data.data.status).toBe("ok");
    expect(r.data.data.service).toBe("analytics");
  });
});

describe("Route not found", () => {
  test("returns 404 for unknown route", async () => {
    const r = await req("GET", "/analytics/unknown");
    expect(r.status).toBe(404);
  });
});
