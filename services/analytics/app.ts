import { Router, json, parseBody, HttpError, generateId, now, getQuery } from '../../shared/router';
import { Store } from '../../shared/store';
import { validate } from '../../shared/validation';
import type { AnalyticsEvent } from '../../shared/types';

const store = new Store<AnalyticsEvent>();

export function getStore() { return store; }
export function resetStore() { store.clear(); }

const router = new Router();

// GET /analytics/events
router.get('/analytics/events', (req) => {
  const params = getQuery(req);
  const page = Math.max(1, parseInt(params.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20')));
  const category = params.get('category');
  const eventType = params.get('eventType');
  const userId = params.get('userId');

  let items = store.getAll();
  if (category) items = items.filter(e => e.category === category);
  if (eventType) items = items.filter(e => e.eventType === eventType);
  if (userId) items = items.filter(e => e.userId === userId);

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = items.length;
  const start = (page - 1) * limit;
  items = items.slice(start, start + limit);
  return json({ success: true, data: items, total, page, limit });
});

// POST /analytics/events
router.post('/analytics/events', async (req) => {
  const body = await parseBody<any>(req);
  const errors = validate(body, [
    { field: 'userId', required: true, type: 'string' },
    { field: 'eventType', required: true, type: 'string', minLength: 1 },
    { field: 'category', required: true, type: 'string', minLength: 1 },
  ]);
  if (errors.length) return json({ success: false, errors }, 400);

  const event: AnalyticsEvent = {
    id: generateId(),
    userId: body.userId,
    eventType: body.eventType,
    category: body.category,
    properties: body.properties || {},
    sessionId: body.sessionId || generateId(),
    timestamp: body.timestamp || now(),
  };
  store.create(event);
  return json({ success: true, data: event }, 201);
});

// GET /analytics/events/:id
router.get('/analytics/events/:id', (_req, params) => {
  const event = store.get(params.id);
  if (!event) throw new HttpError(404, 'Event not found');
  return json({ success: true, data: event });
});

// PUT /analytics/events/:id
router.put('/analytics/events/:id', async (req, params) => {
  if (!store.has(params.id)) throw new HttpError(404, 'Event not found');

  const body = await parseBody<any>(req);
  const updates: Partial<AnalyticsEvent> = {};
  if (body.eventType !== undefined) {
    if (typeof body.eventType !== 'string' || body.eventType.length === 0) {
      return json({ success: false, errors: ['eventType must be a non-empty string'] }, 400);
    }
    updates.eventType = body.eventType;
  }
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || body.category.length === 0) {
      return json({ success: false, errors: ['category must be a non-empty string'] }, 400);
    }
    updates.category = body.category;
  }
  if (body.properties !== undefined) updates.properties = body.properties;

  const updated = store.update(params.id, updates);
  return json({ success: true, data: updated });
});

// DELETE /analytics/events/:id
router.delete('/analytics/events/:id', (_req, params) => {
  if (!store.has(params.id)) throw new HttpError(404, 'Event not found');
  store.delete(params.id);
  return json({ success: true, data: { message: 'Event deleted' } });
});

// GET /analytics/summary — aggregate stats
router.get('/analytics/summary', (req) => {
  const params = getQuery(req);
  const category = params.get('category');

  let events = store.getAll();
  if (category) events = events.filter(e => e.category === category);

  const uniqueUsers = new Set(events.map(e => e.userId)).size;
  const uniqueSessions = new Set(events.map(e => e.sessionId)).size;

  const eventsByType: Record<string, number> = {};
  const eventsByCategory: Record<string, number> = {};
  for (const e of events) {
    eventsByType[e.eventType] = (eventsByType[e.eventType] || 0) + 1;
    eventsByCategory[e.category] = (eventsByCategory[e.category] || 0) + 1;
  }

  return json({
    success: true,
    data: {
      totalEvents: events.length,
      uniqueUsers,
      uniqueSessions,
      eventsByType,
      eventsByCategory,
    },
  });
});

// GET /analytics/users/:userId/activity
router.get('/analytics/users/:userId/activity', (req, params) => {
  const query = getQuery(req);
  const category = query.get('category');
  const days = Math.min(365, Math.max(1, parseInt(query.get('days') || '30')));

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let events = store.find(e => e.userId === params.userId && e.timestamp >= cutoff);
  if (category) events = events.filter(e => e.category === category);

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const eventsByDay: Record<string, number> = {};
  for (const e of events) {
    const day = e.timestamp.slice(0, 10);
    eventsByDay[day] = (eventsByDay[day] || 0) + 1;
  }

  const sessions = new Set(events.map(e => e.sessionId)).size;

  return json({
    success: true,
    data: {
      userId: params.userId,
      totalEvents: events.length,
      totalSessions: sessions,
      eventsByDay,
      recentEvents: events.slice(0, 10),
    },
  });
});

export function createApp() {
  return (req: Request) => router.handle(req);
}
