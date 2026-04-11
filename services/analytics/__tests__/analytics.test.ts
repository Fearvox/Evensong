import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, resetStore } from '../app';
import { post, get, put, del } from '../../../shared/test-utils';

const app = createApp();

beforeEach(() => resetStore());

const validEvent = {
  userId: 'user-1',
  eventType: 'page_view',
  category: 'engagement',
};

async function createEvent(overrides = {}) {
  const res = await post(app, '/analytics/events', { ...validEvent, ...overrides });
  return res.data.data;
}

describe('POST /analytics/events', () => {
  test('creates an event', async () => {
    const res = await post(app, '/analytics/events', validEvent);
    expect(res.status).toBe(201);
    expect(res.data.data.userId).toBe('user-1');
    expect(res.data.data.eventType).toBe('page_view');
    expect(res.data.data.category).toBe('engagement');
    expect(res.data.data.sessionId).toBeDefined();
    expect(res.data.data.timestamp).toBeDefined();
  });

  test('creates with custom properties', async () => {
    const res = await post(app, '/analytics/events', {
      ...validEvent,
      properties: { page: '/home', duration: 5000 },
    });
    expect(res.data.data.properties.page).toBe('/home');
    expect(res.data.data.properties.duration).toBe(5000);
  });

  test('creates with custom sessionId', async () => {
    const res = await post(app, '/analytics/events', {
      ...validEvent,
      sessionId: 'custom-session',
    });
    expect(res.data.data.sessionId).toBe('custom-session');
  });

  test('creates with custom timestamp', async () => {
    const ts = '2024-01-01T00:00:00.000Z';
    const res = await post(app, '/analytics/events', { ...validEvent, timestamp: ts });
    expect(res.data.data.timestamp).toBe(ts);
  });

  test('validates required fields', async () => {
    const res = await post(app, '/analytics/events', {});
    expect(res.status).toBe(400);
    expect(res.data.errors.length).toBeGreaterThanOrEqual(3);
  });

  test('validates eventType is non-empty', async () => {
    const res = await post(app, '/analytics/events', { ...validEvent, eventType: '' });
    expect(res.status).toBe(400);
  });

  test('validates category is non-empty', async () => {
    const res = await post(app, '/analytics/events', { ...validEvent, category: '' });
    expect(res.status).toBe(400);
  });

  test('defaults properties to empty object', async () => {
    const res = await post(app, '/analytics/events', validEvent);
    expect(res.data.data.properties).toEqual({});
  });
});

describe('GET /analytics/events', () => {
  test('lists all events', async () => {
    await createEvent();
    await createEvent({ eventType: 'click' });
    const res = await get(app, '/analytics/events');
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(2);
  });

  test('filters by category', async () => {
    await createEvent({ category: 'engagement' });
    await createEvent({ category: 'conversion', eventType: 'purchase' });
    const res = await get(app, '/analytics/events?category=engagement');
    expect(res.data.data.length).toBe(1);
  });

  test('filters by eventType', async () => {
    await createEvent({ eventType: 'page_view' });
    await createEvent({ eventType: 'click' });
    const res = await get(app, '/analytics/events?eventType=click');
    expect(res.data.data.length).toBe(1);
  });

  test('filters by userId', async () => {
    await createEvent({ userId: 'user-1' });
    await createEvent({ userId: 'user-2', eventType: 'click' });
    const res = await get(app, '/analytics/events?userId=user-1');
    expect(res.data.data.length).toBe(1);
  });

  test('paginates results', async () => {
    for (let i = 0; i < 5; i++) await createEvent({ eventType: `ev${i}` });
    const res = await get(app, '/analytics/events?page=2&limit=2');
    expect(res.data.data.length).toBe(2);
    expect(res.data.total).toBe(5);
  });

  test('returns empty list', async () => {
    const res = await get(app, '/analytics/events');
    expect(res.data.data).toEqual([]);
  });

  test('sorts by timestamp descending', async () => {
    await createEvent({ timestamp: '2024-01-01T00:00:00Z', eventType: 'old' });
    await createEvent({ timestamp: '2024-06-01T00:00:00Z', eventType: 'new' });
    const res = await get(app, '/analytics/events');
    expect(res.data.data[0].eventType).toBe('new');
  });
});

