// Orders store — in-memory order management with status transitions and timeline tracking

import { MemoryStore } from "../shared/store";
import { generateId, now } from "../shared/http";
import type { Order, OrderItem, OrderStatus } from "../shared/types";

export interface TimelineEntry {
  status: OrderStatus;
  timestamp: string;
}

// Valid status transitions — forward flow plus cancellation and refund
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export class OrderStore {
  private store = new MemoryStore<Order>();
  private timelines = new Map<string, TimelineEntry[]>();

  // --- CRUD ---

  create(data: {
    userId: string;
    items: OrderItem[];
    currency?: string;
    shippingAddress?: string;
  }): Order {
    const total = this.calculateTotal(data.items);
    const timestamp = now();
    const order: Order = {
      id: generateId(),
      userId: data.userId,
      items: [...data.items],
      status: "pending",
      total,
      currency: data.currency ?? "USD",
      shippingAddress: data.shippingAddress,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const created = this.store.create(order);
    this.timelines.set(created.id, [{ status: "pending", timestamp }]);
    return created;
  }

  get(id: string): Order | undefined {
    return this.store.get(id);
  }

  getAll(): Order[] {
    return this.store.getAll();
  }

  update(id: string, updates: Partial<Order>): Order | undefined {
    const order = this.store.get(id);
    if (!order) return undefined;
    return this.store.update(id, { ...updates, updatedAt: now() });
  }

  delete(id: string): boolean {
    const existed = this.store.has(id);
    if (existed) {
      this.store.delete(id);
      this.timelines.delete(id);
    }
    return existed;
  }

  // --- Status transitions ---

  isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  updateStatus(id: string, newStatus: OrderStatus): Order | undefined {
    const order = this.store.get(id);
    if (!order) return undefined;
    if (!this.isValidTransition(order.status, newStatus)) return undefined;
    const timestamp = now();
    const updated = this.store.update(id, { status: newStatus, updatedAt: timestamp });
    if (updated) {
      const timeline = this.timelines.get(id) ?? [];
      timeline.push({ status: newStatus, timestamp });
      this.timelines.set(id, timeline);
    }
    return updated;
  }

  cancel(id: string): Order | undefined {
    return this.updateStatus(id, "cancelled");
  }

  // --- Timeline ---

  getTimeline(id: string): TimelineEntry[] | undefined {
    if (!this.store.has(id)) return undefined;
    return [...(this.timelines.get(id) ?? [])];
  }

  // --- Item management ---

  addItem(id: string, item: OrderItem): Order | undefined {
    const order = this.store.get(id);
    if (!order) return undefined;
    if (order.status !== "pending") return undefined;
    const items = [...order.items, item];
    const total = this.calculateTotal(items);
    return this.store.update(id, { items, total, updatedAt: now() });
  }

  removeItem(id: string, productId: string): Order | undefined | "cancelled" {
    const order = this.store.get(id);
    if (!order) return undefined;
    if (order.status !== "pending") return undefined;
    const items = order.items.filter((i) => i.productId !== productId);
    if (items.length === order.items.length) return undefined; // item not found
    if (items.length === 0) {
      const timestamp = now();
      this.store.update(id, { items: [], total: 0, status: "cancelled", updatedAt: timestamp });
      const timeline = this.timelines.get(id) ?? [];
      timeline.push({ status: "cancelled", timestamp });
      this.timelines.set(id, timeline);
      return "cancelled";
    }
    const total = this.calculateTotal(items);
    return this.store.update(id, { items, total, updatedAt: now() });
  }

  // --- Queries ---

  findByUser(userId: string): Order[] {
    return this.store.find((o) => o.userId === userId);
  }

  findByStatus(status: OrderStatus): Order[] {
    return this.store.find((o) => o.status === status);
  }

  filter(params: {
    userId?: string;
    status?: OrderStatus;
    startDate?: string;
    endDate?: string;
  }): Order[] {
    return this.store.find((o) => {
      if (params.userId && o.userId !== params.userId) return false;
      if (params.status && o.status !== params.status) return false;
      if (params.startDate && o.createdAt < params.startDate) return false;
      if (params.endDate && o.createdAt > params.endDate) return false;
      return true;
    });
  }

  // --- Stats ---

  stats(): {
    countByStatus: Record<string, number>;
    totalRevenue: number;
    averageOrderValue: number;
    totalOrders: number;
  } {
    const all = this.store.getAll();
    const countByStatus: Record<string, number> = {};
    let totalRevenue = 0;

    for (const order of all) {
      countByStatus[order.status] = (countByStatus[order.status] ?? 0) + 1;
      if (order.status !== "cancelled" && order.status !== "refunded") {
        totalRevenue += order.total;
      }
    }

    const revenueOrders = all.filter(
      (o) => o.status !== "cancelled" && o.status !== "refunded",
    );
    const averageOrderValue =
      revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;

    return {
      countByStatus,
      totalRevenue,
      averageOrderValue,
      totalOrders: all.length,
    };
  }

  // --- Helpers ---

  calculateTotal(items: OrderItem[]): number {
    return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }

  recalculateTotal(id: string): number | undefined {
    const order = this.store.get(id);
    if (!order) return undefined;
    const total = this.calculateTotal(order.items);
    this.store.update(id, { total, updatedAt: now() });
    return total;
  }

  count(): number {
    return this.store.count();
  }

  clear(): void {
    this.store.clear();
    this.timelines.clear();
  }

  has(id: string): boolean {
    return this.store.has(id);
  }
}

export const orderStore = new OrderStore();
