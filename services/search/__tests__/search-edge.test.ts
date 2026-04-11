import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validDoc = {
  type: 'product',
  title: 'Test Document',
  content: 'Some searchable content for testing.',
  tags: ['test'],
};

async function createDoc(overrides = {}) {
  const res = await post(app, '/search/documents', { ...validDoc, ...overrides });
  return res.data.data;
}

describe('document creation edge cases', () => {
  test('generates unique ids', async () => {
    const d1 = await createDoc();
    const d2 = await createDoc({ title: 'Second' });
    expect(d1.id).not.toBe(d2.id);
  });

  test('sets indexedAt and updatedAt', async () => {
    const doc = await createDoc();
    expect(doc.indexedAt).toBeDefined();
    expect(doc.updatedAt).toBeDefined();
  });

  test('rejects empty type', async () => {
    const res = await post(app, '/search/documents', { ...validDoc, type: '' });
    expect(res.status).toBe(400);
  });

  test('rejects title exceeding max length', async () => {
    const res = await post(app, '/search/documents', { ...validDoc, title: 'a'.repeat(501) });
    expect(res.status).toBe(400);
  });

  test('accepts title at max length boundary', async () => {
    const res = await post(app, '/search/documents', { ...validDoc, title: 'a'.repeat(500) });
    expect(res.status).toBe(201);
  });
});

describe('search scoring edge cases', () => {
  test('title match scores higher than content match', async () => {
    await createDoc({ title: 'Apple Phone', content: 'A smartphone device', tags: [] });
    await createDoc({ title: 'Device Case', content: 'Case for your Apple phone', tags: [] });
    const res = await get(app, '/search?q=apple');
    expect(res.data.data[0].title).toBe('Apple Phone');
    expect(res.data.data[0]._score).toBeGreaterThan(res.data.data[1]._score);
  });

  test('matches across title and tags accumulate score', async () => {
    await createDoc({ title: 'Laptop Computer', content: 'A laptop', tags: ['laptop'] });
    const res = await get(app, '/search?q=laptop');
    // Should match in title + content + tag
    expect(res.data.data[0]._score).toBe(18); // 10 (title) + 5 (content) + 3 (tag)
  });

  test('search handles special characters in query', async () => {
    await createDoc({ title: 'C++ Programming Guide', content: 'Learn C++ basics', tags: [] });
    const res = await get(app, '/search?q=c%2B%2B');
    expect(res.data.data.length).toBe(1);
  });
});

describe('suggest edge cases', () => {
  test('matches word within title, not just start', async () => {
    await createDoc({ title: 'Best Wireless Mouse', tags: [] });
    const res = await get(app, '/search/suggest?q=wire');
    expect(res.data.data.length).toBe(1);
  });

  test('deduplicates title suggestions', async () => {
    await createDoc({ title: 'Wireless Mouse', tags: [] });
    // Same title appears, word match and prefix match would both add it
    const res = await get(app, '/search/suggest?q=wireless');
    const titleSuggestions = res.data.data.filter((s: any) => s.source === 'title');
    expect(titleSuggestions.length).toBe(1);
  });

  test('returns empty for no matches', async () => {
    await createDoc();
    const res = await get(app, '/search/suggest?q=zzzzz');
    expect(res.data.data).toEqual([]);
  });

  test('rejects empty query', async () => {
    const res = await get(app, '/search/suggest?q=');
    expect(res.status).toBe(400);
  });
});

describe('reindex edge cases', () => {
  test('updates updatedAt on all documents', async () => {
    const doc = await createDoc();
    const originalUpdatedAt = doc.updatedAt;
    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 10));
    await post(app, '/search/reindex');
    const updated = await get(app, `/search/documents/${doc.id}`);
    expect(updated.data.data.updatedAt).not.toBe(originalUpdatedAt);
  });
});

describe('update edge cases', () => {
  test('updates type', async () => {
    const doc = await createDoc();
    const res = await put(app, `/search/documents/${doc.id}`, { type: 'article' });
    expect(res.data.data.type).toBe('article');
  });

  test('updates metadata', async () => {
    const doc = await createDoc();
    const res = await put(app, `/search/documents/${doc.id}`, { metadata: { key: 'val' } });
    expect(res.data.data.metadata.key).toBe('val');
  });

  test('preserves fields not in update', async () => {
    const doc = await createDoc();
    const res = await put(app, `/search/documents/${doc.id}`, { title: 'New Title' });
    expect(res.data.data.content).toBe(validDoc.content);
    expect(res.data.data.type).toBe(validDoc.type);
  });

  test('validates content on update', async () => {
    const doc = await createDoc();
    const res = await put(app, `/search/documents/${doc.id}`, { content: '' });
    expect(res.status).toBe(400);
  });
});

describe('search pagination', () => {
  test('second page of results', async () => {
    for (let i = 0; i < 5; i++) {
      await createDoc({ title: `Item ${i}`, content: `Searchable item number ${i}`, tags: [] });
    }
    const page1 = await get(app, '/search?q=searchable&page=1&limit=2');
    const page2 = await get(app, '/search?q=searchable&page=2&limit=2');
    expect(page1.data.data.length).toBe(2);
    expect(page2.data.data.length).toBe(2);
    expect(page1.data.data[0].id).not.toBe(page2.data.data[0].id);
  });
});

describe('invalid JSON', () => {
  test('rejects invalid JSON on document create', async () => {
    const response = await app(new Request('http://test/search/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }));
    expect(response.status).toBe(400);
  });
});
