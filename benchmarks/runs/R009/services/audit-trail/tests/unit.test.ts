// R009 Evensong III — Audit Trail Unit Tests
import { describe, it, expect, beforeEach } from 'bun:test';
import { AuditTrailService } from '../src/index.ts';
import { EventBus } from '../../../shared/events.ts';
import { ValidationError, AuthorizationError, NotFoundError } from '../../../shared/errors.ts';

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
    resourceId: 'model-42',
    action: 'create_model',
    outcome: 'success' as const,
    ...overrides,
  };
}

describe('AuditTrailService — logEvent', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('creates an audit record with all required fields', async () => {
    const rec = await svc.logEvent(baseEvent());
    expect(rec.id).toBeTruthy();
    expect(rec.eventType).toBe('create');
    expect(rec.userId).toBe('user-1');
    expect(rec.sequenceNumber).toBe(1);
    expect(rec.hash).toBeTruthy();
    expect(rec.previousHash).toBeTruthy();
    expect(rec.createdAt).toBeTruthy();
    expect(rec.retainUntil).toBeTruthy();
  });

  it('assigns monotonically increasing sequence numbers', async () => {
    const r1 = await svc.logEvent(baseEvent());
    const r2 = await svc.logEvent(baseEvent());
    const r3 = await svc.logEvent(baseEvent());
    expect(r1.sequenceNumber).toBe(1);
    expect(r2.sequenceNumber).toBe(2);
    expect(r3.sequenceNumber).toBe(3);
  });

  it('first record has genesis previousHash', async () => {
    const rec = await svc.logEvent(baseEvent());
    expect(rec.previousHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('each subsequent record chains to previous hash', async () => {
    const r1 = await svc.logEvent(baseEvent());
    const r2 = await svc.logEvent(baseEvent());
    expect(r2.previousHash).toBe(r1.hash);
  });

  it('retainUntil is at least 90 days in the future', async () => {
    const rec = await svc.logEvent(baseEvent());
    const created = new Date(rec.createdAt).getTime();
    const retain = new Date(rec.retainUntil).getTime();
    expect(retain - created).toBeGreaterThanOrEqual(90 * 86400000 - 1000);
  });

  it('throws ValidationError when userId is missing', async () => {
    await expect(svc.logEvent(baseEvent({ userId: '' }))).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when userEmail is missing', async () => {
    await expect(svc.logEvent(baseEvent({ userEmail: '' }))).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when organizationId is missing', async () => {
    await expect(svc.logEvent(baseEvent({ organizationId: '' }))).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when resourceType is missing', async () => {
    await expect(svc.logEvent(baseEvent({ resourceType: '' }))).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when action is missing', async () => {
    await expect(svc.logEvent(baseEvent({ action: '' }))).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for unknown eventType', async () => {
    await expect(svc.logEvent(baseEvent({ eventType: 'hack' as any }))).rejects.toThrow(ValidationError);
  });

  it('supports all valid event types', async () => {
    const types = ['create', 'read', 'update', 'delete', 'login', 'logout', 'permission_change', 'export'] as const;
    for (const eventType of types) {
      const rec = await svc.logEvent(baseEvent({ eventType }));
      expect(rec.eventType).toBe(eventType);
    }
  });

  it('stores optional fields (ipAddress, userAgent, requestId)', async () => {
    const rec = await svc.logEvent(baseEvent({
      ipAddress: '10.0.0.1',
      userAgent: 'TestAgent/1.0',
      requestId: 'req-abc',
    }));
    expect(rec.ipAddress).toBe('10.0.0.1');
    expect(rec.userAgent).toBe('TestAgent/1.0');
    expect(rec.requestId).toBe('req-abc');
  });
});

describe('AuditTrailService — getEvent', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('retrieves a record by id', async () => {
    const rec = await svc.logEvent(baseEvent());
    const found = await svc.getEvent(rec.id);
    expect(found.id).toBe(rec.id);
    expect(found.action).toBe('create_model');
  });

  it('throws NotFoundError for unknown id', async () => {
    await expect(svc.getEvent('nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('records an access log entry when accessedBy is provided', async () => {
    const rec = await svc.logEvent(baseEvent());
    await svc.getEvent(rec.id, 'auditor-1', 'compliance check');
    const log = await svc.getAccessLog(rec.id);
    expect(log.length).toBe(1);
    expect(log[0].accessedBy).toBe('auditor-1');
    expect(log[0].purpose).toBe('compliance check');
  });

  it('does not record access log when accessedBy is omitted', async () => {
    const rec = await svc.logEvent(baseEvent());
    await svc.getEvent(rec.id);
    const log = await svc.getAccessLog(rec.id);
    expect(log.length).toBe(0);
  });
});

describe('AuditTrailService — queryEvents', () => {
  let svc: AuditTrailService;
  beforeEach(async () => {
    svc = makeService();
    await svc.logEvent(baseEvent({ userId: 'u1', eventType: 'create', outcome: 'success', resourceType: 'model' }));
    await svc.logEvent(baseEvent({ userId: 'u2', eventType: 'read', outcome: 'success', resourceType: 'dataset' }));
    await svc.logEvent(baseEvent({ userId: 'u1', eventType: 'delete', outcome: 'failure', resourceType: 'model' }));
    await svc.logEvent(baseEvent({ userId: 'u3', eventType: 'login', outcome: 'success', resourceType: 'auth' }));
  });

  it('returns all records with no filter', async () => {
    const results = await svc.queryEvents({});
    expect(results.length).toBe(4);
  });

  it('filters by userId', async () => {
    const results = await svc.queryEvents({ userId: 'u1' });
    expect(results.length).toBe(2);
    expect(results.every(r => r.userId === 'u1')).toBe(true);
  });

  it('filters by eventType', async () => {
    const results = await svc.queryEvents({ eventType: 'login' });
    expect(results.length).toBe(1);
    expect(results[0].eventType).toBe('login');
  });

  it('filters by resourceType', async () => {
    const results = await svc.queryEvents({ resourceType: 'model' });
    expect(results.length).toBe(2);
  });

  it('filters by outcome', async () => {
    const results = await svc.queryEvents({ outcome: 'failure' });
    expect(results.length).toBe(1);
    expect(results[0].eventType).toBe('delete');
  });

  it('returns results sorted by sequenceNumber ascending', async () => {
    const results = await svc.queryEvents({});
    for (let i = 1; i < results.length; i++) {
      expect(results[i].sequenceNumber).toBeGreaterThan(results[i - 1].sequenceNumber);
    }
  });

  it('applies limit and offset for pagination', async () => {
    const page1 = await svc.queryEvents({ limit: 2, offset: 0 });
    const page2 = await svc.queryEvents({ limit: 2, offset: 2 });
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    expect(page1[0].sequenceNumber).not.toBe(page2[0].sequenceNumber);
  });
});

describe('AuditTrailService — getEventsByUser/Resource/Action', () => {
  let svc: AuditTrailService;
  beforeEach(async () => {
    svc = makeService();
    await svc.logEvent(baseEvent({ userId: 'alice', resourceType: 'paper', resourceId: 'p-1', action: 'submit' }));
    await svc.logEvent(baseEvent({ userId: 'bob', resourceType: 'model', resourceId: 'm-1', action: 'deploy' }));
    await svc.logEvent(baseEvent({ userId: 'alice', resourceType: 'model', resourceId: 'm-2', action: 'deploy' }));
  });

  it('getEventsByUser returns all events for that user', async () => {
    const recs = await svc.getEventsByUser('alice');
    expect(recs.length).toBe(2);
    expect(recs.every(r => r.userId === 'alice')).toBe(true);
  });

  it('getEventsByResource filters by resourceType only', async () => {
    const recs = await svc.getEventsByResource('model');
    expect(recs.length).toBe(2);
  });

  it('getEventsByResource filters by resourceType AND resourceId', async () => {
    const recs = await svc.getEventsByResource('model', 'm-1');
    expect(recs.length).toBe(1);
    expect(recs[0].resourceId).toBe('m-1');
  });

  it('getEventsByAction returns matching records', async () => {
    const recs = await svc.getEventsByAction('deploy');
    expect(recs.length).toBe(2);
  });
});

describe('AuditTrailService — retention policies', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('sets a retention policy successfully', async () => {
    const policy = await svc.setRetentionPolicy({
      eventType: 'default',
      retentionDays: 365,
      organizationId: 'org-1',
      createdBy: 'admin-1',
      createdByRoles: ['admin'],
    });
    expect(policy.retentionDays).toBe(365);
    expect(policy.eventType).toBe('default');
  });

  it('rejects retentionDays below 90', async () => {
    await expect(svc.setRetentionPolicy({
      eventType: 'default',
      retentionDays: 30,
      organizationId: null,
      createdBy: 'admin-1',
      createdByRoles: ['admin'],
    })).rejects.toThrow(ValidationError);
  });

  it('requires manage permission to set retention policy', async () => {
    await expect(svc.setRetentionPolicy({
      eventType: 'default',
      retentionDays: 365,
      organizationId: null,
      createdBy: 'user-1',
      createdByRoles: ['viewer'],
    })).rejects.toThrow(AuthorizationError);
  });

  it('updates existing policy instead of creating duplicate', async () => {
    await svc.setRetentionPolicy({ eventType: 'default', retentionDays: 180, organizationId: null, createdBy: 'a', createdByRoles: ['admin'] });
    await svc.setRetentionPolicy({ eventType: 'default', retentionDays: 365, organizationId: null, createdBy: 'a', createdByRoles: ['admin'] });
    const stats = await svc.getAuditStats();
    expect(stats.retentionPolicies).toBe(1);
  });

  it('applies org-specific policy when logging events', async () => {
    await svc.setRetentionPolicy({ eventType: 'delete', retentionDays: 365, organizationId: 'org-2', createdBy: 'a', createdByRoles: ['admin'] });
    const rec = await svc.logEvent(baseEvent({ eventType: 'delete', organizationId: 'org-2' }));
    const created = new Date(rec.createdAt).getTime();
    const retain = new Date(rec.retainUntil).getTime();
    const days = Math.round((retain - created) / 86400000);
    expect(days).toBe(365);
  });

  it('applyRetention removes only expired records', async () => {
    // All fresh records should NOT be deleted
    await svc.logEvent(baseEvent());
    await svc.logEvent(baseEvent());
    const result = await svc.applyRetention();
    expect(result.examined).toBe(2);
    expect(result.deleted).toBe(0);
  });
});

describe('AuditTrailService — integrity verification', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('verifies integrity of empty log', async () => {
    const result = await svc.verifyIntegrity();
    expect(result.valid).toBe(true);
    expect(result.chainLength).toBe(0);
  });

  it('verifies integrity of valid chain', async () => {
    await svc.logEvent(baseEvent());
    await svc.logEvent(baseEvent());
    await svc.logEvent(baseEvent());
    const result = await svc.verifyIntegrity();
    expect(result.valid).toBe(true);
    expect(result.chainLength).toBe(3);
    expect(result.brokenAt).toBeNull();
  });
});

describe('AuditTrailService — compliance report', () => {
  let svc: AuditTrailService;
  beforeEach(async () => {
    svc = makeService();
    await svc.logEvent(baseEvent({ userId: 'u1', organizationId: 'org-a', eventType: 'create', outcome: 'success' }));
    await svc.logEvent(baseEvent({ userId: 'u2', organizationId: 'org-a', eventType: 'delete', outcome: 'failure' }));
    await svc.logEvent(baseEvent({ userId: 'u1', organizationId: 'org-b', eventType: 'read', outcome: 'success' }));
  });

  it('generates a compliance report with correct totals', async () => {
    const report = await svc.getComplianceReport({
      framework: 'SOC2',
      organizationId: 'org-a',
      periodStart: '2000-01-01T00:00:00.000Z',
      periodEnd: '2099-12-31T23:59:59.999Z',
      requestedBy: 'admin-1',
      requestedByRoles: ['admin'],
    });
    expect(report.totalEvents).toBe(2);
    expect(report.framework).toBe('SOC2');
    expect(report.uniqueUsers).toBe(2);
    expect(report.eventsByType['create']).toBe(1);
    expect(report.eventsByOutcome['failure']).toBe(1);
  });

  it('requires view_audit_log permission', async () => {
    await expect(svc.getComplianceReport({
      framework: 'GDPR',
      organizationId: 'org-a',
      periodStart: '2000-01-01T00:00:00.000Z',
      periodEnd: '2099-12-31T23:59:59.999Z',
      requestedBy: 'user-1',
      requestedByRoles: ['researcher'],
    })).rejects.toThrow(AuthorizationError);
  });

  it('report includes integrityStatus', async () => {
    const report = await svc.getComplianceReport({
      framework: 'HIPAA',
      organizationId: 'org-a',
      periodStart: '2000-01-01T00:00:00.000Z',
      periodEnd: '2099-12-31T23:59:59.999Z',
      requestedBy: 'admin-1',
      requestedByRoles: ['admin'],
    });
    expect(['verified', 'compromised', 'partial']).toContain(report.integrityStatus);
  });
});

describe('AuditTrailService — exportAuditLog', () => {
  let svc: AuditTrailService;
  beforeEach(async () => {
    svc = makeService();
    await svc.logEvent(baseEvent({ userId: 'u1', action: 'do_thing' }));
    await svc.logEvent(baseEvent({ userId: 'u2', action: 'other_thing' }));
  });

  it('exports in JSON format', async () => {
    const result = await svc.exportAuditLog({
      options: { format: 'json' },
      exportedBy: 'auditor',
      exportedByRoles: ['researcher'],
    });
    expect(result.format).toBe('json');
    const parsed = JSON.parse(result.content);
    // 2 original + 1 export event logged
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(result.checksum).toBeTruthy();
  });

  it('exports in NDJSON format', async () => {
    const result = await svc.exportAuditLog({
      options: { format: 'ndjson' },
      exportedBy: 'auditor',
      exportedByRoles: ['researcher'],
    });
    const lines = result.content.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('exports in CSV format with header row', async () => {
    const result = await svc.exportAuditLog({
      options: { format: 'csv' },
      exportedBy: 'auditor',
      exportedByRoles: ['researcher'],
    });
    const lines = result.content.split('\n').filter(Boolean);
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('eventType');
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('requires export_data permission', async () => {
    await expect(svc.exportAuditLog({
      options: { format: 'json' },
      exportedBy: 'viewer-1',
      exportedByRoles: ['viewer'],
    })).rejects.toThrow(AuthorizationError);
  });

  it('includes hashes when includeHashes is true', async () => {
    const result = await svc.exportAuditLog({
      options: { format: 'json', includeHashes: true },
      exportedBy: 'auditor',
      exportedByRoles: ['researcher'],
    });
    const parsed = JSON.parse(result.content);
    expect(parsed[0].hash).toBeTruthy();
    expect(parsed[0].previousHash).toBeTruthy();
  });

  it('logs the export itself as an audit event', async () => {
    await svc.exportAuditLog({
      options: { format: 'json' },
      exportedBy: 'auditor',
      exportedByRoles: ['researcher'],
    });
    const exports = await svc.queryEvents({ eventType: 'export' });
    expect(exports.length).toBeGreaterThanOrEqual(1);
  });
});

describe('AuditTrailService — getAuditStats', () => {
  let svc: AuditTrailService;
  beforeEach(async () => {
    svc = makeService();
    await svc.logEvent(baseEvent({ eventType: 'create', outcome: 'success' }));
    await svc.logEvent(baseEvent({ eventType: 'read', outcome: 'success' }));
    await svc.logEvent(baseEvent({ eventType: 'delete', outcome: 'failure' }));
  });

  it('returns total record count', async () => {
    const stats = await svc.getAuditStats();
    expect(stats.totalRecords).toBe(3);
  });

  it('groups events by type and outcome', async () => {
    const stats = await svc.getAuditStats();
    expect(stats.eventsByType['create']).toBe(1);
    expect(stats.eventsByType['read']).toBe(1);
    expect(stats.eventsByType['delete']).toBe(1);
    expect(stats.eventsByOutcome['success']).toBe(2);
    expect(stats.eventsByOutcome['failure']).toBe(1);
  });

  it('reports chainLength equal to totalRecords', async () => {
    const stats = await svc.getAuditStats();
    expect(stats.chainLength).toBe(3);
  });

  it('reports integrityVerified true for clean chain', async () => {
    const stats = await svc.getAuditStats();
    expect(stats.integrityVerified).toBe(true);
  });
});

describe('AuditTrailService — health', () => {
  let svc: AuditTrailService;
  beforeEach(() => { svc = makeService(); });

  it('returns healthy status when chain is intact', async () => {
    await svc.logEvent(baseEvent());
    const h = await svc.health();
    expect(h.status).toBe('healthy');
    expect(h.details.integrityValid).toBe(true);
  });

  it('includes totalRecords in health details', async () => {
    await svc.logEvent(baseEvent());
    await svc.logEvent(baseEvent());
    const h = await svc.health();
    expect(h.details.totalRecords).toBe(2);
  });
});
