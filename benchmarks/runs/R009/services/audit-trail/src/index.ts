// R009 Evensong III — Audit Trail Service
import { randomUUID, createHash } from 'crypto';
import { InMemoryStore } from '../../../shared/db.ts';
import { NotFoundError, ValidationError, AuthorizationError } from '../../../shared/errors.ts';
import { createLogger } from '../../../shared/logger.ts';
import { EventBus, DomainEvent, eventBus as globalEventBus } from '../../../shared/events.ts';
import { Role, requirePermission } from '../../../shared/auth.ts';

// ─── Domain Types ────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'permission_change'
  | 'export';

export type ComplianceFramework = 'SOC2' | 'GDPR' | 'HIPAA' | 'PCI_DSS';

export interface AuditRecord {
  id: string;
  sequenceNumber: number;           // monotonically increasing
  eventType: AuditEventType;
  userId: string;
  userEmail: string;
  userRoles: Role[];
  organizationId: string;
  resourceType: string;
  resourceId: string | null;
  action: string;
  outcome: 'success' | 'failure' | 'partial';
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  details: Record<string, unknown>;
  previousHash: string;             // hash of previous record (chain)
  hash: string;                     // SHA-256 of this record's canonical fields
  createdAt: string;
  retainUntil: string;              // ISO date — minimum 90 days from createdAt
}

