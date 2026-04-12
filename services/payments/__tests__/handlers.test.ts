import { describe, test, expect, beforeEach } from "bun:test";
import { handleRequest, paymentStore, methodStore } from "../handlers";

// Helper to build Request objects
function req(method: string, path: string, body?: unknown): Request {
  const url = `http://localhost:3005${path}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init);
}

async function json(r: Response) {
  return r.json() as Promise<Record<string, unknown>>;
}

function paymentBody(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-1",
    userId: "user-1",
    amount: 250,
    currency: "USD",
    method: "credit_card",
    ...overrides,
  };
}

describe("Payments handlers", () => {
  beforeEach(() => {
    paymentStore.clear();
    methodStore.clear();
    methodStore.seed();
  });

  // --- POST /payments ---

  describe("POST /payments", () => {
    test("creates a payment and returns 201", async () => {
      const res = await handleRequest(req("POST", "/payments", paymentBody()));
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.success).toBe(true);
      const data = body.data as Record<string, unknown>;
      expect(data.orderId).toBe("order-1");
      expect(data.status).toBe("pending");
      expect(data.id).toBeTruthy();
    });

    test("rejects missing orderId", async () => {
      const res = await handleRequest(req("POST", "/payments", paymentBody({ orderId: "" })));
      expect(res.status).toBe(400);
    });

    test("rejects negative amount", async () => {
      const res = await handleRequest(req("POST", "/payments", paymentBody({ amount: -10 })));
      expect(res.status).toBe(400);
    });

    test("rejects zero amount", async () => {
      const res = await handleRequest(req("POST", "/payments", paymentBody({ amount: 0 })));
      expect(res.status).toBe(400);
    });

    test("rejects invalid method", async () => {
      const res = await handleRequest(req("POST", "/payments", paymentBody({ method: "cash" })));
      expect(res.status).toBe(400);
    });

    test("rejects missing currency", async () => {
      const res = await handleRequest(req("POST", "/payments", paymentBody({ currency: "" })));
      expect(res.status).toBe(400);
    });

    test("rejects empty body", async () => {
      const res = await handleRequest(req("POST", "/payments"));
      expect(res.status).toBe(400);
    });

    test("creates payment without userId", async () => {
      const res = await handleRequest(req("POST", "/payments", paymentBody({ userId: undefined })));
      expect(res.status).toBe(201);
      const body = await json(res);
      expect((body.data as Record<string, unknown>).userId).toBe("");
    });
  });

  // --- GET /payments ---

  describe("GET /payments", () => {
    test("returns empty data when no payments exist", async () => {
      const res = await handleRequest(req("GET", "/payments"));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data).toEqual([]);
    });

    test("returns all payments", async () => {
      await handleRequest(req("POST", "/payments", paymentBody()));
      await handleRequest(req("POST", "/payments", paymentBody({ orderId: "order-2" })));
      const res = await handleRequest(req("GET", "/payments"));
      const body = await json(res);
      expect((body.data as unknown[]).length).toBe(2);
    });

    test("filters by orderId", async () => {
      await handleRequest(req("POST", "/payments", paymentBody({ orderId: "o1" })));
      await handleRequest(req("POST", "/payments", paymentBody({ orderId: "o2" })));
      const res = await handleRequest(req("GET", "/payments?orderId=o1"));
      const body = await json(res);
      const payments = body.data as unknown[];
      expect(payments.length).toBe(1);
    });

    test("filters by userId", async () => {
      await handleRequest(req("POST", "/payments", paymentBody({ userId: "u1" })));
      await handleRequest(req("POST", "/payments", paymentBody({ userId: "u2" })));
      const res = await handleRequest(req("GET", "/payments?userId=u1"));
      const body = await json(res);
      expect((body.data as unknown[]).length).toBe(1);
    });

    test("filters by status", async () => {
      const r1 = await handleRequest(req("POST", "/payments", paymentBody({ amount: 100 })));
      const p1 = (await json(r1)).data as Record<string, unknown>;
      await handleRequest(req("POST", `/payments/${p1.id}/process`));
      await handleRequest(req("POST", "/payments", paymentBody({ amount: 50 })));

      const res = await handleRequest(req("GET", "/payments?status=completed"));
      const body = await json(res);
      expect((body.data as unknown[]).length).toBe(1);
    });

    test("includes pagination metadata", async () => {
      await handleRequest(req("POST", "/payments", paymentBody()));
      const res = await handleRequest(req("GET", "/payments"));
      const body = await json(res);
      expect(body.total).toBeDefined();
      expect(body.page).toBeDefined();
      expect(body.pageSize).toBeDefined();
    });
  });

  // --- GET /payments/:id ---

  describe("GET /payments/:id", () => {
    test("returns payment by id", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody()));
      const created = (await json(r)).data as Record<string, unknown>;
      const res = await handleRequest(req("GET", `/payments/${created.id}`));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect((body.data as Record<string, unknown>).id).toBe(created.id);
    });

    test("returns 404 for non-existent id", async () => {
      const res = await handleRequest(req("GET", "/payments/nonexistent"));
      expect(res.status).toBe(404);
    });
  });

  // --- DELETE /payments/:id ---

  describe("DELETE /payments/:id", () => {
    test("cancels a pending payment", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody()));
      const created = (await json(r)).data as Record<string, unknown>;
      const res = await handleRequest(req("DELETE", `/payments/${created.id}`));
      expect(res.status).toBe(200);
    });

    test("returns 404 for non-existent id", async () => {
      const res = await handleRequest(req("DELETE", "/payments/ghost"));
      expect(res.status).toBe(404);
    });

    test("payment is gone after cancel", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody()));
      const created = (await json(r)).data as Record<string, unknown>;
      await handleRequest(req("DELETE", `/payments/${created.id}`));
      const res = await handleRequest(req("GET", `/payments/${created.id}`));
      expect(res.status).toBe(404);
    });

    test("cannot cancel a completed payment", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody({ amount: 100 })));
      const created = (await json(r)).data as Record<string, unknown>;
      await handleRequest(req("POST", `/payments/${created.id}/process`));
      const res = await handleRequest(req("DELETE", `/payments/${created.id}`));
      expect(res.status).toBe(400);
    });
  });

  // --- POST /payments/:id/process ---

  describe("POST /payments/:id/process", () => {
    test("succeeds for amount <= 10000", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody({ amount: 5000 })));
      const created = (await json(r)).data as Record<string, unknown>;
      const res = await handleRequest(req("POST", `/payments/${created.id}/process`));
      expect(res.status).toBe(200);
      const body = await json(res);
      const data = body.data as Record<string, unknown>;
      expect(data.status).toBe("completed");
      expect(data.transactionRef).toBeTruthy();
      expect((data.transactionRef as string).startsWith("TXN-")).toBe(true);
    });

    test("fails for amount > 10000", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody({ amount: 15000 })));
      const created = (await json(r)).data as Record<string, unknown>;
      const res = await handleRequest(req("POST", `/payments/${created.id}/process`));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect((body.data as Record<string, unknown>).status).toBe("failed");
    });

    test("returns 404 for non-existent payment", async () => {
      const res = await handleRequest(req("POST", "/payments/ghost/process"));
      expect(res.status).toBe(404);
    });

    test("rejects processing a non-pending payment", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody({ amount: 100 })));
      const created = (await json(r)).data as Record<string, unknown>;
      await handleRequest(req("POST", `/payments/${created.id}/process`));
      const res = await handleRequest(req("POST", `/payments/${created.id}/process`));
      expect(res.status).toBe(400);
    });

    test("boundary: exactly 10000 succeeds", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody({ amount: 10000 })));
      const created = (await json(r)).data as Record<string, unknown>;
      const res = await handleRequest(req("POST", `/payments/${created.id}/process`));
      const body = await json(res);
      expect((body.data as Record<string, unknown>).status).toBe("completed");
    });
  });

  // --- POST /payments/:id/refund ---

  describe("POST /payments/:id/refund", () => {
    async function createAndProcess(amount = 500): Promise<string> {
      const r = await handleRequest(req("POST", "/payments", paymentBody({ amount })));
      const id = ((await json(r)).data as Record<string, unknown>).id as string;
      await handleRequest(req("POST", `/payments/${id}/process`));
      return id;
    }

    test("refunds a completed payment and returns 201", async () => {
      const id = await createAndProcess(500);
      const res = await handleRequest(req("POST", `/payments/${id}/refund`));
      expect(res.status).toBe(201);
      const body = await json(res);
      const data = body.data as Record<string, unknown>;
      const refund = data.refund as Record<string, unknown>;
      const original = data.original as Record<string, unknown>;
      expect(original.status).toBe("refunded");
      expect(refund.amount).toBe(-500);
      expect(refund.status).toBe("refunded");
      expect((refund.transactionRef as string).startsWith("RFN-")).toBe(true);
    });

    test("creates a new payment record for the refund", async () => {
      const id = await createAndProcess(300);
      const beforeCount = paymentStore.getAll().length;
      await handleRequest(req("POST", `/payments/${id}/refund`));
      expect(paymentStore.getAll().length).toBe(beforeCount + 1);
    });

    test("supports partial refund with custom amount", async () => {
      const id = await createAndProcess(1000);
      const res = await handleRequest(req("POST", `/payments/${id}/refund`, { amount: 250 }));
      expect(res.status).toBe(201);
      const body = await json(res);
      const refund = (body.data as Record<string, unknown>).refund as Record<string, unknown>;
      expect(refund.amount).toBe(-250);
    });

    test("rejects double refund", async () => {
      const id = await createAndProcess(500);
      await handleRequest(req("POST", `/payments/${id}/refund`));
      const res = await handleRequest(req("POST", `/payments/${id}/refund`));
      expect(res.status).toBe(400);
    });

    test("rejects refund of pending payment", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody()));
      const id = ((await json(r)).data as Record<string, unknown>).id as string;
      const res = await handleRequest(req("POST", `/payments/${id}/refund`));
      expect(res.status).toBe(400);
    });

    test("rejects refund of failed payment", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody({ amount: 20000 })));
      const id = ((await json(r)).data as Record<string, unknown>).id as string;
      await handleRequest(req("POST", `/payments/${id}/process`));
      const res = await handleRequest(req("POST", `/payments/${id}/refund`));
      expect(res.status).toBe(400);
    });

    test("returns 404 for non-existent payment", async () => {
      const res = await handleRequest(req("POST", "/payments/ghost/refund"));
      expect(res.status).toBe(404);
    });
  });

  // --- GET /payments/stats ---

  describe("GET /payments/stats", () => {
    test("returns zeroed stats when empty", async () => {
      const res = await handleRequest(req("GET", "/payments/stats"));
      expect(res.status).toBe(200);
      const body = await json(res);
      const data = body.data as Record<string, unknown>;
      expect(data.totalProcessed).toBe(0);
      expect(data.count).toBe(0);
    });

    test("reflects completed payment amounts", async () => {
      const r1 = await handleRequest(req("POST", "/payments", paymentBody({ amount: 200 })));
      const id1 = ((await json(r1)).data as Record<string, unknown>).id as string;
      const r2 = await handleRequest(req("POST", "/payments", paymentBody({ amount: 300 })));
      const id2 = ((await json(r2)).data as Record<string, unknown>).id as string;
      await handleRequest(req("POST", `/payments/${id1}/process`));
      await handleRequest(req("POST", `/payments/${id2}/process`));

      const res = await handleRequest(req("GET", "/payments/stats"));
      const data = (await json(res)).data as Record<string, unknown>;
      expect(data.totalProcessed).toBe(500);
    });

    test("includes byStatus and byMethod breakdowns", async () => {
      const r = await handleRequest(req("POST", "/payments", paymentBody({ amount: 100 })));
      const id = ((await json(r)).data as Record<string, unknown>).id as string;
      await handleRequest(req("POST", `/payments/${id}/process`));

      const res = await handleRequest(req("GET", "/payments/stats"));
      const data = (await json(res)).data as Record<string, unknown>;
      expect(data.byStatus).toBeDefined();
      expect(data.byMethod).toBeDefined();
    });
  });

  // --- GET /payments/methods ---

  describe("GET /payments/methods", () => {
    test("returns seeded payment methods", async () => {
      const res = await handleRequest(req("GET", "/payments/methods"));
      expect(res.status).toBe(200);
      const body = await json(res);
      const methods = body.data as Array<Record<string, unknown>>;
      expect(methods.length).toBeGreaterThanOrEqual(5);
    });

    test("returns empty when not seeded", async () => {
      methodStore.clear();
      const res = await handleRequest(req("GET", "/payments/methods"));
      const body = await json(res);
      expect(body.data).toEqual([]);
    });
  });

  // --- GET /payments/health ---

  describe("GET /payments/health", () => {
    test("returns ok status", async () => {
      const res = await handleRequest(req("GET", "/payments/health"));
      expect(res.status).toBe(200);
      const body = await json(res);
      const data = body.data as Record<string, unknown>;
      expect(data.status).toBe("ok");
      expect(data.service).toBe("payments");
    });
  });

  // --- Unknown routes ---

  describe("unknown routes", () => {
    test("returns 404 for unknown root path", async () => {
      const res = await handleRequest(req("GET", "/unknown"));
      expect(res.status).toBe(404);
    });
  });
});
