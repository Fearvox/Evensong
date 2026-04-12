// Notifications service — edge case and template tests
import { describe, it, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { resetStores } from "../store";

const BASE = "http://localhost:3006/notifications";
const H = { "Content-Type": "application/json" };
const post = (p: string, b?: unknown) =>
  handleRequest(new Request(`${BASE}${p}`, { method: "POST", headers: H, body: b !== undefined ? JSON.stringify(b) : undefined }));
const get = (p: string) => handleRequest(new Request(`${BASE}${p}`));
const patch = (p: string) => handleRequest(new Request(`${BASE}${p}`, { method: "PATCH" }));
const del = (p: string) => handleRequest(new Request(`${BASE}${p}`, { method: "DELETE" }));
const rawPost = (p: string, raw: string) =>
  handleRequest(new Request(`${BASE}${p}`, { method: "POST", headers: H, body: raw }));
const json = (r: Response) => r.json();
const VALID = { userId: "user-1", type: "order", channel: "email", title: "Order Shipped", body: "Your order #123 has shipped." };

describe("Notifications Edge Cases", () => {
  beforeEach(() => resetStores());

  // --- Delete edge cases ---
  it("DELETE non-existent returns 404", async () => {
    const res = await del("/no-such-id");
    expect(res.status).toBe(404);
  });

  // --- Send edge cases ---
  it("POST /:id/send on non-existent returns 404", async () => {
    const res = await post("/no-such-id/send", {});
    expect(res.status).toBe(404);
  });

  // --- Read/unread on non-existent ---
  it("PATCH non-existent/read returns 404", async () => {
    const res = await patch("/no-such-id/read");
    expect(res.status).toBe(404);
  });

  it("PATCH non-existent/unread returns 404", async () => {
    const res = await patch("/no-such-id/unread");
    expect(res.status).toBe(404);
  });

  // --- Empty/malformed body ---
  it("POST / with empty body returns 400", async () => {
    const res = await handleRequest(
      new Request(BASE, { method: "POST" }),
    );
    expect(res.status).toBe(400);
  });

  it("POST / with malformed JSON returns 400", async () => {
    const res = await rawPost("", "{bad json!!");
    expect(res.status).toBe(400);
  });

  it("POST / with missing body field returns 400", async () => {
    const res = await post("", { userId: "u1", type: "order", channel: "email", title: "T" });
    expect(res.status).toBe(400);
  });

  // --- Bulk mark as read edge cases ---
  it("POST /bulk/read with empty ids returns 400", async () => {
    const res = await post("/bulk/read", { ids: [] });
    expect(res.status).toBe(400);
  });

  it("POST /bulk/read with non-array ids returns 400", async () => {
    const res = await post("/bulk/read", { ids: "not-array" });
    expect(res.status).toBe(400);
  });

  it("POST /bulk/read with non-existent ids returns updated 0", async () => {
    const res = await post("/bulk/read", { ids: ["fake-1", "fake-2"] });
    const data = await json(res);
    expect(data.data.updated).toBe(0);
  });

  // --- Route not found ---
  it("returns 404 for unknown routes", async () => {
    const res = await get("/unknown/path");
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-notifications prefix", async () => {
    const res = await handleRequest(
      new Request("http://localhost:3006/other"),
    );
    expect(res.status).toBe(404);
  });

  // --- User with no notifications ---
  it("GET /user/:userId returns empty for unknown user", async () => {
    const res = await get("/user/ghost-user");
    const data = await json(res);
    expect(data.data).toEqual([]);
  });

  it("GET /user/:userId/unread returns 0 for unknown user", async () => {
    const res = await get("/user/ghost-user/unread");
    const data = await json(res);
    expect(data.data.unread).toBe(0);
  });

  // --- Invalid filter values ---
  it("GET /?type=invalid returns 400", async () => {
    const res = await get("?type=invalid");
    expect(res.status).toBe(400);
  });

  it("GET /?channel=invalid returns 400", async () => {
    const res = await get("?channel=invalid");
    expect(res.status).toBe(400);
  });

  // --- Stats on empty store ---
  it("GET /stats returns zeroes when empty", async () => {
    const res = await get("/stats");
    const data = await json(res);
    expect(data.data.total).toBe(0);
    expect(data.data.sent).toBe(0);
    expect(data.data.read).toBe(0);
  });
});

describe("Notification Templates", () => {
  beforeEach(() => resetStores());

  it("POST /template creates a template", async () => {
    const res = await post("/template", {
      name: "welcome",
      title: "Welcome {{name}}",
      body: "Hello {{name}}, welcome to {{app}}!",
    });
    const data = await json(res);
    expect(res.status).toBe(201);
    expect(data.data.name).toBe("welcome");
    expect(data.data.title).toBe("Welcome {{name}}");
  });

  it("POST /template rejects duplicate name", async () => {
    await post("/template", { name: "dup", title: "T", body: "B" });
    const res = await post("/template", { name: "dup", title: "T2", body: "B2" });
    expect(res.status).toBe(409);
  });

  it("POST /template validates required fields", async () => {
    const res = await post("/template", { name: "" });
    expect(res.status).toBe(400);
  });

  it("POST /from-template creates notification from template", async () => {
    await post("/template", {
      name: "order-shipped",
      title: "Order {{orderId}} shipped",
      body: "Hi {{name}}, your order {{orderId}} is on its way!",
    });
    const res = await post("/from-template", {
      templateName: "order-shipped",
      userId: "user-1",
      type: "order",
      channel: "push",
      variables: { orderId: "ORD-999", name: "Alice" },
    });
    const data = await json(res);
    expect(res.status).toBe(201);
    expect(data.data.title).toBe("Order ORD-999 shipped");
    expect(data.data.body).toBe("Hi Alice, your order ORD-999 is on its way!");
    expect(data.data.channel).toBe("push");
  });

  it("POST /from-template with missing template returns 404", async () => {
    const res = await post("/from-template", {
      templateName: "nonexistent",
      userId: "user-1",
      type: "order",
      channel: "email",
    });
    expect(res.status).toBe(404);
  });

  it("POST /from-template with missing variables leaves placeholders", async () => {
    await post("/template", {
      name: "promo",
      title: "Sale: {{discount}}",
      body: "Use code {{code}} for {{discount}} off!",
    });
    const res = await post("/from-template", {
      templateName: "promo",
      userId: "user-1",
      type: "promotion",
      channel: "in_app",
      variables: {},
    });
    const data = await json(res);
    expect(data.data.title).toBe("Sale: {{discount}}");
    expect(data.data.body).toContain("{{code}}");
  });

  it("POST /from-template validates required fields", async () => {
    const res = await post("/from-template", { templateName: "x" });
    expect(res.status).toBe(400);
  });

  it("POST /from-template with no variables object still works", async () => {
    await post("/template", {
      name: "simple",
      title: "Hello",
      body: "World",
    });
    const res = await post("/from-template", {
      templateName: "simple",
      userId: "user-1",
      type: "system",
      channel: "sms",
    });
    const data = await json(res);
    expect(res.status).toBe(201);
    expect(data.data.title).toBe("Hello");
  });
});
