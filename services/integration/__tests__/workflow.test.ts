import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp as createAuthApp, resetStores as resetAuth } from '../../auth/app';
import { createApp as createUsersApp, resetStore as resetUsers } from '../../users/app';
import { createApp as createProductsApp, resetStore as resetProducts } from '../../products/app';
import { createApp as createOrdersApp, resetStore as resetOrders } from '../../orders/app';
import { createApp as createPaymentsApp, resetStore as resetPayments } from '../../payments/app';
import { createApp as createNotificationsApp, resetStore as resetNotifications } from '../../notifications/app';
import { createApp as createAnalyticsApp, resetStore as resetAnalytics } from '../../analytics/app';
import { createApp as createSearchApp, resetStore as resetSearch } from '../../search/app';
import { post, get, put, patch } from '../../../shared/test-utils';

const auth = createAuthApp();
const users = createUsersApp();
const products = createProductsApp();
const orders = createOrdersApp();
const payments = createPaymentsApp();
const notifications = createNotificationsApp();
const analytics = createAnalyticsApp();
const search = createSearchApp();

function resetAll() {
  resetAuth();
  resetUsers();
  resetProducts();
  resetOrders();
  resetPayments();
  resetNotifications();
  resetAnalytics();
  resetSearch();
}

beforeEach(() => resetAll());

describe('User Registration → Order → Payment → Notification workflow', () => {
  test('complete e-commerce flow', async () => {
    // 1. Register a user
    const regRes = await post(auth, '/auth/register', {
      email: 'buyer@example.com',
      username: 'buyer',
      password: 'securepass123',
      displayName: 'Test Buyer',
    });
    expect(regRes.status).toBe(201);
    const token = regRes.data.data.token;
    const userId = regRes.data.data.user.id;

    // 2. Verify the token is valid
    const verifyRes = await post(auth, '/auth/verify', { token });
    expect(verifyRes.data.data.valid).toBe(true);

    // 3. Create a user profile entry
    const userRes = await post(users, '/users', {
      email: 'buyer@example.com',
      username: 'buyer',
      displayName: 'Test Buyer',
    });
    expect(userRes.status).toBe(201);

    // 4. Create products
    const product1 = await post(products, '/products', {
      name: 'Widget A',
      description: 'A quality widget',
      price: 25.00,
      stock: 50,
      category: 'widgets',
    });
    expect(product1.status).toBe(201);

    const product2 = await post(products, '/products', {
      name: 'Widget B',
      description: 'Premium widget',
      price: 45.00,
      stock: 30,
      category: 'widgets',
    });
    expect(product2.status).toBe(201);

    // 5. Reserve stock
    const reserveRes = await post(products, `/products/${product1.data.data.id}/reserve`, { quantity: 2 });
    expect(reserveRes.status).toBe(200);
    expect(reserveRes.data.data.reservedStock).toBe(2);

    const reserveRes2 = await post(products, `/products/${product2.data.data.id}/reserve`, { quantity: 1 });
    expect(reserveRes2.status).toBe(200);

    // 6. Create order
    const orderRes = await post(orders, '/orders', {
      userId,
      items: [
        { productId: product1.data.data.id, quantity: 2, unitPrice: 25.00 },
        { productId: product2.data.data.id, quantity: 1, unitPrice: 45.00 },
      ],
      shippingAddress: '123 Main St, Springfield, IL 62701',
    });
    expect(orderRes.status).toBe(201);
    expect(orderRes.data.data.totalAmount).toBe(95.00);
    expect(orderRes.data.data.status).toBe('pending');

    // 7. Process payment
    const payRes = await post(payments, '/payments', {
      orderId: orderRes.data.data.id,
      userId,
      amount: 95.00,
      currency: 'USD',
      method: 'credit_card',
    });
    expect(payRes.status).toBe(201);

    // Complete the payment
    const completeRes = await put(payments, `/payments/${payRes.data.data.id}`, { status: 'completed' });
    expect(completeRes.data.data.status).toBe('completed');

    // 8. Update order status
    const confirmRes = await put(orders, `/orders/${orderRes.data.data.id}`, { status: 'confirmed' });
    expect(confirmRes.data.data.status).toBe('confirmed');

    // 9. Send notification
    const notifRes = await post(notifications, '/notifications', {
      userId,
      type: 'email',
      title: 'Order Confirmed',
      message: `Your order ${orderRes.data.data.id} has been confirmed.`,
      metadata: { orderId: orderRes.data.data.id },
    });
    expect(notifRes.status).toBe(201);

    // 10. Track analytics events
    await post(analytics, '/analytics/events', {
      userId,
      eventType: 'purchase',
      category: 'conversion',
      properties: { orderId: orderRes.data.data.id, amount: 95.00 },
    });

    // 11. Index products for search
    await post(search, '/search/documents', {
      type: 'product',
      title: 'Widget A',
      content: 'A quality widget for everyday use',
      tags: ['widget', 'quality'],
    });

    // 12. Verify the full state
    const orderCheck = await get(orders, `/orders/${orderRes.data.data.id}`);
    expect(orderCheck.data.data.status).toBe('confirmed');

    const paymentCheck = await get(payments, `/payments/order/${orderRes.data.data.id}`);
    expect(paymentCheck.data.data[0].status).toBe('completed');

    const userOrders = await get(orders, `/orders/user/${userId}`);
    expect(userOrders.data.data.length).toBe(1);

    const searchRes = await get(search, '/search?q=widget');
    expect(searchRes.data.data.length).toBe(1);

    const summaryRes = await get(analytics, '/analytics/summary');
    expect(summaryRes.data.data.totalEvents).toBe(1);
    expect(summaryRes.data.data.eventsByType.purchase).toBe(1);
  });
});

