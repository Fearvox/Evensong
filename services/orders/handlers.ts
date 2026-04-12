// Orders HTTP handlers — factory pattern with createRouter

import {
  success,
  paginated,
  error,
  notFound,
  conflict,
  parseBody,
  getPathSegments,
  getQueryParams,
} from "../shared/http";
import {
  isNonEmptyString,
  isPositiveNumber,
  isPositiveInteger,
  isArray,
  isInEnum,
  isObject,
  validate,
  formatValidationErrors,
} from "../shared/validation";
import type { OrderStatus, OrderItem } from "../shared/types";
import type { OrderStore } from "./store";
import { orderStore as _orderStore } from "./store";

const VALID_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

// Normalize an item from request body — maps legacy `price` → `unitPrice`,
// defaults `name` to `productId` when not provided.
function normalizeItem(raw: Record<string, unknown>): Record<string, unknown> {
  const unitPrice =
    raw.unitPrice !== undefined ? raw.unitPrice : raw.price;
  const name =
    typeof raw.name === "string" && raw.name.length > 0
      ? raw.name
      : raw.productId;
  return { ...raw, unitPrice, name };
}

export function createRouter(
  store: OrderStore,
): (req: Request) => Response | Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const method = req.method;
    const segments = getPathSegments(req.url);

    // All routes start with /orders
    if (segments[0] !== "orders") {
      return notFound("Route not found");
    }

    // --- 4-segment routes: /orders/:id/items/:productId ---

    // DELETE /orders/:id/items/:productId — remove item from order
    if (
      method === "DELETE" &&
      segments.length === 4 &&
      segments[2] === "items"
    ) {
      const id = segments[1];
      const productId = segments[3];
      const order = store.get(id);
      if (!order) return notFound("Order not found");
      if (order.status !== "pending")
        return conflict("Can only remove items from pending orders");

      const result = store.removeItem(id, productId);
      if (result === undefined) return notFound("Item not found in order");
      if (result === "cancelled") {
        const cancelled = store.get(id);
        return success(cancelled);
      }
      return success(result);
    }

    // --- 3-segment routes ---

    // POST /orders/:id/items — add item to order
    if (
      method === "POST" &&
      segments.length === 3 &&
      segments[2] === "items"
    ) {
      const id = segments[1];
      const order = store.get(id);
      if (!order) return notFound("Order not found");
      if (order.status !== "pending")
        return conflict("Can only add items to pending orders");

      const body = await parseBody<Record<string, unknown>>(req);
      if (!body) return error("Invalid request body");

      const normalized = normalizeItem(body);
      const itemErrors = validate([
        { field: "productId", valid: isNonEmptyString(normalized.productId), message: "required" },
        { field: "name", valid: isNonEmptyString(normalized.name), message: "required" },
        { field: "quantity", valid: isPositiveInteger(normalized.quantity), message: "must be a positive integer" },
        { field: "unitPrice", valid: isPositiveNumber(normalized.unitPrice), message: "must be positive" },
      ]);
      if (itemErrors.length > 0) return error(formatValidationErrors(itemErrors));

      const updated = store.addItem(id, normalized as unknown as OrderItem);
      if (!updated) return conflict("Cannot add item to this order");
      return success(updated);
    }

    // PATCH /orders/:id/status — advance order status
    if (
      (method === "PATCH" || method === "PUT") &&
      segments.length === 3 &&
      segments[2] === "status"
    ) {
      const id = segments[1];
      const order = store.get(id);
      if (!order) return notFound("Order not found");
      const body = await parseBody<{ status: unknown }>(req);
      if (!body || !isNonEmptyString(body.status))
        return error("Status is required");
      if (!isInEnum(body.status, VALID_STATUSES))
        return error("Invalid status value");

      if (!store.isValidTransition(order.status, body.status as OrderStatus)) {
        return conflict(
          `Cannot transition from '${order.status}' to '${body.status}'`,
        );
      }
      const updated = store.updateStatus(id, body.status as OrderStatus);
      return success(updated);
    }

    // POST /orders/:id/cancel
    if (
      method === "POST" &&
      segments.length === 3 &&
      segments[2] === "cancel"
    ) {
      const id = segments[1];
      const order = store.get(id);
      if (!order) return notFound("Order not found");
      const cancelled = store.cancel(id);
      if (!cancelled)
        return error(`Cannot cancel order with status '${order.status}'`, 400);
      return success(cancelled);
    }

    // GET /orders/:id/total — recalculate and return order total
    if (
      method === "GET" &&
      segments.length === 3 &&
      segments[2] === "total"
    ) {
      const total = store.recalculateTotal(segments[1]);
      if (total === undefined) return notFound("Order not found");
      return success({ total });
    }

    // GET /orders/:id/timeline or /orders/:id/history
    if (
      method === "GET" &&
      segments.length === 3 &&
      (segments[2] === "timeline" || segments[2] === "history")
    ) {
      const timeline = store.getTimeline(segments[1]);
      if (timeline === undefined) return notFound("Order not found");
      return success(timeline);
    }

    // --- Named 2-segment collection routes ---

    // GET /orders/health
    if (method === "GET" && segments.length === 2 && segments[1] === "health") {
      return success({ status: "ok", service: "orders" });
    }

    // GET /orders/stats
    if (method === "GET" && segments.length === 2 && segments[1] === "stats") {
      return success(store.stats());
    }

    // GET /orders/user/:userId (3 segments: orders, user, :userId)
    if (
      method === "GET" &&
      segments.length === 3 &&
      segments[1] === "user"
    ) {
      const orders = store.findByUser(segments[2]);
      return success(orders);
    }

    // --- Collection routes (1 segment) ---

    // POST /orders — create order
    if (method === "POST" && segments.length === 1) {
      const body = await parseBody(req);
      if (!body) return error("Invalid request body");

      const b = body as Record<string, unknown>;
      const topErrors = validate([
        { field: "userId", valid: isNonEmptyString(b.userId), message: "required" },
        {
          field: "items",
          valid: isArray(b.items) && (b.items as unknown[]).length > 0,
          message: "must be a non-empty array",
        },
      ]);
      if (topErrors.length > 0) return error(formatValidationErrors(topErrors));

      // Validate each item (with normalization)
      const rawItems = b.items as Record<string, unknown>[];
      const normalizedItems: OrderItem[] = [];
      for (let i = 0; i < rawItems.length; i++) {
        const rawItem = rawItems[i];
        if (!isObject(rawItem)) return error(`items[${i}]: must be an object`);
        const item = normalizeItem(rawItem);
        const itemErrors = validate([
          { field: `items[${i}].productId`, valid: isNonEmptyString(item.productId), message: "required" },
          { field: `items[${i}].quantity`, valid: isPositiveInteger(item.quantity), message: "must be a positive integer" },
          { field: `items[${i}].unitPrice`, valid: isPositiveNumber(item.unitPrice), message: "must be positive" },
        ]);
        if (itemErrors.length > 0) return error(formatValidationErrors(itemErrors));
        normalizedItems.push(item as unknown as OrderItem);
      }

      const order = store.create({
        userId: b.userId as string,
        items: normalizedItems,
        currency: typeof b.currency === "string" && b.currency.length > 0 ? b.currency : "USD",
        shippingAddress: typeof b.shippingAddress === "string" ? b.shippingAddress : undefined,
      });
      return success(order, 201);
    }

    // GET /orders — list orders with pagination and filtering
    if (method === "GET" && segments.length === 1) {
      const params = getQueryParams(req.url);
      const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
      const pageSize = Math.max(
        1,
        Math.min(100, parseInt(params.get("pageSize") ?? "20", 10) || 20),
      );
      const userId = params.get("userId") ?? undefined;
      const status = params.get("status") as OrderStatus | undefined;

      const filtered = store.filter({ userId, status });
      const total = filtered.length;
      const start = (page - 1) * pageSize;
      const paged = filtered.slice(start, start + pageSize);
      return paginated(paged, total, page, pageSize);
    }

    // --- Single resource routes (2 segments) ---

    // GET /orders/:id
    if (method === "GET" && segments.length === 2) {
      const order = store.get(segments[1]);
      if (!order) return notFound("Order not found");
      return success(order);
    }

    // PUT /orders/:id — update shipping address (pending only)
    if (method === "PUT" && segments.length === 2) {
      const id = segments[1];
      const order = store.get(id);
      if (!order) return notFound("Order not found");
      if (order.status !== "pending")
        return conflict("Can only update pending orders");

      const body = await parseBody(req);
      if (!body) return error("Invalid request body");

      const b = body as Record<string, unknown>;
      if (!isNonEmptyString(b.shippingAddress)) {
        return error("shippingAddress must be a non-empty string", 400);
      }
      const updated = store.update(id, {
        shippingAddress: b.shippingAddress as string,
      });
      if (!updated) return conflict("Cannot update this order");
      return success(updated);
    }

    // DELETE /orders/:id — cancel order (pending or confirmed only), then remove from store
    if (method === "DELETE" && segments.length === 2) {
      const id = segments[1];
      const order = store.get(id);
      if (!order) return notFound("Order not found");
      const cancelled = store.cancel(id);
      if (!cancelled)
        return conflict(`Cannot cancel order with status '${order.status}'`);
      return success({ ...cancelled, deleted: true });
    }

    return notFound("Endpoint not found");
  };
}

// Singleton export for edge tests that import handleRequest directly
export const handleRequest = createRouter(_orderStore);
