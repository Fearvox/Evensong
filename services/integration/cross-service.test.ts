import { describe, test, expect } from "bun:test";

// Cross-service integration tests
// Imports adapted to each service's actual export pattern

import { register, login, getProfile } from "../auth/handlers";
import { handleRequest as productsHandler } from "../products/handlers";
import { handleRequest as usersHandler } from "../users/handlers";
import { handleRequest as paymentsHandler } from "../payments/handlers";
import { handleRequest as notificationsHandler } from "../notifications/handlers";
import { handleRequest as analyticsHandler } from "../analytics/handlers";

import { OrderStore } from "../orders/store";
import { createRouter as createOrderRouter } from "../orders/handlers";

import { SearchEngine } from "../search/store";
import { createRouter as createSearchRouter } from "../search/handlers";

// Setup orders and search (both use factory pattern → handleRequest(req))
const ordersRoute = createOrderRouter(new OrderStore());
const searchHandler = createSearchRouter(new SearchEngine());

// Call helper
async function call(
  handler: (req: Request) => Response | Promise<Response>,
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any }> {
  const req = new Request(`http://localhost${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}

describe("Cross-Service Integration", () => {
  test("full e-commerce: register → product → order → pay → notify → track → search", async () => {
    // 1. Register user (auth)
    const reg = await call(register, "/users/register", {
      method: "POST",
      body: { email: "integ@test.com", password: "securePass1234", name: "Integration User" },
    });
    expect(reg.status).toBe(201);
    expect(reg.body.success).toBe(true);
    const userId = reg.body.data.user.id;
    const token = reg.body.data.token;

    // 2. Login (auth)
    const lg = await call(login, "/auth/login", {
      method: "POST",
      body: { email: "integ@test.com", password: "securePass1234" },
    });
    expect(lg.status).toBe(200);
    expect(lg.body.data.token).toBeDefined();

    // 3. Profile (auth)
    const prof = await call(getProfile, "/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(prof.status).toBe(200);
    expect(prof.body.data.email).toBe("integ@test.com");

    // 4. Create product
    const prod = await call(productsHandler, "/products", {
      method: "POST",
      body: { name: "Widget", description: "A test widget", price: 29.99, currency: "USD", category: "electronics", stock: 100, tags: ["test"] },
    });
    expect(prod.status).toBe(201);
    const productId = prod.body.data.id;

    // 5. Create order (uses price field, not unitPrice)
    const ord = await call(ordersRoute, "/orders", {
      method: "POST",
      body: { userId, items: [{ productId, name: "Widget", quantity: 2, price: 29.99 }], shippingAddress: "123 Test St" },
    });
    expect(ord.status).toBe(201);
    expect(ord.body.data.total).toBe(59.98);
    const orderId = ord.body.data.id;

    // 6. Confirm order
    const conf = await call(ordersRoute, `/orders/${orderId}/status`, { method: "PUT", body: { status: "confirmed" } });
    expect(conf.status).toBe(200);
    expect(conf.body.data.status).toBe("confirmed");

    // 7. Create + process payment
    const pay = await call(paymentsHandler, "/payments", {
      method: "POST",
      body: { orderId, userId, amount: 59.98, currency: "USD", method: "credit_card" },
    });
    expect(pay.status).toBe(201);
    const paymentId = pay.body.data.id;

    const proc = await call(paymentsHandler, `/payments/${paymentId}/process`, { method: "POST" });
    expect(proc.status).toBe(200);
    expect(proc.body.data.status).toBe("completed");

    // 8. Create + send notification
    const notif = await call(notificationsHandler, "/notifications", {
      method: "POST",
      body: { userId, type: "order", channel: "email", title: "Order Confirmed", body: `Order ${orderId} confirmed.` },
    });
    expect(notif.status).toBe(201);
    const notifId = notif.body.data.id;

    const sent = await call(notificationsHandler, `/notifications/${notifId}/send`, { method: "POST" });
    expect(sent.status).toBe(200);
    expect(sent.body.data.sentAt).toBeDefined();

    // 9. Track analytics event (uses "name" field, not "eventType")
    const evt = await call(analyticsHandler, "/analytics/events", {
      method: "POST",
      body: { name: "purchase_completed", userId, sessionId: "sess-1", properties: { orderId, paymentId } },
    });
    expect(evt.status).toBe(201);

    // 10. Index + search (search needs id, collection, content as string)
    const idx = await call(searchHandler, "/search/index", {
      method: "POST",
      body: { id: orderId, collection: "orders", content: `Order ${orderId} Widget confirmed` },
    });
    expect(idx.status).toBe(201);

    const srch = await call(searchHandler, "/search/query", {
      method: "POST",
      body: { query: "Widget", collection: "orders" },
    });
    expect(srch.status).toBe(200);
    expect(srch.body.data.results.length).toBeGreaterThan(0);
  });

  test("duplicate registration → 409", async () => {
    const body = { email: "dup-integ@test.com", password: "password123", name: "Dup" };
    const f = await call(register, "/users/register", { method: "POST", body });
    expect(f.status).toBe(201);
    const s = await call(register, "/users/register", { method: "POST", body });
    expect(s.status).toBe(409);
  });

  test("payment refund workflow", async () => {
    const c = await call(paymentsHandler, "/payments", {
      method: "POST",
      body: { orderId: "ro-1", userId: "ru-1", amount: 100, currency: "USD", method: "credit_card" },
    });
    expect(c.status).toBe(201);
    const pid = c.body.data.id;

    const p = await call(paymentsHandler, `/payments/${pid}/process`, { method: "POST" });
    expect(p.body.data.status).toBe("completed");

    const r = await call(paymentsHandler, `/payments/${pid}/refund`, { method: "POST" });
    // Refund creates new record → 201, original marked as refunded
    expect(r.status).toBe(201);
    expect(r.body.data.original.status).toBe("refunded");
  });

  test("order status chain + timeline", async () => {
    const c = await call(ordersRoute, "/orders", {
      method: "POST",
      body: { userId: "chain-u", items: [{ productId: "p1", name: "X", quantity: 1, price: 10 }], shippingAddress: "addr" },
    });
    expect(c.status).toBe(201);
    const oid = c.body.data.id;

    for (const status of ["confirmed", "shipped", "delivered"]) {
      const r = await call(ordersRoute, `/orders/${oid}/status`, { method: "PUT", body: { status } });
      expect(r.status).toBe(200);
      expect(r.body.data.status).toBe(status);
    }

    const tl = await call(ordersRoute, `/orders/${oid}/timeline`);
    expect(tl.status).toBe(200);
    expect(tl.body.data.length).toBeGreaterThanOrEqual(3);
  });

  test("large payment (>10000) fails processing", async () => {
    const c = await call(paymentsHandler, "/payments", {
      method: "POST",
      body: { orderId: "lo", userId: "lu", amount: 15000, currency: "USD", method: "credit_card" },
    });
    const p = await call(paymentsHandler, `/payments/${c.body.data.id}/process`, { method: "POST" });
    expect(p.body.data.status).toBe("failed");
  });

  test("product stock adjustment", async () => {
    const c = await call(productsHandler, "/products", {
      method: "POST",
      body: { name: "StockItem", description: "t", price: 15, currency: "USD", category: "t", stock: 50, tags: [] },
    });
    const pid = c.body.data.id;

    // Products use "quantity" field for stock adjustment
    const d = await call(productsHandler, `/products/${pid}/stock`, { method: "POST", body: { quantity: -10 } });
    expect(d.status).toBe(200);
    expect(d.body.data.stock).toBe(40);

    const o = await call(productsHandler, `/products/${pid}/stock`, { method: "POST", body: { quantity: -50 } });
    expect(o.status).toBe(400);
  });

  test("user creation and search", async () => {
    // Users: POST /users requires admin header, search via GET /users?search=
    await call(usersHandler, "/users", {
      method: "POST",
      body: { email: "alice-i@t.com", name: "Alice Smith", role: "user" },
      headers: { "x-role": "admin" },
    });

    const r = await call(usersHandler, "/users?search=alice");
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    expect(r.body.data[0].name).toContain("Alice");
  });

  test("search index and query", async () => {
    await call(searchHandler, "/search/index", {
      method: "POST",
      body: { id: "doc-1", collection: "articles", content: "Advanced TypeScript Patterns for Microservices" },
    });
    await call(searchHandler, "/search/index", {
      method: "POST",
      body: { id: "doc-2", collection: "articles", content: "Building Scalable Microservices with Bun Runtime" },
    });

    const r = await call(searchHandler, "/search/query", {
      method: "POST",
      body: { query: "microservices", collection: "articles" },
    });
    expect(r.status).toBe(200);
    expect(r.body.data.results.length).toBe(2);
  });

  test("analytics event tracking and listing", async () => {
    const e = await call(analyticsHandler, "/analytics/events", {
      method: "POST",
      body: { name: "page_view", userId: "av-user", sessionId: "av-sess", properties: { page: "/home" } },
    });
    expect(e.status).toBe(201);

    const list = await call(analyticsHandler, "/analytics/events");
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
  });
});
