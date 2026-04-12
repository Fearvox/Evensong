// Notifications service — core tests

import { describe, it, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { resetStores } from "../store";

const BASE = "http://localhost:3006/notifications";

function post(path: string, body: unknown) {
  return handleRequest(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function get(path: string) {
  return handleRequest(new Request(`${BASE}${path}`));
}

function patch(path: string) {
  return handleRequest(new Request(`${BASE}${path}`, { method: "PATCH" }));
}

function del(path: string) {
  return handleRequest(new Request(`${BASE}${path}`, { method: "DELETE" }));
}

async function json(res: Response) {
  return res.json();
}

const VALID = {
  userId: "user-1",
  type: "order",
  channel: "email",
  title: "Order Shipped",
  body: "Your order #123 has shipped.",
};

describe("Notifications Service", () => {
  beforeEach(() => resetStores());

  // --- Health ---
  it("GET /health returns ok", async () => {
    const res = await get("/health");
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.status).toBe("ok");
    expect(data.data.service).toBe("notifications");
  });

  // --- CRUD ---
  it("POST / creates a notification", async () => {
    const res = await post("", VALID);
    const data = await json(res);
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.title).toBe("Order Shipped");
    expect(data.data.read).toBe(false);
    expect(data.data.sentAt).toBeUndefined();
  });

  it("GET /:id returns a notification", async () => {
    const created = await json(await post("", VALID));
    const res = await get(`/${created.data.id}`);
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.id).toBe(created.data.id);
  });

  it("GET /:id returns 404 for unknown id", async () => {
    const res = await get("/nonexistent");
    expect(res.status).toBe(404);
  });

  it("GET / lists notifications with pagination", async () => {
    await post("", VALID);
    await post("", { ...VALID, title: "Second" });
    const res = await get("?page=1&pageSize=1");
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.total).toBe(2);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(1);
  });

  it("DELETE /:id removes a notification", async () => {
    const created = await json(await post("", VALID));
    const res = await del(`/${created.data.id}`);
    expect(res.status).toBe(200);
    const check = await get(`/${created.data.id}`);
    expect(check.status).toBe(404);
  });

  // --- Read / Unread ---
  it("PATCH /:id/read marks as read", async () => {
    const created = await json(await post("", VALID));
    const res = await patch(`/${created.data.id}/read`);
    const data = await json(res);
    expect(data.data.read).toBe(true);
  });

  it("PATCH /:id/unread marks as unread", async () => {
    const created = await json(await post("", VALID));
    await patch(`/${created.data.id}/read`);
    const res = await patch(`/${created.data.id}/unread`);
    const data = await json(res);
    expect(data.data.read).toBe(false);
  });

  it("PATCH /:id/read on already-read is idempotent", async () => {
    const created = await json(await post("", VALID));
    await patch(`/${created.data.id}/read`);
    const res = await patch(`/${created.data.id}/read`);
    const data = await json(res);
    expect(data.data.read).toBe(true);
  });

  // --- Send ---
  it("POST /:id/send sets sentAt", async () => {
    const created = await json(await post("", VALID));
    const res = await post(`/${created.data.id}/send`, {});
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.sentAt).toBeDefined();
  });

  it("POST /:id/send fails if already sent", async () => {
    const created = await json(await post("", VALID));
    await post(`/${created.data.id}/send`, {});
    const res = await post(`/${created.data.id}/send`, {});
    expect(res.status).toBe(400);
  });

  // --- User notifications ---
  it("GET /user/:userId returns user notifications", async () => {
    await post("", VALID);
    await post("", { ...VALID, userId: "user-2" });
    const res = await get("/user/user-1");
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.data[0].userId).toBe("user-1");
  });

  it("GET /user/:userId/unread returns count", async () => {
    await post("", VALID);
    await post("", VALID);
    const created = await json(await post("", VALID));
    await patch(`/${created.data.id}/read`);
    const res = await get("/user/user-1/unread");
    const data = await json(res);
    expect(data.data.unread).toBe(2);
  });

  // --- Bulk mark as read ---
  it("POST /bulk/read marks multiple as read", async () => {
    const n1 = await json(await post("", VALID));
    const n2 = await json(await post("", VALID));
    const res = await post("/bulk/read", { ids: [n1.data.id, n2.data.id] });
    const data = await json(res);
    expect(data.data.updated).toBe(2);
    const check1 = await json(await get(`/${n1.data.id}`));
    expect(check1.data.read).toBe(true);
  });

  // --- Filtering ---
  it("GET /?type=order filters by type", async () => {
    await post("", VALID);
    await post("", { ...VALID, type: "system" });
    const res = await get("?type=order");
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.data[0].type).toBe("order");
  });

  it("GET /?channel=sms filters by channel", async () => {
    await post("", VALID);
    await post("", { ...VALID, channel: "sms" });
    const res = await get("?channel=sms");
    const data = await json(res);
    expect(data.data.length).toBe(1);
  });

  it("GET /?read=false filters unread", async () => {
    const created = await json(await post("", VALID));
    await post("", VALID);
    await patch(`/${created.data.id}/read`);
    const res = await get("?read=false");
    const data = await json(res);
    expect(data.data.length).toBe(1);
  });

  it("GET /?userId=user-1 filters by userId", async () => {
    await post("", VALID);
    await post("", { ...VALID, userId: "user-2" });
    const res = await get("?userId=user-1");
    const data = await json(res);
    expect(data.data.length).toBe(1);
  });

  // --- Stats ---
  it("GET /stats returns statistics", async () => {
    await post("", VALID);
    await post("", { ...VALID, type: "system", channel: "push" });
    const created = await json(await post("", VALID));
    await post(`/${created.data.id}/send`, {});
    const res = await get("/stats");
    const data = await json(res);
    expect(data.data.total).toBe(3);
    expect(data.data.sent).toBe(1);
    expect(data.data.unsent).toBe(2);
    expect(data.data.byType.order).toBe(2);
    expect(data.data.byType.system).toBe(1);
  });

  // --- Validation ---
  it("POST / fails with missing userId", async () => {
    const res = await post("", { ...VALID, userId: "" });
    expect(res.status).toBe(400);
  });

  it("POST / fails with invalid type", async () => {
    const res = await post("", { ...VALID, type: "invalid" });
    expect(res.status).toBe(400);
  });

  it("POST / fails with invalid channel", async () => {
    const res = await post("", { ...VALID, channel: "fax" });
    expect(res.status).toBe(400);
  });

  it("POST / fails with empty title", async () => {
    const res = await post("", { ...VALID, title: "" });
    expect(res.status).toBe(400);
  });
});
