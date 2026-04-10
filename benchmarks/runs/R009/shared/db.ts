// R009 Evensong III — Database Abstraction with Connection Pooling
import { randomUUID } from 'crypto';

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  poolSize: number;
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  duration: number;
}

export interface Connection {
  id: string;
  inUse: boolean;
  createdAt: number;
  lastUsedAt: number;
}

export class ConnectionPool {
  private connections: Connection[] = [];
  private waitQueue: Array<(conn: Connection) => void> = [];

  constructor(private config: DbConfig) {}

  get size() { return this.connections.length; }
  get available() { return this.connections.filter(c => !c.inUse).length; }
  get inUse() { return this.connections.filter(c => c.inUse).length; }

  async acquire(): Promise<Connection> {
    const free = this.connections.find(c => !c.inUse);
    if (free) {
      free.inUse = true;
      free.lastUsedAt = Date.now();
      return free;
    }
    if (this.connections.length < this.config.poolSize) {
      const conn: Connection = { id: randomUUID(), inUse: true, createdAt: Date.now(), lastUsedAt: Date.now() };
      this.connections.push(conn);
      return conn;
    }
    return new Promise(resolve => this.waitQueue.push(resolve));
  }

  release(connId: string): boolean {
    const conn = this.connections.find(c => c.id === connId);
    if (!conn) return false;
    conn.inUse = false;
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      conn.inUse = true;
      conn.lastUsedAt = Date.now();
      next(conn);
    }
    return true;
  }

  destroy(): void {
    this.connections = [];
    this.waitQueue = [];
  }

  stats() {
    return { total: this.size, available: this.available, inUse: this.inUse, waiting: this.waitQueue.length };
  }
}

// In-memory store for benchmark (simulates DB operations)
export class InMemoryStore<T extends { id: string }> {
  private data = new Map<string, T>();

  async insert(item: T): Promise<T> {
    if (this.data.has(item.id)) throw new Error(`Duplicate key: ${item.id}`);
    this.data.set(item.id, { ...item });
    return { ...item };
  }

  async findById(id: string): Promise<T | null> {
    const item = this.data.get(id);
    return item ? { ...item } : null;
  }

  async findAll(filter?: (item: T) => boolean): Promise<T[]> {
    const all = Array.from(this.data.values());
    return filter ? all.filter(filter) : all;
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const existing = this.data.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id };
    this.data.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    return this.data.delete(id);
  }

  async count(filter?: (item: T) => boolean): Promise<number> {
    if (!filter) return this.data.size;
    return Array.from(this.data.values()).filter(filter).length;
  }

  clear(): void { this.data.clear(); }
  get size(): number { return this.data.size; }
}

export function createPool(config: Partial<DbConfig> = {}): ConnectionPool {
  return new ConnectionPool({
    host: config.host || 'localhost',
    port: config.port || 5432,
    database: config.database || 'r009',
    poolSize: config.poolSize || 10,
  });
}
