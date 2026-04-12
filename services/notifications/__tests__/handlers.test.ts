// Notifications service — handler tests covering CRUD, send, read, templates, bulk

import { describe, test, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { resetStores } from "../store";

const BASE = "http://localhost:3006";

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(`${BASE}${path}`, opts);
}

async function json(r: Response) {
  return r.json();
}

const VALID = {
  userId: "user-1",
  type: "order",
  channel: "email",
  title: "Order Shipped",
  body: "Your order #123 has shipped.",
};

async function createNotification(overrides: Record<string, unknown> = {}) {
  const res = await handleRequest(req("POST", "/notifications", { ...VALID, ...overrides }));
  return { res, data: await json(res) };
}

async function createTemplate(overrides: Record<string, unknown> = {}) {
  const payload = {
    name: "welcome",
    channel: "email",
    subject: "Welcome {{name}}",
    body: "Hello {{name}}, welcome to {{app}}!",
    ...overrides,
  };
  const res = await handleRequest(req("POST", "/notifications/templates", payload));
  return { res, data: await json(res) };
}

// ---- CRUD ----

describe("Notifications — Create", () => {
  beforeEach(() => resetStores());

  test("POST /notifications creates a notification with 201", async () => {
    const { res, data } = await createNotification();
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.title).toBe("Order Shipped");
    expect(data.data.body).toBe("Your order #123 has shipped.");
    expect(data.data.userId).toBe("user-1");
    expect(data.data.type).toBe("order");
    expect(data.data.channel).toBe("email");
    expect(data.data.read).toBe(false);
    expect(data.data.sentAt).toBeUndefined();
    expect(data.data.id).toBeDefined();
    expect(data.data.createdAt).toBeDefined();
  });

  test("POST /notifications accepts non-enum type strings (flexible)", async () => {
    const { res, data } = await createNotification({ type: "order_confirmation" });
    expect(res.status).toBe(201);
    expect(data.data.type).toBe("order_confirmation");
  });

  test("POST /notifications accepts payment_failed as type", async () => {
    const { res, data } = await createNotification({ type: "payment_failed" });
    expect(res.status).toBe(201);
    expect(data.data.type).toBe("payment_failed");
  });

  test("POST /notifications accepts refund_processed as type", async () => {
    const { res } = await createNotification({ type: "refund_processed" });
    expect(res.status).toBe(201);
  });

  test("POST /notifications rejects missing userId", async () => {
    const res = await handleRequest(req("POST", "/notifications", { ...VALID, userId: "" }));
    expect(res.status).toBe(400);
  });

  test("POST /notifications rejects missing type", async () => {
    const res = await handleRequest(req("POST", "/notifications", { ...VALID, type: "" }));
    expect(res.status).toBe(400);
  });

  test("POST /notifications rejects missing title", async () => {
    const res = await handleRequest(req("POST", "/notifications", { ...VALID, title: "" }));
    expect(res.status).toBe(400);
  });

  test("POST /notifications rejects missing body", async () => {
    const res = await handleRequest(req("POST", "/notifications", { ...VALID, body: "" }));
    expect(res.status).toBe(400);
  });

  test("POST /notifications rejects null body", async () => {
    const res = await handleRequest(new Request(`${BASE}/notifications`, { method: "POST" }));
    expect(res.status).toBe(400);
  });
});

