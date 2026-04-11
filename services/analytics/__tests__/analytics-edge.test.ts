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

describe('creation edge cases', () => {
  test('generates unique ids', async () => {
    const e1 = await createEvent();
    const e2 = await createEvent({ eventType: 'click' });
    expect(e1.id).not.toBe(e2.id);
  });

  test('auto-generates sessionId if not provided', async () => {
    const event = await createEvent();
    expect(event.sessionId).toBeDefined();
    expect(typeof event.sessionId).toBe('string');
  });

  test('auto-generates timestamp if not provided', async () => {
    const event = await createEvent();
    expect(event.timestamp).toBeDefined();
    expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
  });

  test('rejects non-string eventType', async () => {
    const res = await post(app, '/analytics/events', { ...validEvent, eventType: 123 });
    expect(res.status).toBe(400);
  });

  test('rejects non-string category', async () => {
    const res = await post(app, '/analytics/events', { ...validEvent, category: true });
    expect(res.status).toBe(400);
  });

  test('rejects non-string userId', async () => {
    const res = await post(app, '/analytics/events', { ...validEvent, userId: 42 });
    expect(res.status).toBe(400);
  });
});

describe('filter combinations', () => {
  test('filters by category and eventType together', async () => {
    await createEvent({ category: 'engagement', eventType: 'page_view' });
    await createEvent({ category: 'engagement', eventType: 'click' });
    await createEvent({ category: 'conversion', eventType: 'purchase' });
    const res = await get(app, '/analytics/events?category=engagement&eventType=click');
    expect(res.data.data.length).toBe(1);
  });

  test('filters by all three dimensions', async () => {
    await createEvent({ userId: 'user-1', category: 'engagement', eventType: 'page_view' });
    await createEvent({ userId: 'user-2', category: 'engagement', eventType: 'page_view' });
    const res = await get(app, '/analytics/events?userId=user-1&category=engagement&eventType=page_view');
    expect(res.data.data.length).toBe(1);
  });
});

describe('summary edge cases', () => {
  test('counts unique sessions correctly', async () => {
    await createEvent({ sessionId: 'session-1' });
    await createEvent({ sessionId: 'session-1', eventType: 'click' });
    await createEvent({ sessionId: 'session-2', eventType: 'purchase' });
    const res = await get(app, '/analytics/summary');
    expect(res.data.data.uniqueSessions).toBe(2);
  });

  test('eventsByType aggregation handles many types', async () => {
    for (const type of ['view', 'click', 'scroll', 'submit', 'download']) {
      await createEvent({ eventType: type });
    }
    const res = await get(app, '/analytics/summary');
    expect(Object.keys(res.data.data.eventsByType).length).toBe(5);
  });
});

describe('user activity edge cases', () => {
  test('respects days parameter', async () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    await createEvent({ userId: 'user-1', timestamp: oldDate });
    await createEvent({ userId: 'user-1', eventType: 'click' }); // recent
    const res = await get(app, '/analytics/users/user-1/activity?days=30');
    expect(res.data.data.totalEvents).toBe(1); // only recent
  });

  test('clamps days to min 1', async () => {
    const res = await get(app, '/analytics/users/user-1/activity?days=0');
    expect(res.status).toBe(200);
  });

  test('clamps days to max 365', async () => {
    const res = await get(app, '/analytics/users/user-1/activity?days=9999');
    expect(res.status).toBe(200);
  });

  test('activity includes session count', async () => {
    await createEvent({ userId: 'user-1', sessionId: 'a' });
    await createEvent({ userId: 'user-1', sessionId: 'b', eventType: 'click' });
    const res = await get(app, '/analytics/users/user-1/activity');
    expect(res.data.data.totalSessions).toBe(2);
  });
});

describe('update edge cases', () => {
  test('preserves fields not in update', async () => {
    const event = await createEvent({ properties: { key: 'value' } });
    const res = await put(app, `/analytics/events/${event.id}`, { eventType: 'click' });
    expect(res.data.data.category).toBe('engagement');
    expect(res.data.data.userId).toBe('user-1');
  });
});

describe('invalid JSON', () => {
  test('rejects invalid JSON body', async () => {
    const response = await app(new Request('http://test/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    }));
    expect(response.status).toBe(400);
  });
});
