import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validProduct = {
  name: 'Widget',
  description: 'A useful widget',
  price: 29.99,
  stock: 100,
  category: 'electronics',
};

async function createProduct(overrides = {}) {
  const res = await post(app, '/products', { ...validProduct, ...overrides });
  return res.data.data;
}

describe('POST /products', () => {
  test('creates a product', async () => {
    const res = await post(app, '/products', validProduct);
    expect(res.status).toBe(201);
    expect(res.data.data.name).toBe('Widget');
    expect(res.data.data.price).toBe(29.99);
    expect(res.data.data.stock).toBe(100);
    expect(res.data.data.reservedStock).toBe(0);
    expect(res.data.data.active).toBe(true);
  });

  test('creates product with tags', async () => {
    const res = await post(app, '/products', { ...validProduct, tags: ['new', 'sale'] });
    expect(res.data.data.tags).toEqual(['new', 'sale']);
  });

  test('validates required fields', async () => {
    const res = await post(app, '/products', {});
    expect(res.status).toBe(400);
    expect(res.data.errors.length).toBeGreaterThanOrEqual(4);
  });

  test('validates price is positive', async () => {
    const res = await post(app, '/products', { ...validProduct, price: 0 });
    expect(res.status).toBe(400);
  });

  test('validates stock is non-negative', async () => {
    const res = await post(app, '/products', { ...validProduct, stock: -1 });
    expect(res.status).toBe(400);
  });

  test('validates name type', async () => {
    const res = await post(app, '/products', { ...validProduct, name: 123 });
    expect(res.status).toBe(400);
  });

  test('validates price type', async () => {
    const res = await post(app, '/products', { ...validProduct, price: 'free' });
    expect(res.status).toBe(400);
  });

  test('sets active to false when specified', async () => {
    const res = await post(app, '/products', { ...validProduct, active: false });
    expect(res.data.data.active).toBe(false);
  });
});

describe('GET /products', () => {
  test('lists all products', async () => {
    await createProduct();
    await createProduct({ name: 'Gadget' });
    const res = await get(app, '/products');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
    expect(res.data.total).toBe(2);
  });

  test('filters by category', async () => {
    await createProduct({ category: 'electronics' });
    await createProduct({ name: 'Shirt', category: 'clothing' });
    const res = await get(app, '/products?category=electronics');
    expect(res.data.data.length).toBe(1);
    expect(res.data.data[0].category).toBe('electronics');
  });

  test('filters by price range', async () => {
    await createProduct({ price: 10 });
    await createProduct({ name: 'Expensive', price: 100 });
    const res = await get(app, '/products?minPrice=50&maxPrice=200');
    expect(res.data.data.length).toBe(1);
    expect(res.data.data[0].name).toBe('Expensive');
  });

  test('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await createProduct({ name: `Product ${i}` });
    }
    const res = await get(app, '/products?page=1&limit=3');
    expect(res.data.data.length).toBe(3);
    expect(res.data.total).toBe(5);
  });

  test('returns empty list', async () => {
    const res = await get(app, '/products');
    expect(res.data.data).toEqual([]);
  });
});

describe('GET /products/:id', () => {
  test('gets product by id', async () => {
    const product = await createProduct();
    const res = await get(app, `/products/${product.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Widget');
  });

  test('returns 404 for missing product', async () => {
    const res = await get(app, '/products/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PUT /products/:id', () => {
  test('updates product fields', async () => {
    const product = await createProduct();
    const res = await put(app, `/products/${product.id}`, { name: 'Updated Widget', price: 39.99 });
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Updated Widget');
    expect(res.data.data.price).toBe(39.99);
  });

  test('returns 404 for missing product', async () => {
    const res = await put(app, '/products/nonexistent', { name: 'Test' });
    expect(res.status).toBe(404);
  });

  test('validates price on update', async () => {
    const product = await createProduct();
    const res = await put(app, `/products/${product.id}`, { price: -5 });
    expect(res.status).toBe(400);
  });

  test('updates active flag', async () => {
    const product = await createProduct();
    const res = await put(app, `/products/${product.id}`, { active: false });
    expect(res.data.data.active).toBe(false);
  });

  test('updates tags', async () => {
    const product = await createProduct();
    const res = await put(app, `/products/${product.id}`, { tags: ['updated', 'popular'] });
    expect(res.data.data.tags).toEqual(['updated', 'popular']);
  });
});

describe('DELETE /products/:id', () => {
  test('deletes a product', async () => {
    const product = await createProduct();
    const res = await del(app, `/products/${product.id}`);
    expect(res.status).toBe(200);
    const check = await get(app, `/products/${product.id}`);
    expect(check.status).toBe(404);
  });

  test('returns 404 for missing product', async () => {
    const res = await del(app, '/products/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /products/:id/reserve', () => {
  test('reserves stock', async () => {
    const product = await createProduct({ stock: 50 });
    const res = await post(app, `/products/${product.id}/reserve`, { quantity: 10 });
    expect(res.status).toBe(200);
    expect(res.data.data.reservedStock).toBe(10);
  });

  test('rejects insufficient stock', async () => {
    const product = await createProduct({ stock: 5 });
    const res = await post(app, `/products/${product.id}/reserve`, { quantity: 10 });
    expect(res.status).toBe(409);
    expect(res.data.error).toContain('Insufficient stock');
  });

  test('accounts for already reserved stock', async () => {
    const product = await createProduct({ stock: 10 });
    await post(app, `/products/${product.id}/reserve`, { quantity: 8 });
    const res = await post(app, `/products/${product.id}/reserve`, { quantity: 5 });
    expect(res.status).toBe(409);
  });

  test('validates quantity is required', async () => {
    const product = await createProduct();
    const res = await post(app, `/products/${product.id}/reserve`, {});
    expect(res.status).toBe(400);
  });

  test('validates quantity is positive', async () => {
    const product = await createProduct();
    const res = await post(app, `/products/${product.id}/reserve`, { quantity: 0 });
    expect(res.status).toBe(400);
  });

  test('returns 404 for missing product', async () => {
    const res = await post(app, '/products/nonexistent/reserve', { quantity: 1 });
    expect(res.status).toBe(404);
  });
});

describe('POST /products/:id/release', () => {
  test('releases reserved stock', async () => {
    const product = await createProduct({ stock: 50 });
    await post(app, `/products/${product.id}/reserve`, { quantity: 20 });
    const res = await post(app, `/products/${product.id}/release`, { quantity: 10 });
    expect(res.status).toBe(200);
    expect(res.data.data.reservedStock).toBe(10);
  });

  test('rejects releasing more than reserved', async () => {
    const product = await createProduct({ stock: 50 });
    await post(app, `/products/${product.id}/reserve`, { quantity: 5 });
    const res = await post(app, `/products/${product.id}/release`, { quantity: 10 });
    expect(res.status).toBe(409);
  });

  test('returns 404 for missing product', async () => {
    const res = await post(app, '/products/nonexistent/release', { quantity: 1 });
    expect(res.status).toBe(404);
  });

  test('validates quantity', async () => {
    const product = await createProduct();
    const res = await post(app, `/products/${product.id}/release`, {});
    expect(res.status).toBe(400);
  });
});