describe("Notifications — Read & List", () => {
  beforeEach(() => resetStores());

  test("GET /notifications lists all notifications", async () => {
    await createNotification();
    await createNotification({ title: "Second" });
    const res = await handleRequest(req("GET", "/notifications"));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.length).toBe(2);
  });

  test("GET /notifications/:id returns notification by id", async () => {
    const { data: created } = await createNotification();
    const res = await handleRequest(req("GET", `/notifications/${created.data.id}`));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.id).toBe(created.data.id);
    expect(data.data.title).toBe("Order Shipped");
  });

  test("GET /notifications/:id returns 404 for unknown id", async () => {
    const res = await handleRequest(req("GET", "/notifications/nonexistent"));
    expect(res.status).toBe(404);
  });

  test("GET /notifications?userId= filters by userId", async () => {
    await createNotification({ userId: "user-1" });
    await createNotification({ userId: "user-2" });
    const res = await handleRequest(req("GET", "/notifications?userId=user-1"));
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.data[0].userId).toBe("user-1");
  });

  test("GET /notifications?read=false filters unread", async () => {
    const { data: n1 } = await createNotification();
    await createNotification();
    await handleRequest(req("POST", `/notifications/${n1.data.id}/read`));
    const res = await handleRequest(req("GET", "/notifications?read=false"));
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.data[0].read).toBe(false);
  });

  test("GET /notifications?read=true filters read", async () => {
    const { data: n1 } = await createNotification();
    await createNotification();
    await handleRequest(req("POST", `/notifications/${n1.data.id}/read`));
    const res = await handleRequest(req("GET", "/notifications?read=true"));
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.data[0].read).toBe(true);
  });

  test("GET /notifications?type= filters by type", async () => {
    await createNotification({ type: "order" });
    await createNotification({ type: "system" });
    const res = await handleRequest(req("GET", "/notifications?type=order"));
    const data = await json(res);
    expect(data.data.length).toBe(1);
    expect(data.data[0].type).toBe("order");
  });
});

describe("Notifications — Update & Delete", () => {
  beforeEach(() => resetStores());

  test("PUT /notifications/:id updates title", async () => {
    const { data: created } = await createNotification();
    const res = await handleRequest(req("PUT", `/notifications/${created.data.id}`, { title: "Updated Title" }));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.title).toBe("Updated Title");
    expect(data.data.body).toBe("Your order #123 has shipped.");
  });

  test("PUT /notifications/:id updates body", async () => {
    const { data: created } = await createNotification();
    const res = await handleRequest(req("PUT", `/notifications/${created.data.id}`, { body: "New body" }));
    const data = await json(res);
    expect(data.data.body).toBe("New body");
  });

  test("PUT /notifications/:id updates read status", async () => {
    const { data: created } = await createNotification();
    const res = await handleRequest(req("PUT", `/notifications/${created.data.id}`, { read: true }));
    const data = await json(res);
    expect(data.data.read).toBe(true);
  });

  test("PUT /notifications/:id returns 404 for unknown id", async () => {
    const res = await handleRequest(req("PUT", "/notifications/nonexistent", { title: "X" }));
    expect(res.status).toBe(404);
  });

  test("PUT /notifications/:id rejects invalid title", async () => {
    const { data: created } = await createNotification();
    const res = await handleRequest(req("PUT", `/notifications/${created.data.id}`, { title: "" }));
    expect(res.status).toBe(400);
  });

  test("DELETE /notifications/:id deletes notification", async () => {
    const { data: created } = await createNotification();
    const res = await handleRequest(req("DELETE", `/notifications/${created.data.id}`));
    expect(res.status).toBe(200);
    const check = await handleRequest(req("GET", `/notifications/${created.data.id}`));
    expect(check.status).toBe(404);
  });

  test("DELETE /notifications/:id returns 404 for unknown id", async () => {
    const res = await handleRequest(req("DELETE", "/notifications/nonexistent"));
    expect(res.status).toBe(404);
  });
});

// ---- Send & Read actions ----

