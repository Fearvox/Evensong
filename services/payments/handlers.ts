// Payments service — request handlers (pure function, no server)

import {
  success,
  error,
  notFound,
  paginated,
  parseBody,
  getPathSegments,
  getQueryParams,
  json,
} from "../shared/http";
import {
  isNonEmptyString,
  isPositiveNumber,
  isInEnum,
  validate,
  formatValidationErrors,
} from "../shared/validation";
import type { PaymentMethod, PaymentStatus } from "../shared/types";
import { paymentStore, methodStore, VALID_METHODS, VALID_STATUSES } from "./store";

export { paymentStore, methodStore };

export async function handleRequest(req: Request): Promise<Response> {
  const method = req.method;
  const segments = getPathSegments(req.url);

  if (segments[0] !== "payments") {
    return notFound("Route not found");
  }

  // --- Static routes (matched before :id) ---

  // GET /payments/health
  if (method === "GET" && segments[1] === "health" && !segments[2]) {
    return success({
      status: "ok",
      service: "payments",
      timestamp: new Date().toISOString(),
    });
  }

  // GET /payments/stats
  if (method === "GET" && segments[1] === "stats" && !segments[2]) {
    return success(paymentStore.stats());
  }

  // POST /payments/validate — dry-run validation
  if (method === "POST" && segments[1] === "validate" && !segments[2]) {
    const body = await parseBody<Record<string, unknown>>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      { field: "orderId", valid: isNonEmptyString(body.orderId), message: "orderId is required" },
      { field: "amount", valid: isPositiveNumber(body.amount), message: "amount must be a positive number" },
      { field: "currency", valid: isNonEmptyString(body.currency), message: "currency is required" },
      {
        field: "method",
        valid: isInEnum(body.method, VALID_METHODS),
        message: `method must be one of: ${VALID_METHODS.join(", ")}`,
      },
    ]);

    if (errors.length > 0) {
      return json(
        { success: false, valid: false, errors: errors.map((e) => `${e.field}: ${e.message}`) },
        400,
      );
    }

    return success({ valid: true, message: "Payment details are valid" });
  }

  // GET /payments/order/:orderId
  if (method === "GET" && segments[1] === "order" && segments[2] && !segments[3]) {
    return success(paymentStore.getByOrderId(segments[2]));
  }

  // GET /payments/user/:userId
  if (method === "GET" && segments[1] === "user" && segments[2] && !segments[3]) {
    return success(paymentStore.getByUserId(segments[2]));
  }

  // --- Action routes: /payments/:id/process, /payments/:id/refund, /payments/:id/receipt ---

  // POST /payments/:id/process
  if (method === "POST" && segments[1] && segments[2] === "process" && !segments[3]) {
    const result = paymentStore.process(segments[1]);
    if ("error" in result) {
      if (result.error === "Payment not found") return notFound(result.error);
      return error(result.error, 400);
    }
    return success(result);
  }

  // POST /payments/:id/refund
  if (method === "POST" && segments[1] && segments[2] === "refund" && !segments[3]) {
    const body = await parseBody<{ amount?: number; reason?: string }>(req);
    const result = paymentStore.refund(segments[1], body?.amount, body?.reason);
    if ("error" in result) {
      if (result.error === "Payment not found") return notFound(result.error);
      return error(result.error, 400);
    }
    return json(
      { success: true, data: { refund: result.refund, original: result.original } },
      201,
    );
  }

  // GET /payments/:id/receipt
  if (method === "GET" && segments[1] && segments[2] === "receipt" && !segments[3]) {
    const receipt = paymentStore.generateReceipt(segments[1]);
    if (!receipt) return notFound("Payment not found");
    return success(receipt);
  }

  // --- CRUD routes ---

  // POST /payments — create payment
  if (method === "POST" && !segments[1]) {
    const body = await parseBody(req);
    if (!body) return error("Invalid or missing request body");

    const b = body as Record<string, unknown>;
    const errors = validate([
      { field: "orderId", valid: isNonEmptyString(b.orderId), message: "orderId is required" },
      { field: "amount", valid: isPositiveNumber(b.amount), message: "amount must be a positive number" },
      { field: "currency", valid: isNonEmptyString(b.currency), message: "currency is required" },
      {
        field: "method",
        valid: isInEnum(b.method, VALID_METHODS),
        message: `method must be one of: ${VALID_METHODS.join(", ")}`,
      },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    const payment = paymentStore.create({
      orderId: b.orderId as string,
      userId: typeof b.userId === "string" ? b.userId : undefined,
      amount: b.amount as number,
      currency: b.currency as string,
      method: b.method as PaymentMethod,
    });

    return json({ success: true, data: payment }, 201);
  }

  // GET /payments — list with filters and pagination
  if (method === "GET" && !segments[1]) {
    const params = getQueryParams(req.url);
    const page = Math.max(1, parseInt(params.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(params.get("pageSize") || "20", 10)));

    const orderId = params.get("orderId") || undefined;
    const userId = params.get("userId") || undefined;
    const status = params.get("status") as PaymentStatus | undefined;
    const paymentMethod = params.get("method") as PaymentMethod | undefined;

    if (status && !isInEnum(status, VALID_STATUSES)) {
      return error(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`);
    }
    if (paymentMethod && !isInEnum(paymentMethod, VALID_METHODS)) {
      return error(`Invalid method. Must be one of: ${VALID_METHODS.join(", ")}`);
    }

    let payments = paymentStore.filter({
      orderId,
      userId,
      status,
      method: paymentMethod,
    });

    const total = payments.length;
    const start = (page - 1) * pageSize;
    payments = payments.slice(start, start + pageSize);

    return paginated(payments, total, page, pageSize);
  }

  // GET /payments/:id
  if (method === "GET" && segments[1] && !segments[2]) {
    const payment = paymentStore.get(segments[1]);
    if (!payment) return notFound("Payment not found");
    return success(payment);
  }

  // DELETE /payments/:id — cancel pending payment only
  if (method === "DELETE" && segments[1] && !segments[2]) {
    const result = paymentStore.cancel(segments[1]);
    if ("error" in result) {
      if (result.error === "Payment not found") return notFound(result.error);
      return error(result.error, 400);
    }
    return success({ message: "Payment cancelled", payment: result });
  }

  return notFound("Route not found");
}
