import { describe, test, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { productStore, categoryStore } from "../store";

function req(method: string, path: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(`http://localhost:3003${path}`, init);
}

async function call(method: string, path: string, body?: unknown) {
  const res = await handleRequest(req(method, path, body));
  return { status: res.status, json: (await res.json()) as any };
}

const validProduct = {
  name: "Widget",
  description: "A widget",
  price: 29.99,
  category: "gadgets",
  stock: 100,
  tags: ["cool"],
};

beforeEach(() => {
  productStore.clear();
  categoryStore.clear();
});

describe("POST /products", () => {
  test("creates product with valid data — 201", async () => {
    const { status, json } = await call("POST", "/products", validProduct);
    expect(status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Widget");
    expect(json.data.id).toBeDefined();
  });

  test("defaults currency to USD", async () => {
    const { json } = await call("POST", "/products", validProduct);
    expect(json.data.currency).toBe("USD");
  });

  test("uses provided currency", async () => {
    const { json } = await call("POST", "/products", { ...validProduct, currency: "EUR" });
    expect(json.data.currency).toBe("EUR");
  });

  test("defaults tags to empty array when not provided", async () => {
    const { name, price, category, stock } = validProduct;
    const { json } = await call("POST", "/products", { name, price, category, stock });
    expect(json.data.tags).toEqual([]);
  });

  test("rejects missing name — 400", async () => {
    const { status, json } = await call("POST", "/products", { ...validProduct, name: "" });
    expect(status).toBe(400);
    expect(json.success).toBe(false);
  });

  test("rejects non-positive price — 400", async () => {
    const { status } = await call("POST", "/products", { ...validProduct, price: 0 });
    expect(status).toBe(400);
  });

  test("rejects negative price — 400", async () => {
    const { status } = await call("POST", "/products", { ...validProduct, price: -5 });
    expect(status).toBe(400);
  });

  test("rejects negative stock — 400", async () => {
    const { status } = await call("POST", "/products", { ...validProduct, stock: -1 });
    expect(status).toBe(400);
  });

  test("rejects non-integer stock — 400", async () => {
    const { status } = await call("POST", "/products", { ...validProduct, stock: 5.5 });
    expect(status).toBe(400);
  });

  test("rejects missing category — 400", async () => {
    const { status } = await call("POST", "/products", { ...validProduct, category: "" });
    expect(status).toBe(400);
  });

  test("rejects non-array tags — 400", async () => {
    const { status } = await call("POST", "/products", { ...validProduct, tags: "bad" });
    expect(status).toBe(400);
  });

  test("rejects empty body — 400", async () => {
    const res = await handleRequest(
      new Request("http://localhost:3003/products", { method: "POST" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /products", () => {
  test("returns empty list initially", async () => {
    const { status, json } = await call("GET", "/products");
    expect(status).toBe(200);
    expect(json.data).toEqual([]);
  });

  test("returns all products", async () => {
    await call("POST", "/products", validProduct);
    await call("POST", "/products", { ...validProduct, name: "Gizmo" });
    const { json } = await call("GET", "/products");
    expect(json.data).toHaveLength(2);
  });

  test("filters by category", async () => {
    await call("POST", "/products", { ...validProduct, category: "A" });
    await call("POST", "/products", { ...validProduct, category: "B" });
    const { json } = await call("GET", "/products?category=A");
    expect(json.data).toHaveLength(1);
    expect(json.data[0].category).toBe("A");
  });

  test("filters by search query in name", async () => {
    await call("POST", "/products", { ...validProduct, name: "Blue Sprocket", description: "item one" });
    await call("POST", "/products", { ...validProduct, name: "Red Gadget", description: "item two" });
    const { json } = await call("GET", "/products?search=sprocket");
    expect(json.data).toHaveLength(1);
    expect(json.data[0].name).toBe("Blue Sprocket");
  });

  test("filters by search query in tags", async () => {
    await call("POST", "/products", { ...validProduct, tags: ["organic"] });
    await call("POST", "/products", { ...validProduct, tags: ["synthetic"] });
    const { json } = await call("GET", "/products?search=organic");
    expect(json.data).toHaveLength(1);
  });

  test("combines category and search filters", async () => {
    await call("POST", "/products", { ...validProduct, name: "Blue Widget", category: "A" });
    await call("POST", "/products", { ...validProduct, name: "Blue Gadget", category: "B" });
    await call("POST", "/products", { ...validProduct, name: "Red Widget", category: "A" });
    const { json } = await call("GET", "/products?category=A&search=blue");
    expect(json.data).toHaveLength(1);
    expect(json.data[0].name).toBe("Blue Widget");
  });
});

describe("GET /products/:id", () => {
  test("returns product by id — 200", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status, json } = await call("GET", `/products/${created.data.id}`);
    expect(status).toBe(200);
    expect(json.data.name).toBe("Widget");
  });

  test("returns 404 for non-existent id", async () => {
    const { status, json } = await call("GET", "/products/nonexistent");
    expect(status).toBe(404);
    expect(json.success).toBe(false);
  });
});

describe("PUT /products/:id", () => {
  test("updates product fields — 200", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const id = created.data.id;
    const { status, json } = await call("PUT", `/products/${id}`, { name: "Super Widget", price: 49.99 });
    expect(status).toBe(200);
    expect(json.data.name).toBe("Super Widget");
    expect(json.data.price).toBe(49.99);
    expect(json.data.category).toBe("gadgets");
  });

  test("returns 404 for non-existent id", async () => {
    const { status } = await call("PUT", "/products/nope", { name: "X" });
    expect(status).toBe(404);
  });

  test("rejects invalid name — 400", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status } = await call("PUT", `/products/${created.data.id}`, { name: "" });
    expect(status).toBe(400);
  });

  test("rejects invalid price — 400", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status } = await call("PUT", `/products/${created.data.id}`, { price: -10 });
    expect(status).toBe(400);
  });

  test("rejects invalid stock — 400", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status } = await call("PUT", `/products/${created.data.id}`, { stock: -1 });
    expect(status).toBe(400);
  });

  test("rejects non-boolean active — 400", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status } = await call("PUT", `/products/${created.data.id}`, { active: "yes" });
    expect(status).toBe(400);
  });

  test("rejects non-array tags — 400", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status } = await call("PUT", `/products/${created.data.id}`, { tags: "bad" });
    expect(status).toBe(400);
  });

  test("rejects non-string description — 400", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status } = await call("PUT", `/products/${created.data.id}`, { description: 123 });
    expect(status).toBe(400);
  });

  test("updates active flag", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { json } = await call("PUT", `/products/${created.data.id}`, { active: false });
    expect(json.data.active).toBe(false);
  });
});