describe("Notifications — Send & Read Actions", () => {
  beforeEach(() => resetStores());

  test("POST /notifications/:id/send marks as sent with sentAt", async () => {
    const { data: created } = await createNotification();
    const res = await handleRequest(req("POST", `/notifications/${created.data.id}/send`));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.sentAt).toBeDefined();
    expect(typeof data.data.sentAt).toBe("string");
  });

  test("POST /notifications/:id/send fails if already sent", async () => {
    const { data: created } = await createNotification();
    await handleRequest(req("POST", `/notifications/${created.data.id}/send`));
    const res = await handleRequest(req("POST", `/notifications/${created.data.id}/send`));
    expect(res.status).toBe(400);
  });

  test("POST /notifications/:id/send returns 404 for unknown id", async () => {
    const res = await handleRequest(req("POST", "/notifications/nonexistent/send"));
    expect(res.status).toBe(404);
  });

  test("POST /notifications/:id/read marks as read", async () => {
    const { data: created } = await createNotification();
    expect(created.data.read).toBe(false);
    const res = await handleRequest(req("POST", `/notifications/${created.data.id}/read`));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.read).toBe(true);
  });

  test("POST /notifications/:id/read returns 404 for unknown id", async () => {
    const res = await handleRequest(req("POST", "/notifications/nonexistent/read"));
    expect(res.status).toBe(404);
  });

  test("POST /notifications/:id/read is idempotent", async () => {
    const { data: created } = await createNotification();
    await handleRequest(req("POST", `/notifications/${created.data.id}/read`));
    const res = await handleRequest(req("POST", `/notifications/${created.data.id}/read`));
    const data = await json(res);
    expect(data.data.read).toBe(true);
  });
});

// ---- Bulk Send ----

describe("Notifications — Bulk Send", () => {
  beforeEach(() => resetStores());

  test("POST /notifications/bulk-send creates notifications for all userIds", async () => {
    const res = await handleRequest(req("POST", "/notifications/bulk-send", {
      userIds: ["user-1", "user-2", "user-3"],
      type: "promotion",
      channel: "push",
      title: "Flash Sale!",
      body: "50% off everything",
    }));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.sent).toBe(3);
    expect(data.data.notifications.length).toBe(3);
    const userIds = data.data.notifications.map((n: any) => n.userId);
    expect(userIds).toContain("user-1");
    expect(userIds).toContain("user-2");
    expect(userIds).toContain("user-3");
  });

  test("POST /notifications/bulk-send each notification has correct fields", async () => {
    const res = await handleRequest(req("POST", "/notifications/bulk-send", {
      userIds: ["user-A"],
      type: "alert",
      channel: "sms",
      title: "Alert",
      body: "Something happened",
    }));
    const data = await json(res);
    const n = data.data.notifications[0];
    expect(n.type).toBe("alert");
    expect(n.channel).toBe("sms");
    expect(n.title).toBe("Alert");
    expect(n.read).toBe(false);
  });

  test("POST /notifications/bulk-send rejects empty userIds", async () => {
    const res = await handleRequest(req("POST", "/notifications/bulk-send", {
      userIds: [],
      type: "order",
      channel: "email",
      title: "T",
      body: "B",
    }));
    expect(res.status).toBe(400);
  });

  test("POST /notifications/bulk-send rejects missing fields", async () => {
    const res = await handleRequest(req("POST", "/notifications/bulk-send", {
      userIds: ["user-1"],
    }));
    expect(res.status).toBe(400);
  });
});

// ---- Unread Count ----

describe("Notifications — Unread Count", () => {
  beforeEach(() => resetStores());

  test("GET /notifications/unread-count?userId= returns count", async () => {
    await createNotification({ userId: "user-1" });
    await createNotification({ userId: "user-1" });
    await createNotification({ userId: "user-2" });
    const res = await handleRequest(req("GET", "/notifications/unread-count?userId=user-1"));
    const data = await json(res);
    expect(res.status).toBe(200);
    expect(data.data.userId).toBe("user-1");
    expect(data.data.count).toBe(2);
  });

  test("GET /notifications/unread-count decreases after marking read", async () => {
    const { data: n1 } = await createNotification({ userId: "user-1" });
    await createNotification({ userId: "user-1" });
    await handleRequest(req("POST", `/notifications/${n1.data.id}/read`));
    const res = await handleRequest(req("GET", "/notifications/unread-count?userId=user-1"));
    const data = await json(res);
    expect(data.data.count).toBe(1);
  });

  test("GET /notifications/unread-count returns 0 for unknown user", async () => {
    const res = await handleRequest(req("GET", "/notifications/unread-count?userId=ghost"));
    const data = await json(res);
    expect(data.data.count).toBe(0);
  });

  test("GET /notifications/unread-count rejects missing userId", async () => {
    const res = await handleRequest(req("GET", "/notifications/unread-count"));
    expect(res.status).toBe(400);
  });
});

