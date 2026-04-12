/**
 * Integration tests: cross-service workflow
 * user registration → order creation → payment → notification
 */
import { describe, test, expect, beforeEach } from 'bun:test';

// Auth service
import { router as authRouter } from '../auth/handlers';
import { authStore } from '../auth/store';

// Products service
import { handleRequest as productsHandler } from '../products/handlers';
import { productStore, categoryStore } from '../products/store';

// Orders service
import { OrderStore } from '../orders/store';
import { createRouter as createOrdersRouter } from '../orders/handlers';

// Payments service
import { handleRequest as paymentsHandler, paymentStore, methodStore } from '../payments/handlers';

// Notifications service
import { handleRequest as notificationsHandler } from '../notifications/handlers';
import { notificationStore, templateStore } from '../notifications/store';

// --- Helpers ---

async function authReq(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body) init.body = JSON.stringify(body);
  const res = await authRouter(new Request(`http://localhost:3001${path}`, init));
  return { status: res.status, json: await res.json() as any };
}

async function productsReq(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await productsHandler(new Request(`http://localhost:3003${path}`, init));
  return { status: res.status, json: await res.json() as any };
}

let orderStore: OrderStore;
let ordersRouter: (req: Request) => Promise<Response>;

async function ordersReq(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await ordersRouter(new Request(`http://localhost:3004${path}`, init));
  return { status: res.status, json: await res.json() as any };
}

async function paymentsReq(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await paymentsHandler(new Request(`http://localhost:3005${path}`, init));
  return { status: res.status, json: await res.json() as any };
}

async function notificationsReq(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const res = await notificationsHandler(new Request(`http://localhost:3006${path}`, init));
  return { status: res.status, json: await res.json() as any };
}

beforeEach(() => {
  authStore.users.clear();
  authStore.sessions.clear();
  authStore.resetTokens.clear();
  authStore.loginAttempts.clear();
  productStore.clear();
  categoryStore.clear();
  orderStore = new OrderStore();
  ordersRouter = createOrdersRouter(orderStore);
  paymentStore.clear();
  methodStore.clear();
  methodStore.seed();
  notificationStore.clear();
  templateStore.clear();
});

// --- Integration Flow ---

