import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validPayment = {
  orderId: 'order-1',
  userId: 'user-1',
  amount: 49.99,
  currency: 'usd',
  method: 'credit_card' as const,
};

async function createPayment(overrides = {}) {
  const res = await post(app, '/payments', { ...validPayment, ...overrides });
  return res.data.data;
}

describe('POST /payments', () => {
  test('creates a payment', async () => {
    const res = await post(app, '/payments', validPayment);
    expect(res.status).toBe(201);
    expect(res.data.data.orderId).toBe('order-1');
    expect(res.data.data.amount).toBe(49.99);
    expect(res.data.data.currency).toBe('USD');
    expect(res.data.data.status).toBe('pending');
    expect(res.data.data.transactionRef).toMatch(/^txn_/);
  });

  test('validates required fields', async () => {
    const res = await post(app, '/payments', {});
    expect(res.status).toBe(400);
    expect(res.data.errors.length).toBeGreaterThanOrEqual(5);
  });

  test('validates amount is positive', async () => {
    const res = await post(app, '/payments', { ...validPayment, amount: 0 });
    expect(res.status).toBe(400);
  });

  test('validates payment method', async () => {
    const res = await post(app, '/payments', { ...validPayment, method: 'bitcoin' });
    expect(res.status).toBe(400);
  });

  test('validates currency length', async () => {
    const res = await post(app, '/payments', { ...validPayment, currency: 'us' });
    expect(res.status).toBe(400);
  });

  test('rejects duplicate active payment for same order', async () => {
    await createPayment();
    const res = await post(app, '/payments', { ...validPayment, orderId: 'order-1' });
    expect(res.status).toBe(409);
  });

  test('allows new payment after previous one failed', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'failed' });
    const res = await post(app, '/payments', validPayment);
    expect(res.status).toBe(201);
  });

  test('rounds amount to 2 decimal places', async () => {
    const res = await post(app, '/payments', { ...validPayment, amount: 10.999, orderId: 'order-round' });
    expect(res.data.data.amount).toBe(11);
  });
});

describe('GET /payments', () => {
  test('lists all payments', async () => {
    await createPayment({ orderId: 'o1' });
    await createPayment({ orderId: 'o2' });
    const res = await get(app, '/payments');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
  });

  test('filters by status', async () => {
    const payment = await createPayment({ orderId: 'o1' });
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    await createPayment({ orderId: 'o2' });
    const res = await get(app, '/payments?status=completed');
    expect(res.data.data.length).toBe(1);
  });

  test('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await createPayment({ orderId: `order-${i}` });
    }
    const res = await get(app, '/payments?page=2&limit=2');
    expect(res.data.data.length).toBe(2);
    expect(res.data.total).toBe(5);
  });

  test('returns empty list', async () => {
    const res = await get(app, '/payments');
    expect(res.data.data).toEqual([]);
  });
});

describe('GET /payments/:id', () => {
  test('gets payment by id', async () => {
    const payment = await createPayment();
    const res = await get(app, `/payments/${payment.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.orderId).toBe('order-1');
  });

  test('returns 404 for missing payment', async () => {
    const res = await get(app, '/payments/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PUT /payments/:id', () => {
  test('updates payment status', async () => {
    const payment = await createPayment();
    const res = await put(app, `/payments/${payment.id}`, { status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('completed');
  });

  test('rejects updating refunded payment', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    await post(app, `/payments/${payment.id}/refund`);
    const res = await put(app, `/payments/${payment.id}`, { status: 'completed' });
    expect(res.status).toBe(409);
  });

  test('validates invalid status', async () => {
    const payment = await createPayment();
    const res = await put(app, `/payments/${payment.id}`, { status: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('returns 404 for missing payment', async () => {
    const res = await put(app, '/payments/nonexistent', { status: 'completed' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /payments/:id', () => {
  test('deletes a pending payment', async () => {
    const payment = await createPayment();
    const res = await del(app, `/payments/${payment.id}`);
    expect(res.status).toBe(200);
  });

  test('rejects deleting non-pending payment', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    const res = await del(app, `/payments/${payment.id}`);
    expect(res.status).toBe(409);
  });

  test('returns 404 for missing payment', async () => {
    const res = await del(app, '/payments/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /payments/:id/refund', () => {
  test('refunds a completed payment (full)', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    const res = await post(app, `/payments/${payment.id}/refund`);
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('refunded');
    expect(res.data.data.refundAmount).toBe(49.99);
    expect(res.data.data.refundRef).toMatch(/^ref_/);
  });

  test('refunds a partial amount', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    const res = await post(app, `/payments/${payment.id}/refund`, { amount: 20.00 });
    expect(res.data.data.refundAmount).toBe(20.00);
  });

  test('rejects refund exceeding payment amount', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    const res = await post(app, `/payments/${payment.id}/refund`, { amount: 100.00 });
    expect(res.status).toBe(409);
  });

  test('rejects refunding pending payment', async () => {
    const payment = await createPayment();
    const res = await post(app, `/payments/${payment.id}/refund`);
    expect(res.status).toBe(409);
  });

  test('rejects refunding failed payment', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'failed' });
    const res = await post(app, `/payments/${payment.id}/refund`);
    expect(res.status).toBe(409);
  });

  test('rejects invalid refund amount', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    const res = await post(app, `/payments/${payment.id}/refund`, { amount: -10 });
    expect(res.status).toBe(400);
  });

  test('returns 404 for missing payment', async () => {
    const res = await post(app, '/payments/nonexistent/refund');
    expect(res.status).toBe(404);
  });
});

describe('GET /payments/order/:orderId', () => {
  test('gets payments for an order', async () => {
    const payment = await createPayment({ orderId: 'order-1' });
    await put(app, `/payments/${payment.id}`, { status: 'failed' });
    await createPayment({ orderId: 'order-1' });
    const res = await get(app, '/payments/order/order-1');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
    expect(res.data.total).toBe(2);
  });

  test('returns empty for order with no payments', async () => {
    const res = await get(app, '/payments/order/order-99');
    expect(res.data.data).toEqual([]);
  });

  test('sorts by createdAt descending', async () => {
    const p1 = await createPayment({ orderId: 'order-1' });
    await put(app, `/payments/${p1.id}`, { status: 'failed' });
    await createPayment({ orderId: 'order-1' });
    const res = await get(app, '/payments/order/order-1');
    const dates = res.data.data.map((p: any) => new Date(p.createdAt).getTime());
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
  });
});
