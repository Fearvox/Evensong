import { MemoryStore } from "../shared/store";
import type { User } from "../shared/types";
import { generateId, now } from "../shared/http";

export interface ActivityEntry {
  action: string;
  timestamp: string;
}

export interface UserRecord extends User {
  deletedAt?: string;
}

export class UserStore {
  private store = new MemoryStore<UserRecord>();
  private activityLog = new Map<string, ActivityEntry[]>();

  create(data: { name: string; email: string; role: User["role"] }): UserRecord {
    const timestamp = now();
    const user: UserRecord = {
      id: generateId(),
      name: data.name,
      email: data.email,
      role: data.role,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.store.create(user);
  }

  get(id: string): UserRecord | undefined {
    return this.store.get(id);
  }

  getAll(): UserRecord[] {
    return this.store.getAll();
  }

  getActive(): UserRecord[] {
    return this.store.find((u) => !u.deletedAt);
  }

  update(id: string, updates: Partial<Pick<UserRecord, "name" | "email" | "role" | "active">>): UserRecord | undefined {
    return this.store.update(id, { ...updates, updatedAt: now() });
  }

  softDelete(id: string): UserRecord | undefined {
    return this.store.update(id, { deletedAt: now(), active: false, updatedAt: now() });
  }

  restore(id: string): UserRecord | undefined {
    return this.store.update(id, { deletedAt: undefined, active: true, updatedAt: now() });
  }

  findByEmail(email: string): UserRecord | undefined {
    return this.store.findOne((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  search(query: string): UserRecord[] {
    const q = query.toLowerCase();
    return this.store.find(
      (u) => !u.deletedAt && (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  }

  filterByRole(role: User["role"]): UserRecord[] {
    return this.store.find((u) => !u.deletedAt && u.role === role);
  }

  filterByActive(active: boolean): UserRecord[] {
    return this.store.find((u) => !u.deletedAt && u.active === active);
  }

  bulkActivate(ids: string[]): number {
    let count = 0;
    for (const id of ids) {
      const user = this.store.get(id);
      if (user && !user.deletedAt) {
        this.store.update(id, { active: true, updatedAt: now() });
        count++;
      }
    }
    return count;
  }

  bulkDeactivate(ids: string[]): number {
    let count = 0;
    for (const id of ids) {
      const user = this.store.get(id);
      if (user && !user.deletedAt) {
        this.store.update(id, { active: false, updatedAt: now() });
        count++;
      }
    }
    return count;
  }

  logActivity(userId: string, action: string): void {
    const entries = this.activityLog.get(userId) ?? [];
    entries.push({ action, timestamp: now() });
    this.activityLog.set(userId, entries);
  }

  getActivity(userId: string): ActivityEntry[] {
    return this.activityLog.get(userId) ?? [];
  }

  stats(): { total: number; active: number; inactive: number; deleted: number; byRole: Record<string, number> } {
    const all = this.store.getAll();
    const deleted = all.filter((u) => u.deletedAt).length;
    const active = all.filter((u) => !u.deletedAt && u.active).length;
    const inactive = all.filter((u) => !u.deletedAt && !u.active).length;
    const byRole: Record<string, number> = {};
    for (const u of all.filter((u) => !u.deletedAt)) {
      byRole[u.role] = (byRole[u.role] ?? 0) + 1;
    }
    return { total: all.length - deleted, active, inactive, deleted, byRole };
  }

  count(): number {
    return this.store.count();
  }

  clear(): void {
    this.store.clear();
    this.activityLog.clear();
  }
}

export const userStore = new UserStore();
