import {
  success,
  error,
  notFound,
  parseBody,
  getPathSegments,
  getQueryParams,
} from "../shared/http";
import {
  isNonEmptyString,
  isPositiveNumber,
  isNonNegativeInteger,
  isArray,
  validate,
  formatValidationErrors,
} from "../shared/validation";
import { productStore, categoryStore } from "./store";

export async function handleRequest(req: Request): Promise<Response> {
  const method = req.method;
  const segments = getPathSegments(req.url);
  const params = getQueryParams(req.url);

  // --- Category routes (must be checked before :id routes) ---

  // POST /products/categories
  if (method === "POST" && segments[0] === "products" && segments[1] === "categories" && segments.length === 2) {
    const body = await parseBody<{ name: unknown }>(req);
    if (!body) return error("Invalid or missing request body");
    if (!isNonEmptyString(body.name)) return error("name is required");

    const existing = categoryStore.findByName(body.name as string);
    if (existing) return error("Category already exists", 409);

    const category = categoryStore.create(body.name as string);
    return success(category, 201);
  }

  // GET /products/categories
  if (method === "GET" && segments[0] === "products" && segments[1] === "categories" && segments.length === 2) {
    return success(categoryStore.getAll());
  }

  // --- Bulk price update ---

  // POST /products/bulk-price
  if (method === "POST" && segments[0] === "products" && segments[1] === "bulk-price" && segments.length === 2) {
    const body = await parseBody<{ category: unknown; adjustment: unknown }>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      { field: "category", valid: isNonEmptyString(body.category), message: "category is required" },
      { field: "adjustment", valid: typeof body.adjustment === "number" && isFinite(body.adjustment as number), message: "adjustment must be a number" },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    const updated = productStore.bulkPriceUpdate(body.category as string, body.adjustment as number);
    return success({ updated: updated.length, products: updated });
  }

  // --- Low stock ---

  // GET /products/low-stock
  if (method === "GET" && segments[0] === "products" && segments[1] === "low-stock" && segments.length === 2) {
    const threshold = parseInt(params.get("threshold") ?? "10", 10);
    const t = isNaN(threshold) ? 10 : threshold;
    return success(productStore.getLowStock(t));
  }

  // --- Stock adjustment ---

  // POST /products/:id/stock
  if (method === "POST" && segments[0] === "products" && segments[2] === "stock" && segments.length === 3) {
    const id = segments[1];
    const body = await parseBody<{ quantity: unknown }>(req);
    if (!body) return error("Invalid or missing request body");
    if (typeof body.quantity !== "number" || !isFinite(body.quantity as number)) {
      return error("quantity must be a number");
    }

    const result = productStore.adjustStock(id, body.quantity as number);
    if (result.error) {
      if (result.error === "Product not found") return notFound("Product not found");
      return error(result.error);
    }
    return success(result.product);
  }

  // --- CRUD ---

  // POST /products
  if (method === "POST" && segments[0] === "products" && segments.length === 1) {
    const body = await parseBody<{
      name: unknown;
      description: unknown;
      price: unknown;
      currency: unknown;
      category: unknown;
      stock: unknown;
      tags: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const errors = validate([
      { field: "name", valid: isNonEmptyString(body.name), message: "name is required" },
      { field: "price", valid: isPositiveNumber(body.price), message: "price must be a positive number" },
      { field: "category", valid: isNonEmptyString(body.category), message: "category is required" },
      { field: "stock", valid: isNonNegativeInteger(body.stock), message: "stock must be a non-negative integer" },
    ]);
    if (errors.length > 0) return error(formatValidationErrors(errors));

    if (body.tags !== undefined && !isArray(body.tags)) {
      return error("tags must be an array");
    }

    const product = productStore.create({
      name: body.name as string,
      description: body.description as string | undefined,
      price: body.price as number,
      currency: body.currency as string | undefined,
      category: body.category as string,
      stock: body.stock as number,
      tags: body.tags as string[] | undefined,
    });
    return success(product, 201);
  }

  // GET /products
  if (method === "GET" && segments[0] === "products" && segments.length === 1) {
    const category = params.get("category");
    const searchQuery = params.get("search");

    let products = productStore.getAll();

    if (category) {
      products = products.filter((p) => p.category === category);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return success(products);
  }

  // GET /products/:id
  if (method === "GET" && segments[0] === "products" && segments.length === 2) {
    const id = segments[1];
    const product = productStore.get(id);
    if (!product) return notFound("Product not found");
    return success(product);
  }

  // PUT /products/:id
  if (method === "PUT" && segments[0] === "products" && segments.length === 2) {
    const id = segments[1];
    const product = productStore.get(id);
    if (!product) return notFound("Product not found");

    const body = await parseBody<{
      name?: unknown;
      description?: unknown;
      price?: unknown;
      currency?: unknown;
      category?: unknown;
      stock?: unknown;
      active?: unknown;
      tags?: unknown;
    }>(req);
    if (!body) return error("Invalid or missing request body");

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!isNonEmptyString(body.name)) return error("name must be a non-empty string");
      updates.name = body.name;
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string") return error("description must be a string");
      updates.description = body.description;
    }
    if (body.price !== undefined) {
      if (!isPositiveNumber(body.price)) return error("price must be a positive number");
      updates.price = body.price;
    }
    if (body.currency !== undefined) {
      if (!isNonEmptyString(body.currency)) return error("currency must be a non-empty string");
      updates.currency = body.currency;
    }
    if (body.category !== undefined) {
      if (!isNonEmptyString(body.category)) return error("category must be a non-empty string");
      updates.category = body.category;
    }
    if (body.stock !== undefined) {
      if (!isNonNegativeInteger(body.stock)) return error("stock must be a non-negative integer");
      updates.stock = body.stock;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") return error("active must be a boolean");
      updates.active = body.active;
    }
    if (body.tags !== undefined) {
      if (!isArray(body.tags)) return error("tags must be an array");
      updates.tags = body.tags;
    }

    const updated = productStore.update(id, updates);
    return success(updated);
  }

  // DELETE /products/:id
  if (method === "DELETE" && segments[0] === "products" && segments.length === 2) {
    const id = segments[1];
    const product = productStore.get(id);
    if (!product) return notFound("Product not found");
    productStore.delete(id);
    return success({ deleted: true });
  }

  return notFound("Route not found");
}
