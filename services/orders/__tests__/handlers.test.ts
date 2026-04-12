import { describe, test, expect, beforeEach } from "bun:test";
import { OrderStore } from "../store";
import { createRouter } from "../handlers";

let store: OrderStore;
let router: (req: Request) => Response | Promise<Response>;

async function call(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const req = new Request(`http://localhost${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const res = await router(req);
  return { status: res.status, body: await res.json() };
}

function validOrderBody(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    items: [{ productId: "p1", name: "Widget", quantity: 2, price: 29.99 }],
    shippingAddress: "123 Test St",
    ...overrides,
  };
}

describe("Orders Handlers", () => {
  beforeEach(() => {
    store = new OrderStore();
    router = createRouter(store);
  });

  // --- POST /orders ---

  describe("POST /orders", () => {
    test("creates order with valid body", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userId).toBe("u1");
      expect(res.body.data.status).toBe("pending");
      expect(res.body.data.total).toBe(59.98); // 2 * 29.99
      expect(res.body.data.currency).toBe("USD");
      expect(res.body.data.shippingAddress).toBe("123 Test St");
    });

    test("maps price field to unitPrice", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      expect(res.body.data.items[0].unitPrice).toBe(29.99);
      expect(res.body.data.items[0].productId).toBe("p1");
    });

    test("uses productId as name when name not provided", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: {
          userId: "u1",
          items: [{ productId: "prod-abc", quantity: 1, price: 5 }],
        },
      });
      expect(res.status).toBe(201);
      expect(res.body.data.items[0].name).toBe("prod-abc");
    });

    test("returns 400 when userId is missing", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: { items: [{ productId: "p1", quantity: 1, price: 5 }] },
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test("returns 400 when items is not an array", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: { userId: "u1", items: "not-array" },
      });
      expect(res.status).toBe(400);
    });

    test("returns 400 when items is empty", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: { userId: "u1", items: [] },
      });
      expect(res.status).toBe(400);
    });

    test("returns 400 when item has invalid quantity", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: {
          userId: "u1",
          items: [{ productId: "p1", quantity: -1, price: 5 }],
        },
      });
      expect(res.status).toBe(400);
    });

    test("returns 400 when item has invalid price", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: {
          userId: "u1",
          items: [{ productId: "p1", quantity: 1, price: 0 }],
        },
      });
      expect(res.status).toBe(400);
    });

    test("returns 400 when item missing productId", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: {
          userId: "u1",
          items: [{ quantity: 1, price: 5 }],
        },
      });
      expect(res.status).toBe(400);
    });

    test("returns 400 for missing body", async () => {
      const req = new Request("http://localhost/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const res = await router(req);
      expect(res.status).toBe(400);
    });

    test("handles multiple items with correct total", async () => {
      const res = await call("/orders", {
        method: "POST",
        body: {
          userId: "u1",
          items: [
            { productId: "a", name: "A", quantity: 3, price: 10 },
            { productId: "b", name: "B", quantity: 1, price: 25 },
          ],
        },
      });
      expect(res.status).toBe(201);
      expect(res.body.data.total).toBe(55); // 3*10 + 1*25
      expect(res.body.data.items).toHaveLength(2);
    });
  });

  // --- GET /orders ---

  describe("GET /orders", () => {
    test("returns empty array when no orders", async () => {
      const res = await call("/orders");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    test("returns all orders", async () => {
      await call("/orders", { method: "POST", body: validOrderBody() });
      await call("/orders", {
        method: "POST",
        body: validOrderBody({ userId: "u2" }),
      });
      const res = await call("/orders");
      expect(res.body.data).toHaveLength(2);
    });

    test("filters by userId query param", async () => {
      await call("/orders", { method: "POST", body: validOrderBody() });
      await call("/orders", {
        method: "POST",
        body: validOrderBody({ userId: "u2" }),
      });
      const res = await call("/orders?userId=u1");
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].userId).toBe("u1");
    });

    test("returns empty for non-matching userId filter", async () => {
      await call("/orders", { method: "POST", body: validOrderBody() });
      const res = await call("/orders?userId=nobody");
      expect(res.body.data).toEqual([]);
    });
  });

  // --- GET /orders/:id ---

  describe("GET /orders/:id", () => {
    test("returns order by id", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;
      const res = await call(`/orders/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
    });

    test("returns 404 for non-existent order", async () => {
      const res = await call("/orders/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  // --- PUT /orders/:id ---

  describe("PUT /orders/:id", () => {
    test("updates shipping address", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;
      const res = await call(`/orders/${id}`, {
        method: "PUT",
        body: { shippingAddress: "456 Oak Ave" },
      });
      expect(res.status).toBe(200);
      expect(res.body.data.shippingAddress).toBe("456 Oak Ave");
    });

    test("returns 404 for non-existent order", async () => {
      const res = await call("/orders/bad-id", {
        method: "PUT",
        body: { shippingAddress: "x" },
      });
      expect(res.status).toBe(404);
    });

    test("returns 400 for invalid shippingAddress", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const res = await call(`/orders/${created.body.data.id}`, {
        method: "PUT",
        body: { shippingAddress: "" },
      });
      expect(res.status).toBe(400);
    });
  });

  // --- DELETE /orders/:id ---

  describe("DELETE /orders/:id", () => {
    test("deletes existing order", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;
      const res = await call(`/orders/${id}`, { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
    });

    test("returns 404 for non-existent order", async () => {
      const res = await call("/orders/nonexistent", { method: "DELETE" });
      expect(res.status).toBe(404);
    });

    test("deleted order returns cancelled status", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      await call(`/orders/${created.body.data.id}`, { method: "DELETE" });
      const res = await call(`/orders/${created.body.data.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("cancelled");
    });
  });

  // --- PUT /orders/:id/status ---

  describe("PUT /orders/:id/status", () => {
    test("transitions pending to confirmed", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;
      const res = await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "confirmed" },
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("confirmed");
    });

    test("returns 409 for invalid transition", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const res = await call(`/orders/${created.body.data.id}/status`, {
        method: "PUT",
        body: { status: "delivered" },
      });
      expect(res.status).toBe(409);
    });

    test("returns 404 for non-existent order", async () => {
      const res = await call("/orders/bad/status", {
        method: "PUT",
        body: { status: "confirmed" },
      });
      expect(res.status).toBe(404);
    });

    test("returns 400 for invalid status value", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const res = await call(`/orders/${created.body.data.id}/status`, {
        method: "PUT",
        body: { status: "invalid" },
      });
      expect(res.status).toBe(400);
    });

    test("returns 400 when body is missing", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const req = new Request(
        `http://localhost/orders/${created.body.data.id}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
        },
      );
      const res = await router(req);
      expect(res.status).toBe(400);
    });
  });

  // --- PATCH /orders/:id/status ---

  describe("PATCH /orders/:id/status", () => {
    test("works the same as PUT for status update", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const res = await call(`/orders/${created.body.data.id}/status`, {
        method: "PATCH",
        body: { status: "confirmed" },
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("confirmed");
    });

    test("returns 409 for invalid transition via PATCH", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const res = await call(`/orders/${created.body.data.id}/status`, {
        method: "PATCH",
        body: { status: "shipped" },
      });
      expect(res.status).toBe(409);
    });
  });

  // --- Status chain ---

  describe("status chain", () => {
    test("full forward chain: pending -> confirmed -> shipped -> delivered", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;

      for (const status of ["confirmed", "shipped", "delivered"]) {
        const res = await call(`/orders/${id}/status`, {
          method: "PUT",
          body: { status },
        });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(status);
      }
    });

    test("full chain with processing step", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;

      for (const status of [
        "confirmed",
        "processing",
        "shipped",
        "delivered",
      ]) {
        const res = await call(`/orders/${id}/status`, {
          method: "PUT",
          body: { status },
        });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(status);
      }
    });

    test("delivered -> refunded", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;

      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "confirmed" },
      });
      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "shipped" },
      });
      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "delivered" },
      });
      const res = await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "refunded" },
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("refunded");
    });
  });

  // --- GET /orders/:id/timeline ---

  describe("GET /orders/:id/timeline", () => {
    test("returns timeline with initial entry", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const res = await call(`/orders/${created.body.data.id}/timeline`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe("pending");
    });

    test("records all status changes", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;
      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "confirmed" },
      });
      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "shipped" },
      });
      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "delivered" },
      });
      const res = await call(`/orders/${id}/timeline`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data[0].status).toBe("pending");
      expect(res.body.data[res.body.data.length - 1].status).toBe("delivered");
    });

    test("returns 404 for non-existent order", async () => {
      const res = await call("/orders/bad/timeline");
      expect(res.status).toBe(404);
    });
  });

  // --- GET /orders/:id/history ---

  describe("GET /orders/:id/history", () => {
    test("returns same data as timeline", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;
      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "confirmed" },
      });

      const timeline = await call(`/orders/${id}/timeline`);
      const history = await call(`/orders/${id}/history`);
      expect(history.status).toBe(200);
      expect(history.body.data).toEqual(timeline.body.data);
    });

    test("returns 404 for non-existent order", async () => {
      const res = await call("/orders/bad/history");
      expect(res.status).toBe(404);
    });
  });

  // --- POST /orders/:id/cancel ---

  describe("POST /orders/:id/cancel", () => {
    test("cancels a pending order", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const res = await call(`/orders/${created.body.data.id}/cancel`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("cancelled");
    });

    test("cancels a confirmed order", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      await call(`/orders/${created.body.data.id}/status`, {
        method: "PUT",
        body: { status: "confirmed" },
      });
      const res = await call(`/orders/${created.body.data.id}/cancel`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("cancelled");
    });

    test("returns 400 when cancelling delivered order", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const id = created.body.data.id;
      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "confirmed" },
      });
      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "shipped" },
      });
      await call(`/orders/${id}/status`, {
        method: "PUT",
        body: { status: "delivered" },
      });
      const res = await call(`/orders/${id}/cancel`, { method: "POST" });
      expect(res.status).toBe(400);
    });

    test("returns 404 for non-existent order", async () => {
      const res = await call("/orders/bad/cancel", { method: "POST" });
      expect(res.status).toBe(404);
    });
  });

  // --- GET /orders/stats ---

  describe("GET /orders/stats", () => {
    test("returns stats for empty store", async () => {
      const res = await call("/orders/stats");
      expect(res.status).toBe(200);
      expect(res.body.data.totalOrders).toBe(0);
      expect(res.body.data.totalRevenue).toBe(0);
    });

    test("returns correct stats with orders", async () => {
      await call("/orders", { method: "POST", body: validOrderBody() }); // 59.98
      await call("/orders", {
        method: "POST",
        body: validOrderBody({ userId: "u2" }),
      }); // 59.98
      const res = await call("/orders/stats");
      expect(res.body.data.totalOrders).toBe(2);
      expect(res.body.data.totalRevenue).toBeCloseTo(119.96);
      expect(res.body.data.countByStatus.pending).toBe(2);
    });
  });

  // --- 404 routes ---

  describe("unknown routes", () => {
    test("returns 404 for unknown path", async () => {
      const res = await call("/unknown");
      expect(res.status).toBe(404);
    });

    test("returns 404 for /orders/:id with non-existent subroute", async () => {
      const created = await call("/orders", {
        method: "POST",
        body: validOrderBody(),
      });
      const res = await call(
        `/orders/${created.body.data.id}/nonexistent`,
      );
      // This hits the GET /orders/:id check since segments.length === 3
      // and segment[2] is not timeline/history/status — falls through to 404
      expect(res.status).toBe(404);
    });
  });
});
