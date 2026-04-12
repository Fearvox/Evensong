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

describe("GET /analytics/user/:userId", () => {
  test("returns user event history", async () => {
    await trackEvent({ eventType: "login", userId: "u1" });
    await trackEvent({ eventType: "click", userId: "u1" });
    await trackEvent({ eventType: "login", userId: "u2" });
    const r = await req("GET", "/analytics/user/u1");
    expect(r.status).toBe(200);
    expect(r.data.data).toHaveLength(2);
    expect(r.data.data.every((e: any) => e.userId === "u1")).toBe(true);
  });

  test("returns empty array for unknown user", async () => {
    const r = await req("GET", "/analytics/user/nobody");
    expect(r.data.data).toHaveLength(0);
  });
});

describe("GET /analytics/session/:sessionId", () => {
  test("returns session events", async () => {
    await trackEvent({ sessionId: "s1", eventType: "a" });
    await trackEvent({ sessionId: "s1", eventType: "b" });
    await trackEvent({ sessionId: "s2", eventType: "c" });
    const r = await req("GET", "/analytics/session/s1");
    expect(r.data.data).toHaveLength(2);
  });

  test("returns empty for unknown session", async () => {
    const r = await req("GET", "/analytics/session/unknown-session");
    expect(r.data.data).toHaveLength(0);
  });
});

describe("GET /analytics/retention", () => {
  test("counts users who did both events within window", async () => {
    // u1 does signup then purchase (same timestamp ~ within 1 day)
    await trackEvent({ eventType: "signup", userId: "u1" });
    await trackEvent({ eventType: "purchase", userId: "u1" });
    // u2 only does signup
    await trackEvent({ eventType: "signup", userId: "u2" });
    const r = await req("GET", "/analytics/retention?eventA=signup&eventB=purchase&days=7");
    expect(r.data.data.count).toBe(1);
  });

  test("returns zero when no users match", async () => {
    await trackEvent({ eventType: "signup", userId: "u1" });
    const r = await req("GET", "/analytics/retention?eventA=signup&eventB=purchase&days=7");
    expect(r.data.data.count).toBe(0);
  });

  test("requires eventA and eventB", async () => {
    const r = await req("GET", "/analytics/retention?eventA=signup");
    expect(r.status).toBe(400);
  });

  test("defaults to 30 days", async () => {
    await trackEvent({ eventType: "a", userId: "u1" });
    await trackEvent({ eventType: "b", userId: "u1" });
    const r = await req("GET", "/analytics/retention?eventA=a&eventB=b");
    expect(r.status).toBe(200);
    expect(r.data.data.count).toBe(1);
  });
});

describe("GET /analytics/top", () => {
  test("returns top event types by count", async () => {
    await trackEvent({ eventType: "click" });
    await trackEvent({ eventType: "click" });
    await trackEvent({ eventType: "click" });
    await trackEvent({ eventType: "view" });
    await trackEvent({ eventType: "view" });
    await trackEvent({ eventType: "purchase" });
    const r = await req("GET", "/analytics/top?limit=2");
    expect(r.data.data).toHaveLength(2);
    expect(r.data.data[0].eventType).toBe("click");
    expect(r.data.data[0].count).toBe(3);
    expect(r.data.data[1].eventType).toBe("view");
  });

  test("defaults to limit 10", async () => {
    await trackEvent({ eventType: "a" });
    const r = await req("GET", "/analytics/top");
    expect(r.status).toBe(200);
    expect(r.data.data).toHaveLength(1);
  });

  test("returns empty when no events", async () => {
    const r = await req("GET", "/analytics/top");
    expect(r.data.data).toHaveLength(0);
  });
});

describe("GET /analytics/stats", () => {
  test("returns overall stats", async () => {
    await trackEvent({ eventType: "a", userId: "u1", sessionId: "s1" });
    await trackEvent({ eventType: "b", userId: "u2", sessionId: "s1" });
    await trackEvent({ eventType: "c", userId: "u1", sessionId: "s2" });
    const r = await req("GET", "/analytics/stats");
    expect(r.data.data.totalEvents).toBe(3);
    expect(r.data.data.uniqueUsers).toBe(2);
    expect(r.data.data.uniqueSessions).toBe(2);
    expect(r.data.data.eventsToday).toBe(3);
  });

  test("returns zeros when empty", async () => {
    const r = await req("GET", "/analytics/stats");
    expect(r.data.data.totalEvents).toBe(0);
    expect(r.data.data.uniqueUsers).toBe(0);
    expect(r.data.data.uniqueSessions).toBe(0);
    expect(r.data.data.eventsToday).toBe(0);
  });
});

describe("DELETE /analytics/events", () => {
  test("deletes by eventType", async () => {
    await trackEvent({ eventType: "click" });
    await trackEvent({ eventType: "click" });
    await trackEvent({ eventType: "view" });
    const r = await req("DELETE", "/analytics/events?eventType=click");
    expect(r.data.data.deleted).toBe(2);
    expect(analyticsStore.count()).toBe(1);
  });

  test("deletes by before date", async () => {
    await trackEvent({ eventType: "old" });
    const future = new Date(Date.now() + 86400000).toISOString();
    const r = await req("DELETE", `/analytics/events?before=${future}`);
    expect(r.data.data.deleted).toBe(1);
  });

  test("requires at least one filter", async () => {
    const r = await req("DELETE", "/analytics/events");
    expect(r.status).toBe(400);
  });

  test("returns 0 when no events match filter", async () => {
    await trackEvent({ eventType: "click" });
    const r = await req("DELETE", "/analytics/events?eventType=nonexistent");
    expect(r.data.data.deleted).toBe(0);
  });
});

describe("GET /analytics/events date range filter", () => {
  test("filters by from and to", async () => {
    await trackEvent({ eventType: "a" });
    const fromDate = new Date(Date.now() - 1000).toISOString();
    const toDate = new Date(Date.now() + 1000).toISOString();
    const r = await req("GET", `/analytics/events?from=${fromDate}&to=${toDate}`);
    expect(r.data.data).toHaveLength(1);
  });

  test("excludes events outside range", async () => {
    await trackEvent({ eventType: "a" });
    const futureFrom = new Date(Date.now() + 86400000).toISOString();
    const futureTo = new Date(Date.now() + 172800000).toISOString();
    const r = await req("GET", `/analytics/events?from=${futureFrom}&to=${futureTo}`);
    expect(r.data.data).toHaveLength(0);
  });
});

describe("Edge: non-analytics prefix", () => {
  test("returns 404 for non-analytics routes", async () => {
    const r = await req("GET", "/users/health");
    expect(r.status).toBe(404);
  });
});

describe("Edge: batch validation", () => {
  test("rejects missing body entirely", async () => {
    const res = await handleRequest(new Request(`${BASE}/analytics/events/batch`, { method: "POST" }));
    expect(res.status).toBe(400);
  });
});

describe("Edge: funnel with events but no userId", () => {
  test("ignores events without userId in funnel", async () => {
    await trackEvent({ eventType: "signup" }); // has default userId u1
    await req("POST", "/analytics/events", { eventType: "signup" }); // no userId
    const r = await req("GET", "/analytics/funnel?steps=signup");
    expect(r.data.data[0].users).toBe(1);
  });
});
