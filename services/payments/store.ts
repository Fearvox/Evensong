// Payments store — in-memory payment management with method registry

import { MemoryStore, generateId, now } from "../shared";
import type { Payment, PaymentMethod, PaymentStatus } from "../shared";

// Payment method metadata
export interface PaymentMethodInfo {
  id: string;
  name: string;
  type: PaymentMethod;
  enabled: boolean;
}

// Payment statistics
export interface PaymentStats {
  totalProcessed: number;
  count: number;
  byStatus: Record<string, number>;
  byMethod: Record<string, number>;
  byCurrency: Record<string, number>;
}

const DEFAULT_METHODS: PaymentMethodInfo[] = [
  { id: "pm_cc", name: "Credit Card", type: "credit_card", enabled: true },
  { id: "pm_dc", name: "Debit Card", type: "debit_card", enabled: true },
  { id: "pm_bt", name: "Bank Transfer", type: "bank_transfer", enabled: true },
  { id: "pm_wa", name: "Digital Wallet", type: "wallet", enabled: true },
  { id: "pm_cr", name: "Cryptocurrency", type: "crypto", enabled: true },
];

export const VALID_METHODS: readonly PaymentMethod[] = [
  "credit_card", "debit_card", "bank_transfer", "wallet", "crypto",
];

export const VALID_STATUSES: readonly PaymentStatus[] = [
  "pending", "processing", "completed", "failed", "refunded",
];

// --- Method store ---

export class MethodStore {
  private methods: PaymentMethodInfo[] = [];

  seed(): void {
    this.methods = DEFAULT_METHODS.map((m) => ({ ...m }));
  }

  clear(): void {
    this.methods = [];
  }

  getAll(): PaymentMethodInfo[] {
    return this.methods.map((m) => ({ ...m }));
  }

  getEnabled(): PaymentMethodInfo[] {
    return this.methods.filter((m) => m.enabled).map((m) => ({ ...m }));
  }
}

// --- Payment store ---

export class PaymentStore {
  private store = new MemoryStore<Payment>();

  // Generate a transaction reference
  private generateTransactionRef(): string {
    return `TXN-${crypto.randomUUID()}`;
  }

  create(data: {
    orderId: string;
    userId?: string;
    amount: number;
    currency: string;
    method: PaymentMethod;
  }): Payment {
    const timestamp = now();
    const payment: Payment = {
      id: generateId(),
      orderId: data.orderId,
      userId: data.userId ?? "",
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      method: data.method,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.store.create(payment);
  }

  get(id: string): Payment | undefined {
    return this.store.get(id);
  }

  getAll(): Payment[] {
    return this.store.getAll();
  }

  update(id: string, updates: Partial<Payment>): Payment | undefined {
    const existing = this.store.get(id);
    if (!existing) return undefined;
    const timestamp = now();
    // Guarantee updatedAt strictly advances even within the same millisecond
    const updatedAt = timestamp > existing.updatedAt ? timestamp : new Date(new Date(existing.updatedAt).getTime() + 1).toISOString();
    return this.store.update(id, { ...updates, updatedAt });
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  count(): number {
    return this.store.count();
  }

  clear(): void {
    this.store.clear();
  }

  // Filter by any combination of criteria
  filter(params: {
    orderId?: string;
    userId?: string;
    status?: PaymentStatus;
    method?: PaymentMethod;
  }): Payment[] {
    return this.store.find((p) => {
      if (params.orderId && p.orderId !== params.orderId) return false;
      if (params.userId && p.userId !== params.userId) return false;
      if (params.status && p.status !== params.status) return false;
      if (params.method && p.method !== params.method) return false;
      return true;
    });
  }

  // Get payments by order ID
  getByOrderId(orderId: string): Payment[] {
    return this.store.find((p) => p.orderId === orderId);
  }

  // Get payments by user ID
  getByUserId(userId: string): Payment[] {
    return this.store.find((p) => p.userId === userId);
  }

  // Process: amount > 10000 → failed, otherwise → completed
  process(id: string): Payment | { error: string } {
    const payment = this.store.get(id);
    if (!payment) return { error: "Payment not found" };
    if (payment.status !== "pending") {
      return { error: `Cannot process payment with status '${payment.status}'` };
    }

    const succeeded = payment.amount <= 10000;
    const newStatus: PaymentStatus = succeeded ? "completed" : "failed";

    return this.store.update(id, {
      status: newStatus,
      transactionRef: this.generateTransactionRef(),
      updatedAt: now(),
    })!;
  }

  // Refund: only completed payments; creates refund record + marks original
  refund(
    id: string,
    refundAmount?: number,
    _reason?: string,
  ): { refund: Payment; original: Payment } | { error: string } {
    const payment = this.store.get(id);
    if (!payment) return { error: "Payment not found" };
    if (payment.status === "refunded") return { error: "Payment has already been refunded" };
    if (payment.status !== "completed") return { error: "Only completed payments can be refunded" };

    const amount = refundAmount ?? payment.amount;
    if (amount <= 0 || amount > payment.amount) return { error: "Invalid refund amount" };

    // Mark original as refunded
    const updatedOriginal = this.store.update(id, {
      status: "refunded" as PaymentStatus,
      updatedAt: now(),
    })!;

    // Create refund record
    const timestamp = now();
    const refundPayment: Payment = {
      id: generateId(),
      orderId: payment.orderId,
      userId: payment.userId,
      amount: -amount,
      currency: payment.currency,
      method: payment.method,
      status: "refunded",
      transactionRef: `RFN-${crypto.randomUUID()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const refund = this.store.create(refundPayment);

    return { refund, original: updatedOriginal };
  }

  // Cancel: only pending payments
  cancel(id: string): Payment | { error: string } {
    const payment = this.store.get(id);
    if (!payment) return { error: "Payment not found" };
    if (payment.status !== "pending") {
      return { error: `Cannot cancel payment with status '${payment.status}'` };
    }
    this.store.delete(id);
    return payment;
  }

  // Generate receipt for a payment
  generateReceipt(id: string): Record<string, unknown> | null {
    const payment = this.store.get(id);
    if (!payment) return null;

    return {
      receiptId: `rcpt_${payment.id.slice(0, 8)}`,
      paymentId: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      amount: payment.amount,
      formattedAmount: `${payment.currency} ${payment.amount.toFixed(2)}`,
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
      transactionRef: payment.transactionRef || null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  // Statistics
  stats(): PaymentStats {
    const all = this.store.getAll();
    const completed = all.filter((p) => p.status === "completed");
    const totalProcessed = completed.reduce((sum, p) => sum + p.amount, 0);

    const byStatus: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    const byCurrency: Record<string, number> = {};

    for (const p of all) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
      byMethod[p.method] = (byMethod[p.method] ?? 0) + 1;
      byCurrency[p.currency] = (byCurrency[p.currency] ?? 0) + 1;
    }

    return { totalProcessed, count: all.length, byStatus, byMethod, byCurrency };
  }
}

// Singleton instances
export const paymentStore = new PaymentStore();
export const methodStore = new MethodStore();
