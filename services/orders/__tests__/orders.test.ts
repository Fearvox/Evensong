import { describe, test, expect, beforeEach } from "bun:test";
import { OrderStore } from "../store";
import { createRouter } from "../handlers";

const BASE = "http://localhost:3004";
const store = new OrderStore();
const handleRequest = createRouter(store);

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
const VALID_ORDER = { userId: "u1", items: [VALID_ITEM], currency: "USD", shippingAddress: "123 Main St" };

async function json(res: Response) { return res.json(); }

describe("Orders CRUD", () => {
  beforeEach(() => store.clear());

  test("POST /orders — create order", async () => {
    const res = await post("/orders", VALID_ORDER);
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe("u1");
    expect(body.data.status).toBe("pending");
    expect(body.data.total).toBe(19.98);
    expect(body.data.items).toHaveLength(1);
  });

  test("GET /orders/:id — get order", async () => {
    const created = await json(await post("/orders", VALID_ORDER));
    const res = await get(`/orders/${created.data.id}`);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(created.data.id);
  });

  test("GET /orders/:id — not found", async () => {
    const res = await get("/orders/nonexistent");
    expect(res.status).toBe(404);
  });

  test("GET /orders — list orders", async () => {
    await post("/orders", VALID_ORDER);
    await post("/orders", { ...VALID_ORDER, userId: "u2" });
    const res = await get("/orders");
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  test("GET /orders — pagination", async () => {
    for (let i = 0; i < 5; i++) await post("/orders", VALID_ORDER);
    const res = await get("/orders?page=2&pageSize=2");
    const body = await json(res);
    expect(body.data).toHaveLength(2);
    expect(body.page).toBe(2);
    expect(body.total).toBe(5);
  });

  test("GET /orders — filter by userId", async () => {
    await post("/orders", VALID_ORDER);
    await post("/orders", { ...VALID_ORDER, userId: "u2" });
    const res = await get("/orders?userId=u2");
    const body = await json(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].userId).toBe("u2");
  });

  test("GET /orders — filter by status", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    await post("/orders", VALID_ORDER); // stays pending
    const res = await get("/orders?status=confirmed");
    const body = await json(res);
    expect(body.data).toHaveLength(1);
  });

  test("PUT /orders/:id — update shipping address", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await put(`/orders/${c.data.id}`, { shippingAddress: "456 Oak Ave" });
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.shippingAddress).toBe("456 Oak Ave");
  });

  test("DELETE /orders/:id — cancel pending order", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await del(`/orders/${c.data.id}`);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("cancelled");
  });

  test("DELETE /orders/:id — cancel confirmed order", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    const res = await del(`/orders/${c.data.id}`);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("cancelled");
  });
});

describe("Status transitions", () => {
  beforeEach(() => store.clear());

  test("pending -> confirmed", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    expect((await json(res)).data.status).toBe("confirmed");
  });

  test("confirmed -> processing", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    const res = await patch(`/orders/${c.data.id}/status`, { status: "processing" });
    expect((await json(res)).data.status).toBe("processing");
  });

  test("processing -> shipped", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    await patch(`/orders/${c.data.id}/status`, { status: "processing" });
    const res = await patch(`/orders/${c.data.id}/status`, { status: "shipped" });
    expect((await json(res)).data.status).toBe("shipped");
  });

  test("shipped -> delivered", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    await patch(`/orders/${c.data.id}/status`, { status: "processing" });
    await patch(`/orders/${c.data.id}/status`, { status: "shipped" });
    const res = await patch(`/orders/${c.data.id}/status`, { status: "delivered" });
    expect((await json(res)).data.status).toBe("delivered");
  });

  test("delivered -> refunded", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    await patch(`/orders/${c.data.id}/status`, { status: "processing" });
    await patch(`/orders/${c.data.id}/status`, { status: "shipped" });
    await patch(`/orders/${c.data.id}/status`, { status: "delivered" });
    const res = await patch(`/orders/${c.data.id}/status`, { status: "refunded" });
    expect((await json(res)).data.status).toBe("refunded");
  });

  test("confirmed -> cancelled", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    const res = await patch(`/orders/${c.data.id}/status`, { status: "cancelled" });
    expect((await json(res)).data.status).toBe("cancelled");
  });

  test("processing -> cancelled", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    await patch(`/orders/${c.data.id}/status`, { status: "processing" });
    const res = await patch(`/orders/${c.data.id}/status`, { status: "cancelled" });
    expect((await json(res)).data.status).toBe("cancelled");
  });

  test("invalid: pending -> shipped", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await patch(`/orders/${c.data.id}/status`, { status: "shipped" });
    expect(res.status).toBe(409);
  });

  test("invalid: cancelled -> confirmed", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await del(`/orders/${c.data.id}`);
    const res = await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    expect(res.status).toBe(409);
  });

  test("invalid: refunded -> any", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    await patch(`/orders/${c.data.id}/status`, { status: "confirmed" });
    await patch(`/orders/${c.data.id}/status`, { status: "processing" });
    await patch(`/orders/${c.data.id}/status`, { status: "shipped" });
    await patch(`/orders/${c.data.id}/status`, { status: "delivered" });
    await patch(`/orders/${c.data.id}/status`, { status: "refunded" });
    const res = await patch(`/orders/${c.data.id}/status`, { status: "pending" });
    expect(res.status).toBe(409);
  });
});

describe("Items management", () => {
  beforeEach(() => store.clear());

  test("POST /orders/:id/items — add item", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const newItem = { productId: "p2", name: "Gadget", quantity: 1, unitPrice: 14.99 };
    const res = await post(`/orders/${c.data.id}/items`, newItem);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.total).toBeCloseTo(34.97);
  });

  test("DELETE /orders/:id/items/:productId — remove item", async () => {
    const order = { ...VALID_ORDER, items: [VALID_ITEM, { productId: "p2", name: "Gadget", quantity: 1, unitPrice: 5 }] };
    const c = await json(await post("/orders", order));
    const res = await del(`/orders/${c.data.id}/items/p1`);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].productId).toBe("p2");
  });

  test("DELETE last item — cancels order", async () => {
    const c = await json(await post("/orders", VALID_ORDER));
    const res = await del(`/orders/${c.data.id}/items/p1`);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("cancelled");
  });
});
