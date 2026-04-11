import { Router, json, parseBody, HttpError, generateId, now } from '../../shared/router';
import { Store } from '../../shared/store';
import { validate } from '../../shared/validation';
import type { Payment, PaymentStatus, PaymentMethod } from '../../shared/types';

const store = new Store<Payment>();

export function getStore() { return store; }
export function resetStore() { store.clear(); }

const VALID_METHODS: PaymentMethod[] = ['credit_card', 'debit_card', 'bank_transfer', 'wallet'];
const VALID_STATUSES: PaymentStatus[] = ['pending', 'completed', 'failed', 'refunded'];

const router = new Router();

// GET /payments
router.get('/payments', (req) => {
  const params = new URL(req.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')));
  const status = params.get('status') as PaymentStatus | null;

  let items = store.getAll();
  if (status && VALID_STATUSES.includes(status)) {
    items = items.filter(p => p.status === status);
  }

  const total = items.length;
  const start = (page - 1) * limit;
  items = items.slice(start, start + limit);
  return json({ success: true, data: items, total, page, limit });
});

// POST /payments
router.post('/payments', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'orderId', required: true, type: 'string' },
    { field: 'userId', required: true, type: 'string' },
    { field: 'amount', required: true, type: 'number', min: 0.01 },
    { field: 'currency', required: true, type: 'string', minLength: 3, maxLength: 3 },
    { field: 'method', required: true, type: 'string' },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  if (!VALID_METHODS.includes(body.method)) {
    return json({ success: false, errors: [`method must be one of: ${VALID_METHODS.join(', ')}`] }, 400);
  }

  // Check for duplicate payment on same order
  const existingPayment = store.findOne(
    p => p.orderId === body.orderId && (p.status === 'completed' || p.status === 'pending')
  );
  if (existingPayment) {
    throw new HttpError(409, 'An active payment already exists for this order');
  }

  const payment: Payment = {
    id: generateId(),
    orderId: body.orderId,
    userId: body.userId,
    amount: Math.round(body.amount * 100) / 100,
    currency: body.currency.toUpperCase(),
    method: body.method,
    status: 'pending',
    transactionRef: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now(),
    updatedAt: now(),
  };
  store.create(payment);
  return json({ success: true, data: payment }, 201);
});

// GET /payments/:id
router.get('/payments/:id', (_req, params) => {
  const payment = store.get(params.id);
  if (!payment) throw new HttpError(404, 'Payment not found');
  return json({ success: true, data: payment });
});

// PUT /payments/:id
router.put('/payments/:id', async (req, params) => {
  const payment = store.get(params.id);
  if (!payment) throw new HttpError(404, 'Payment not found');

  if (payment.status === 'refunded') {
    throw new HttpError(409, 'Cannot update a refunded payment');
  }

  const body = await parseBody<any>(req);
  const updates: Partial<Payment> = { updatedAt: now() };

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return json({ success: false, errors: [`status must be one of: ${VALID_STATUSES.join(', ')}`] }, 400);
    }
    updates.status = body.status;
  }

  const updated = store.update(params.id, updates);
  return json({ success: true, data: updated });
});

// DELETE /payments/:id
router.delete('/payments/:id', (_req, params) => {
  const payment = store.get(params.id);
  if (!payment) throw new HttpError(404, 'Payment not found');
  if (payment.status !== 'pending') {
    throw new HttpError(409, 'Can only delete pending payments');
  }
  store.delete(params.id);
  return json({ success: true, data: { message: 'Payment deleted' } });
});

// POST /payments/:id/refund
router.post('/payments/:id/refund', async (req, params) => {
  const payment = store.get(params.id);
  if (!payment) throw new HttpError(404, 'Payment not found');

  if (payment.status !== 'completed') {
    throw new HttpError(409, `Cannot refund payment with status '${payment.status}'. Only completed payments can be refunded.`);
  }

  const body = await parseBody<any>(req).catch(() => ({}));
  let refundAmount = payment.amount;
  if (body.amount !== undefined) {
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return json({ success: false, errors: ['amount must be a positive number'] }, 400);
    }
    if (body.amount > payment.amount) {
      throw new HttpError(409, `Refund amount (${body.amount}) cannot exceed payment amount (${payment.amount})`);
    }
    refundAmount = body.amount;
  }

  const updated = store.update(params.id, {
    status: 'refunded',
    updatedAt: now(),
  });

  return json({
    success: true,
    data: {
      ...updated,
      refundAmount: Math.round(refundAmount * 100) / 100,
      refundRef: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    },
  });
});

// GET /payments/order/:orderId
router.get('/payments/order/:orderId', (_req, params) => {
  const payments = store.find(p => p.orderId === params.orderId);
  payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return json({ success: true, data: payments, total: payments.length });
});

export function createApp() {
  return (req: Request) => router.handle(req);
}