describe('GET /analytics/events/:id', () => {
  test('gets event by id', async () => {
    const event = await createEvent();
    const res = await get(app, `/analytics/events/${event.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.eventType).toBe('page_view');
  });

  test('returns 404 for missing event', async () => {
    const res = await get(app, '/analytics/events/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PUT /analytics/events/:id', () => {
  test('updates event type', async () => {
    const event = await createEvent();
    const res = await put(app, `/analytics/events/${event.id}`, { eventType: 'click' });
    expect(res.status).toBe(200);
    expect(res.data.data.eventType).toBe('click');
  });

  test('updates category', async () => {
    const event = await createEvent();
    const res = await put(app, `/analytics/events/${event.id}`, { category: 'conversion' });
    expect(res.data.data.category).toBe('conversion');
  });

  test('updates properties', async () => {
    const event = await createEvent();
    const res = await put(app, `/analytics/events/${event.id}`, { properties: { key: 'value' } });
    expect(res.data.data.properties.key).toBe('value');
  });

  test('validates empty eventType', async () => {
    const event = await createEvent();
    const res = await put(app, `/analytics/events/${event.id}`, { eventType: '' });
    expect(res.status).toBe(400);
  });

  test('validates empty category', async () => {
    const event = await createEvent();
    const res = await put(app, `/analytics/events/${event.id}`, { category: '' });
    expect(res.status).toBe(400);
  });

  test('returns 404 for missing event', async () => {
    const res = await put(app, '/analytics/events/nonexistent', { eventType: 'click' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /analytics/events/:id', () => {
  test('deletes an event', async () => {
    const event = await createEvent();
    const res = await del(app, `/analytics/events/${event.id}`);
    expect(res.status).toBe(200);
    const check = await get(app, `/analytics/events/${event.id}`);
    expect(check.status).toBe(404);
  });

  test('returns 404 for missing event', async () => {
    const res = await del(app, '/analytics/events/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /analytics/summary', () => {
  test('returns aggregate statistics', async () => {
    await createEvent({ userId: 'user-1', eventType: 'page_view', category: 'engagement' });
    await createEvent({ userId: 'user-1', eventType: 'click', category: 'engagement' });
    await createEvent({ userId: 'user-2', eventType: 'purchase', category: 'conversion' });
    const res = await get(app, '/analytics/summary');
    expect(res.status).toBe(200);
    expect(res.data.data.totalEvents).toBe(3);
    expect(res.data.data.uniqueUsers).toBe(2);
    expect(res.data.data.eventsByType.page_view).toBe(1);
    expect(res.data.data.eventsByType.click).toBe(1);
    expect(res.data.data.eventsByType.purchase).toBe(1);
    expect(res.data.data.eventsByCategory.engagement).toBe(2);
    expect(res.data.data.eventsByCategory.conversion).toBe(1);
  });

  test('filters summary by category', async () => {
    await createEvent({ category: 'engagement' });
    await createEvent({ category: 'conversion', eventType: 'purchase' });
    const res = await get(app, '/analytics/summary?category=engagement');
    expect(res.data.data.totalEvents).toBe(1);
  });

  test('returns empty summary', async () => {
    const res = await get(app, '/analytics/summary');
    expect(res.data.data.totalEvents).toBe(0);
    expect(res.data.data.uniqueUsers).toBe(0);
  });
});

describe('GET /analytics/users/:userId/activity', () => {
  test('returns user activity', async () => {
    await createEvent({ userId: 'user-1' });
    await createEvent({ userId: 'user-1', eventType: 'click' });
    await createEvent({ userId: 'user-2', eventType: 'other' });
    const res = await get(app, '/analytics/users/user-1/activity');
    expect(res.status).toBe(200);
    expect(res.data.data.userId).toBe('user-1');
    expect(res.data.data.totalEvents).toBe(2);
    expect(res.data.data.recentEvents.length).toBe(2);
  });

  test('filters by category', async () => {
    await createEvent({ userId: 'user-1', category: 'engagement' });
    await createEvent({ userId: 'user-1', category: 'conversion', eventType: 'purchase' });
    const res = await get(app, '/analytics/users/user-1/activity?category=engagement');
    expect(res.data.data.totalEvents).toBe(1);
  });

  test('returns empty for user with no events', async () => {
    const res = await get(app, '/analytics/users/user-99/activity');
    expect(res.data.data.totalEvents).toBe(0);
    expect(res.data.data.recentEvents).toEqual([]);
  });

  test('includes events by day breakdown', async () => {
    await createEvent({ userId: 'user-1' });
    const res = await get(app, '/analytics/users/user-1/activity');
    const days = Object.keys(res.data.data.eventsByDay);
    expect(days.length).toBeGreaterThan(0);
  });

  test('limits recent events to 10', async () => {
    for (let i = 0; i < 15; i++) {
      await createEvent({ userId: 'user-1', eventType: `ev${i}` });
    }
    const res = await get(app, '/analytics/users/user-1/activity');
    expect(res.data.data.recentEvents.length).toBe(10);
    expect(res.data.data.totalEvents).toBe(15);
  });
});
