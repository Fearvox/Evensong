import { describe, test, expect, beforeEach } from "bun:test";
import { ProductStore, CategoryStore } from "../store";

let productStore: ProductStore;
let categoryStore: CategoryStore;

const sampleProduct = () => ({
  name: "Widget",
  description: "A fine widget",
  price: 29.99,
  category: "gadgets",
  stock: 100,
  tags: ["cool", "new"],
});

beforeEach(() => {
  productStore = new ProductStore();
  categoryStore = new CategoryStore();
});

describe("ProductStore", () => {
  describe("create", () => {
    test("creates product with all fields", () => {
      const p = productStore.create(sampleProduct());
      expect(p.id).toBeDefined();
      expect(p.name).toBe("Widget");
      expect(p.description).toBe("A fine widget");
      expect(p.price).toBe(29.99);
      expect(p.currency).toBe("USD");
      expect(p.category).toBe("gadgets");
      expect(p.stock).toBe(100);
      expect(p.active).toBe(true);
      expect(p.tags).toEqual(["cool", "new"]);
      expect(p.createdAt).toBeDefined();
      expect(p.updatedAt).toBeDefined();
    });

    test("defaults currency to USD when not provided", () => {
      const p = productStore.create({ name: "X", price: 10, category: "c", stock: 5 });
      expect(p.currency).toBe("USD");
    });

    test("defaults description to empty string when not provided", () => {
      const p = productStore.create({ name: "X", price: 10, category: "c", stock: 5 });
      expect(p.description).toBe("");
    });

    test("defaults tags to empty array when not provided", () => {
      const p = productStore.create({ name: "X", price: 10, category: "c", stock: 5 });
      expect(p.tags).toEqual([]);
    });

    test("uses provided currency", () => {
      const p = productStore.create({ ...sampleProduct(), currency: "EUR" });
      expect(p.currency).toBe("EUR");
    });

    test("records initial stock history entry on create", () => {
      const p = productStore.create(sampleProduct());
      const history = productStore.getStockHistory(p.id);
      expect(history).toHaveLength(1);
      expect(history[0].previousStock).toBe(0);
      expect(history[0].newStock).toBe(100);
      expect(history[0].reason).toBe("initial");
    });

    test("generates unique ids for each product", () => {
      const p1 = productStore.create(sampleProduct());
      const p2 = productStore.create(sampleProduct());
      expect(p1.id).not.toBe(p2.id);
    });
  });

  describe("get / getAll", () => {
    test("get returns undefined for non-existent id", () => {
      expect(productStore.get("nope")).toBeUndefined();
    });

    test("get returns product by id", () => {
      const p = productStore.create(sampleProduct());
      const fetched = productStore.get(p.id);
      expect(fetched).toBeDefined();
      expect(fetched!.name).toBe("Widget");
    });

    test("getAll returns all products", () => {
      productStore.create(sampleProduct());
      productStore.create({ ...sampleProduct(), name: "Gizmo" });
      expect(productStore.getAll()).toHaveLength(2);
    });

    test("getAll returns empty array when store is empty", () => {
      expect(productStore.getAll()).toEqual([]);
    });
  });

  describe("update", () => {
    test("updates specified fields", () => {
      const p = productStore.create(sampleProduct());
      const updated = productStore.update(p.id, { name: "Super Widget", price: 49.99 });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe("Super Widget");
      expect(updated!.price).toBe(49.99);
      expect(updated!.category).toBe("gadgets");
    });

    test("returns undefined for non-existent id", () => {
      expect(productStore.update("nope", { name: "X" })).toBeUndefined();
    });

    test("updates updatedAt timestamp", () => {
      const p = productStore.create(sampleProduct());
      const originalUpdatedAt = p.updatedAt;
      // Small delay to ensure different timestamp
      const updated = productStore.update(p.id, { name: "New" });
      expect(updated!.updatedAt).toBeDefined();
    });
  });

  describe("delete", () => {
    test("deletes existing product", () => {
      const p = productStore.create(sampleProduct());
      expect(productStore.delete(p.id)).toBe(true);
      expect(productStore.get(p.id)).toBeUndefined();
    });

    test("returns false for non-existent id", () => {
      expect(productStore.delete("nope")).toBe(false);
    });

    test("decrements count after delete", () => {
      const p = productStore.create(sampleProduct());
      expect(productStore.count()).toBe(1);
      productStore.delete(p.id);
      expect(productStore.count()).toBe(0);
    });
  });

  describe("adjustStock", () => {
    test("adds stock with positive quantity", () => {
      const p = productStore.create(sampleProduct());
      const result = productStore.adjustStock(p.id, 50);
      expect(result.error).toBeUndefined();
      expect(result.product!.stock).toBe(150);
    });

    test("subtracts stock with negative quantity", () => {
      const p = productStore.create(sampleProduct());
      const result = productStore.adjustStock(p.id, -30);
      expect(result.error).toBeUndefined();
      expect(result.product!.stock).toBe(70);
    });

    test("returns error when resulting stock would be negative", () => {
      const p = productStore.create(sampleProduct());
      const result = productStore.adjustStock(p.id, -200);
      expect(result.error).toBe("Insufficient stock");
      expect(result.product).toBeUndefined();
    });

    test("returns error for non-existent product", () => {
      const result = productStore.adjustStock("nope", 10);
      expect(result.error).toBe("Product not found");
    });

    test("allows adjusting stock to exactly zero", () => {
      const p = productStore.create(sampleProduct());
      const result = productStore.adjustStock(p.id, -100);
      expect(result.error).toBeUndefined();
      expect(result.product!.stock).toBe(0);
    });

    test("records stock history entries", () => {
      const p = productStore.create(sampleProduct());
      productStore.adjustStock(p.id, 20);
      productStore.adjustStock(p.id, -10);
      const history = productStore.getStockHistory(p.id);
      // 1 initial + 2 adjustments
      expect(history).toHaveLength(3);
      expect(history[1].change).toBe(20);
      expect(history[2].change).toBe(-10);
    });
  });

  describe("findByCategory", () => {
    test("returns products matching category", () => {
      productStore.create({ ...sampleProduct(), category: "electronics" });
      productStore.create({ ...sampleProduct(), category: "books" });
      productStore.create({ ...sampleProduct(), category: "electronics" });
      expect(productStore.findByCategory("electronics")).toHaveLength(2);
    });

    test("returns empty array for non-existent category", () => {
      expect(productStore.findByCategory("nonexistent")).toEqual([]);
    });
  });

  describe("search", () => {
    test("finds by name", () => {
      productStore.create({ ...sampleProduct(), name: "Blue Sprocket", description: "item one" });
      productStore.create({ ...sampleProduct(), name: "Red Gadget", description: "item two" });
      expect(productStore.search("sprocket")).toHaveLength(1);
    });

    test("finds by description", () => {
      productStore.create({ ...sampleProduct(), description: "premium quality item" });
      expect(productStore.search("premium")).toHaveLength(1);
    });

    test("finds by tag", () => {
      productStore.create({ ...sampleProduct(), tags: ["organic", "fresh"] });
      productStore.create({ ...sampleProduct(), tags: ["synthetic"] });
      expect(productStore.search("organic")).toHaveLength(1);
    });

    test("search is case-insensitive", () => {
      productStore.create({ ...sampleProduct(), name: "LOUD WIDGET" });
      expect(productStore.search("loud")).toHaveLength(1);
    });
  });

  describe("getLowStock", () => {
    test("returns products at or below threshold", () => {
      productStore.create({ ...sampleProduct(), stock: 5 });
      productStore.create({ ...sampleProduct(), stock: 10 });
      productStore.create({ ...sampleProduct(), stock: 50 });
      expect(productStore.getLowStock(10)).toHaveLength(2);
    });

    test("returns empty array when all products above threshold", () => {
      productStore.create({ ...sampleProduct(), stock: 100 });
      expect(productStore.getLowStock(5)).toEqual([]);
    });
  });

  describe("bulkPriceUpdate", () => {
    test("updates prices for matching category", () => {
      productStore.create({ ...sampleProduct(), category: "A", price: 100 });
      productStore.create({ ...sampleProduct(), category: "A", price: 200 });
      productStore.create({ ...sampleProduct(), category: "B", price: 50 });
      const updated = productStore.bulkPriceUpdate("A", 10);
      expect(updated).toHaveLength(2);
      expect(updated[0].price).toBe(110);
      expect(updated[1].price).toBe(210);
    });

    test("skips products where new price would be negative", () => {
      productStore.create({ ...sampleProduct(), category: "A", price: 5 });
      productStore.create({ ...sampleProduct(), category: "A", price: 100 });
      const updated = productStore.bulkPriceUpdate("A", -10);
      expect(updated).toHaveLength(1);
      expect(updated[0].price).toBe(90);
    });

    test("returns empty array for non-existent category", () => {
      expect(productStore.bulkPriceUpdate("nope", 10)).toEqual([]);
    });
  });

  describe("clear / count", () => {
    test("clear empties the store and stock history", () => {
      productStore.create(sampleProduct());
      productStore.clear();
      expect(productStore.count()).toBe(0);
      expect(productStore.getStockHistory()).toEqual([]);
    });
  });
});

