import { describe, test, expect, beforeEach } from "bun:test";
import { PaymentStore, MethodStore } from "../store";
import type { Payment, PaymentMethod } from "../../shared/types";

describe("PaymentStore", () => {
  let store: PaymentStore;

  beforeEach(() => {
    store = new PaymentStore();
  });

  const makePayment = (overrides: Partial<{
    orderId: string; userId: string; amount: number;
    currency: string; method: PaymentMethod;
  }> = {}) => store.create({
    orderId: overrides.orderId ?? "order-1",
    userId: overrides.userId ?? "user-1",
    amount: overrides.amount ?? 100,
    currency: overrides.currency ?? "USD",
    method: overrides.method ?? "credit_card",
  });

  describe("create", () => {
    test("creates a payment with all fields populated", () => {
      const p = makePayment();
      expect(p.id).toBeTruthy();
      expect(p.orderId).toBe("order-1");
      expect(p.userId).toBe("user-1");
      expect(p.amount).toBe(100);
      expect(p.currency).toBe("USD");
      expect(p.method).toBe("credit_card");
      expect(p.status).toBe("pending");
      expect(p.createdAt).toBeTruthy();
      expect(p.updatedAt).toBeTruthy();
    });

    test("defaults status to pending", () => {
      const p = makePayment();
      expect(p.status).toBe("pending");
    });

    test("defaults userId to empty string when omitted", () => {
      const p = store.create({
        orderId: "order-x",
        amount: 50,
        currency: "EUR",
        method: "wallet",
      });
      expect(p.userId).toBe("");
    });

    test("assigns unique ids to different payments", () => {
      const p1 = makePayment();
      const p2 = makePayment();
      expect(p1.id).not.toBe(p2.id);
    });

    test("uppercases currency", () => {
      const p = store.create({
        orderId: "o1",
        amount: 10,
        currency: "eur",
        method: "wallet",
      });
      expect(p.currency).toBe("EUR");
    });
  });

  describe("get / getAll", () => {
    test("retrieves a payment by id", () => {
      const created = makePayment();
      const fetched = store.get(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
    });

    test("returns undefined for non-existent id", () => {
      expect(store.get("no-such-id")).toBeUndefined();
    });

    test("getAll returns all created payments", () => {
      makePayment({ orderId: "a" });
      makePayment({ orderId: "b" });
      makePayment({ orderId: "c" });
      expect(store.getAll()).toHaveLength(3);
    });
  });

  describe("update", () => {
    test("updates mutable fields and bumps updatedAt", () => {
      const p = makePayment();
      const updated = store.update(p.id, { currency: "EUR" });
      expect(updated).toBeDefined();
      expect(updated!.currency).toBe("EUR");
      expect(updated!.updatedAt).not.toBe(p.updatedAt);
    });

    test("returns undefined when id does not exist", () => {
      expect(store.update("ghost", { currency: "GBP" })).toBeUndefined();
    });
  });

  describe("delete", () => {
    test("removes a payment and returns true", () => {
      const p = makePayment();
      expect(store.delete(p.id)).toBe(true);
      expect(store.get(p.id)).toBeUndefined();
    });

    test("returns false for non-existent id", () => {
      expect(store.delete("nope")).toBe(false);
    });
  });

  describe("filter", () => {
    test("filters by orderId", () => {
      makePayment({ orderId: "o1" });
      makePayment({ orderId: "o2" });
      makePayment({ orderId: "o1" });
      expect(store.filter({ orderId: "o1" })).toHaveLength(2);
    });

    test("filters by userId", () => {
      makePayment({ userId: "u1" });
      makePayment({ userId: "u2" });
      expect(store.filter({ userId: "u2" })).toHaveLength(1);
    });

    test("filters by status after processing", () => {
      const p = makePayment({ amount: 50 });
      store.process(p.id);
      expect(store.filter({ status: "completed" })).toHaveLength(1);
      expect(store.filter({ status: "pending" })).toHaveLength(0);
    });

    test("filters by method", () => {
      makePayment({ method: "credit_card" });
      makePayment({ method: "wallet" });
      expect(store.filter({ method: "wallet" })).toHaveLength(1);
    });

    test("returns all when no filters provided", () => {
      makePayment();
      makePayment();
      expect(store.filter({})).toHaveLength(2);
    });
  });

  describe("getByOrderId / getByUserId", () => {
    test("getByOrderId returns payments for a specific order", () => {
      makePayment({ orderId: "o1" });
      makePayment({ orderId: "o1" });
      makePayment({ orderId: "o2" });
      expect(store.getByOrderId("o1")).toHaveLength(2);
    });

    test("getByUserId returns payments for a specific user", () => {
      makePayment({ userId: "u1" });
      makePayment({ userId: "u2" });
      makePayment({ userId: "u1" });
      expect(store.getByUserId("u1")).toHaveLength(2);
    });
  });

  describe("process", () => {
    test("completes payment when amount <= 10000", () => {
      const p = makePayment({ amount: 5000 });
      const result = store.process(p.id);
      expect("error" in result).toBe(false);
      const processed = result as Payment;
      expect(processed.status).toBe("completed");
      expect(processed.transactionRef).toBeTruthy();
      expect(processed.transactionRef!.startsWith("TXN-")).toBe(true);
    });

    test("fails payment when amount > 10000", () => {
      const p = makePayment({ amount: 15000 });
      const result = store.process(p.id);
      expect("error" in result).toBe(false);
      const processed = result as Payment;
      expect(processed.status).toBe("failed");
    });

    test("completes payment at exactly 10000 boundary", () => {
      const p = makePayment({ amount: 10000 });
      const result = store.process(p.id);
      expect("error" in result).toBe(false);
      expect((result as Payment).status).toBe("completed");
    });

    test("fails payment at 10001 boundary", () => {
      const p = makePayment({ amount: 10001 });
      const result = store.process(p.id);
      expect("error" in result).toBe(false);
      expect((result as Payment).status).toBe("failed");
    });

    test("returns error for non-existent payment", () => {
      const result = store.process("ghost");
      expect("error" in result).toBe(true);
    });

    test("returns error when processing non-pending payment", () => {
      const p = makePayment({ amount: 100 });
      store.process(p.id); // now completed
      const result = store.process(p.id);
      expect("error" in result).toBe(true);
      expect((result as { error: string }).error).toContain("Cannot process");
    });
  });

  describe("refund", () => {
    test("refunds a completed payment and creates refund record", () => {
      const p = makePayment({ amount: 200 });
      store.process(p.id);
      const result = store.refund(p.id);
      expect("error" in result).toBe(false);
      const { refund, original } = result as { refund: Payment; original: Payment };
      expect(original.status).toBe("refunded");
      expect(refund.amount).toBe(-200);
      expect(refund.status).toBe("refunded");
      expect(refund.transactionRef!.startsWith("RFN-")).toBe(true);
      expect(refund.orderId).toBe(p.orderId);
    });

    test("allows partial refund with custom amount", () => {
      const p = makePayment({ amount: 500 });
      store.process(p.id);
      const result = store.refund(p.id, 150);
      expect("error" in result).toBe(false);
      const { refund } = result as { refund: Payment; original: Payment };
      expect(refund.amount).toBe(-150);
    });

    test("rejects refund of pending payment", () => {
      const p = makePayment();
      const result = store.refund(p.id);
      expect("error" in result).toBe(true);
    });

    test("rejects refund of already-refunded payment", () => {
      const p = makePayment({ amount: 100 });
      store.process(p.id);
      store.refund(p.id);
      const result = store.refund(p.id);
      expect("error" in result).toBe(true);
      expect((result as { error: string }).error).toContain("already been refunded");
    });

    test("rejects refund of failed payment", () => {
      const p = makePayment({ amount: 20000 });
      store.process(p.id); // fails
      const result = store.refund(p.id);
      expect("error" in result).toBe(true);
    });

    test("rejects refund amount exceeding original", () => {
      const p = makePayment({ amount: 100 });
      store.process(p.id);
      const result = store.refund(p.id, 200);
      expect("error" in result).toBe(true);
    });

    test("rejects zero refund amount", () => {
      const p = makePayment({ amount: 100 });
      store.process(p.id);
      const result = store.refund(p.id, 0);
      expect("error" in result).toBe(true);
    });

    test("rejects negative refund amount", () => {
      const p = makePayment({ amount: 100 });
      store.process(p.id);
      const result = store.refund(p.id, -50);
      expect("error" in result).toBe(true);
    });
  });

  describe("cancel", () => {
    test("cancels a pending payment", () => {
      const p = makePayment();
      const result = store.cancel(p.id);
      expect("error" in result).toBe(false);
      expect(store.get(p.id)).toBeUndefined();
    });

    test("rejects cancelling a completed payment", () => {
      const p = makePayment({ amount: 100 });
      store.process(p.id);
      const result = store.cancel(p.id);
      expect("error" in result).toBe(true);
    });

    test("returns error for non-existent payment", () => {
      const result = store.cancel("ghost");
      expect("error" in result).toBe(true);
    });
  });

  describe("generateReceipt", () => {
    test("generates receipt for existing payment", () => {
      const p = makePayment({ amount: 250 });
      const receipt = store.generateReceipt(p.id);
      expect(receipt).not.toBeNull();
      expect(receipt!.paymentId).toBe(p.id);
      expect(receipt!.amount).toBe(250);
      expect(receipt!.formattedAmount).toBe("USD 250.00");
    });

    test("returns null for non-existent payment", () => {
      expect(store.generateReceipt("ghost")).toBeNull();
    });
  });

  describe("stats", () => {
    test("returns zeroed stats when empty", () => {
      const s = store.stats();
      expect(s.totalProcessed).toBe(0);
      expect(s.count).toBe(0);
      expect(Object.keys(s.byStatus)).toHaveLength(0);
      expect(Object.keys(s.byMethod)).toHaveLength(0);
    });

    test("counts by status correctly after processing", () => {
      const p1 = makePayment({ amount: 100 });
      const p2 = makePayment({ amount: 20000 });
      makePayment({ amount: 50 }); // stays pending
      store.process(p1.id); // completed
      store.process(p2.id); // failed
      const s = store.stats();
      expect(s.byStatus["completed"]).toBe(1);
      expect(s.byStatus["failed"]).toBe(1);
      expect(s.byStatus["pending"]).toBe(1);
      expect(s.count).toBe(3);
    });

    test("totalProcessed only includes completed payments", () => {
      const p1 = makePayment({ amount: 300 });
      const p2 = makePayment({ amount: 500 });
      const p3 = makePayment({ amount: 99999 }); // will fail
      store.process(p1.id);
      store.process(p2.id);
      store.process(p3.id);
      const s = store.stats();
      expect(s.totalProcessed).toBe(800);
    });

    test("counts by method correctly", () => {
      makePayment({ method: "credit_card" });
      makePayment({ method: "credit_card" });
      makePayment({ method: "wallet" });
      const s = store.stats();
      expect(s.byMethod["credit_card"]).toBe(2);
      expect(s.byMethod["wallet"]).toBe(1);
    });

    test("counts by currency correctly", () => {
      makePayment({ currency: "USD" });
      makePayment({ currency: "EUR" });
      makePayment({ currency: "USD" });
      const s = store.stats();
      expect(s.byCurrency["USD"]).toBe(2);
      expect(s.byCurrency["EUR"]).toBe(1);
    });
  });

  describe("count / clear", () => {
    test("count reflects number of payments", () => {
      makePayment();
      makePayment();
      expect(store.count()).toBe(2);
    });

    test("clear removes all payments", () => {
      makePayment();
      makePayment();
      store.clear();
      expect(store.count()).toBe(0);
      expect(store.getAll()).toHaveLength(0);
    });
  });
});

describe("MethodStore", () => {
  let methods: MethodStore;

  beforeEach(() => {
    methods = new MethodStore();
  });

  test("starts empty before seed", () => {
    expect(methods.getAll()).toHaveLength(0);
  });

  test("seed populates default payment methods", () => {
    methods.seed();
    const all = methods.getAll();
    expect(all.length).toBeGreaterThanOrEqual(5);
    const types = all.map((m) => m.type);
    expect(types).toContain("credit_card");
    expect(types).toContain("debit_card");
    expect(types).toContain("bank_transfer");
    expect(types).toContain("wallet");
    expect(types).toContain("crypto");
  });

  test("getEnabled returns only enabled methods", () => {
    methods.seed();
    const enabled = methods.getEnabled();
    expect(enabled.every((m) => m.enabled)).toBe(true);
    expect(enabled.length).toBeGreaterThanOrEqual(5);
  });

  test("clear removes all methods", () => {
    methods.seed();
    methods.clear();
    expect(methods.getAll()).toHaveLength(0);
  });

  test("seed replaces previous methods (no duplication)", () => {
    methods.seed();
    const countFirst = methods.getAll().length;
    methods.seed();
    expect(methods.getAll().length).toBe(countFirst);
  });
});
