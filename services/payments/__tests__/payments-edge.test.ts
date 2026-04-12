import { describe, test, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { paymentStore } from "../store";

async function req(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await handleRequest(new Request(`http://localhost:3005${path}`, init));
  return { status: res.status, json: (await res.json()) as any };
}

const valid = {
  orderId: "order_001",
  userId: "user_001",
  amount: 100,
  currency: "USD",
  method: "credit_card" as const,
};

beforeEach(() => paymentStore.clear());

// --- Order/user lookups ---

describe("GET /payments/order/:orderId", () => {
  test("returns payments for an order", async () => {
    await req("POST", "/payments", valid);
    await req("POST", "/payments", { ...valid, amount: 50 });
    await req("POST", "/payments", { ...valid, orderId: "order_999" });
    const r = await req("GET", "/payments/order/order_001");
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBe(2);
  });

  test("returns empty array for unknown order", async () => {
    const r = await req("GET", "/payments/order/nonexistent");
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual([]);
  });
});

describe("GET /payments/user/:userId", () => {
  test("returns payments for a user", async () => {
    await req("POST", "/payments", valid);
    await req("POST", "/payments", { ...valid, userId: "user_002" });
    const r = await req("GET", "/payments/user/user_001");
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBe(1);
  });
});

// --- Receipt ---

describe("GET /payments/:id/receipt", () => {
  test("generates receipt for existing payment", async () => {
    const c = await req("POST", "/payments", valid);
    const r = await req("GET", `/payments/${c.json.data.id}/receipt`);
    expect(r.status).toBe(200);
    expect(r.json.data.paymentId).toBe(c.json.data.id);
    expect(r.json.data.formattedAmount).toBe("USD 100.00");
    expect(r.json.data.receiptId).toContain("rcpt_");
  });

  test("returns 404 for unknown payment receipt", async () => {
    const r = await req("GET", "/payments/nonexistent/receipt");
    expect(r.status).toBe(404);
  });
});

// --- Stats ---

describe("GET /payments/stats", () => {
  test("returns correct statistics", async () => {
    const p1 = await req("POST", "/payments", valid);
    const p2 = await req("POST", "/payments", { ...valid, amount: 200, currency: "EUR", method: "wallet" });
    const p3 = await req("POST", "/payments", { ...valid, amount: 15000 });
    await req("POST", `/payments/${p1.json.data.id}/process`);
    await req("POST", `/payments/${p2.json.data.id}/process`);
    await req("POST", `/payments/${p3.json.data.id}/process`);

    const r = await req("GET", "/payments/stats");
    expect(r.status).toBe(200);
    expect(r.json.data.totalProcessed).toBe(300); // 100 + 200
    expect(r.json.data.count).toBe(3);
    expect(r.json.data.byStatus.completed).toBe(2);
    expect(r.json.data.byStatus.failed).toBe(1);
    expect(r.json.data.byMethod.credit_card).toBe(2);
    expect(r.json.data.byMethod.wallet).toBe(1);
    expect(r.json.data.byCurrency.USD).toBe(2);
    expect(r.json.data.byCurrency.EUR).toBe(1);
  });

  test("returns zeros when empty", async () => {
    const r = await req("GET", "/payments/stats");
    expect(r.json.data.totalProcessed).toBe(0);
    expect(r.json.data.count).toBe(0);
  });
});

// --- Validate (dry run) ---

describe("POST /payments/validate", () => {
  test("validates correct payment details", async () => {
    const r = await req("POST", "/payments/validate", valid);
    expect(r.status).toBe(200);
    expect(r.json.data.valid).toBe(true);
  });

  test("rejects invalid details", async () => {
    const r = await req("POST", "/payments/validate", { orderId: "", amount: -1 });
    expect(r.status).toBe(400);
    expect(r.json.valid).toBe(false);
    expect(r.json.errors.length).toBeGreaterThan(0);
  });
});

// --- Cancel (DELETE) ---

describe("DELETE /payments/:id", () => {
  test("cancels a pending payment", async () => {
    const c = await req("POST", "/payments", valid);
    const r = await req("DELETE", `/payments/${c.json.data.id}`);
    expect(r.status).toBe(200);
    expect(r.json.data.message).toBe("Payment cancelled");
    // Verify it's gone
    const check = await req("GET", `/payments/${c.json.data.id}`);
    expect(check.status).toBe(404);
  });

  test("rejects cancelling completed payment", async () => {
    const c = await req("POST", "/payments", valid);
    await req("POST", `/payments/${c.json.data.id}/process`);
    const r = await req("DELETE", `/payments/${c.json.data.id}`);
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("Cannot cancel");
  });

  test("returns 404 for unknown payment", async () => {
    const r = await req("DELETE", "/payments/nonexistent");
    expect(r.status).toBe(404);
  });
});

// --- Multiple currencies ---

describe("multiple currencies", () => {
  test("supports USD, EUR, GBP, JPY, CNY", async () => {
    const currencies = ["USD", "EUR", "GBP", "JPY", "CNY"];
    for (const currency of currencies) {
      const r = await req("POST", "/payments", { ...valid, currency });
      expect(r.status).toBe(201);
      expect(r.json.data.currency).toBe(currency);
    }
    const r = await req("GET", "/payments");
    expect(r.json.data.length).toBe(5);
  });
});

// --- Edge: process already-failed ---

describe("edge: process already-failed payment", () => {
  test("cannot process a failed payment", async () => {
    const c = await req("POST", "/payments", { ...valid, amount: 20000 });
    await req("POST", `/payments/${c.json.data.id}/process`);
    const r = await req("POST", `/payments/${c.json.data.id}/process`);
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("Cannot process");
  });
});

// --- Edge: refund already-refunded ---

describe("edge: refund already-refunded payment", () => {
  test("cannot refund a refunded payment", async () => {
    const c = await req("POST", "/payments", valid);
    await req("POST", `/payments/${c.json.data.id}/process`);
    await req("POST", `/payments/${c.json.data.id}/refund`);
    const r = await req("POST", `/payments/${c.json.data.id}/refund`);
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("already been refunded");
  });
});

// --- Edge: unknown route ---

describe("edge: unknown routes", () => {
  test("returns 404 for non-payments path", async () => {
    const r = await req("GET", "/unknown");
    expect(r.status).toBe(404);
  });

  test("returns 404 for unknown sub-route", async () => {
    const r = await req("GET", "/payments/some-id/unknown");
    expect(r.status).toBe(404);
  });
});

// --- Edge: boundary amount 10000 ---

describe("edge: boundary amount", () => {
  test("amount exactly 10000 succeeds", async () => {
    const c = await req("POST", "/payments", { ...valid, amount: 10000 });
    const r = await req("POST", `/payments/${c.json.data.id}/process`);
    expect(r.json.data.status).toBe("completed");
  });

  test("amount 10001 fails", async () => {
    const c = await req("POST", "/payments", { ...valid, amount: 10001 });
    const r = await req("POST", `/payments/${c.json.data.id}/process`);
    expect(r.json.data.status).toBe("failed");
  });
});