describe("DELETE /products/:id", () => {
  test("deletes product — 200", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status, json } = await call("DELETE", `/products/${created.data.id}`);
    expect(status).toBe(200);
    expect(json.data.deleted).toBe(true);
  });

  test("returns 404 for non-existent id", async () => {
    const { status } = await call("DELETE", "/products/nope");
    expect(status).toBe(404);
  });

  test("product is gone after delete", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    await call("DELETE", `/products/${created.data.id}`);
    const { status } = await call("GET", `/products/${created.data.id}`);
    expect(status).toBe(404);
  });
});

describe("POST /products/:id/stock", () => {
  test("adds stock with positive quantity — 200", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status, json } = await call("POST", `/products/${created.data.id}/stock`, { quantity: 50 });
    expect(status).toBe(200);
    expect(json.data.stock).toBe(150);
  });

  test("subtracts stock with negative quantity — 200", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status, json } = await call("POST", `/products/${created.data.id}/stock`, { quantity: -30 });
    expect(status).toBe(200);
    expect(json.data.stock).toBe(70);
  });

  test("returns 400 when stock would go negative", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status, json } = await call("POST", `/products/${created.data.id}/stock`, { quantity: -200 });
    expect(status).toBe(400);
    expect(json.error).toBe("Insufficient stock");
  });

  test("returns 404 for non-existent product", async () => {
    const { status } = await call("POST", "/products/nope/stock", { quantity: 10 });
    expect(status).toBe(404);
  });

  test("rejects non-number quantity — 400", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const { status } = await call("POST", `/products/${created.data.id}/stock`, { quantity: "ten" });
    expect(status).toBe(400);
  });

  test("rejects missing body — 400", async () => {
    const { json: created } = await call("POST", "/products", validProduct);
    const res = await handleRequest(
      new Request(`http://localhost:3003/products/${created.data.id}/stock`, { method: "POST" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /products/low-stock", () => {
  test("returns products at or below default threshold (10)", async () => {
    await call("POST", "/products", { ...validProduct, stock: 5 });
    await call("POST", "/products", { ...validProduct, stock: 10 });
    await call("POST", "/products", { ...validProduct, stock: 50 });
    const { json } = await call("GET", "/products/low-stock");
    expect(json.data).toHaveLength(2);
  });

  test("uses custom threshold", async () => {
    await call("POST", "/products", { ...validProduct, stock: 5 });
    await call("POST", "/products", { ...validProduct, stock: 20 });
    const { json } = await call("GET", "/products/low-stock?threshold=3");
    expect(json.data).toHaveLength(0);
  });

  test("returns empty array when no low-stock products", async () => {
    await call("POST", "/products", { ...validProduct, stock: 100 });
    const { json } = await call("GET", "/products/low-stock?threshold=5");
    expect(json.data).toEqual([]);
  });
});

describe("POST /products/categories", () => {
  test("creates category — 201", async () => {
    const { status, json } = await call("POST", "/products/categories", { name: "Electronics" });
    expect(status).toBe(201);
    expect(json.data.name).toBe("Electronics");
    expect(json.data.id).toBeDefined();
  });

  test("rejects duplicate category name — 409", async () => {
    await call("POST", "/products/categories", { name: "Electronics" });
    const { status, json } = await call("POST", "/products/categories", { name: "Electronics" });
    expect(status).toBe(409);
    expect(json.success).toBe(false);
  });

  test("rejects empty name — 400", async () => {
    const { status } = await call("POST", "/products/categories", { name: "" });
    expect(status).toBe(400);
  });

  test("rejects missing body — 400", async () => {
    const res = await handleRequest(
      new Request("http://localhost:3003/products/categories", { method: "POST" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /products/categories", () => {
  test("returns empty list initially", async () => {
    const { json } = await call("GET", "/products/categories");
    expect(json.data).toEqual([]);
  });

  test("returns all categories", async () => {
    await call("POST", "/products/categories", { name: "A" });
    await call("POST", "/products/categories", { name: "B" });
    const { json } = await call("GET", "/products/categories");
    expect(json.data).toHaveLength(2);
  });
});

describe("POST /products/bulk-price", () => {
  test("updates prices for matching category", async () => {
    await call("POST", "/products", { ...validProduct, category: "electronics", price: 100 });
    await call("POST", "/products", { ...validProduct, category: "electronics", price: 200 });
    await call("POST", "/products", { ...validProduct, category: "books", price: 50 });
    const { status, json } = await call("POST", "/products/bulk-price", {
      category: "electronics",
      adjustment: 15,
    });
    expect(status).toBe(200);
    expect(json.data.updated).toBe(2);
    expect(json.data.products[0].price).toBe(115);
    expect(json.data.products[1].price).toBe(215);
  });

  test("returns 0 updated for non-existent category", async () => {
    const { json } = await call("POST", "/products/bulk-price", {
      category: "nope",
      adjustment: 10,
    });
    expect(json.data.updated).toBe(0);
  });

  test("rejects missing category — 400", async () => {
    const { status } = await call("POST", "/products/bulk-price", { adjustment: 10 });
    expect(status).toBe(400);
  });

  test("rejects missing adjustment — 400", async () => {
    const { status } = await call("POST", "/products/bulk-price", { category: "A" });
    expect(status).toBe(400);
  });

  test("supports negative adjustment", async () => {
    await call("POST", "/products", { ...validProduct, category: "A", price: 100 });
    const { json } = await call("POST", "/products/bulk-price", { category: "A", adjustment: -20 });
    expect(json.data.products[0].price).toBe(80);
  });
});

describe("unknown routes", () => {
  test("returns 404 for unknown route", async () => {
    const { status } = await call("GET", "/unknown");
    expect(status).toBe(404);
  });

  test("returns 404 for unsupported method on valid path", async () => {
    const { status } = await call("PATCH", "/products");
    expect(status).toBe(404);
  });
});
