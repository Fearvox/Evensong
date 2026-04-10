// R009 Evensong III — Audit Trail Edge Case Tests
import { describe, it, expect, beforeEach } from 'bun:test';
import { AuditTrailService } from '../src/index.ts';
import { EventBus } from '../../../shared/events.ts';
import { NotFoundError, ValidationError } from '../../../shared/errors.ts';

function makeService() {
  return new AuditTrailService(new EventBus());
}

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventType: 'create' as const,
    userId: 'user-1',
    userEmail: 'user@example.com',
    userRoles: ['researcher'] as any,
    organizationId: 'org-1',
    resourceType: 'model',
    resourceId: null as string | null,
    action: 'create_model',
    outcome: 'success' as const,
    ...overrides,
  };
}

describe('Edge — date range filtering', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('fromDate filters out older records', async () => {
    await svc.logEvent(baseEvent());
    const future = new Date(Date.now() + 86400000).toISOString();
    const results = await svc.queryEvents({ fromDate: future });
    expect(results.length).toBe(0);
  });

  it('toDate filters out newer records', async () => {
    await svc.logEvent(baseEvent());
    const past = new Date(Date.now() - 86400000).toISOString();
    const results = await svc.queryEvents({ toDate: past });
    expect(results.length).toBe(0);
  });

  it('records within range are included', async () => {
    await svc.logEvent(baseEvent());
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 1000).toISOString();
    const results = await svc.queryEvents({ fromDate: past, toDate: future });
    expect(results.length).toBe(1);
  });
});

describe('Edge — resourceId null handling', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('accepts null resourceId', async () => {
    const rec = await svc.logEvent(baseEvent({ resourceId: null }));
    expect(rec.resourceId).toBeNull();
  });

  it('filters by resourceId when explicitly set', async () => {
    await svc.logEvent(baseEvent({ resourceId: null }));
    await svc.logEvent(baseEvent({ resourceId: 'r-1' }));
    const results = await svc.queryEvents({ resourceId: 'r-1' });
    expect(results.length).toBe(1);
    expect(results[0].resourceId).toBe('r-1');
  });
});

describe('Edge — access log multi-access', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('tracks multiple accesses to same record', async () => {
    const rec = await svc.logEvent(baseEvent());
    await svc.getEvent(rec.id, 'auditor-1', 'check');
    await svc.getEvent(rec.id, 'auditor-2', 'review');
    await svc.getEvent(rec.id, 'auditor-1', 'recheck');
    const log = await svc.getAccessLog(rec.id);
    expect(log.length).toBe(3);
  });

  it('getAccessLog with no id returns all access entries', async () => {
    const r1 = await svc.logEvent(baseEvent());
    const r2 = await svc.logEvent(baseEvent());
    await svc.getEvent(r1.id, 'a');
    await svc.getEvent(r2.id, 'b');
    const all = await svc.getAccessLog();
    expect(all.length).toBe(2);
  });
});

describe('Edge — retention policy precedence', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('org-specific policy overrides global default', async () => {
    await svc.setRetentionPolicy({ eventType: 'default', retentionDays: 180, organizationId: null, createdBy: 'a', createdByRoles: ['admin'] });
    await svc.setRetentionPolicy({ eventType: 'default', retentionDays: 365, organizationId: 'org-x', createdBy: 'a', createdByRoles: ['admin'] });
    const rec = await svc.logEvent(baseEvent({ organizationId: 'org-x' }));
    const created = new Date(rec.createdAt).getTime();
    const retain = new Date(rec.retainUntil).getTime();
    const days = Math.round((retain - created) / 86400000);
    expect(days).toBe(365);
  });

  it('event-type-specific policy overrides default', async () => {
    await svc.setRetentionPolicy({ eventType: 'default', retentionDays: 180, organizationId: null, createdBy: 'a', createdByRoles: ['admin'] });
    await svc.setRetentionPolicy({ eventType: 'login', retentionDays: 730, organizationId: null, createdBy: 'a', createdByRoles: ['admin'] });
    const rec = await svc.logEvent(baseEvent({ eventType: 'login' }));
    const created = new Date(rec.createdAt).getTime();
    const retain = new Date(rec.retainUntil).getTime();
    const days = Math.round((retain - created) / 86400000);
    expect(days).toBe(730);
  });

  it('fallback to 90 days when no policy defined', async () => {
    const rec = await svc.logEvent(baseEvent());
    const created = new Date(rec.createdAt).getTime();
    const retain = new Date(rec.retainUntil).getTime();
    const days = Math.round((retain - created) / 86400000);
    expect(days).toBe(90);
  });
});

describe('Edge — CSV export with commas in data', () => {
  let svc: AuditTrailService;
  beforeEach(async () => {
    svc = makeService();
    await svc.logEvent(baseEvent({ action: 'create,then,delete' }));
  });

  it('CSV export handles action values containing commas', async () => {
    const result = await svc.exportAuditLog({
      options: { format: 'csv' },
      exportedBy: 'auditor',
      exportedByRoles: ['researcher'],
    });
    expect(result.content).toContain('"create,then,delete"');
  });
});

describe('Edge — empty store operations', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('queryEvents returns empty array on empty store', async () => {
    const results = await svc.queryEvents({});
    expect(results).toEqual([]);
  });

  it('getAuditStats returns nulls for oldest/newest on empty store', async () => {
    const stats = await svc.getAuditStats();
    expect(stats.oldestRecord).toBeNull();
    expect(stats.newestRecord).toBeNull();
    expect(stats.totalRecords).toBe(0);
  });

  it('applyRetention on empty store returns 0/0', async () => {
    const result = await svc.applyRetention();
    expect(result.examined).toBe(0);
    expect(result.deleted).toBe(0);
  });

  it('CSV export on empty filter produces header only', async () => {
    const result = await svc.exportAuditLog({
      options: { format: 'csv' },
      exportedBy: 'auditor',
      exportedByRoles: ['researcher'],
    });
    // Should have at least 1 line (header) + export event
    expect(result.content).toContain('id');
  });
});

describe('Edge — _resetForTesting', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('resets all state including sequence counter', async () => {
    await svc.logEvent(baseEvent());
    await svc.logEvent(baseEvent());
    svc._resetForTesting();
    const stats = await svc.getAuditStats();
    expect(stats.totalRecords).toBe(0);
    // After reset, next event gets sequence 1 again
    const rec = await svc.logEvent(baseEvent());
    expect(rec.sequenceNumber).toBe(1);
  });

  it('genesis hash is restored after reset', async () => {
    await svc.logEvent(baseEvent());
    svc._resetForTesting();
    const rec = await svc.logEvent(baseEvent());
    expect(rec.previousHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
  });
});