describe('Order Cancellation → Refund → Notification flow', () => {
  test('cancels order and refunds payment', async () => {
    // Setup: create order and payment
    const orderRes = await post(orders, '/orders', {
      userId: 'user-1',
      items: [{ productId: 'prod-1', quantity: 1, unitPrice: 50.00 }],
      shippingAddress: '456 Oak St, Springfield, IL 62701',
    });
    const orderId = orderRes.data.data.id;

    const payRes = await post(payments, '/payments', {
      orderId,
      userId: 'user-1',
      amount: 50.00,
      currency: 'USD',
      method: 'debit_card',
    });
    await put(payments, `/payments/${payRes.data.data.id}`, { status: 'completed' });

    // Cancel the order
    const cancelRes = await post(orders, `/orders/${orderId}/cancel`, { reason: 'Changed my mind' });
    expect(cancelRes.data.data.status).toBe('cancelled');

    // Refund the payment
    const refundRes = await post(payments, `/payments/${payRes.data.data.id}/refund`, { amount: 50.00 });
    expect(refundRes.data.data.status).toBe('refunded');
    expect(refundRes.data.data.refundAmount).toBe(50.00);

    // Notify user
    const notifRes = await post(notifications, '/notifications', {
      userId: 'user-1',
      type: 'email',
      title: 'Order Cancelled & Refunded',
      message: `Your order has been cancelled and $50.00 has been refunded.`,
    });
    expect(notifRes.status).toBe(201);

    // Mark notification as read
    const readRes = await patch(notifications, `/notifications/${notifRes.data.data.id}/read`);
    expect(readRes.data.data.status).toBe('read');

    // Track cancellation analytics
    await post(analytics, '/analytics/events', {
      userId: 'user-1',
      eventType: 'order_cancelled',
      category: 'orders',
      properties: { orderId, reason: 'Changed my mind' },
    });

    const activityRes = await get(analytics, '/analytics/users/user-1/activity');
    expect(activityRes.data.data.totalEvents).toBe(1);
  });
});

describe('Broadcast Notification → Analytics Tracking', () => {
  test('broadcasts notification and tracks analytics', async () => {
    const broadcastRes = await post(notifications, '/notifications/broadcast', {
      userIds: ['user-1', 'user-2', 'user-3'],
      type: 'push',
      title: 'Flash Sale!',
      message: '50% off all products for the next 24 hours!',
    });
    expect(broadcastRes.status).toBe(201);
    expect(broadcastRes.data.data.length).toBe(3);

    // Track analytics for broadcast
    await post(analytics, '/analytics/events', {
      userId: 'system',
      eventType: 'broadcast_sent',
      category: 'notifications',
      properties: { recipients: 3, type: 'push' },
    });

    const summary = await get(analytics, '/analytics/summary');
    expect(summary.data.data.eventsByType.broadcast_sent).toBe(1);
  });
});

