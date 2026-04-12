/**
 * Products service — core functionality tests
 * CRUD, search, filters, stock, categories, bulk price
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { productStore, categoryStore } from "../store";

// --- Helpers ---

async function req(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) init.body = JSON.stringify(body);
  const res = await handleRequest(new Request(`http://localhost:3003${path}`, init));
  return { status: res.status, json: (await res.json()) as any };
}

const sample = {
  name: "Widget Pro",
  description: "A premium widget",
  price: 29.99,
  stock: 100,
  category: "widgets",
  tags: ["premium", "new"],
};

beforeEach(() => {
  productStore.clear();
  categoryStore.clear();
});

// --- CRUD ---

describe("Product CRUD", () => {
  test("POST /products — create product with all fields", async () => {
    const res = await req("POST", "/products", sample);
    expect(res.status).toBe(201);
    expect(res.json.success).toBe(true);
    expect(res.json.data.name).toBe("Widget Pro");
    expect(res.json.data.price).toBe(29.99);
    expect(res.json.data.stock).toBe(100);
    expect(res.json.data.category).toBe("widgets");
    expect(res.json.data.tags).toEqual(["premium", "new"]);
    expect(res.json.data.active).toBe(true);
    expect(res.json.data.currency).toBe("USD");
    expect(res.json.data.id).toBeTruthy();
    expect(res.json.data.createdAt).toBeTruthy();
  });

  test("POST /products — defaults applied (currency, active, tags)", async () => {
    const res = await req("POST", "/products", {
      name: "Basic",
      price: 5,
      stock: 0,
      category: "misc",
    });
    expect(res.status).toBe(201);
    expect(res.json.data.currency).toBe("USD");
    expect(res.json.data.active).toBe(true);
    expect(res.json.data.tags).toEqual([]);
    expect(res.json.data.description).toBe("");
  });

  test("GET /products/:id — retrieve existing product", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    const res = await req("GET", `/products/${id}`);
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe(id);
    expect(res.json.data.name).toBe("Widget Pro");
  });

  test("GET /products/:id — not found returns 404", async () => {
    const res = await req("GET", "/products/nonexistent");
    expect(res.status).toBe(404);
    expect(res.json.success).toBe(false);
  });

  test("PUT /products/:id — update specific fields", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    const res = await req("PUT", `/products/${id}`, {
      name: "Widget Pro V2",
      price: 39.99,
    });
    expect(res.status).toBe(200);
    expect(res.json.data.name).toBe("Widget Pro V2");
    expect(res.json.data.price).toBe(39.99);
    expect(res.json.data.stock).toBe(100); // unchanged
  });

  test("PUT /products/:id — not found returns 404", async () => {
    const res = await req("PUT", "/products/nonexistent", { name: "X" });
    expect(res.status).toBe(404);
  });

  test("DELETE /products/:id — delete product", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    const del = await req("DELETE", `/products/${id}`);
    expect(del.status).toBe(200);
    expect(del.json.data.deleted).toBe(true);

    const get = await req("GET", `/products/${id}`);
    expect(get.status).toBe(404);
  });

  test("DELETE /products/:id — not found returns 404", async () => {
    const res = await req("DELETE", "/products/nonexistent");
    expect(res.status).toBe(404);
  });

  test("GET /products — list all products", async () => {
    await req("POST", "/products", { ...sample, name: "A" });
    await req("POST", "/products", { ...sample, name: "B" });
    const res = await req("GET", "/products");
    expect(res.status).toBe(200);
    expect(res.json.data.length).toBe(2);
  });
});

// --- Search via query param ---

describe("Product search", () => {
  test("GET /products?search= — search by name", async () => {
    await req("POST", "/products", { ...sample, name: "Wireless Mouse" });
    await req("POST", "/products", { ...sample, name: "Keyboard" });
    const res = await req("GET", "/products?search=wireless");
    expect(res.status).toBe(200);
    expect(res.json.data.length).toBe(1);
    expect(res.json.data[0].name).toBe("Wireless Mouse");
  });

  test("GET /products?search= — search by description", async () => {
    await req("POST", "/products", {
      ...sample,
      name: "Headphones",
      description: "noise-cancelling premium",
    });
    await req("POST", "/products", { ...sample, name: "Speaker" });
    const res = await req("GET", "/products?search=cancelling");
    expect(res.status).toBe(200);
    expect(res.json.data.length).toBe(1);
  });

  test("GET /products?search= — search by tag", async () => {
    await req("POST", "/products", { ...sample, tags: ["wireless", "bluetooth"] });
    await req("POST", "/products", { ...sample, name: "Wired", tags: ["wired"] });
    const res = await req("GET", "/products?search=bluetooth");
    expect(res.json.data.length).toBe(1);
  });

  test("GET /products?search= — case insensitive", async () => {
    await req("POST", "/products", { ...sample, name: "UPPERCASE THING" });
    const res = await req("GET", "/products?search=uppercase");
    expect(res.json.data.length).toBe(1);
  });
});

// --- Filters ---

describe("Product filters", () => {
  test("filter by category", async () => {
    await req("POST", "/products", { ...sample, category: "electronics" });
    await req("POST", "/products", { ...sample, category: "clothing" });
    const res = await req("GET", "/products?category=electronics");
    expect(res.json.data.length).toBe(1);
    expect(res.json.data[0].category).toBe("electronics");
  });
});

// --- Stock ---

describe("Stock management", () => {
  test("POST /products/:id/stock — add stock", async () => {
    const created = await req("POST", "/products", { ...sample, stock: 10 });
    const id = created.json.data.id;
    const res = await req("POST", `/products/${id}/stock`, { quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.json.data.stock).toBe(15);
  });

  test("POST /products/:id/stock — reduce stock", async () => {
    const created = await req("POST", "/products", { ...sample, stock: 10 });
    const id = created.json.data.id;
    const res = await req("POST", `/products/${id}/stock`, { quantity: -3 });
    expect(res.status).toBe(200);
    expect(res.json.data.stock).toBe(7);
  });

  test("POST /products/:id/stock — below zero returns 400", async () => {
    const created = await req("POST", "/products", { ...sample, stock: 5 });
    const id = created.json.data.id;
    const res = await req("POST", `/products/${id}/stock`, { quantity: -10 });
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
  });

  test("POST /products/:id/stock — reduce to exactly zero", async () => {
    const created = await req("POST", "/products", { ...sample, stock: 5 });
    const id = created.json.data.id;
    const res = await req("POST", `/products/${id}/stock`, { quantity: -5 });
    expect(res.status).toBe(200);
    expect(res.json.data.stock).toBe(0);
  });
});

// --- Categories ---

describe("Categories", () => {
  test("POST /products/categories — create category", async () => {
    const res = await req("POST", "/products/categories", { name: "electronics" });
    expect(res.status).toBe(201);
    expect(res.json.data.name).toBe("electronics");
    expect(res.json.data.id).toBeTruthy();
  });

  test("POST /products/categories — duplicate returns 409", async () => {
    await req("POST", "/products/categories", { name: "electronics" });
    const res = await req("POST", "/products/categories", { name: "electronics" });
    expect(res.status).toBe(409);
  });

  test("GET /products/categories — list all categories", async () => {
    await req("POST", "/products/categories", { name: "a" });
    await req("POST", "/products/categories", { name: "b" });
    const res = await req("GET", "/products/categories");
    expect(res.status).toBe(200);
    expect(res.json.data.length).toBe(2);
  });
});

// --- Low stock ---

describe("Low stock", () => {
  test("GET /products/low-stock — returns products below threshold", async () => {
    await req("POST", "/products", { ...sample, stock: 2 });
    await req("POST", "/products", { ...sample, stock: 100 });
    const res = await req("GET", "/products/low-stock?threshold=5");
    expect(res.status).toBe(200);
    expect(res.json.data.length).toBe(1);
    expect(res.json.data[0].stock).toBe(2);
  });
});
