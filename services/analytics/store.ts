import { MemoryStore } from "../shared/store";
import type { AnalyticsEvent } from "../shared/types";
import { generateId, now } from "../shared/http";

export interface EventInput {
  name: string;
  userId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
}

export interface EventStats {
  totalEvents: number;
  uniqueUsers: number;
  topEventTypes: Array<{ eventType: string; count: number }>;
  eventsPerDay: Record<string, number>;
}

export interface FunnelStep {
  step: string;
  count: number;
}

export interface RetentionResult {
  recentUsers: number;
  totalUsers: number;
  retentionRate: number;
  recentPeriodDays: number;
  totalPeriodDays: number;
}

export class AnalyticsStore {
  private store = new MemoryStore<AnalyticsEvent>();

  trackEvent(input: EventInput): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: generateId(),
      eventType: input.name,
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

  stats(): EventStats {
    const all = this.store.getAll();

    const uniqueUserSet = new Set<string>();
    const typeCounts = new Map<string, number>();
    const dayCounts: Record<string, number> = {};

    for (const event of all) {
      if (event.userId) uniqueUserSet.add(event.userId);

      typeCounts.set(event.eventType, (typeCounts.get(event.eventType) ?? 0) + 1);

      const day = event.timestamp.slice(0, 10);
      dayCounts[day] = (dayCounts[day] ?? 0) + 1;
    }

    const topEventTypes = Array.from(typeCounts.entries())
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalEvents: all.length,
      uniqueUsers: uniqueUserSet.size,
      topEventTypes,
      eventsPerDay: dayCounts,
    };
  }

  funnel(steps: string[], userId?: string): FunnelStep[] {
    let events = this.store.getAll();
    if (userId) {
      events = events.filter((e) => e.userId === userId);
    }

    // Group events by user
    const userEvents = new Map<string, AnalyticsEvent[]>();
    for (const event of events) {
      const uid = event.userId ?? "__anonymous__";
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
      result.push({ step: steps[i], count });
    }

    return result;
  }

  retention(recentDays = 7, totalDays = 30): RetentionResult {
    const all = this.store.getAll();
    const nowMs = Date.now();
    const recentCutoff = nowMs - recentDays * 24 * 60 * 60 * 1000;
    const totalCutoff = nowMs - totalDays * 24 * 60 * 60 * 1000;

    const recentUserSet = new Set<string>();
    const totalUserSet = new Set<string>();

    for (const event of all) {
      if (!event.userId) continue;
      const ts = new Date(event.timestamp).getTime();
      if (ts >= totalCutoff) {
        totalUserSet.add(event.userId);
      }
      if (ts >= recentCutoff) {
        recentUserSet.add(event.userId);
      }
    }

    const totalUsers = totalUserSet.size;
    const recentUsers = recentUserSet.size;
    const retentionRate = totalUsers === 0 ? 0 : Math.round((recentUsers / totalUsers) * 10000) / 100;

    return {
      recentUsers,
      totalUsers,
      retentionRate,
      recentPeriodDays: recentDays,
      totalPeriodDays: totalDays,
    };
  }

  count(): number {
    return this.store.count();
  }

  clear(): void {
    this.store.clear();
  }
}

export const analyticsStore = new AnalyticsStore();
