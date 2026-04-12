import { describe, test, expect, beforeEach } from "bun:test";
import { OrderStore } from "../store";
import type { OrderItem } from "../../shared/types";

function makeItems(count = 1): OrderItem[] {
  return Array.from({ length: count }, (_, i) => ({
    productId: `prod-${i + 1}`,
    name: `Product ${i + 1}`,
    quantity: 2,
    unitPrice: 10.0 + i,
  }));
}

describe("OrderStore", () => {
  let store: OrderStore;

  beforeEach(() => {
    store = new OrderStore();
  });

  // --- Creation ---

  describe("create", () => {
    test("creates order with correct defaults", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      expect(order.id).toBeDefined();
      expect(order.userId).toBe("u1");
      expect(order.status).toBe("pending");
      expect(order.currency).toBe("USD");
      expect(order.total).toBe(20); // 2 * 10
      expect(order.createdAt).toBeDefined();
      expect(order.updatedAt).toBeDefined();
    });

    test("calculates total from multiple items", () => {
      const items: OrderItem[] = [
        { productId: "a", name: "A", quantity: 3, unitPrice: 5 },
        { productId: "b", name: "B", quantity: 1, unitPrice: 25 },
      ];
      const order = store.create({ userId: "u2", items });
      expect(order.total).toBe(40); // 3*5 + 1*25
    });

    test("uses provided currency", () => {
      const order = store.create({
        userId: "u1",
        items: makeItems(),
        currency: "EUR",
      });
      expect(order.currency).toBe("EUR");
    });

    test("stores shipping address when provided", () => {
      const order = store.create({
        userId: "u1",
        items: makeItems(),
        shippingAddress: "123 Main St",
      });
      expect(order.shippingAddress).toBe("123 Main St");
    });

    test("shipping address is undefined when not provided", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      expect(order.shippingAddress).toBeUndefined();
    });

    test("records initial timeline entry on creation", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      const timeline = store.getTimeline(order.id);
      expect(timeline).toHaveLength(1);
      expect(timeline![0].status).toBe("pending");
      expect(timeline![0].timestamp).toBe(order.createdAt);
    });

    test("generates unique IDs for each order", () => {
      const o1 = store.create({ userId: "u1", items: makeItems() });
      const o2 = store.create({ userId: "u1", items: makeItems() });
      expect(o1.id).not.toBe(o2.id);
    });
  });

  // --- Read ---

  describe("get / getAll", () => {
    test("retrieves order by id", () => {
      const created = store.create({ userId: "u1", items: makeItems() });
      const fetched = store.get(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.userId).toBe("u1");
    });

    test("returns undefined for non-existent id", () => {
      expect(store.get("nonexistent")).toBeUndefined();
    });

    test("getAll returns all orders", () => {
      store.create({ userId: "u1", items: makeItems() });
      store.create({ userId: "u2", items: makeItems() });
      expect(store.getAll()).toHaveLength(2);
    });

    test("getAll returns empty array when no orders", () => {
      expect(store.getAll()).toEqual([]);
    });
  });

  // --- Update ---

  describe("update", () => {
    test("updates order fields", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      const updated = store.update(order.id, {
        shippingAddress: "456 Oak Ave",
      });
      expect(updated).toBeDefined();
      expect(updated!.shippingAddress).toBe("456 Oak Ave");
    });

    test("returns undefined for non-existent order", () => {
      expect(store.update("bad-id", { shippingAddress: "x" })).toBeUndefined();
    });

    test("updates updatedAt timestamp", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      const updated = store.update(order.id, { shippingAddress: "new" });
      expect(updated!.updatedAt).toBeDefined();
    });
  });

  // --- Delete ---

  describe("delete", () => {
    test("deletes existing order and returns true", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      expect(store.delete(order.id)).toBe(true);
      expect(store.get(order.id)).toBeUndefined();
    });

    test("returns false for non-existent order", () => {
      expect(store.delete("nonexistent")).toBe(false);
    });

    test("also removes timeline data", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      store.delete(order.id);
      expect(store.getTimeline(order.id)).toBeUndefined();
    });
  });

  // --- Status transitions ---

  describe("isValidTransition", () => {
    test("pending -> confirmed is valid", () => {
      expect(store.isValidTransition("pending", "confirmed")).toBe(true);
    });

    test("pending -> cancelled is valid", () => {
      expect(store.isValidTransition("pending", "cancelled")).toBe(true);
    });

    test("confirmed -> processing is valid", () => {
      expect(store.isValidTransition("confirmed", "processing")).toBe(true);
    });

    test("confirmed -> shipped is valid (skip processing)", () => {
      expect(store.isValidTransition("confirmed", "shipped")).toBe(true);
    });

    test("shipped -> delivered is valid", () => {
      expect(store.isValidTransition("shipped", "delivered")).toBe(true);
    });

    test("delivered -> refunded is valid", () => {
      expect(store.isValidTransition("delivered", "refunded")).toBe(true);
    });

    test("pending -> shipped is invalid (skip confirmed)", () => {
      expect(store.isValidTransition("pending", "shipped")).toBe(false);
    });

    test("delivered -> pending is invalid (backward)", () => {
      expect(store.isValidTransition("delivered", "pending")).toBe(false);
    });

    test("cancelled -> anything is invalid", () => {
      expect(store.isValidTransition("cancelled", "pending")).toBe(false);
      expect(store.isValidTransition("cancelled", "confirmed")).toBe(false);
    });

    test("refunded -> anything is invalid", () => {
      expect(store.isValidTransition("refunded", "pending")).toBe(false);
    });
  });

  describe("updateStatus", () => {
    test("advances status and returns updated order", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      const updated = store.updateStatus(order.id, "confirmed");
      expect(updated).toBeDefined();
      expect(updated!.status).toBe("confirmed");
    });

    test("returns undefined for invalid transition", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      expect(store.updateStatus(order.id, "shipped")).toBeUndefined();
    });

    test("returns undefined for non-existent order", () => {
      expect(store.updateStatus("bad", "confirmed")).toBeUndefined();
    });

    test("records timeline entry on status change", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      store.updateStatus(order.id, "confirmed");
      const timeline = store.getTimeline(order.id);
      expect(timeline).toHaveLength(2);
      expect(timeline![0].status).toBe("pending");
      expect(timeline![1].status).toBe("confirmed");
    });

    test("full forward chain records all entries", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      store.updateStatus(order.id, "confirmed");
      store.updateStatus(order.id, "processing");
      store.updateStatus(order.id, "shipped");
      store.updateStatus(order.id, "delivered");
      const timeline = store.getTimeline(order.id);
      expect(timeline).toHaveLength(5);
      expect(timeline!.map((t) => t.status)).toEqual([
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
      ]);
    });
  });

  describe("cancel", () => {
    test("cancels pending order", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      const cancelled = store.cancel(order.id);
      expect(cancelled).toBeDefined();
      expect(cancelled!.status).toBe("cancelled");
    });

    test("cancels confirmed order", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      store.updateStatus(order.id, "confirmed");
      const cancelled = store.cancel(order.id);
      expect(cancelled).toBeDefined();
      expect(cancelled!.status).toBe("cancelled");
    });

    test("cannot cancel delivered order", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      store.updateStatus(order.id, "confirmed");
      store.updateStatus(order.id, "shipped");
      store.updateStatus(order.id, "delivered");
      expect(store.cancel(order.id)).toBeUndefined();
    });

    test("cannot cancel already cancelled order", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      store.cancel(order.id);
      expect(store.cancel(order.id)).toBeUndefined();
    });
  });

  // --- Timeline ---

  describe("getTimeline", () => {
    test("returns undefined for non-existent order", () => {
      expect(store.getTimeline("bad")).toBeUndefined();
    });

    test("each entry has status and timestamp", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      store.updateStatus(order.id, "confirmed");
      const timeline = store.getTimeline(order.id);
      for (const entry of timeline!) {
        expect(entry.status).toBeDefined();
        expect(entry.timestamp).toBeDefined();
        expect(typeof entry.timestamp).toBe("string");
      }
    });

    test("returns copy (not reference)", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      const tl1 = store.getTimeline(order.id);
      const tl2 = store.getTimeline(order.id);
      expect(tl1).not.toBe(tl2);
      expect(tl1).toEqual(tl2);
    });
  });

  // --- Queries ---

  describe("findByUser", () => {
    test("returns orders for specific user", () => {
      store.create({ userId: "u1", items: makeItems() });
      store.create({ userId: "u1", items: makeItems() });
      store.create({ userId: "u2", items: makeItems() });
      expect(store.findByUser("u1")).toHaveLength(2);
      expect(store.findByUser("u2")).toHaveLength(1);
    });

    test("returns empty array for user with no orders", () => {
      expect(store.findByUser("nobody")).toEqual([]);
    });
  });

  describe("findByStatus", () => {
    test("returns orders matching status", () => {
      store.create({ userId: "u1", items: makeItems() });
      const o2 = store.create({ userId: "u1", items: makeItems() });
      store.updateStatus(o2.id, "confirmed");
      expect(store.findByStatus("pending")).toHaveLength(1);
      expect(store.findByStatus("confirmed")).toHaveLength(1);
    });
  });

  // --- Stats ---

  describe("stats", () => {
    test("returns correct stats for empty store", () => {
      const s = store.stats();
      expect(s.totalOrders).toBe(0);
      expect(s.totalRevenue).toBe(0);
      expect(s.averageOrderValue).toBe(0);
      expect(s.countByStatus).toEqual({});
    });

    test("calculates revenue excluding cancelled and refunded", () => {
      store.create({ userId: "u1", items: makeItems() }); // 20
      const o2 = store.create({ userId: "u1", items: makeItems() }); // 20
      store.cancel(o2.id);
      const s = store.stats();
      expect(s.totalRevenue).toBe(20);
      expect(s.totalOrders).toBe(2);
      expect(s.countByStatus.pending).toBe(1);
      expect(s.countByStatus.cancelled).toBe(1);
    });

    test("calculates average order value correctly", () => {
      const items1: OrderItem[] = [
        { productId: "a", name: "A", quantity: 1, unitPrice: 100 },
      ];
      const items2: OrderItem[] = [
        { productId: "b", name: "B", quantity: 1, unitPrice: 200 },
      ];
      store.create({ userId: "u1", items: items1 });
      store.create({ userId: "u1", items: items2 });
      const s = store.stats();
      expect(s.averageOrderValue).toBe(150);
    });
  });

  // --- Helpers ---

  describe("calculateTotal", () => {
    test("calculates sum of quantity * unitPrice", () => {
      const items: OrderItem[] = [
        { productId: "a", name: "A", quantity: 3, unitPrice: 10 },
        { productId: "b", name: "B", quantity: 2, unitPrice: 7.5 },
      ];
      expect(store.calculateTotal(items)).toBe(45);
    });

    test("returns 0 for empty items", () => {
      expect(store.calculateTotal([])).toBe(0);
    });
  });

  describe("count / clear / has", () => {
    test("count returns number of orders", () => {
      expect(store.count()).toBe(0);
      store.create({ userId: "u1", items: makeItems() });
      expect(store.count()).toBe(1);
    });

    test("clear removes all orders and timelines", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      store.clear();
      expect(store.count()).toBe(0);
      expect(store.getTimeline(order.id)).toBeUndefined();
    });

    test("has returns true for existing order", () => {
      const order = store.create({ userId: "u1", items: makeItems() });
      expect(store.has(order.id)).toBe(true);
      expect(store.has("nonexistent")).toBe(false);
    });
  });
});
