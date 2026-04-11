import { Router, json, parseBody, HttpError, generateId, now } from '../../shared/router';
import { Store } from '../../shared/store';
import { validate } from '../../shared/validation';
import type { Product } from '../../shared/types';

const store = new Store<Product>();

export function getStore() { return store; }
export function resetStore() { store.clear(); }

const router = new Router();

// GET /products
router.get('/products', (req) => {
  const params = new URL(req.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')));
  const category = params.get('category');
  const minPrice = params.get('minPrice') ? parseFloat(params.get('minPrice')!) : undefined;
  const maxPrice = params.get('maxPrice') ? parseFloat(params.get('maxPrice')!) : undefined;

  let items = store.getAll();
  if (category) items = items.filter(p => p.category === category);
  if (minPrice !== undefined) items = items.filter(p => p.price >= minPrice);
  if (maxPrice !== undefined) items = items.filter(p => p.price <= maxPrice);

  const total = items.length;
  const start = (page - 1) * limit;
  items = items.slice(start, start + limit);
  return json({ success: true, data: items, total, page, limit });
});

// POST /products
router.post('/products', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'name', required: true, type: 'string', minLength: 1, maxLength: 200 },
    { field: 'description', required: true, type: 'string', minLength: 1 },
    { field: 'price', required: true, type: 'number', min: 0.01 },
    { field: 'stock', required: true, type: 'number', min: 0 },
    { field: 'category', required: true, type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const product: Product = {
    id: generateId(),
    name: body.name,
    description: body.description,
    price: body.price,
    stock: Math.floor(body.stock),
    reservedStock: 0,
    category: body.category,
    tags: Array.isArray(body.tags) ? body.tags : [],
    active: body.active !== false,
    createdAt: now(),
    updatedAt: now(),
  };
  store.create(product);
  return json({ success: true, data: product }, 201);
});

// GET /products/:id
router.get('/products/:id', (_req, params) => {
  const product = store.get(params.id);
  if (!product) throw new HttpError(404, 'Product not found');
  return json({ success: true, data: product });
});

// PUT /products/:id
router.put('/products/:id', async (req, params) => {
  if (!store.has(params.id)) throw new HttpError(404, 'Product not found');

  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'name', type: 'string', minLength: 1, maxLength: 200 },
    { field: 'description', type: 'string', minLength: 1 },
    { field: 'price', type: 'number', min: 0.01 },
    { field: 'stock', type: 'number', min: 0 },
    { field: 'category', type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const updates: Partial<Product> = { updatedAt: now() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.price !== undefined) updates.price = body.price;
  if (body.stock !== undefined) updates.stock = Math.floor(body.stock);
  if (body.category !== undefined) updates.category = body.category;
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.active !== undefined) updates.active = body.active;

  const updated = store.update(params.id, updates);
  return json({ success: true, data: updated });
});

// DELETE /products/:id
router.delete('/products/:id', (_req, params) => {
  if (!store.has(params.id)) throw new HttpError(404, 'Product not found');
  store.delete(params.id);
  return json({ success: true, data: { message: 'Product deleted' } });
});

// POST /products/:id/reserve — reserve stock for an order
router.post('/products/:id/reserve', async (req, params) => {
  const product = store.get(params.id);
  if (!product) throw new HttpError(404, 'Product not found');

  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'quantity', required: true, type: 'number', min: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const quantity = Math.floor(body.quantity);
  const available = product.stock - product.reservedStock;
  if (quantity > available) {
    throw new HttpError(409, `Insufficient stock. Available: ${available}, requested: ${quantity}`);
  }

  const updated = store.update(params.id, {
    reservedStock: product.reservedStock + quantity,
    updatedAt: now(),
  });
  return json({ success: true, data: updated });
});

// POST /products/:id/release — release reserved stock
router.post('/products/:id/release', async (req, params) => {
  const product = store.get(params.id);
  if (!product) throw new HttpError(404, 'Product not found');

  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'quantity', required: true, type: 'number', min: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const quantity = Math.floor(body.quantity);
  if (quantity > product.reservedStock) {
    throw new HttpError(409, `Cannot release more than reserved. Reserved: ${product.reservedStock}, requested: ${quantity}`);
  }

  const updated = store.update(params.id, {
    reservedStock: product.reservedStock - quantity,
    updatedAt: now(),
  });
  return json({ success: true, data: updated });
});

export function createApp() {
  return (req: Request) => router.handle(req);
}
