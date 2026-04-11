import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validOrder = {
  userId: 'user-1',
  items: [
    { productId: 'prod-1', quantity: 2, unitPrice: 10.00 },
    { productId: 'prod-2', quantity: 1, unitPrice: 25.50 },
  ],
  shippingAddress: '123 Main St, City, ST 12345',
};

async function createOrder(overrides = {}) {
  const res = await post(app, '/orders', { ...validOrder, ...overrides });
  return res.data.data;
}

describe('POST /orders', () => {
  test('creates an order', async () => {
    const res = await post(app, '/orders', validOrder);
    expect(res.status).toBe(201);
    expect(res.data.data.userId).toBe('user-1');
    expect(res.data.data.status).toBe('pending');
    expect(res.data.data.items.length).toBe(2);
    expect(res.data.data.totalAmount).toBe(45.50);
  });

  test('calculates total correctly', async () => {
    const res = await post(app, '/orders', {
      ...validOrder,
      items: [{ productId: 'p1', quantity: 3, unitPrice: 9.99 }],
    });
    expect(res.data.data.totalAmount).toBe(29.97);
  });

  test('validates required fields', async () => {
    const res = await post(app, '/orders', {});
    expect(res.status).toBe(400);
    expect(res.data.errors.length).toBeGreaterThanOrEqual(3);
  });

  test('validates items must be non-empty array', async () => {
    const res = await post(app, '/orders', { ...validOrder, items: [] });
    expect(res.status).toBe(400);
  });

  test('validates item productId', async () => {
    const res = await post(app, '/orders', {
      ...validOrder,
      items: [{ quantity: 1, unitPrice: 10 }],
    });
    expect(res.status).toBe(400);
  });

  test('validates item quantity', async () => {
    const res = await post(app, '/orders', {
      ...validOrder,
      items: [{ productId: 'p1', quantity: 0, unitPrice: 10 }],
    });
    expect(res.status).toBe(400);
  });

  test('validates item unitPrice', async () => {
    const res = await post(app, '/orders', {
      ...validOrder,
      items: [{ productId: 'p1', quantity: 1, unitPrice: -5 }],
    });
    expect(res.status).toBe(400);
  });

  test('validates shipping address length', async () => {
    const res = await post(app, '/orders', { ...validOrder, shippingAddress: '123' });
    expect(res.status).toBe(400);
  });
});

describe('GET /orders', () => {
  test('lists all orders', async () => {
    await createOrder();
    await createOrder({ userId: 'user-2' });
    const res = await get(app, '/orders');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
  });

  test('filters by status', async () => {
    const order = await createOrder();
    await put(app, `/orders/${order.id}`, { status: 'confirmed' });
    await createOrder();
    const res = await get(app, '/orders?status=confirmed');
    expect(res.data.data.length).toBe(1);
    expect(res.data.data[0].status).toBe('confirmed');
  });

  test('paginates results', async () => {
    for (let i = 0; i < 5; i++) await createOrder({ userId: `user-${i}` });
    const res = await get(app, '/orders?page=2&limit=2');
    expect(res.data.data.length).toBe(2);
    expect(res.data.total).toBe(5);
  });

  test('returns empty list', async () => {
    const res = await get(app, '/orders');
    expect(res.data.data).toEqual([]);
  });
});

