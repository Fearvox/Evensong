// Shared types for all microservices

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  displayName: string;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
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
  stock: number;
  reservedStock: number;
  category: string;
  tags: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  shippingAddress: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'credit_card' | 'debit_card' | 'bank_transfer' | 'wallet';

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionRef: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType = 'email' | 'sms' | 'push' | 'in_app';
export type NotificationStatus = 'pending' | 'sent' | 'read' | 'failed';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface AnalyticsEvent {
  id: string;
  userId: string;
  eventType: string;
  category: string;
  properties: Record<string, unknown>;
  sessionId: string;
  timestamp: string;
}

export interface SearchDocument {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  indexedAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
