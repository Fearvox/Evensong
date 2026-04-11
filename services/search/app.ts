import { Router, json, parseBody, HttpError, generateId, now, getQuery } from '../../shared/router';
import { Store } from '../../shared/store';
import { validate } from '../../shared/validation';
import type { SearchDocument } from '../../shared/types';

const store = new Store<SearchDocument>();

export function getStore() { return store; }
export function resetStore() { store.clear(); }

const router = new Router();

// GET /search — search across documents
router.get('/search', (req) => {
  const params = getQuery(req);
  const q = params.get('q')?.toLowerCase();
  const type = params.get('type');
  const page = Math.max(1, parseInt(params.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')));

  if (!q || q.trim().length === 0) {
    return json({ success: false, errors: ['q (query) parameter is required'] }, 400);
  }

  let results = store.getAll().filter(doc => {
    const searchable = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase();
    return searchable.includes(q);
  });

  if (type) results = results.filter(doc => doc.type === type);

  // Score by relevance (title match > content match > tag match)
  const scored = results.map(doc => {
    let score = 0;
    if (doc.title.toLowerCase().includes(q)) score += 10;
    if (doc.content.toLowerCase().includes(q)) score += 5;
    if (doc.tags.some(t => t.toLowerCase().includes(q))) score += 3;
    return { doc, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const total = scored.length;
  const start = (page - 1) * limit;
  const items = scored.slice(start, start + limit).map(({ doc, score }) => ({
    ...doc,
    _score: score,
  }));

  return json({ success: true, data: items, total, page, limit });
});

// POST /search/documents — index a document
router.post('/search/documents', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'type', required: true, type: 'string', minLength: 1 },
    { field: 'title', required: true, type: 'string', minLength: 1, maxLength: 500 },
    { field: 'content', required: true, type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const doc: SearchDocument = {
    id: generateId(),
    type: body.type,
    title: body.title,
    content: body.content,
    tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [],
    metadata: body.metadata || {},
    indexedAt: now(),
    updatedAt: now(),
  };
  store.create(doc);
  return json({ success: true, data: doc }, 201);
});

// GET /search/documents/:id
router.get('/search/documents/:id', (_req, params) => {
  const doc = store.get(params.id);
  if (!doc) throw new HttpError(404, 'Document not found');
  return json({ success: true, data: doc });
});

// PUT /search/documents/:id
router.put('/search/documents/:id', async (req, params) => {
  if (!store.has(params.id)) throw new HttpError(404, 'Document not found');

  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'title', type: 'string', minLength: 1, maxLength: 500 },
    { field: 'content', type: 'string', minLength: 1 },
    { field: 'type', type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const updates: Partial<SearchDocument> = { updatedAt: now() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.type !== undefined) updates.type = body.type;
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.metadata !== undefined) updates.metadata = body.metadata;

  const updated = store.update(params.id, updates);
  return json({ success: true, data: updated });
});

// DELETE /search/documents/:id
router.delete('/search/documents/:id', (_req, params) => {
  if (!store.has(params.id)) throw new HttpError(404, 'Document not found');
  store.delete(params.id);
  return json({ success: true, data: { message: 'Document deleted' } });
});

// GET /search/suggest — autocomplete suggestions
router.get('/search/suggest', (req) => {
  const params = getQuery(req);
  const prefix = params.get('q')?.toLowerCase();
  const maxResults = Math.min(20, Math.max(1, parseInt(params.get('limit') || '10')));

  if (!prefix || prefix.trim().length === 0) {
    return json({ success: false, errors: ['q (query) parameter is required'] }, 400);
  }

  const docs = store.getAll();
  const titleSuggestions = new Set<string>();
  const tagSuggestions = new Set<string>();

  for (const doc of docs) {
    if (doc.title.toLowerCase().startsWith(prefix)) {
      titleSuggestions.add(doc.title);
    }
    // Also check words within titles
    const words = doc.title.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.startsWith(prefix)) {
        titleSuggestions.add(doc.title);
      }
    }
    for (const tag of doc.tags) {
      if (tag.toLowerCase().startsWith(prefix)) {
        tagSuggestions.add(tag);
      }
    }
  }

  const suggestions = [
    ...Array.from(titleSuggestions).map(s => ({ text: s, source: 'title' as const })),
    ...Array.from(tagSuggestions).map(s => ({ text: s, source: 'tag' as const })),
  ].slice(0, maxResults);

  return json({ success: true, data: suggestions });
});

// POST /search/reindex — rebuild index (simulated)
router.post('/search/reindex', (_req) => {
  const docs = store.getAll();
  let reindexed = 0;
  for (const doc of docs) {
    store.update(doc.id, { updatedAt: now() });
    reindexed++;
  }
  return json({
    success: true,
    data: { reindexed, totalDocuments: docs.length, completedAt: now() },
  });
});

export function createApp() {
  return (req: Request) => router.handle(req);
}
