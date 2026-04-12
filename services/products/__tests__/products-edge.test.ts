/**
 * Products service — edge cases and validation tests
 * Validation errors, bulk operations, boundary conditions, stock history
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
  name: "Edge Widget",
  description: "For edge case testing",
  price: 19.99,
  stock: 50,
  category: "testing",
  tags: ["edge"],
};

beforeEach(() => {
  productStore.clear();
  categoryStore.clear();
});

// --- Validation ---

describe("Validation", () => {
  test("POST /products — missing name", async () => {
    const res = await req("POST", "/products", { price: 10, stock: 5, category: "x" });
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toContain("name");
  });

  test("POST /products — missing price", async () => {
    const res = await req("POST", "/products", { name: "X", stock: 5, category: "x" });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("price");
  });

  test("POST /products — negative price", async () => {
    const res = await req("POST", "/products", { name: "X", price: -5, stock: 0, category: "x" });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("price");
  });

  test("POST /products — zero price rejected (must be positive)", async () => {
    const res = await req("POST", "/products", { name: "X", price: 0, stock: 0, category: "x" });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("price");
  });

  test("POST /products — negative stock", async () => {
    const res = await req("POST", "/products", { name: "X", price: 10, stock: -1, category: "x" });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("stock");
  });

  test("POST /products — missing category", async () => {
    const res = await req("POST", "/products", { name: "X", price: 10, stock: 0 });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("category");
  });

  test("POST /products — invalid JSON body", async () => {
    const rawRes = await handleRequest(
      new Request("http://localhost:3003/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );
    expect(rawRes.status).toBe(400);
  });

  test("POST /products — tags must be array", async () => {
    const res = await req("POST", "/products", {
      ...sample,
      tags: "not-array",
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("tags");
  });

  test("PUT /products/:id — invalid price", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    const res = await req("PUT", `/products/${id}`, { price: -10 });
    expect(res.status).toBe(400);
  });

  test("PUT /products/:id — invalid stock", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    const res = await req("PUT", `/products/${id}`, { stock: -5 });
    expect(res.status).toBe(400);
  });

  test("PUT /products/:id — empty name rejected", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    const res = await req("PUT", `/products/${id}`, { name: "" });
    expect(res.status).toBe(400);
  });

  test("PUT /products/:id — tags must be array", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    const res = await req("PUT", `/products/${id}`, { tags: "not-array" });
    expect(res.status).toBe(400);
  });

  test("PUT /products/:id — active must be boolean", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    const res = await req("PUT", `/products/${id}`, { active: "yes" });
    expect(res.status).toBe(400);
  });

  test("POST /products/:id/stock — non-number quantity", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    const res = await req("POST", `/products/${id}/stock`, { quantity: "five" });
    expect(res.status).toBe(400);
  });

  test("POST /products/:id/stock — non-existent product", async () => {
    const res = await req("POST", "/products/nonexistent/stock", { quantity: 5 });
    expect(res.status).toBe(404);
  });

  test("POST /products/categories — missing name", async () => {
    const res = await req("POST", "/products/categories", {});
    expect(res.status).toBe(400);
  });
});

// --- Bulk Price Update ---

describe("Bulk price update", () => {
  test("increase price for category", async () => {
    await req("POST", "/products", { ...sample, price: 100, category: "elec" });
    await req("POST", "/products", { ...sample, price: 200, category: "elec" });
    await req("POST", "/products", { ...sample, price: 50, category: "other" });
    const res = await req("POST", "/products/bulk-price", {
      category: "elec",
      adjustment: 10,
    });
    expect(res.status).toBe(200);
    expect(res.json.data.updated).toBe(2);
    expect(res.json.data.products[0].price).toBe(110);
    expect(res.json.data.products[1].price).toBe(210);
  });

  test("decrease price for category", async () => {
    await req("POST", "/products", { ...sample, price: 100, category: "sale" });
    const res = await req("POST", "/products/bulk-price", {
      category: "sale",
      adjustment: -20,
    });
    expect(res.json.data.products[0].price).toBe(80);
  });

  test("price cannot go below zero", async () => {
    await req("POST", "/products", { ...sample, price: 10, category: "cheap" });
    const res = await req("POST", "/products/bulk-price", {
      category: "cheap",
      adjustment: -20,
    });
    // Product with price 10 - 20 = -10, should be skipped (newPrice < 0)
    expect(res.json.data.updated).toBe(0);
  });

  test("missing category returns error", async () => {
    const res = await req("POST", "/products/bulk-price", { adjustment: 5 });
    expect(res.status).toBe(400);
  });

  test("missing adjustment returns error", async () => {
    const res = await req("POST", "/products/bulk-price", { category: "x" });
    expect(res.status).toBe(400);
  });
});

// --- Stock history ---

describe("Stock history (store level)", () => {
  test("stock changes are recorded", async () => {
    const created = await req("POST", "/products", { ...sample, stock: 10 });
    const id = created.json.data.id;
    await req("POST", `/products/${id}/stock`, { quantity: 5 });
    await req("POST", `/products/${id}/stock`, { quantity: -3 });
    const history = productStore.getStockHistory(id);
    // initial + 2 adjustments
    expect(history.length).toBe(3);
    expect(history[0].reason).toBe("initial");
    expect(history[1].reason).toBe("add");
    expect(history[2].reason).toBe("subtract");
  });
});

// --- Edge cases ---

describe("Edge cases", () => {
  test("empty tags array is valid", async () => {
    const res = await req("POST", "/products", { ...sample, tags: [] });
    expect(res.status).toBe(201);
    expect(res.json.data.tags).toEqual([]);
  });

  test("unknown route returns 404", async () => {
    const res = await req("GET", "/unknown");
    expect(res.status).toBe(404);
  });

  test("PUT updates only specified fields", async () => {
    const created = await req("POST", "/products", sample);
    const id = created.json.data.id;
    await req("PUT", `/products/${id}`, { active: false });
    const get = await req("GET", `/products/${id}`);
    expect(get.json.data.active).toBe(false);
    expect(get.json.data.name).toBe("Edge Widget"); // unchanged
    expect(get.json.data.price).toBe(19.99); // unchanged
  });

  test("update with custom currency", async () => {
    const created = await req("POST", "/products", { ...sample, currency: "EUR" });
    const id = created.json.data.id;
    expect(created.json.data.currency).toBe("EUR");
    const res = await req("PUT", `/products/${id}`, { currency: "GBP" });
    expect(res.json.data.currency).toBe("GBP");
  });

  test("multiple products same category counted in low-stock", async () => {
    await req("POST", "/products", { ...sample, stock: 1 });
    await req("POST", "/products", { ...sample, stock: 3 });
    await req("POST", "/products", { ...sample, stock: 100 });
    const res = await req("GET", "/products/low-stock?threshold=5");
    expect(res.json.data.length).toBe(2);
  });

  test("search and category filter combined", async () => {
    await req("POST", "/products", { ...sample, name: "Red Shoe", category: "shoes" });
    await req("POST", "/products", { ...sample, name: "Red Hat", category: "hats" });
    const res = await req("GET", "/products?category=shoes&search=red");
    expect(res.json.data.length).toBe(1);
    expect(res.json.data[0].name).toBe("Red Shoe");
  });
});
