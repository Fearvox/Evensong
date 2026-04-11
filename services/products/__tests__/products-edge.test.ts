import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put } from '../../../shared/test-utils';

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

describe('creation edge cases', () => {
  test('floors stock to integer', async () => {
    const res = await post(app, '/products', { ...validProduct, stock: 10.7 });
    expect(res.data.data.stock).toBe(10);
  });

  test('defaults tags to empty array when not provided', async () => {
    const res = await post(app, '/products', validProduct);
    expect(res.data.data.tags).toEqual([]);
  });

  test('sets createdAt and updatedAt', async () => {
    const res = await post(app, '/products', validProduct);
    expect(res.data.data.createdAt).toBeDefined();
    expect(res.data.data.updatedAt).toBeDefined();
  });

  test('rejects negative price', async () => {
    const res = await post(app, '/products', { ...validProduct, price: -5 });
    expect(res.status).toBe(400);
  });

  test('rejects empty name', async () => {
    const res = await post(app, '/products', { ...validProduct, name: '' });
    expect(res.status).toBe(400);
  });

  test('rejects name exceeding max length', async () => {
    const res = await post(app, '/products', { ...validProduct, name: 'a'.repeat(201) });
    expect(res.status).toBe(400);
  });
});

describe('list filtering edge cases', () => {
  test('returns all when no filters', async () => {
    await createProduct({ name: 'A', category: 'x' });
    await createProduct({ name: 'B', category: 'y' });
    const res = await get(app, '/products');
    expect(res.data.data.length).toBe(2);
  });

  test('combined category and price filter', async () => {
    await createProduct({ name: 'Cheap', price: 5, category: 'x' });
    await createProduct({ name: 'Expensive', price: 500, category: 'x' });
    await createProduct({ name: 'Other', price: 50, category: 'y' });
    const res = await get(app, '/products?category=x&minPrice=10');
    expect(res.data.data.length).toBe(1);
    expect(res.data.data[0].name).toBe('Expensive');
  });
});

describe('reserve/release edge cases', () => {
  test('reserves exact available amount', async () => {
    const product = await createProduct({ stock: 10 });
    const res = await post(app, `/products/${product.id}/reserve`, { quantity: 10 });
    expect(res.status).toBe(200);
    expect(res.data.data.reservedStock).toBe(10);
  });

  test('reserves then releases full amount', async () => {
    const product = await createProduct({ stock: 20 });
    await post(app, `/products/${product.id}/reserve`, { quantity: 15 });
    const res = await post(app, `/products/${product.id}/release`, { quantity: 15 });
    expect(res.data.data.reservedStock).toBe(0);
  });

  test('multiple sequential reserves accumulate', async () => {
    const product = await createProduct({ stock: 100 });
    await post(app, `/products/${product.id}/reserve`, { quantity: 10 });
    await post(app, `/products/${product.id}/reserve`, { quantity: 20 });
    const check = await get(app, `/products/${product.id}`);
    expect(check.data.data.reservedStock).toBe(30);
  });

  test('reserve floors quantity to integer', async () => {
    const product = await createProduct({ stock: 10 });
    const res = await post(app, `/products/${product.id}/reserve`, { quantity: 3.7 });
    expect(res.data.data.reservedStock).toBe(3);
  });

  test('rejects non-number quantity in reserve', async () => {
    const product = await createProduct();
    const res = await post(app, `/products/${product.id}/reserve`, { quantity: 'five' });
    expect(res.status).toBe(400);
  });

  test('rejects non-number quantity in release', async () => {
    const product = await createProduct();
    const res = await post(app, `/products/${product.id}/release`, { quantity: 'ten' });
    expect(res.status).toBe(400);
  });
});

describe('update edge cases', () => {
  test('update preserves fields not in payload', async () => {
    const product = await createProduct({ tags: ['a', 'b'] });
    const res = await put(app, `/products/${product.id}`, { name: 'New Name' });
    expect(res.data.data.tags).toEqual(['a', 'b']);
    expect(res.data.data.price).toBe(29.99);
  });
});