// ---- Templates ----

describe("Notifications — Templates", () => {
  beforeEach(() => resetStores());

  test("POST /notifications/templates creates a template with 201", async () => {
    const { res, data } = await createTemplate();
    expect(res.status).toBe(201);
    expect(data.data.name).toBe("welcome");
    expect(data.data.channel).toBe("email");
    expect(data.data.subject).toBe("Welcome {{name}}");
    expect(data.data.body).toBe("Hello {{name}}, welcome to {{app}}!");
    expect(data.data.id).toBeDefined();
  });

  test("GET /notifications/templates lists all templates", async () => {
    await createTemplate({ name: "tmpl-1" });
    await createTemplate({ name: "tmpl-2" });
    const res = await handleRequest(req("GET", "/notifications/templates"));
    const data = await json(res);
    expect(data.data.length).toBe(2);
  });

  test("POST /notifications/templates rejects missing name", async () => {
    const res = await handleRequest(req("POST", "/notifications/templates", {
      channel: "email", subject: "S", body: "B",
    }));
    expect(res.status).toBe(400);
  });

  test("POST /notifications/templates rejects missing subject", async () => {
    const res = await handleRequest(req("POST", "/notifications/templates", {
      name: "t", channel: "email", body: "B",
    }));
    expect(res.status).toBe(400);
  });

  test("POST /notifications/from-template creates notification from template", async () => {
    const { data: tmpl } = await createTemplate({
      name: "order-shipped",
      channel: "push",
      subject: "Order {{orderId}} shipped",
      body: "Hi {{name}}, your order {{orderId}} is on its way!",
    });
    const res = await handleRequest(req("POST", "/notifications/from-template", {
      templateId: tmpl.data.id,
      userId: "user-1",
      variables: { orderId: "ORD-999", name: "Alice" },
    }));
    const data = await json(res);
    expect(res.status).toBe(201);
    expect(data.data.title).toBe("Order ORD-999 shipped");
    expect(data.data.body).toBe("Hi Alice, your order ORD-999 is on its way!");
    expect(data.data.userId).toBe("user-1");
  });

  test("POST /notifications/from-template returns 404 for unknown template", async () => {
    const res = await handleRequest(req("POST", "/notifications/from-template", {
      templateId: "nonexistent",
      userId: "user-1",
    }));
    expect(res.status).toBe(404);
  });

  test("POST /notifications/from-template leaves unreplaced placeholders", async () => {
    const { data: tmpl } = await createTemplate({
      name: "promo",
      subject: "Sale: {{discount}}",
      body: "Use code {{code}} for {{discount}} off!",
    });
    const res = await handleRequest(req("POST", "/notifications/from-template", {
      templateId: tmpl.data.id,
      userId: "user-1",
      variables: {},
    }));
    const data = await json(res);
    expect(data.data.title).toBe("Sale: {{discount}}");
    expect(data.data.body).toContain("{{code}}");
  });

  test("POST /notifications/from-template works without variables object", async () => {
    const { data: tmpl } = await createTemplate({
      name: "simple",
      subject: "Hello",
      body: "Static body",
    });
    const res = await handleRequest(req("POST", "/notifications/from-template", {
      templateId: tmpl.data.id,
      userId: "user-1",
    }));
    const data = await json(res);
    expect(res.status).toBe(201);
    expect(data.data.title).toBe("Hello");
    expect(data.data.body).toBe("Static body");
  });

  test("POST /notifications/from-template rejects missing templateId", async () => {
    const res = await handleRequest(req("POST", "/notifications/from-template", {
      userId: "user-1",
    }));
    expect(res.status).toBe(400);
  });
});

// ---- Route not found ----

describe("Notifications — Routing", () => {
  beforeEach(() => resetStores());

  test("returns 404 for non-notifications prefix", async () => {
    const res = await handleRequest(req("GET", "/other"));
    expect(res.status).toBe(404);
  });

  test("returns 404 for unknown sub-route", async () => {
    const res = await handleRequest(req("GET", "/notifications/unknown/path/deep"));
    expect(res.status).toBe(404);
  });
});
