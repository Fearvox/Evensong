// R009 Evensong III — Event Bus with Dead Letter Queue
export interface DomainEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  correlationId: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type EventHandler = (event: DomainEvent) => Promise<void> | void;

export interface DeadLetterEntry {
  event: DomainEvent;
  error: string;
  failedAt: string;
  retryCount: number;
}

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private deadLetterQueue: DeadLetterEntry[] = [];
  private maxRetries = 3;

  subscribe(eventType: string, handler: EventHandler): () => void {
    const list = this.handlers.get(eventType) || [];
    list.push(handler);
    this.handlers.set(eventType, list);
    return () => {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  async publish(event: DomainEvent): Promise<{ delivered: number; failed: number }> {
    const handlers = this.handlers.get(event.type) || [];
    let delivered = 0, failed = 0;
    for (const handler of handlers) {
      try {
        await handler(event);
        delivered++;
      } catch (err) {
        failed++;
        this.deadLetterQueue.push({
          event,
          error: err instanceof Error ? err.message : String(err),
          failedAt: new Date().toISOString(),
          retryCount: 0,
        });
      }
    }
    return { delivered, failed };
  }

  getDeadLetters(): DeadLetterEntry[] { return [...this.deadLetterQueue]; }
  clearDeadLetters(): number { const n = this.deadLetterQueue.length; this.deadLetterQueue = []; return n; }

  async retryDeadLetters(): Promise<{ retried: number; failed: number }> {
    const entries = [...this.deadLetterQueue];
    this.deadLetterQueue = [];
    let retried = 0, failed = 0;
    for (const entry of entries) {
      if (entry.retryCount >= this.maxRetries) {
        this.deadLetterQueue.push(entry);
        failed++;
        continue;
      }
      const handlers = this.handlers.get(entry.event.type) || [];
      let success = false;
      for (const h of handlers) {
        try { await h(entry.event); success = true; } catch { success = false; }
      }
      if (success) retried++;
      else {
        entry.retryCount++;
        this.deadLetterQueue.push(entry);
        failed++;
      }
    }
    return { retried, failed };
  }

  listSubscriptions(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [type, handlers] of this.handlers) result[type] = handlers.length;
    return result;
  }

  reset(): void { this.handlers.clear(); this.deadLetterQueue = []; }
}

export const eventBus = new EventBus();
