import { describe, test, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { orderStore } from "../store";

const BASE = "http://localhost:3004";

function post(path: string, body: unknown) {
  return handleRequest(new Request(`${BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}
function get(path: string) {
  return handleRequest(new Request(`${BASE}${path}`));
}
function put(path: string, body: unknown) {
  return handleRequest(new Request(`${BASE}${path}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}
function del(path: string) {
  return handleRequest(new Request(`${BASE}${path}`, { method: "DELETE" }));
}
function patch(path: string, body: unknown) {
  return handleRequest(new Request(`${BASE}${path}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

const VALID_ITEM = { productId: "p1", name: "Widget", quantity: 2, unitPrice: 9.99 };
const VALID_ORDER = { userId: "u1", items: [VALID_ITEM], currency: "USD" };

async function json(res: Response) { return res.json(); }

describe("Validation edge cases", () => {
  beforeEach(() => orderStore.clear());

  test("POST /orders — missing userId", async () => {
    const res = await post("/orders", { items: [VALID_ITEM], currency: "USD" });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("userId");
  });

  test("POST /orders — empty items array", async () => {
    const res = await post("/orders", { userId: "u1", items: [], currency: "USD" });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("items");
  });

  test("POST /orders — negative price", async () => {
    const res = await post("/orders", {
      userId: "u1", items: [{ ...VALID_ITEM, unitPrice: -5 }], currency: "USD",
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("unitPrice");
  });

  test("POST /orders — zero quantity", async () => {
    const res = await post("/orders", {
      userId: "u1", items: [{ ...VALID_ITEM, quantity: 0 }], currency: "USD",
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("quantity");
  });

  test("POST /orders — fractional quantity", async () => {
    const res = await post("/orders", {
      userId: "u1", items: [{ ...VALID_ITEM, quantity: 1.5 }], currency: "USD",
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("quantity");
  });

  test("POST /orders — missing currency defaults to USD", async () => {
    const res = await post("/orders", { userId: "u1", items: [VALID_ITEM] });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data.currency).toBe("USD");
  });

  test("POST /orders — empty body", async () => {
    const res = await handleRequest(new Request(`${BASE}/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "",
    }));
    expect(res.status).toBe(400);
  });

  test("POST /orders — item missing productId", async () => {
    const res = await post("/orders", {
      userId: "u1", items: [{ name: "X", quantity: 1, unitPrice: 10 }], currency: "USD",
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("productId");
  });

  test("PATCH /orders/:id/status — missing status", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await patch(`/orders/${c.data.id}/status`, {});
    expect(res.status).toBe(400);
  });

  test("PATCH /orders/:id/status — invalid status value", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await patch(`/orders/${c.data.id}/status`, { status: "flying" });
    expect(res.status).toBe(400);
  });

  test("PATCH /orders/:id/status — order not found", async () => {
    const res = await patch("/orders/nonexistent/status", { status: "confirmed" });
    expect(res.status).toBe(404);
  });
});

describe("Update & delete edge cases", () => {
  beforeEach(() => orderStore.clear());

  test("PUT /orders/:id — cannot update non-pending order", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    const res = await put(`/orders/${c.data.id}`, { shippingAddress: "new" });
    expect(res.status).toBe(409);
  });

  test("PUT /orders/:id — not found", async () => {
    const res = await put("/orders/nope", { shippingAddress: "new" });
    expect(res.status).toBe(404);
  });

  test("PUT /orders/:id — empty body", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await handleRequest(new Request(`${BASE}/orders/${c.data.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: "",
    }));
    expect(res.status).toBe(400);
  });

  test("DELETE /orders/:id — cannot cancel delivered order", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    await patch(`/orders/${c.data.id}/status`, { status: "processing" });
    await patch(`/orders/${c.data.id}/status`, { status: "shipped" });
    await patch(`/orders/${c.data.id}/status`, { status: "delivered" });
    const res = await del(`/orders/${c.data.id}`);
    expect(res.status).toBe(409);
  });

  test("DELETE /orders/:id — cancel already cancelled (idempotent fail)", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await del(`/orders/${c.data.id}`);
    const res = await del(`/orders/${c.data.id}`);
    expect(res.status).toBe(409);
  });

  test("DELETE /orders/:id — not found", async () => {
    const res = await del("/orders/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("Item operations edge cases", () => {
  beforeEach(() => orderStore.clear());

  test("POST /orders/:id/items — on confirmed order", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    const res = await post(`/orders/${c.data.id}/items`, VALID_ITEM);
    expect(res.status).toBe(409);
  });

  test("POST /orders/:id/items — order not found", async () => {
    const res = await post("/orders/nope/items", VALID_ITEM);
    expect(res.status).toBe(404);
  });

  test("POST /orders/:id/items — invalid item body", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await post(`/orders/${c.data.id}/items`, { productId: "" });
    expect(res.status).toBe(400);
  });

  test("DELETE /orders/:id/items/:productId — item not in order", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await del(`/orders/${c.data.id}/items/nonexistent`);
    expect(res.status).toBe(404);
  });

  test("DELETE /orders/:id/items/:productId — on non-pending order", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    const res = await del(`/orders/${c.data.id}/items/p1`);
    expect(res.status).toBe(409);
  });
});

describe("User orders & stats & misc", () => {
  beforeEach(() => orderStore.clear());

  test("GET /orders/user/:userId", async () => {
    await post("/orders", VALID_ORDER);
    await post("/orders", { ...VALID_ORDER, userId: "u2" });
    await post("/orders", VALID_ORDER);
    const res = await get("/orders/user/u1");
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  test("GET /orders/stats — correct counts and revenue", async () => {
    await post("/orders", VALID_ORDER);
    const c2 = await json(await post("/orders", VALID_ORDER));
    await del(`/orders/${c2.data.id}`); // cancel one
    const res = await get("/orders/stats");
    const body = await json(res);
    expect(body.data.totalOrders).toBe(2);
    expect(body.data.countByStatus.pending).toBe(1);
    expect(body.data.countByStatus.cancelled).toBe(1);
    expect(body.data.totalRevenue).toBeCloseTo(19.98);
    expect(body.data.averageOrderValue).toBeCloseTo(19.98);
  });

  test("GET /orders/:id/total — recalculate", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await get(`/orders/${c.data.id}/total`);
    const body = await json(res);
    expect(body.data.total).toBeCloseTo(19.98);
  });

  test("GET /orders/:id/total — not found", async () => {
    const res = await get("/orders/nope/total");
    expect(res.status).toBe(404);
  });

  test("GET /orders/health", async () => {
    const res = await get("/orders/health");
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.service).toBe("orders");
  });

  test("unknown endpoint returns 404", async () => {
    const res = await handleRequest(new Request(`${BASE}/unknown`));
    expect(res.status).toBe(404);
  });

  test("multiple items total calculation", async () => {
    const items = [
      { productId: "p1", name: "A", quantity: 3, unitPrice: 10 },
      { productId: "p2", name: "B", quantity: 2, unitPrice: 25 },
    ];
    const res = await post("/orders", { userId: "u1", items, currency: "USD" });
    const body = await json(res);
    expect(body.data.total).toBe(80); // 3*10 + 2*25
  });
});
