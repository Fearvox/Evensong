import { MemoryStore } from "../shared/store";
import type { AnalyticsEvent } from "../shared/types";
import { generateId, now } from "../shared/http";

export interface EventInput {
  eventType: string;
  userId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
}

export interface EventStats {
  totalEvents: number;
  uniqueUsers: number;
  uniqueSessions: number;
  eventsToday: number;
}

export interface FunnelStep {
  step: string;
  users: number;
}

export interface AggregateResult {
  count: number;
  uniqueUsers: number;
}

export interface RetentionCountResult {
  count: number;
}

export class AnalyticsStore {
  private store = new MemoryStore<AnalyticsEvent>();

  trackEvent(input: EventInput): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: generateId(),
      eventType: input.eventType,
      userId: input.userId,
      sessionId: input.sessionId,
      properties: input.properties ?? {},
      timestamp: now(),
    };
    return this.store.create(event);
  }

  trackBatch(inputs: EventInput[]): AnalyticsEvent[] {
    return inputs.map((input) => this.trackEvent(input));
  }

  get(id: string): AnalyticsEvent | undefined {
    return this.store.get(id);
  }

  getAll(): AnalyticsEvent[] {
    return this.store.getAll();
  }

  remove(id: string): boolean {
    return this.store.delete(id);
  }

  findByUserId(userId: string): AnalyticsEvent[] {
    return this.store.find((e) => e.userId === userId);
  }

  findBySessionId(sessionId: string): AnalyticsEvent[] {
    return this.store.find((e) => e.sessionId === sessionId);
  }

  findByEventType(eventType: string): AnalyticsEvent[] {
    return this.store.find((e) => e.eventType === eventType);
  }

  filter(filters: { userId?: string; sessionId?: string; eventType?: string }): AnalyticsEvent[] {
    return this.store.find((e) => {
      if (filters.userId && e.userId !== filters.userId) return false;
      if (filters.sessionId && e.sessionId !== filters.sessionId) return false;
      if (filters.eventType && e.eventType !== filters.eventType) return false;
      return true;
    });
  }

  filterExtended(filters: {
    userId?: string;
    sessionId?: string;
    eventType?: string;
    from?: string;
    to?: string;
  }): AnalyticsEvent[] {
    return this.store.find((e) => {
      if (filters.userId && e.userId !== filters.userId) return false;
      if (filters.sessionId && e.sessionId !== filters.sessionId) return false;
      if (filters.eventType && e.eventType !== filters.eventType) return false;
      if (filters.from) {
        const fromMs = new Date(filters.from).getTime();
        if (new Date(e.timestamp).getTime() < fromMs) return false;
      }
      if (filters.to) {
        const toMs = new Date(filters.to).getTime();
        if (new Date(e.timestamp).getTime() > toMs) return false;
      }
      return true;
    });
  }

  stats(): EventStats {
    const all = this.store.getAll();
    const today = new Date().toISOString().slice(0, 10);

    const uniqueUserSet = new Set<string>();
    const uniqueSessionSet = new Set<string>();
    let eventsToday = 0;

    for (const event of all) {
      if (event.userId) uniqueUserSet.add(event.userId);
      if (event.sessionId) uniqueSessionSet.add(event.sessionId);
      if (event.timestamp.slice(0, 10) === today) eventsToday++;
    }

    return {
      totalEvents: all.length,
      uniqueUsers: uniqueUserSet.size,
      uniqueSessions: uniqueSessionSet.size,
      eventsToday,
    };
  }

  aggregate(eventType: string): AggregateResult {
    const events = this.store.find((e) => e.eventType === eventType);
    const uniqueUsers = new Set(events.map((e) => e.userId).filter(Boolean)).size;
    return { count: events.length, uniqueUsers };
  }

  topEventTypes(limit: number): Array<{ eventType: string; count: number }> {
    const all = this.store.getAll();
    const typeCounts = new Map<string, number>();
    for (const event of all) {
      typeCounts.set(event.eventType, (typeCounts.get(event.eventType) ?? 0) + 1);
    }
    return Array.from(typeCounts.entries())
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  funnel(steps: string[], userId?: string): FunnelStep[] {
    let events = this.store.getAll();
    if (userId) {
      events = events.filter((e) => e.userId === userId);
    }

    // Group events by user — only events with userId
    const userEvents = new Map<string, AnalyticsEvent[]>();
    for (const event of events) {
      if (!event.userId) continue;
      const uid = event.userId;
      const list = userEvents.get(uid) ?? [];
      list.push(event);
      userEvents.set(uid, list);
    }

    // For each step, count users who completed that step in order
    const result: FunnelStep[] = [];
    for (let i = 0; i < steps.length; i++) {
      let count = 0;
      for (const [, userEvts] of userEvents) {
        const sorted = [...userEvts].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        let stepIdx = 0;
        for (const evt of sorted) {
          if (stepIdx <= i && evt.eventType === steps[stepIdx]) {
            stepIdx++;
          }
          if (stepIdx > i) break;
        }
        if (stepIdx > i) count++;
      }
      result.push({ step: steps[i], users: count });
    }

    return result;
  }

  retentionCount(eventA: string, eventB: string, days: number): RetentionCountResult {
    const all = this.store.getAll();
    const windowMs = days * 24 * 60 * 60 * 1000;

    // Group events by userId
    const userEvents = new Map<string, AnalyticsEvent[]>();
    for (const event of all) {
      if (!event.userId) continue;
      const list = userEvents.get(event.userId) ?? [];
      list.push(event);
      userEvents.set(event.userId, list);
    }

    // Count users who did eventA then eventB within `days` window
    let count = 0;
    for (const [, evts] of userEvents) {
      const aEvents = evts.filter((e) => e.eventType === eventA).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const bEvents = evts.filter((e) => e.eventType === eventB);

      for (const aEvt of aEvents) {
        const aMs = new Date(aEvt.timestamp).getTime();
        const hasB = bEvents.some((bEvt) => {
          const bMs = new Date(bEvt.timestamp).getTime();
          return bMs >= aMs && bMs <= aMs + windowMs;
        });
        if (hasB) {
          count++;
          break;
        }
      }
    }

    return { count };
  }

  deleteBulk(filters: { eventType?: string; before?: string }): number {
    const toDelete = this.store.find((e) => {
      if (filters.eventType && e.eventType !== filters.eventType) return false;
      if (filters.before) {
        const beforeMs = new Date(filters.before).getTime();
        if (new Date(e.timestamp).getTime() >= beforeMs) return false;
      }
      return true;
    });
    for (const e of toDelete) {
      this.store.delete(e.id);
    }
    return toDelete.length;
  }

  count(): number {
    return this.store.count();
  }

  clear(): void {
    this.store.clear();
  }
}

export const analyticsStore = new AnalyticsStore();