export interface RetentionPolicy {
  id: string;
  eventType: AuditEventType | 'default';
  retentionDays: number;            // minimum 90
  organizationId: string | null;   // null = global
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessLogEntry {
  id: string;
  auditRecordId: string;
  accessedBy: string;
  accessedAt: string;
  purpose: string | null;
}

export interface QueryFilter {
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  eventType?: AuditEventType;
  outcome?: 'success' | 'failure' | 'partial';
  organizationId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export interface ComplianceReport {
  id: string;
  framework: ComplianceFramework;
  organizationId: string;
  generatedAt: string;
  generatedBy: string;
  periodStart: string;
  periodEnd: string;
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByOutcome: Record<string, number>;
  uniqueUsers: number;
  topResources: Array<{ resourceType: string; count: number }>;
  integrityStatus: 'verified' | 'compromised' | 'partial';
  retentionCompliance: boolean;
  records: AuditRecord[];
}

export interface AuditStats {
  totalRecords: number;
  oldestRecord: string | null;
  newestRecord: string | null;
  eventsByType: Record<string, number>;
  eventsByOutcome: Record<string, number>;
  retentionPolicies: number;
  integrityVerified: boolean;
  chainLength: number;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'ndjson';
  filter?: QueryFilter;
  includeHashes?: boolean;
}

export interface ExportResult {
  format: string;
  recordCount: number;
  content: string;
  exportedAt: string;
  exportedBy: string;
  checksum: string;
}

// ─── Hashing Utilities ───────────────────────────────────────────────────────

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function computeRecordHash(record: Omit<AuditRecord, 'hash'>): string {
  const canonical = [
    record.id,
    record.sequenceNumber,
    record.eventType,
    record.userId,
    record.organizationId,
    record.resourceType,
    record.resourceId ?? '',
    record.action,
    record.outcome,
    record.createdAt,
    record.previousHash,
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AuditTrailService {
  private store: InMemoryStore<AuditRecord>;
  private retentionStore: InMemoryStore<RetentionPolicy>;
  private accessLogStore: InMemoryStore<AccessLogEntry>;
  private logger = createLogger('audit-trail');
  private bus: EventBus;
  private sequenceCounter = 0;
  private lastHash = GENESIS_HASH;

  constructor(bus?: EventBus) {
    this.store = new InMemoryStore<AuditRecord>();
    this.retentionStore = new InMemoryStore<RetentionPolicy>();
    this.accessLogStore = new InMemoryStore<AccessLogEntry>();
    this.bus = bus ?? globalEventBus;
  }

  // ─── Core Logging ──────────────────────────────────────────────────────────

  async logEvent(params: {
    eventType: AuditEventType;
    userId: string;
    userEmail: string;
    userRoles: Role[];
    organizationId: string;
    resourceType: string;
    resourceId?: string | null;
    action: string;
    outcome: 'success' | 'failure' | 'partial';
    ipAddress?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    details?: Record<string, unknown>;
  }): Promise<AuditRecord> {
    if (!params.userId?.trim()) throw new ValidationError('userId is required');
    if (!params.userEmail?.trim()) throw new ValidationError('userEmail is required');
    if (!params.organizationId?.trim()) throw new ValidationError('organizationId is required');
    if (!params.resourceType?.trim()) throw new ValidationError('resourceType is required');
    if (!params.action?.trim()) throw new ValidationError('action is required');

    const validEventTypes: AuditEventType[] = [
      'create', 'read', 'update', 'delete', 'login', 'logout', 'permission_change', 'export'
    ];
    if (!validEventTypes.includes(params.eventType)) {
      throw new ValidationError(`Invalid eventType: ${params.eventType}`);
    }

    const retentionDays = await this._getRetentionDays(params.eventType, params.organizationId);
    const createdAt = new Date().toISOString();
    const retainUntil = new Date(Date.now() + retentionDays * 86400000).toISOString();

    this.sequenceCounter += 1;
    const previousHash = this.lastHash;

    const partial: Omit<AuditRecord, 'hash'> = {
      id: randomUUID(),
      sequenceNumber: this.sequenceCounter,
      eventType: params.eventType,
      userId: params.userId,
      userEmail: params.userEmail,
      userRoles: params.userRoles,
      organizationId: params.organizationId,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      action: params.action,
      outcome: params.outcome,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      requestId: params.requestId ?? null,
      details: params.details ?? {},
      previousHash,
      createdAt,
      retainUntil,
    };

    const hash = computeRecordHash(partial);
    const record: AuditRecord = { ...partial, hash };

    this.lastHash = hash;
    await this.store.insert(record);
    this.logger.info('audit_event_logged', { id: record.id, type: record.eventType });

    await this.bus.publish({
      id: randomUUID(),
      type: 'audit.event_logged',
      source: 'audit-trail',
      timestamp: createdAt,
      correlationId: params.requestId ?? randomUUID(),
      payload: { recordId: record.id, eventType: record.eventType, userId: record.userId },
    });

    return record;
  }

  // ─── Retrieval ─────────────────────────────────────────────────────────────

  async getEvent(id: string, accessedBy?: string, purpose?: string): Promise<AuditRecord> {
    const record = await this.store.findById(id);
    if (!record) throw new NotFoundError('AuditRecord', id);

    if (accessedBy) {
      await this.accessLogStore.insert({
        id: randomUUID(),
        auditRecordId: id,
        accessedBy,
        accessedAt: new Date().toISOString(),
        purpose: purpose ?? null,
      });
    }

    return record;
  }

  async queryEvents(filter: QueryFilter, accessedBy?: string): Promise<AuditRecord[]> {
    let records = await this.store.findAll();

    if (filter.userId) records = records.filter(r => r.userId === filter.userId);
    if (filter.resourceType) records = records.filter(r => r.resourceType === filter.resourceType);
    if (filter.resourceId) records = records.filter(r => r.resourceId === filter.resourceId);
    if (filter.action) records = records.filter(r => r.action === filter.action);
    if (filter.eventType) records = records.filter(r => r.eventType === filter.eventType);
    if (filter.outcome) records = records.filter(r => r.outcome === filter.outcome);
    if (filter.organizationId) records = records.filter(r => r.organizationId === filter.organizationId);
    if (filter.fromDate) records = records.filter(r => r.createdAt >= filter.fromDate!);
    if (filter.toDate) records = records.filter(r => r.createdAt <= filter.toDate!);

    records.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 1000;
    return records.slice(offset, offset + limit);
  }

  async getEventsByUser(userId: string): Promise<AuditRecord[]> {
    return this.queryEvents({ userId });
  }

  async getEventsByResource(resourceType: string, resourceId?: string): Promise<AuditRecord[]> {
    return this.queryEvents({ resourceType, resourceId });
  }

  async getEventsByAction(action: string): Promise<AuditRecord[]> {
    return this.queryEvents({ action });
  }

  // ─── Compliance ────────────────────────────────────────────────────────────

  async getComplianceReport(params: {
    framework: ComplianceFramework;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
    requestedBy: string;
    requestedByRoles: Role[];
  }): Promise<ComplianceReport> {
    requirePermission(params.requestedByRoles, 'view_audit_log');

    const records = await this.queryEvents({
      organizationId: params.organizationId,
      fromDate: params.periodStart,
      toDate: params.periodEnd,
      limit: 100000,
    });

    const eventsByType: Record<string, number> = {};
    const eventsByOutcome: Record<string, number> = {};
    const userSet = new Set<string>();
    const resourceCounts: Record<string, number> = {};

    for (const r of records) {
      eventsByType[r.eventType] = (eventsByType[r.eventType] ?? 0) + 1;
      eventsByOutcome[r.outcome] = (eventsByOutcome[r.outcome] ?? 0) + 1;
      userSet.add(r.userId);
      resourceCounts[r.resourceType] = (resourceCounts[r.resourceType] ?? 0) + 1;
    }

    const topResources = Object.entries(resourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([resourceType, count]) => ({ resourceType, count }));

    const integrityResult = await this.verifyIntegrity();

    // Check retention compliance: all records must have retainUntil >= 90 days from createdAt
    const retentionCompliance = records.every(r => {
      const created = new Date(r.createdAt).getTime();
      const retain = new Date(r.retainUntil).getTime();
      return retain - created >= 90 * 86400000 - 1000; // 1s tolerance
    });

    return {
      id: randomUUID(),
      framework: params.framework,
      organizationId: params.organizationId,
      generatedAt: new Date().toISOString(),
      generatedBy: params.requestedBy,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      totalEvents: records.length,
      eventsByType,
      eventsByOutcome,
      uniqueUsers: userSet.size,
      topResources,
      integrityStatus: integrityResult.valid ? 'verified' : 'compromised',
      retentionCompliance,
      records,
    };
  }

  // ─── Retention Policies ────────────────────────────────────────────────────

  async setRetentionPolicy(params: {
    eventType: AuditEventType | 'default';
    retentionDays: number;
    organizationId: string | null;
    createdBy: string;
    createdByRoles: Role[];
  }): Promise<RetentionPolicy> {
    requirePermission(params.createdByRoles, 'manage');

    if (params.retentionDays < 90) {
      throw new ValidationError('Retention period must be at least 90 days', { minimum: 90, provided: params.retentionDays });
    }

    // Check if a policy already exists for this type + org combination; update it
    const existing = await this.retentionStore.findAll(
      p => p.eventType === params.eventType && p.organizationId === params.organizationId
    );
    if (existing.length > 0) {
      const updated = await this.retentionStore.update(existing[0].id, {
        retentionDays: params.retentionDays,
        updatedAt: new Date().toISOString(),
      });
      return updated!;
    }

    const policy: RetentionPolicy = {
      id: randomUUID(),
      eventType: params.eventType,
      retentionDays: params.retentionDays,
      organizationId: params.organizationId,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.retentionStore.insert(policy);
  }

  async applyRetention(): Promise<{ examined: number; deleted: number }> {
    const now = new Date().toISOString();
    const all = await this.store.findAll();
    let deleted = 0;

    for (const record of all) {
      if (record.retainUntil < now) {
        await this.store.delete(record.id);
        deleted++;
        // Reset chain on retention deletion (immutability only applies within retention window)
      }
    }

    this.logger.info('retention_applied', { examined: all.length, deleted });
    return { examined: all.length, deleted };
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  async exportAuditLog(params: {
    options: ExportOptions;
    exportedBy: string;
    exportedByRoles: Role[];
  }): Promise<ExportResult> {
    requirePermission(params.exportedByRoles, 'export_data');

    const records = await this.queryEvents(params.options.filter ?? {});

    let content: string;
    const format = params.options.format;

    if (format === 'json') {
      const data = params.options.includeHashes ? records : records.map(({ hash, previousHash, ...r }) => r);
      content = JSON.stringify(data, null, 2);
    } else if (format === 'ndjson') {
      const lines = records.map(r => {
        const rec = params.options.includeHashes ? r : (({ hash, previousHash, ...rest }) => rest)(r);
        return JSON.stringify(rec);
      });
      content = lines.join('\n');
    } else {
      // csv
      if (records.length === 0) {
        content = 'id,sequenceNumber,eventType,userId,userEmail,organizationId,resourceType,resourceId,action,outcome,createdAt\n';
      } else {
        const headers = ['id', 'sequenceNumber', 'eventType', 'userId', 'userEmail', 'organizationId', 'resourceType', 'resourceId', 'action', 'outcome', 'createdAt'];
        const rows = records.map(r =>
          headers.map(h => {
            const val = (r as Record<string, unknown>)[h];
            const str = val == null ? '' : String(val);
            return str.includes(',') ? `"${str}"` : str;
          }).join(',')
        );
        content = [headers.join(','), ...rows].join('\n');
      }
    }

    // Log the export itself as an audit event
    await this.logEvent({
      eventType: 'export',
      userId: params.exportedBy,
      userEmail: params.exportedBy,
      userRoles: params.exportedByRoles,
      organizationId: 'system',
      resourceType: 'audit_log',
      action: 'export',
      outcome: 'success',
      details: { format, recordCount: records.length },
    });

    const checksum = createHash('sha256').update(content).digest('hex');

    return {
      format,
      recordCount: records.length,
      content,
      exportedAt: new Date().toISOString(),
      exportedBy: params.exportedBy,
      checksum,
    };
  }

  // ─── Access Log ────────────────────────────────────────────────────────────

  async getAccessLog(auditRecordId?: string): Promise<AccessLogEntry[]> {
    if (auditRecordId) {
      return this.accessLogStore.findAll(e => e.auditRecordId === auditRecordId);
    }
    return this.accessLogStore.findAll();
  }

  // ─── Integrity ─────────────────────────────────────────────────────────────

  async verifyIntegrity(): Promise<{ valid: boolean; brokenAt: number | null; chainLength: number }> {
    const records = await this.store.findAll();
    records.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    if (records.length === 0) {
      return { valid: true, brokenAt: null, chainLength: 0 };
    }

    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      if (record.previousHash !== expectedPrevHash) {
        return { valid: false, brokenAt: record.sequenceNumber, chainLength: i };
      }

      const { hash, ...withoutHash } = record;
      const recomputed = computeRecordHash(withoutHash);
      if (recomputed !== hash) {
        return { valid: false, brokenAt: record.sequenceNumber, chainLength: i };
      }

      expectedPrevHash = record.hash;
    }

    return { valid: true, brokenAt: null, chainLength: records.length };
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  async getAuditStats(): Promise<AuditStats> {
    const records = await this.store.findAll();
    records.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    const eventsByType: Record<string, number> = {};
    const eventsByOutcome: Record<string, number> = {};

    for (const r of records) {
      eventsByType[r.eventType] = (eventsByType[r.eventType] ?? 0) + 1;
      eventsByOutcome[r.outcome] = (eventsByOutcome[r.outcome] ?? 0) + 1;
    }

    const retentionPolicies = await this.retentionStore.count();
    const integrityResult = await this.verifyIntegrity();

    return {
      totalRecords: records.length,
      oldestRecord: records[0]?.createdAt ?? null,
      newestRecord: records[records.length - 1]?.createdAt ?? null,
      eventsByType,
      eventsByOutcome,
      retentionPolicies,
      integrityVerified: integrityResult.valid,
      chainLength: integrityResult.chainLength,
    };
  }

  // ─── Health ────────────────────────────────────────────────────────────────

  async health(): Promise<{ status: 'healthy' | 'degraded'; details: Record<string, unknown> }> {
    const stats = await this.getAuditStats();
    const integrity = await this.verifyIntegrity();

    return {
      status: integrity.valid ? 'healthy' : 'degraded',
      details: {
        totalRecords: stats.totalRecords,
        chainLength: stats.chainLength,
        integrityValid: integrity.valid,
        retentionPolicies: stats.retentionPolicies,
        lastSequence: this.sequenceCounter,
      },
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async _getRetentionDays(eventType: AuditEventType, organizationId: string): Promise<number> {
    // Look for org-specific policy for this event type
    const orgSpecific = await this.retentionStore.findAll(
      p => p.eventType === eventType && p.organizationId === organizationId
    );
    if (orgSpecific.length > 0) return orgSpecific[0].retentionDays;

    // Global policy for this event type
    const globalType = await this.retentionStore.findAll(
      p => p.eventType === eventType && p.organizationId === null
    );
    if (globalType.length > 0) return globalType[0].retentionDays;

    // Org-specific default
    const orgDefault = await this.retentionStore.findAll(
      p => p.eventType === 'default' && p.organizationId === organizationId
    );
    if (orgDefault.length > 0) return orgDefault[0].retentionDays;

    // Global default
    const globalDefault = await this.retentionStore.findAll(
      p => p.eventType === 'default' && p.organizationId === null
    );
    if (globalDefault.length > 0) return globalDefault[0].retentionDays;

    return 90; // baseline minimum
  }

  // For testing — reset state
  _resetForTesting(): void {
    this.store.clear();
    this.retentionStore.clear();
    this.accessLogStore.clear();
    this.sequenceCounter = 0;
    this.lastHash = GENESIS_HASH;
  }
}

export const auditTrailService = new AuditTrailService();
