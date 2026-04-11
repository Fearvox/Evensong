import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validOrder = {
  userId: 'user-1',
  items: [{ productId: 'prod-1', quantity: 2, unitPrice: 10.00 }],
  shippingAddress: '123 Main St, City, ST 12345',
};

async function createOrder(overrides = {}) {
  const res = await post(app, '/orders', { ...validOrder, ...overrides });
  return res.data.data;
}

describe('order creation edge cases', () => {
  test('floors item quantities to integers', async () => {
    const res = await post(app, '/orders', {
      ...validOrder,
      items: [{ productId: 'p1', quantity: 2.8, unitPrice: 10 }],
    });
    expect(res.data.data.items[0].quantity).toBe(2);
  });

  test('rounds totalAmount to 2 decimals', async () => {
    const res = await post(app, '/orders', {
      ...validOrder,
      items: [{ productId: 'p1', quantity: 3, unitPrice: 9.99 }],
    });
    expect(res.data.data.totalAmount).toBe(29.97);
  });

  test('rejects items as non-array type', async () => {
    const res = await post(app, '/orders', { ...validOrder, items: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  test('validates each item in array', async () => {
    const res = await post(app, '/orders', {
      ...validOrder,
      items: [
        { productId: 'p1', quantity: 1, unitPrice: 10 },
        { quantity: 0, unitPrice: -5 }, // invalid
      ],
    });
    expect(res.status).toBe(400);
  });

  test('rejects non-string userId', async () => {
    const res = await post(app, '/orders', { ...validOrder, userId: 123 });
    expect(res.status).toBe(400);
  });

  test('creates order with multiple items', async () => {
    const res = await post(app, '/orders', {
      ...validOrder,
      items: [
        { productId: 'p1', quantity: 1, unitPrice: 10 },
        { productId: 'p2', quantity: 2, unitPrice: 20 },
        { productId: 'p3', quantity: 3, unitPrice: 5 },
      ],
    });
    expect(res.data.data.items.length).toBe(3);
    expect(res.data.data.totalAmount).toBe(65);
  });

  test('sets timestamps on creation', async () => {
    const order = await createOrder();
    expect(order.createdAt).toBeDefined();
    expect(order.updatedAt).toBeDefined();
  });
});

describe('status transition edge cases', () => {
  test('can transition through full lifecycle', async () => {
    const order = await createOrder();
    await put(app, `/orders/${order.id}`, { status: 'confirmed' });
    await put(app, `/orders/${order.id}`, { status: 'processing' });
    await put(app, `/orders/${order.id}`, { status: 'shipped' });
    const res = await put(app, `/orders/${order.id}`, { status: 'delivered' });
    expect(res.data.data.status).toBe('delivered');
  });

  test('cannot update after cancellation', async () => {
    const order = await createOrder();
    await post(app, `/orders/${order.id}/cancel`);
    const res = await put(app, `/orders/${order.id}`, { status: 'confirmed' });
    expect(res.status).toBe(409);
  });
});

describe('cancellation edge cases', () => {
  test('cancel without body uses default reason', async () => {
    const order = await createOrder();
    const res = await post(app, `/orders/${order.id}/cancel`);
    expect(res.data.data.cancellationReason).toBe('No reason provided');
  });

  test('rejects cancelling processing order', async () => {
    const order = await createOrder();
    await put(app, `/orders/${order.id}`, { status: 'processing' });
    const res = await post(app, `/orders/${order.id}/cancel`);
    expect(res.status).toBe(409);
  });
});

describe('user orders edge cases', () => {
  test('ignores invalid status filter', async () => {
    await createOrder();
    const res = await get(app, '/orders/user/user-1?status=bogus');
    // Should return all orders for user (bogus status not in valid list, so no filter applied)
    expect(res.data.data.length).toBe(1);
  });
});

describe('delete edge cases', () => {
  test('verifies deletion actually removes order', async () => {
    const order = await createOrder();
    await del(app, `/orders/${order.id}`);
    const res = await get(app, `/orders/${order.id}`);
    expect(res.status).toBe(404);
    const list = await get(app, '/orders');
    expect(list.data.total).toBe(0);
  });
});

describe('pagination edge cases', () => {
  test('handles empty results', async () => {
    const res = await get(app, '/orders?page=1&limit=10');
    expect(res.data.data).toEqual([]);
    expect(res.data.total).toBe(0);
  });

  test('clamps limit to 100', async () => {
    const res = await get(app, '/orders?limit=999');
    expect(res.data.limit).toBe(100);
  });
});