describe('Cross-service workflow: registration → order → payment → notification', () => {
  test('complete purchase flow', async () => {
    // Step 1: Register a user
    const registerRes = await authReq('POST', '/auth/register', {
      email: 'buyer@example.com',
      password: 'securepass123',
      name: 'Test Buyer',
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.json.success).toBe(true);
    const userId = registerRes.json.data.user.id;
    const token = registerRes.json.data.token;
    expect(userId).toBeTruthy();
    expect(token).toBeTruthy();

    // Step 2: Verify auth session works
    const sessionRes = await authReq('GET', '/auth/session', undefined, token);
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.json.data.user.email).toBe('buyer@example.com');

    // Step 3: Create a product
    const productRes = await productsReq('POST', '/products', {
      name: 'Wireless Headphones',
      description: 'Premium noise-cancelling headphones',
      price: 299.99,
      stock: 50,
      category: 'electronics',
    });
    expect(productRes.status).toBe(201);
    expect(productRes.json.success).toBe(true);
    const productId = productRes.json.data.id;

    // Step 4: Create an order referencing the user and product
    const orderRes = await ordersReq('POST', '/orders', {
      userId,
      items: [{ productId, quantity: 2, price: 299.99 }],
    });
    expect(orderRes.status).toBe(201);
    expect(orderRes.json.success).toBe(true);
    const order = orderRes.json.data;
    const orderId = order.id;
    expect(order.total).toBe(599.98);
    expect(order.status).toBe('pending');

    // Step 5: Create and process payment
    const paymentRes = await paymentsReq('POST', '/payments', {
      orderId,
      amount: 599.98,
      currency: 'USD',
      method: 'credit_card',
    });
    expect(paymentRes.status).toBe(201);
    const paymentId = paymentRes.json.data.id;

    const processRes = await paymentsReq('POST', `/payments/${paymentId}/process`);
    expect(processRes.status).toBe(200);
    expect(processRes.json.data.status).toBe('completed');
    expect(processRes.json.data.transactionRef).toBeTruthy();

    // Step 6: Confirm order after payment
    const confirmRes = await ordersReq('PATCH', `/orders/${orderId}/status`, {
      status: 'confirmed',
    });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.json.data.status).toBe('confirmed');

    // Step 7: Create notification for the user
    const notifRes = await notificationsReq('POST', '/notifications', {
      userId,
      type: 'order_confirmation',
      channel: 'email',
      title: 'Order Confirmed',
      body: `Your order ${orderId} has been confirmed. Total: $599.98`,
    });
    expect(notifRes.status).toBe(201);
    const notifId = notifRes.json.data.id;

    // Step 8: Send the notification
    const sendRes = await notificationsReq('POST', `/notifications/${notifId}/send`);
    expect(sendRes.status).toBe(200);
    expect(sendRes.json.data.sentAt).toBeTruthy();
  });

  test('payment failure triggers different notification', async () => {
    // Register user
    const reg = await authReq('POST', '/auth/register', {
      email: 'bigspender@example.com',
      password: 'password123',
      name: 'Big Spender',
    });
    const userId = reg.json.data.user.id;

    // Create order with high-value items
    const orderRes = await ordersReq('POST', '/orders', {
      userId,
      items: [{ productId: 'prod_luxury', quantity: 1, price: 15000 }],
    });
    const orderId = orderRes.json.data.id;

    // Create payment (amount > 10000 will fail)
    const paymentRes = await paymentsReq('POST', '/payments', {
      orderId,
      amount: 15000,
      currency: 'USD',
      method: 'credit_card',
    });
    const paymentId = paymentRes.json.data.id;

    // Process — should fail
    const processRes = await paymentsReq('POST', `/payments/${paymentId}/process`);
    expect(processRes.status).toBe(200);
    expect(processRes.json.data.status).toBe('failed');

    // Send failure notification
    const notifRes = await notificationsReq('POST', '/notifications', {
      userId,
      type: 'payment_failed',
      channel: 'email',
      title: 'Payment Failed',
      body: `Payment for order ${orderId} was declined.`,
    });
    expect(notifRes.status).toBe(201);

    const sendRes = await notificationsReq('POST', `/notifications/${notifRes.json.data.id}/send`);
    expect(sendRes.status).toBe(200);
  });

  test('full order lifecycle: pending → confirmed → shipped → delivered', async () => {
    const orderRes = await ordersReq('POST', '/orders', {
      userId: 'user_1',
      items: [{ productId: 'p1', quantity: 1, price: 100 }],
    });
    const orderId = orderRes.json.data.id;

    for (const status of ['confirmed', 'shipped', 'delivered'] as const) {
      const res = await ordersReq('PATCH', `/orders/${orderId}/status`, { status });
      expect(res.status).toBe(200);
      expect(res.json.data.status).toBe(status);
    }

    // Verify history has all transitions
    const historyRes = await ordersReq('GET', `/orders/${orderId}/history`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.json.data.length).toBeGreaterThanOrEqual(3);
  });

  test('refund flow after successful payment', async () => {
    // Create and process a payment
    const payRes = await paymentsReq('POST', '/payments', {
      orderId: 'order_123',
      amount: 500,
      currency: 'EUR',
      method: 'paypal',
    });
    const paymentId = payRes.json.data.id;

    await paymentsReq('POST', `/payments/${paymentId}/process`);

    // Refund
    const refundRes = await paymentsReq('POST', `/payments/${paymentId}/refund`, {
      amount: 200,
      reason: 'Partial return',
    });
    expect(refundRes.status).toBe(201);

    // Send refund notification
    const notifRes = await notificationsReq('POST', '/notifications', {
      userId: 'user_refund',
      type: 'refund_processed',
      channel: 'sms',
      title: 'Refund Processed',
      body: 'Your refund of €200 has been processed.',
    });
    expect(notifRes.status).toBe(201);
  });

  test('product stock check before order creation', async () => {
    // Create product with limited stock
    await productsReq('POST', '/products/categories', { name: 'widgets' });
    const prodRes = await productsReq('POST', '/products', {
      name: 'Limited Widget',
      price: 49.99,
      stock: 3,
      category: 'widgets',
    });
    const productId = prodRes.json.data.id;

    // Verify stock
    const getRes = await productsReq('GET', `/products/${productId}`);
    expect(getRes.json.data.stock).toBe(3);

    // Adjust stock down (simulating order fulfillment)
    const stockRes = await productsReq('POST', `/products/${productId}/stock`, {
      quantity: -2,
    });
    expect(stockRes.status).toBe(200);
    expect(stockRes.json.data.stock).toBe(1);

    // Verify product shows as low stock
    const lowStockRes = await productsReq('GET', '/products/low-stock?threshold=5');
    expect(lowStockRes.json.data.length).toBe(1);
    expect(lowStockRes.json.data[0].id).toBe(productId);
  });

  test('notification template workflow', async () => {
    // Create a template
    const tmplRes = await notificationsReq('POST', '/notifications/templates', {
      name: 'order_shipped',
      channel: 'email',
      subject: 'Order {{orderId}} Shipped!',
      body: 'Hi {{name}}, your order {{orderId}} is on its way!',
    });
    expect(tmplRes.status).toBe(201);
    const templateId = tmplRes.json.data.id;

    // Create notification from template
    const notifRes = await notificationsReq('POST', '/notifications/from-template', {
      templateId,
      userId: 'user_tmpl',
      variables: { orderId: 'ORD-789', name: 'Alice' },
    });
    expect(notifRes.status).toBe(201);
    expect(notifRes.json.data.body).toContain('Alice');
    expect(notifRes.json.data.body).toContain('ORD-789');
  });
});