describe('Product Search and Stock Management', () => {
  test('indexes products, searches, and manages stock', async () => {
    // Create and index products
    const p1 = await post(products, '/products', {
      name: 'Laptop Pro 15',
      description: 'High performance laptop',
      price: 1299.99,
      stock: 20,
      category: 'computers',
      tags: ['laptop', 'professional'],
    });

    const p2 = await post(products, '/products', {
      name: 'Laptop Air 13',
      description: 'Ultra lightweight laptop',
      price: 999.99,
      stock: 35,
      category: 'computers',
      tags: ['laptop', 'portable'],
    });

    // Index for search
    await post(search, '/search/documents', {
      type: 'product',
      title: 'Laptop Pro 15',
      content: 'High performance laptop for professionals. 16GB RAM, 512GB SSD.',
      tags: ['laptop', 'professional', 'high-performance'],
    });

    await post(search, '/search/documents', {
      type: 'product',
      title: 'Laptop Air 13',
      content: 'Ultra lightweight laptop for everyday use. 8GB RAM, 256GB SSD.',
      tags: ['laptop', 'portable', 'lightweight'],
    });

    // Search
    const searchRes = await get(search, '/search?q=laptop');
    expect(searchRes.data.data.length).toBe(2);

    const proSearch = await get(search, '/search?q=professional');
    expect(proSearch.data.data.length).toBe(1);
    expect(proSearch.data.data[0].title).toBe('Laptop Pro 15');

    // Get suggestions
    const suggestRes = await get(search, '/search/suggest?q=lap');
    expect(suggestRes.data.data.length).toBeGreaterThan(0);

    // Reserve stock and place order
    await post(products, `/products/${p1.data.data.id}/reserve`, { quantity: 2 });
    const productCheck = await get(products, `/products/${p1.data.data.id}`);
    expect(productCheck.data.data.reservedStock).toBe(2);

    // Release one
    await post(products, `/products/${p1.data.data.id}/release`, { quantity: 1 });
    const productCheck2 = await get(products, `/products/${p1.data.data.id}`);
    expect(productCheck2.data.data.reservedStock).toBe(1);
  });
});

describe('Multi-user Order History', () => {
  test('tracks orders across multiple users', async () => {
    // User 1 places 2 orders
    await post(orders, '/orders', {
      userId: 'user-1',
      items: [{ productId: 'p1', quantity: 1, unitPrice: 10 }],
      shippingAddress: '123 Main St, City, ST 12345',
    });
    await post(orders, '/orders', {
      userId: 'user-1',
      items: [{ productId: 'p2', quantity: 2, unitPrice: 20 }],
      shippingAddress: '123 Main St, City, ST 12345',
    });

    // User 2 places 1 order
    await post(orders, '/orders', {
      userId: 'user-2',
      items: [{ productId: 'p1', quantity: 3, unitPrice: 10 }],
      shippingAddress: '456 Oak Ave, Town, ST 67890',
    });

    const user1Orders = await get(orders, '/orders/user/user-1');
    expect(user1Orders.data.data.length).toBe(2);

    const user2Orders = await get(orders, '/orders/user/user-2');
    expect(user2Orders.data.data.length).toBe(1);

    const allOrders = await get(orders, '/orders');
    expect(allOrders.data.total).toBe(3);
  });
});

describe('User Profile and Preferences', () => {
  test('creates user, updates profile, sets preferences', async () => {
    const userRes = await post(users, '/users', {
      email: 'profile@example.com',
      username: 'profileuser',
      displayName: 'Profile User',
    });
    const userId = userRes.data.data.id;

    // Get profile
    const profileRes = await get(users, `/users/${userId}/profile`);
    expect(profileRes.data.data.hasPreferences).toBe(false);
    expect(typeof profileRes.data.data.accountAge).toBe('number');

    // Set preferences
    await patch(users, `/users/${userId}/preferences`, { theme: 'dark', language: 'en' });
    const updatedProfile = await get(users, `/users/${userId}/profile`);
    expect(updatedProfile.data.data.hasPreferences).toBe(true);

    // Update preferences
    await patch(users, `/users/${userId}/preferences`, { notifications: true });
    const finalUser = await get(users, `/users/${userId}`);
    expect(finalUser.data.data.preferences.theme).toBe('dark');
    expect(finalUser.data.data.preferences.notifications).toBe(true);
  });
});

describe('Password Change Security Flow', () => {
  test('password change invalidates other sessions', async () => {
    // Register
    const reg = await post(auth, '/auth/register', {
      email: 'secure@example.com',
      username: 'secureuser',
      password: 'password123',
      displayName: 'Secure User',
    });
    const token1 = reg.data.data.token;

    // Login from another device
    const login = await post(auth, '/auth/login', {
      email: 'secure@example.com',
      password: 'password123',
    });
    const token2 = login.data.data.token;

    // Both tokens valid
    const v1 = await post(auth, '/auth/verify', { token: token1 });
    expect(v1.data.data.valid).toBe(true);
    const v2 = await post(auth, '/auth/verify', { token: token2 });
    expect(v2.data.data.valid).toBe(true);

    // Change password using token1
    await post(auth, '/auth/change-password', {
      currentPassword: 'password123',
      newPassword: 'newSecure456',
    }, { Authorization: `Bearer ${token1}` });

    // token1 still works (it was the one used to change password)
    const v3 = await post(auth, '/auth/verify', { token: token1 });
    expect(v3.data.data.valid).toBe(true);

    // token2 should be invalidated
    const v4 = await post(auth, '/auth/verify', { token: token2 });
    expect(v4.data.data.valid).toBe(false);

    // Login with new password works
    const newLogin = await post(auth, '/auth/login', {
      email: 'secure@example.com',
      password: 'newSecure456',
    });
    expect(newLogin.status).toBe(200);
  });
});
