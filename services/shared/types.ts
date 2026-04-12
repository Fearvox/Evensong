// Shared types for all microservices

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user" | "moderator";
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  stock: number;
  active: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  total: number;
  currency: string;
  shippingAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionRef?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = "credit_card" | "debit_card" | "bank_transfer" | "wallet" | "crypto";
export type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  read: boolean;
  sentAt?: string;
  createdAt: string;
}

export type NotificationType = "order" | "payment" | "promotion" | "system" | "alert";
export type NotificationChannel = "email" | "sms" | "push" | "in_app";

export interface AnalyticsEvent {
  id: string;
  eventType: string;
  userId?: string;
  sessionId?: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

export interface SearchDocument {
  id: string;
  collection: string;
  content: Record<string, unknown>;
  text: string;
  score?: number;
  indexedAt: string;
}
