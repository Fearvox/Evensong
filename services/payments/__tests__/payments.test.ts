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
  amount: 99.99,
  currency: "USD",
  method: "credit_card",
};

beforeEach(() => paymentStore.clear());

// --- Health ---

describe("GET /payments/health", () => {
  test("returns ok", async () => {
    const r = await req("GET", "/payments/health");
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("ok");
    expect(r.json.data.service).toBe("payments");
  });
});

// --- Create ---

describe("POST /payments", () => {
  test("creates payment with valid data", async () => {
    const r = await req("POST", "/payments", valid);
    expect(r.status).toBe(201);
    expect(r.json.success).toBe(true);
    expect(r.json.data.orderId).toBe("order_001");
    expect(r.json.data.userId).toBe("user_001");
    expect(r.json.data.amount).toBe(99.99);
    expect(r.json.data.currency).toBe("USD");
    expect(r.json.data.method).toBe("credit_card");
    expect(r.json.data.status).toBe("pending");
    expect(r.json.data.id).toBeTruthy();
  });

  test("normalizes currency to uppercase", async () => {
    const r = await req("POST", "/payments", { ...valid, currency: "eur" });
    expect(r.status).toBe(201);
    expect(r.json.data.currency).toBe("EUR");
  });

  test("rejects missing orderId", async () => {
    const r = await req("POST", "/payments", { ...valid, orderId: "" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("orderId");
  });

  test("rejects negative amount", async () => {
    const r = await req("POST", "/payments", { ...valid, amount: -10 });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("amount");
  });

  test("rejects zero amount", async () => {
    const r = await req("POST", "/payments", { ...valid, amount: 0 });
    expect(r.status).toBe(400);
  });

  test("rejects invalid method", async () => {
    const r = await req("POST", "/payments", { ...valid, method: "paypal" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("method");
  });

  test("rejects missing currency", async () => {
    const r = await req("POST", "/payments", { ...valid, currency: "" });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("currency");
  });

  test("rejects empty body", async () => {
    const res = await handleRequest(
      new Request("http://localhost:3005/payments", { method: "POST" }),
    );
    expect(res.status).toBe(400);
  });

  test("rejects malformed JSON", async () => {
    const res = await handleRequest(
      new Request("http://localhost:3005/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad json",
      }),
    );
    expect(res.status).toBe(400);
  });
});

// --- Read ---

describe("GET /payments/:id", () => {
  test("returns payment by ID", async () => {
    const c = await req("POST", "/payments", valid);
    const r = await req("GET", `/payments/${c.json.data.id}`);
    expect(r.status).toBe(200);
    expect(r.json.data.id).toBe(c.json.data.id);
    expect(r.json.data.amount).toBe(99.99);
  });

  test("returns 404 for unknown ID", async () => {
    const r = await req("GET", "/payments/nonexistent");
    expect(r.status).toBe(404);
  });
});

// --- List ---

describe("GET /payments", () => {
  test("lists all with pagination", async () => {
    await req("POST", "/payments", valid);
    await req("POST", "/payments", { ...valid, orderId: "order_002", amount: 50 });
    const r = await req("GET", "/payments");
    expect(r.status).toBe(200);
    expect(r.json.data.length).toBe(2);
    expect(r.json.total).toBe(2);
    expect(r.json.page).toBe(1);
  });

  test("filters by orderId", async () => {
    await req("POST", "/payments", valid);
    await req("POST", "/payments", { ...valid, orderId: "order_002" });
    const r = await req("GET", "/payments?orderId=order_002");
    expect(r.json.data.length).toBe(1);
    expect(r.json.data[0].orderId).toBe("order_002");
  });

  test("filters by userId", async () => {
    await req("POST", "/payments", valid);
    await req("POST", "/payments", { ...valid, userId: "user_002" });
    const r = await req("GET", "/payments?userId=user_002");
    expect(r.json.data.length).toBe(1);
  });

  test("filters by status", async () => {
    const c = await req("POST", "/payments", valid);
    await req("POST", `/payments/${c.json.data.id}/process`);
    await req("POST", "/payments", { ...valid, orderId: "order_002" });
    const r = await req("GET", "/payments?status=completed");
    expect(r.json.data.length).toBe(1);
    expect(r.json.data[0].status).toBe("completed");
  });

  test("filters by method", async () => {
    await req("POST", "/payments", valid);
    await req("POST", "/payments", { ...valid, method: "wallet" });
    const r = await req("GET", "/payments?method=wallet");
    expect(r.json.data.length).toBe(1);
    expect(r.json.data[0].method).toBe("wallet");
  });

  test("paginates correctly", async () => {
    for (let i = 0; i < 5; i++) {
      await req("POST", "/payments", { ...valid, orderId: `order_${i}` });
    }
    const r = await req("GET", "/payments?page=2&pageSize=2");
    expect(r.json.data.length).toBe(2);
    expect(r.json.page).toBe(2);
    expect(r.json.total).toBe(5);
  });
});

// --- Process ---

describe("POST /payments/:id/process", () => {
  test("succeeds for amount <= 10000", async () => {
    const c = await req("POST", "/payments", valid);
    const r = await req("POST", `/payments/${c.json.data.id}/process`);
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("completed");
    expect(r.json.data.transactionRef).toBeTruthy();
  });

  test("fails for amount > 10000", async () => {
    const c = await req("POST", "/payments", { ...valid, amount: 15000 });
    const r = await req("POST", `/payments/${c.json.data.id}/process`);
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("failed");
  });

  test("rejects processing non-pending payment", async () => {
    const c = await req("POST", "/payments", valid);
    await req("POST", `/payments/${c.json.data.id}/process`);
    const r = await req("POST", `/payments/${c.json.data.id}/process`);
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("Cannot process");
  });

  test("returns 404 for unknown ID", async () => {
    const r = await req("POST", "/payments/nonexistent/process");
    expect(r.status).toBe(404);
  });
});

// --- Refund ---

describe("POST /payments/:id/refund", () => {
  test("refunds a completed payment", async () => {
    const c = await req("POST", "/payments", valid);
    await req("POST", `/payments/${c.json.data.id}/process`);
    const r = await req("POST", `/payments/${c.json.data.id}/refund`);
    expect(r.status).toBe(201);
    expect(r.json.data.original.status).toBe("refunded");
    expect(r.json.data.refund.amount).toBe(-99.99);
  });

  test("rejects refund of pending payment", async () => {
    const c = await req("POST", "/payments", valid);
    const r = await req("POST", `/payments/${c.json.data.id}/refund`);
    expect(r.status).toBe(400);
    expect(r.json.error).toContain("completed");
  });

  test("rejects refund of failed payment", async () => {
    const c = await req("POST", "/payments", { ...valid, amount: 15000 });
    await req("POST", `/payments/${c.json.data.id}/process`);
    const r = await req("POST", `/payments/${c.json.data.id}/refund`);
    expect(r.status).toBe(400);
  });

  test("supports partial refund amount", async () => {
    const c = await req("POST", "/payments", { ...valid, amount: 200 });
    await req("POST", `/payments/${c.json.data.id}/process`);
    const r = await req("POST", `/payments/${c.json.data.id}/refund`, { amount: 50, reason: "Partial" });
    expect(r.status).toBe(201);
    expect(r.json.data.refund.amount).toBe(-50);
  });
});