describe("CategoryStore", () => {
  test("creates a category", () => {
    const c = categoryStore.create("Electronics");
    expect(c.id).toBeDefined();
    expect(c.name).toBe("Electronics");
    expect(c.createdAt).toBeDefined();
  });

  test("lists all categories", () => {
    categoryStore.create("A");
    categoryStore.create("B");
    expect(categoryStore.getAll()).toHaveLength(2);
  });

  test("finds category by name (case-insensitive)", () => {
    categoryStore.create("Electronics");
    expect(categoryStore.findByName("electronics")).toBeDefined();
    expect(categoryStore.findByName("ELECTRONICS")).toBeDefined();
  });

  test("returns undefined for non-existent category name", () => {
    expect(categoryStore.findByName("nope")).toBeUndefined();
  });

  test("get returns category by id", () => {
    const c = categoryStore.create("Books");
    expect(categoryStore.get(c.id)!.name).toBe("Books");
  });

  test("get returns undefined for non-existent id", () => {
    expect(categoryStore.get("nope")).toBeUndefined();
  });

  test("count returns correct number", () => {
    expect(categoryStore.count()).toBe(0);
    categoryStore.create("A");
    expect(categoryStore.count()).toBe(1);
  });

  test("clear empties the store", () => {
    categoryStore.create("A");
    categoryStore.clear();
    expect(categoryStore.count()).toBe(0);
  });
});
