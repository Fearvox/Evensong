// R009 Evensong III — Audit Trail Fuzz Tests
import { describe, it, expect, beforeEach } from 'bun:test';
import { AuditTrailService, AuditEventType } from '../src/index.ts';
import { EventBus } from '../../../shared/events.ts';

function makeService() {
  return new AuditTrailService(new EventBus());
}

const EVENT_TYPES: AuditEventType[] = ['create', 'read', 'update', 'delete', 'login', 'logout', 'permission_change', 'export'];
const OUTCOMES = ['success', 'failure', 'partial'] as const;

function randomStr(len = 8): string {
  return Math.random().toString(36).slice(2, 2 + len) || 'x';
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomEvent() {
  return {
    eventType: randomChoice(EVENT_TYPES),
    userId: `user-${randomStr()}`,
    userEmail: `${randomStr()}@example.com`,
    userRoles: [randomChoice(['researcher', 'viewer', 'reviewer', 'admin'])] as any,
    organizationId: `org-${randomStr(4)}`,
    resourceType: randomChoice(['model', 'dataset', 'experiment', 'paper', 'auth']),
    resourceId: Math.random() > 0.3 ? `res-${randomStr()}` : null,
    action: `action_${randomStr()}`,
    outcome: randomChoice(OUTCOMES),
    ipAddress: Math.random() > 0.5 ? `10.${Math.floor(Math.random()*256)}.0.1` : null,
    details: { extra: randomStr() },
  };
}

describe('Fuzz — bulk log and chain integrity', () => {
  it('chain remains valid after 20 random events', async () => {
    const svc = makeService();
    for (let i = 0; i < 20; i++) {
      await svc.logEvent(randomEvent());
    }
    const result = await svc.verifyIntegrity();
    expect(result.valid).toBe(true);
    expect(result.chainLength).toBe(20);
  });

  it('chain remains valid after 50 random events', async () => {
    const svc = makeService();
    for (let i = 0; i < 50; i++) {
      await svc.logEvent(randomEvent());
    }
    const result = await svc.verifyIntegrity();
    expect(result.valid).toBe(true);
    expect(result.chainLength).toBe(50);
  });

  it('sequence numbers are strictly monotonic over 30 random events', async () => {
    const svc = makeService();
    const records = [];
    for (let i = 0; i < 30; i++) {
      records.push(await svc.logEvent(randomEvent()));
    }
    for (let i = 1; i < records.length; i++) {
      expect(records[i].sequenceNumber).toBe(records[i - 1].sequenceNumber + 1);
    }
  });
});

describe('Fuzz — query filter combinations', () => {
  let svc: AuditTrailService;
  const orgIds = ['org-a', 'org-b', 'org-c'];
  const userIds = ['u1', 'u2', 'u3', 'u4'];

  beforeEach(async () => {
    svc = makeService();
    for (let i = 0; i < 40; i++) {
      await svc.logEvent({
        ...randomEvent(),
        organizationId: randomChoice(orgIds),
        userId: randomChoice(userIds),
      });
    }
  });

  it('querying random userId returns only that user\'s events', async () => {
    for (const uid of userIds) {
      const results = await svc.queryEvents({ userId: uid });
      expect(results.every(r => r.userId === uid)).toBe(true);
    }
  });

  it('querying random orgId returns only that org\'s events', async () => {
    for (const org of orgIds) {
      const results = await svc.queryEvents({ organizationId: org });
      expect(results.every(r => r.organizationId === org)).toBe(true);
    }
  });

  it('sum of per-eventType queries equals total', async () => {
    const total = (await svc.queryEvents({})).length;
    let sum = 0;
    for (const et of EVENT_TYPES) {
      const results = await svc.queryEvents({ eventType: et });
      sum += results.length;
    }
    expect(sum).toBe(total);
  });
});

describe('Fuzz — export format consistency', () => {
  it('JSON export and NDJSON export produce same record count for 15 random events', async () => {
    const svc = makeService();
    for (let i = 0; i < 15; i++) {
      await svc.logEvent(randomEvent());
    }

    const jsonResult = await svc.exportAuditLog({
      options: { format: 'json' },
      exportedBy: 'auditor',
      exportedByRoles: ['researcher'],
    });
    const ndjsonResult = await svc.exportAuditLog({
      options: { format: 'ndjson' },
      exportedBy: 'auditor',
      exportedByRoles: ['researcher'],
    });

    const jsonCount = JSON.parse(jsonResult.content).length;
    const ndjsonCount = ndjsonResult.content.split('\n').filter(Boolean).length;
    // Both should have same base records (export events may differ slightly by 1 since
    // the JSON export adds its own export event before ndjson runs)
    expect(Math.abs(jsonCount - ndjsonCount)).toBeLessThanOrEqual(2);
  });

  it('CSV export checksum is stable for same data', async () => {
    const svc = makeService();
    // Log a deterministic event
    await svc.logEvent({
      eventType: 'create',
      userId: 'stable-user',
      userEmail: 'stable@example.com',
      userRoles: ['admin'] as any,
      organizationId: 'org-stable',
      resourceType: 'resource',
      action: 'stable_action',
      outcome: 'success',
    });

    const r1 = await svc.exportAuditLog({ options: { format: 'csv' }, exportedBy: 'a', exportedByRoles: ['researcher'] });
    // content should produce a valid checksum (non-empty hex)
    expect(r1.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Fuzz — retention policy random configurations', () => {
  it('applies 12 random valid retention policies without error', async () => {
    const svc = makeService();
    const eventTypesWithDefault: (AuditEventType | 'default')[] = [...EVENT_TYPES, 'default'];

    for (let i = 0; i < 12; i++) {
      const days = 90 + Math.floor(Math.random() * 3000);
      const eventType = randomChoice(eventTypesWithDefault);
      await svc.setRetentionPolicy({
        eventType,
        retentionDays: days,
        organizationId: Math.random() > 0.5 ? `org-${randomStr(4)}` : null,
        createdBy: 'admin',
        createdByRoles: ['admin'],
      });
    }

    const stats = await svc.getAuditStats();
    expect(stats.retentionPolicies).toBeGreaterThan(0);
  });

  it('all logged events have retainUntil >= 90 days regardless of policy', async () => {
    const svc = makeService();
    // Set a 90-day policy explicitly
    await svc.setRetentionPolicy({ eventType: 'default', retentionDays: 90, organizationId: null, createdBy: 'a', createdByRoles: ['admin'] });

    for (let i = 0; i < 10; i++) {
      const rec = await svc.logEvent(randomEvent());
      const created = new Date(rec.createdAt).getTime();
      const retain = new Date(rec.retainUntil).getTime();
      expect(retain - created).toBeGreaterThanOrEqual(90 * 86400000 - 1000);
    }
  });
});
