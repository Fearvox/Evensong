import { Router, json, parseBody, HttpError, generateId, now } from '../../shared/router';
import { Store } from '../../shared/store';
import { validate } from '../../shared/validation';
import type { Order, OrderItem, OrderStatus } from '../../shared/types';

const store = new Store<Order>();

export function getStore() { return store; }
export function resetStore() { store.clear(); }

const VALID_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'confirmed'];

const router = new Router();

// GET /orders
router.get('/orders', (req) => {
  const params = new URL(req.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')));
  const status = params.get('status') as OrderStatus | null;

  let items = store.getAll();
  if (status && VALID_STATUSES.includes(status)) {
    items = items.filter(o => o.status === status);
  }

  const total = items.length;
  const start = (page - 1) * limit;
  items = items.slice(start, start + limit);
  return json({ success: true, data: items, total, page, limit });
});

// POST /orders
router.post('/orders', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'userId', required: true, type: 'string' },
    { field: 'items', required: true, type: 'array' },
    { field: 'shippingAddress', required: true, type: 'string', minLength: 5 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return json({ success: false, errors: ['items must be a non-empty array'] }, 400);
  }

  const itemErrors: string[] = [];
  const validatedItems: OrderItem[] = [];
  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    if (!item.productId || typeof item.productId !== 'string') {
      itemErrors.push(`items[${i}].productId is required`);
    }
    if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1) {
      itemErrors.push(`items[${i}].quantity must be a positive number`);
    }
    if (!item.unitPrice || typeof item.unitPrice !== 'number' || item.unitPrice <= 0) {
      itemErrors.push(`items[${i}].unitPrice must be a positive number`);
    }
    if (itemErrors.length === 0) {
      validatedItems.push({
        productId: item.productId,
        quantity: Math.floor(item.quantity),
        unitPrice: item.unitPrice,
      });
    }
  }
  if (itemErrors.length) return json({ success: false, errors: itemErrors }, 400);

  const totalAmount = validatedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const order: Order = {
    id: generateId(),
    userId: body.userId,
    items: validatedItems,
    status: 'pending',
    totalAmount: Math.round(totalAmount * 100) / 100,
    shippingAddress: body.shippingAddress,
    createdAt: now(),
    updatedAt: now(),
  };
  store.create(order);
  return json({ success: true, data: order }, 201);
});

// GET /orders/:id
router.get('/orders/:id', (_req, params) => {
  const order = store.get(params.id);
  if (!order) throw new HttpError(404, 'Order not found');
  return json({ success: true, data: order });
});

// PUT /orders/:id
router.put('/orders/:id', async (req, params) => {
  const order = store.get(params.id);
  if (!order) throw new HttpError(404, 'Order not found');

  if (order.status === 'cancelled') {
    throw new HttpError(409, 'Cannot update a cancelled order');
  }
  if (order.status === 'delivered') {
    throw new HttpError(409, 'Cannot update a delivered order');
  }

  const body = await parseBody<any>(req);
  const updates: Partial<Order> = { updatedAt: now() };

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return json({ success: false, errors: [`status must be one of: ${VALID_STATUSES.join(', ')}`] }, 400);
    }
    updates.status = body.status;
  }
  if (body.shippingAddress !== undefined) {
    if (typeof body.shippingAddress !== 'string' || body.shippingAddress.length < 5) {
      return json({ success: false, errors: ['shippingAddress must be at least 5 characters'] }, 400);
    }
    updates.shippingAddress = body.shippingAddress;
  }

  const updated = store.update(params.id, updates);
  return json({ success: true, data: updated });
});

// DELETE /orders/:id
router.delete('/orders/:id', (_req, params) => {
  const order = store.get(params.id);
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.status !== 'pending') {
    throw new HttpError(409, 'Can only delete pending orders');
  }
  store.delete(params.id);
  return json({ success: true, data: { message: 'Order deleted' } });
});

// POST /orders/:id/cancel
router.post('/orders/:id/cancel', async (req, params) => {
  const order = store.get(params.id);
  if (!order) throw new HttpError(404, 'Order not found');

  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    throw new HttpError(409, `Cannot cancel order with status '${order.status}'. Only pending or confirmed orders can be cancelled.`);
  }

  const body = await parseBody<any>(req).catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason : 'No reason provided';

  const updated = store.update(params.id, {
    status: 'cancelled',
    updatedAt: now(),
  });
  return json({ success: true, data: { ...updated, cancellationReason: reason } });
});

// GET /orders/user/:userId
router.get('/orders/user/:userId', (req, params) => {
  const query = new URL(req.url).searchParams;
  const status = query.get('status') as OrderStatus | null;

  let orders = store.find(o => o.userId === params.userId);
  if (status && VALID_STATUSES.includes(status)) {
    orders = orders.filter(o => o.status === status);
  }
  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return json({ success: true, data: orders, total: orders.length });
});

export function createApp() {
  return (req: Request) => router.handle(req);
}
