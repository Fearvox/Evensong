import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validDoc = {
  type: 'product',
  title: 'Wireless Bluetooth Headphones',
  content: 'High quality noise cancelling headphones with 40 hour battery life.',
  tags: ['electronics', 'audio', 'wireless'],
};

async function createDoc(overrides = {}) {
  const res = await post(app, '/search/documents', { ...validDoc, ...overrides });
  return res.data.data;
}

describe('POST /search/documents', () => {
  test('indexes a document', async () => {
    const res = await post(app, '/search/documents', validDoc);
    expect(res.status).toBe(201);
    expect(res.data.data.type).toBe('product');
    expect(res.data.data.title).toBe('Wireless Bluetooth Headphones');
    expect(res.data.data.tags).toEqual(['electronics', 'audio', 'wireless']);
    expect(res.data.data.indexedAt).toBeDefined();
  });

  test('validates required fields', async () => {
    const res = await post(app, '/search/documents', {});
    expect(res.status).toBe(400);
    expect(res.data.errors.length).toBeGreaterThanOrEqual(3);
  });

  test('validates title type', async () => {
    const res = await post(app, '/search/documents', { ...validDoc, title: 123 });
    expect(res.status).toBe(400);
  });

  test('validates content is non-empty', async () => {
    const res = await post(app, '/search/documents', { ...validDoc, content: '' });
    expect(res.status).toBe(400);
  });

  test('defaults tags to empty array', async () => {
    const res = await post(app, '/search/documents', { type: 'article', title: 'Test', content: 'Content' });
    expect(res.data.data.tags).toEqual([]);
  });

  test('filters non-string tags', async () => {
    const res = await post(app, '/search/documents', { ...validDoc, tags: ['valid', 123, 'also-valid'] });
    expect(res.data.data.tags).toEqual(['valid', 'also-valid']);
  });

  test('defaults metadata to empty object', async () => {
    const res = await post(app, '/search/documents', validDoc);
    expect(res.data.data.metadata).toEqual({});
  });

  test('creates with custom metadata', async () => {
    const res = await post(app, '/search/documents', { ...validDoc, metadata: { sku: 'ABC123' } });
    expect(res.data.data.metadata.sku).toBe('ABC123');
  });
});

