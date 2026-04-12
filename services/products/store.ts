import { MemoryStore } from "../shared/store";
import type { Product } from "../shared/types";
import { generateId, now } from "../shared/http";

export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

export interface StockHistoryEntry {
  productId: string;
  previousStock: number;
  newStock: number;
  change: number;
  reason: string;
  timestamp: string;
}

export class ProductStore {
  private store = new MemoryStore<Product>();
  private stockHistory: StockHistoryEntry[] = [];

  create(data: {
    name: string;
    description?: string;
    price: number;
    currency?: string;
    category: string;
    stock: number;
    tags?: string[];
  }): Product {
    const timestamp = now();
    const product: Product = {
      id: generateId(),
      name: data.name,
      description: data.description ?? "",
      price: data.price,
      currency: data.currency ?? "USD",
      category: data.category,
      stock: data.stock,
      active: true,
      tags: data.tags ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const created = this.store.create(product);
    this.recordStockChange(created.id, 0, created.stock, "initial");
    return created;
  }

  get(id: string): Product | undefined {
    return this.store.get(id);
  }

  getAll(): Product[] {
    return this.store.getAll();
  }

  update(
    id: string,
    updates: Partial<Pick<Product, "name" | "description" | "price" | "currency" | "category" | "stock" | "active" | "tags">>,
  ): Product | undefined {
    return this.store.update(id, { ...updates, updatedAt: now() });
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  adjustStock(id: string, quantity: number): { product: Product; error?: string } | { product?: undefined; error: string } {
    const product = this.store.get(id);
    if (!product) return { error: "Product not found" };

    const newStock = product.stock + quantity;
    if (newStock < 0) return { error: "Insufficient stock" };

    const previousStock = product.stock;
    const updated = this.store.update(id, { stock: newStock, updatedAt: now() });
    if (!updated) return { error: "Product not found" };

    this.recordStockChange(id, previousStock, newStock, quantity > 0 ? "add" : "subtract");
    return { product: updated };
  }

  findByCategory(category: string): Product[] {
    return this.store.find((p) => p.category === category);
  }

  search(query: string): Product[] {
    const q = query.toLowerCase();
    return this.store.find(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  getLowStock(threshold: number): Product[] {
    return this.store.find((p) => p.stock <= threshold);
  }

  bulkPriceUpdate(category: string, adjustment: number): Product[] {
    const products = this.findByCategory(category);
    const updated: Product[] = [];
    for (const product of products) {
      const newPrice = product.price + adjustment;
      if (newPrice < 0) continue;
      const result = this.store.update(product.id, { price: newPrice, updatedAt: now() });
      if (result) updated.push(result);
    }
    return updated;
  }

  getStockHistory(productId?: string): StockHistoryEntry[] {
    if (productId) {
      return this.stockHistory.filter((e) => e.productId === productId);
    }
    return [...this.stockHistory];
  }

  count(): number {
    return this.store.count();
  }

  clear(): void {
    this.store.clear();
    this.stockHistory = [];
  }

  private recordStockChange(productId: string, previousStock: number, newStock: number, reason: string): void {
    this.stockHistory.push({
      productId,
      previousStock,
      newStock,
      change: newStock - previousStock,
      reason,
      timestamp: now(),
    });
  }
}

export class CategoryStore {
  private store = new MemoryStore<Category>();

  create(name: string): Category {
    const category: Category = {
      id: generateId(),
      name,
      createdAt: now(),
    };
    return this.store.create(category);
  }

  get(id: string): Category | undefined {
    return this.store.get(id);
  }

  getAll(): Category[] {
    return this.store.getAll();
  }

  findByName(name: string): Category | undefined {
    return this.store.findOne((c) => c.name.toLowerCase() === name.toLowerCase());
  }

  count(): number {
    return this.store.count();
  }

  clear(): void {
    this.store.clear();
  }
}

export const productStore = new ProductStore();
export const categoryStore = new CategoryStore();