describe('GET /orders/:id', () => {
  test('gets order by id', async () => {
    const order = await createOrder();
    const res = await get(app, `/orders/${order.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.userId).toBe('user-1');
  });

  test('returns 404 for missing order', async () => {
    const res = await get(app, '/orders/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PUT /orders/:id', () => {
  test('updates order status', async () => {
    const order = await createOrder();
    const res = await put(app, `/orders/${order.id}`, { status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('confirmed');
  });

  test('updates shipping address', async () => {
    const order = await createOrder();
    const res = await put(app, `/orders/${order.id}`, { shippingAddress: '456 Oak Ave, New City, NT 67890' });
    expect(res.data.data.shippingAddress).toBe('456 Oak Ave, New City, NT 67890');
  });

  test('rejects updating cancelled order', async () => {
    const order = await createOrder();
    await put(app, `/orders/${order.id}`, { status: 'cancelled' });
    const res = await put(app, `/orders/${order.id}`, { status: 'confirmed' });
    expect(res.status).toBe(409);
  });

  test('rejects updating delivered order', async () => {
    const order = await createOrder();
    await put(app, `/orders/${order.id}`, { status: 'delivered' });
    const res = await put(app, `/orders/${order.id}`, { status: 'shipped' });
    expect(res.status).toBe(409);
  });

  test('validates invalid status', async () => {
    const order = await createOrder();
    const res = await put(app, `/orders/${order.id}`, { status: 'bogus' });
    expect(res.status).toBe(400);
  });

  test('returns 404 for missing order', async () => {
    const res = await put(app, '/orders/nonexistent', { status: 'confirmed' });
    expect(res.status).toBe(404);
  });

  test('validates short shipping address', async () => {
    const order = await createOrder();
    const res = await put(app, `/orders/${order.id}`, { shippingAddress: 'XY' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /orders/:id', () => {
  test('deletes a pending order', async () => {
    const order = await createOrder();
    const res = await del(app, `/orders/${order.id}`);
    expect(res.status).toBe(200);
  });

  test('rejects deleting non-pending order', async () => {
    const order = await createOrder();
    await put(app, `/orders/${order.id}`, { status: 'confirmed' });
    const res = await del(app, `/orders/${order.id}`);
    expect(res.status).toBe(409);
  });

  test('returns 404 for missing order', async () => {
    const res = await del(app, '/orders/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /orders/:id/cancel', () => {
  test('cancels a pending order', async () => {
    const order = await createOrder();
    const res = await post(app, `/orders/${order.id}/cancel`, { reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('cancelled');
    expect(res.data.data.cancellationReason).toBe('Changed my mind');
  });

  test('cancels a confirmed order', async () => {
    const order = await createOrder();
    await put(app, `/orders/${order.id}`, { status: 'confirmed' });
    const res = await post(app, `/orders/${order.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('cancelled');
  });

  test('rejects cancelling shipped order', async () => {
    const order = await createOrder();
    await put(app, `/orders/${order.id}`, { status: 'shipped' });
    const res = await post(app, `/orders/${order.id}/cancel`);
    expect(res.status).toBe(409);
  });

  test('rejects cancelling delivered order', async () => {
    const order = await createOrder();
    await put(app, `/orders/${order.id}`, { status: 'delivered' });
    const res = await post(app, `/orders/${order.id}/cancel`);
    expect(res.status).toBe(409);
  });

  test('returns 404 for missing order', async () => {
    const res = await post(app, '/orders/nonexistent/cancel');
    expect(res.status).toBe(404);
  });
});

describe('GET /orders/user/:userId', () => {
  test('gets orders for a user', async () => {
    await createOrder({ userId: 'user-1' });
    await createOrder({ userId: 'user-1' });
    await createOrder({ userId: 'user-2' });
    const res = await get(app, '/orders/user/user-1');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
    expect(res.data.total).toBe(2);
  });

  test('returns empty for user with no orders', async () => {
    const res = await get(app, '/orders/user/user-99');
    expect(res.data.data).toEqual([]);
  });

  test('filters by status', async () => {
    const order = await createOrder({ userId: 'user-1' });
    await put(app, `/orders/${order.id}`, { status: 'confirmed' });
    await createOrder({ userId: 'user-1' });
    const res = await get(app, '/orders/user/user-1?status=confirmed');
    expect(res.data.data.length).toBe(1);
  });

  test('orders sorted by createdAt descending', async () => {
    await createOrder({ userId: 'user-1' });
    await createOrder({ userId: 'user-1' });
    const res = await get(app, '/orders/user/user-1');
    const dates = res.data.data.map((o: any) => new Date(o.createdAt).getTime());
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
  });
});
