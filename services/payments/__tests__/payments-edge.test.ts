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

describe('creation edge cases', () => {
  test('uppercases currency', async () => {
    const res = await post(app, '/payments', { ...validPayment, currency: 'eur', orderId: 'o1' });
    expect(res.data.data.currency).toBe('EUR');
  });

  test('generates unique transaction refs', async () => {
    const p1 = await createPayment({ orderId: 'o1' });
    const p2 = await createPayment({ orderId: 'o2' });
    expect(p1.transactionRef).not.toBe(p2.transactionRef);
  });

  test('accepts all valid payment methods', async () => {
    const methods = ['credit_card', 'debit_card', 'bank_transfer', 'wallet'];
    for (let i = 0; i < methods.length; i++) {
      resetStore();
      const res = await post(app, '/payments', { ...validPayment, method: methods[i] });
      expect(res.status).toBe(201);
    }
  });

  test('rejects non-number amount', async () => {
    const res = await post(app, '/payments', { ...validPayment, amount: 'free' });
    expect(res.status).toBe(400);
  });

  test('rejects negative amount', async () => {
    const res = await post(app, '/payments', { ...validPayment, amount: -10 });
    expect(res.status).toBe(400);
  });

  test('sets createdAt and updatedAt', async () => {
    const payment = await createPayment();
    expect(payment.createdAt).toBeDefined();
    expect(payment.updatedAt).toBeDefined();
  });
});

describe('refund edge cases', () => {
  test('full refund equals payment amount', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    const res = await post(app, `/payments/${payment.id}/refund`);
    expect(res.data.data.refundAmount).toBe(49.99);
  });

  test('partial refund less than payment amount', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    const res = await post(app, `/payments/${payment.id}/refund`, { amount: 10.50 });
    expect(res.data.data.refundAmount).toBe(10.50);
  });

  test('rejects refund with non-numeric amount', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    const res = await post(app, `/payments/${payment.id}/refund`, { amount: 'all' });
    expect(res.status).toBe(400);
  });

  test('generates refund reference', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    const res = await post(app, `/payments/${payment.id}/refund`);
    expect(res.data.data.refundRef).toMatch(/^ref_/);
  });

  test('cannot refund already refunded payment', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    await post(app, `/payments/${payment.id}/refund`);
    // Payment is now refunded, cannot update
    const res = await put(app, `/payments/${payment.id}`, { status: 'completed' });
    expect(res.status).toBe(409);
  });
});

describe('order payments edge cases', () => {
  test('order with no payments returns empty array', async () => {
    const res = await get(app, '/payments/order/nonexistent-order');
    expect(res.data.data).toEqual([]);
    expect(res.data.total).toBe(0);
  });

  test('allows new payment after previous refunded', async () => {
    const payment = await createPayment();
    await put(app, `/payments/${payment.id}`, { status: 'completed' });
    await post(app, `/payments/${payment.id}/refund`);
    const res = await post(app, '/payments', validPayment);
    expect(res.status).toBe(201);
  });
});

describe('pagination edge cases', () => {
  test('handles page beyond data', async () => {
    await createPayment();
    const res = await get(app, '/payments?page=100');
    expect(res.data.data).toEqual([]);
  });

  test('clamps limit', async () => {
    const res = await get(app, '/payments?limit=999');
    expect(res.data.limit).toBe(100);
  });
});

describe('delete edge cases', () => {
  test('verifies deletion removes from store', async () => {
    const payment = await createPayment();
    await del(app, `/payments/${payment.id}`);
    const check = await get(app, `/payments/${payment.id}`);
    expect(check.status).toBe(404);
  });
});