describe('GET /search/documents/:id', () => {
  test('gets document by id', async () => {
    const doc = await createDoc();
    const res = await get(app, `/search/documents/${doc.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.title).toBe('Wireless Bluetooth Headphones');
  });

  test('returns 404 for missing document', async () => {
    const res = await get(app, '/search/documents/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PUT /search/documents/:id', () => {
  test('updates document fields', async () => {
    const doc = await createDoc();
    const res = await put(app, `/search/documents/${doc.id}`, { title: 'Updated Headphones' });
    expect(res.status).toBe(200);
    expect(res.data.data.title).toBe('Updated Headphones');
  });

  test('updates content', async () => {
    const doc = await createDoc();
    const res = await put(app, `/search/documents/${doc.id}`, { content: 'New description.' });
    expect(res.data.data.content).toBe('New description.');
  });

  test('updates tags', async () => {
    const doc = await createDoc();
    const res = await put(app, `/search/documents/${doc.id}`, { tags: ['new-tag'] });
    expect(res.data.data.tags).toEqual(['new-tag']);
  });

  test('returns 404 for missing document', async () => {
    const res = await put(app, '/search/documents/nonexistent', { title: 'Test' });
    expect(res.status).toBe(404);
  });

  test('validates empty title', async () => {
    const doc = await createDoc();
    const res = await put(app, `/search/documents/${doc.id}`, { title: '' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /search/documents/:id', () => {
  test('deletes a document', async () => {
    const doc = await createDoc();
    const res = await del(app, `/search/documents/${doc.id}`);
    expect(res.status).toBe(200);
    const check = await get(app, `/search/documents/${doc.id}`);
    expect(check.status).toBe(404);
  });

  test('returns 404 for missing document', async () => {
    const res = await del(app, '/search/documents/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /search', () => {
  test('searches by query', async () => {
    await createDoc({ title: 'Wireless Headphones' });
    await createDoc({ title: 'USB Cable', content: 'A standard USB cable.', tags: [] });
    const res = await get(app, '/search?q=wireless');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(1);
    expect(res.data.data[0].title).toBe('Wireless Headphones');
  });

  test('searches in content', async () => {
    await createDoc({ title: 'Headphones', content: 'noise cancelling headphones' });
    const res = await get(app, '/search?q=noise');
    expect(res.data.data.length).toBe(1);
  });

  test('searches in tags', async () => {
    await createDoc({ tags: ['portable', 'wireless'] });
    const res = await get(app, '/search?q=portable');
    expect(res.data.data.length).toBe(1);
  });

  test('case insensitive search', async () => {
    await createDoc({ title: 'BLUETOOTH Speaker' });
    const res = await get(app, '/search?q=bluetooth');
    expect(res.data.data.length).toBe(1);
  });

  test('filters by type', async () => {
    await createDoc({ type: 'product' });
    await createDoc({ type: 'article', title: 'Headphones Review', content: 'A review of wireless headphones' });
    const res = await get(app, '/search?q=headphones&type=article');
    expect(res.data.data.length).toBe(1);
    expect(res.data.data[0].type).toBe('article');
  });

  test('requires query parameter', async () => {
    const res = await get(app, '/search');
    expect(res.status).toBe(400);
  });

  test('requires non-empty query', async () => {
    const res = await get(app, '/search?q=');
    expect(res.status).toBe(400);
  });

  test('returns scores', async () => {
    await createDoc({ title: 'Headphones wireless', content: 'Best headphones' });
    const res = await get(app, '/search?q=headphones');
    expect(res.data.data[0]._score).toBeGreaterThan(0);
  });

  test('ranks title matches higher', async () => {
    await createDoc({ title: 'Cable', content: 'Headphones cable adapter' });
    await createDoc({ title: 'Headphones', content: 'A product', tags: [] });
    const res = await get(app, '/search?q=headphones');
    expect(res.data.data[0].title).toBe('Headphones');
  });

  test('paginates search results', async () => {
    for (let i = 0; i < 5; i++) {
      await createDoc({ title: `Widget ${i}`, content: `Widget description ${i}` });
    }
    const res = await get(app, '/search?q=widget&page=2&limit=2');
    expect(res.data.data.length).toBe(2);
    expect(res.data.total).toBe(5);
  });

  test('returns empty for no matches', async () => {
    await createDoc();
    const res = await get(app, '/search?q=nonexistent');
    expect(res.data.data).toEqual([]);
    expect(res.data.total).toBe(0);
  });
});

describe('GET /search/suggest', () => {
  test('returns title suggestions', async () => {
    await createDoc({ title: 'Wireless Headphones', tags: [] });
    await createDoc({ title: 'Wireless Mouse', tags: [] });
    await createDoc({ title: 'USB Cable', tags: [] });
    const res = await get(app, '/search/suggest?q=wire');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
    expect(res.data.data.every((s: any) => s.source === 'title')).toBe(true);
  });

  test('returns tag suggestions', async () => {
    await createDoc({ tags: ['wireless', 'bluetooth'] });
    const res = await get(app, '/search/suggest?q=blue');
    expect(res.data.data.some((s: any) => s.text === 'bluetooth' && s.source === 'tag')).toBe(true);
  });

  test('requires query parameter', async () => {
    const res = await get(app, '/search/suggest');
    expect(res.status).toBe(400);
  });

  test('limits results', async () => {
    for (let i = 0; i < 25; i++) {
      await createDoc({ title: `Product ${i}`, tags: [`tag${i}`] });
    }
    const res = await get(app, '/search/suggest?q=product&limit=5');
    expect(res.data.data.length).toBeLessThanOrEqual(5);
  });

  test('case insensitive suggestions', async () => {
    await createDoc({ title: 'WIRELESS Device' });
    const res = await get(app, '/search/suggest?q=wireless');
    expect(res.data.data.length).toBeGreaterThan(0);
  });
});

describe('POST /search/reindex', () => {
  test('reindexes all documents', async () => {
    await createDoc();
    await createDoc({ title: 'Another doc', content: 'Content here' });
    const res = await post(app, '/search/reindex');
    expect(res.status).toBe(200);
    expect(res.data.data.reindexed).toBe(2);
    expect(res.data.data.totalDocuments).toBe(2);
    expect(res.data.data.completedAt).toBeDefined();
  });

  test('reindexes empty store', async () => {
    const res = await post(app, '/search/reindex');
    expect(res.data.data.reindexed).toBe(0);
    expect(res.data.data.totalDocuments).toBe(0);
  });
});
