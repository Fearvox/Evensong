// R009 Evensong III — Dataset Vault Service
// Responsibilities: versioning, lineage, access control, schema validation, splitting, usage tracking
import { randomUUID } from 'crypto';
import { InMemoryStore } from '../../../shared/db.ts';
import { NotFoundError, ValidationError, ConflictError, AuthorizationError } from '../../../shared/errors.ts';
import { createLogger, Logger } from '../../../shared/logger.ts';
import { EventBus, DomainEvent } from '../../../shared/events.ts';

// ─── Domain Types ────────────────────────────────────────────────────────────

export type DataFormat = 'csv' | 'json' | 'parquet' | 'tfrecord' | 'hdf5' | 'arrow';
export type ColumnType = 'string' | 'integer' | 'float' | 'boolean' | 'datetime' | 'array' | 'object';
export type SplitStrategy = 'random' | 'stratified' | 'temporal' | 'hash';
export type AccessLevel = 'owner' | 'write' | 'read';
export type LineageEventType = 'created' | 'derived' | 'merged' | 'filtered' | 'transformed' | 'split';

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  nullable: boolean;
  unique?: boolean;
  description?: string;
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: (string | number | boolean)[];
  };
}

export interface DatasetSchema {
  id: string;
  datasetId: string;
  columns: ColumnSchema[];
  primaryKey?: string[];
  version: number;
  createdAt: string;
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  organizationId: string;
  format: DataFormat;
  tags: string[];
  schemaId: string | null;
  latestVersionId: string | null;
  totalRows: number;
  totalSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
}

export interface DatasetVersion {
  id: string;
  datasetId: string;
  versionNumber: number;
  description: string;
  createdBy: string;
  rows: number;
  sizeBytes: number;
  checksum: string;
  metadata: Record<string, unknown>;
  parentVersionId: string | null;
  createdAt: string;
}

export interface DatasetSplit {
  id: string;
  datasetId: string;
  versionId: string;
  name: string;
  strategy: SplitStrategy;
  trainRatio: number;
  valRatio: number;
  testRatio: number;
  trainRows: number;
  valRows: number;
  testRows: number;
  seed: number;
  stratifyColumn?: string;
  createdBy: string;
  createdAt: string;
}

export interface AccessGrant {
  id: string;
  datasetId: string;
  userId: string;
  level: AccessLevel;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string | null;
}

export interface LineageRecord {
  id: string;
  datasetId: string;
  versionId: string;
  eventType: LineageEventType;
  sourceDatasetIds: string[];
  transformationDescription: string;
  parameters: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export interface UsageStat {
  id: string;
  datasetId: string;
  userId: string;
  action: 'read' | 'write' | 'download' | 'split';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface CreateDatasetInput {
  name: string;
  description: string;
  ownerId: string;
  organizationId: string;
  format: DataFormat;
  tags?: string[];
  isPublic?: boolean;
}

export interface CreateVersionInput {
  datasetId: string;
  description: string;
  createdBy: string;
  rows: number;
  sizeBytes: number;
  checksum: string;
  metadata?: Record<string, unknown>;
  parentVersionId?: string;
}

export interface SplitDatasetInput {
  datasetId: string;
  versionId: string;
  name: string;
  strategy: SplitStrategy;
  trainRatio: number;
  valRatio: number;
  testRatio: number;
  seed?: number;
  stratifyColumn?: string;
  createdBy: string;
}

export interface GrantAccessInput {
  datasetId: string;
  userId: string;
  level: AccessLevel;
  grantedBy: string;
  expiresAt?: string;
}

export interface AddLineageInput {
  datasetId: string;
  versionId: string;
  eventType: LineageEventType;
  sourceDatasetIds: string[];
  transformationDescription: string;
  parameters?: Record<string, unknown>;
  createdBy: string;
}

export interface SearchDatasetsInput {
  query?: string;
  format?: DataFormat;
  tags?: string[];
  organizationId?: string;
  isPublic?: boolean;
  ownerId?: string;
}

export interface UsageStats {
  datasetId: string;
  totalReads: number;
  totalWrites: number;
  totalDownloads: number;
  totalSplits: number;
  uniqueUsers: number;
  lastAccessed: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(type: string, source: string, payload: Record<string, unknown>): DomainEvent {
  return {
    id: randomUUID(),
    type,
    source,
    timestamp: new Date().toISOString(),
    correlationId: randomUUID(),
    payload,
  };
}

function validateRatios(train: number, val: number, test: number): void {
  if (train <= 0 || val < 0 || test < 0) {
    throw new ValidationError('Split ratios must be non-negative and train > 0');
  }
  const sum = train + val + test;
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new ValidationError(`Split ratios must sum to 1.0, got ${sum.toFixed(4)}`);
  }
}

function computeChecksum(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class DatasetVaultService {
  private datasets: InMemoryStore<Dataset>;
  private versions: InMemoryStore<DatasetVersion>;
  private schemas: InMemoryStore<DatasetSchema>;
  private splits: InMemoryStore<DatasetSplit>;
  private grants: InMemoryStore<AccessGrant>;
  private lineage: InMemoryStore<LineageRecord>;
  private usageStats: InMemoryStore<UsageStat>;
  private logger: Logger;
  private bus: EventBus;
  private versionCounters = new Map<string, number>();

  constructor(bus?: EventBus) {
    this.datasets = new InMemoryStore<Dataset>();
    this.versions = new InMemoryStore<DatasetVersion>();
    this.schemas = new InMemoryStore<DatasetSchema>();
    this.splits = new InMemoryStore<DatasetSplit>();
    this.grants = new InMemoryStore<AccessGrant>();
    this.lineage = new InMemoryStore<LineageRecord>();
    this.usageStats = new InMemoryStore<UsageStat>();
    this.logger = createLogger('dataset-vault');
    this.bus = bus || new EventBus();
  }

  // ─── Dataset CRUD ──────────────────────────────────────────────────────────

  async createDataset(input: CreateDatasetInput): Promise<Dataset> {
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('Dataset name is required');
    }
    if (input.name.length > 255) {
      throw new ValidationError('Dataset name must be 255 characters or fewer');
    }
    if (!input.ownerId) {
      throw new ValidationError('Owner ID is required');
    }
    if (!input.organizationId) {
      throw new ValidationError('Organization ID is required');
    }

    const existing = await this.datasets.findAll(d => d.name === input.name.trim() && d.organizationId === input.organizationId);
    if (existing.length > 0) {
      throw new ConflictError(`Dataset '${input.name}' already exists in organization '${input.organizationId}'`);
    }

    const now = new Date().toISOString();
    const dataset: Dataset = {
      id: randomUUID(),
      name: input.name.trim(),
      description: input.description || '',
      ownerId: input.ownerId,
      organizationId: input.organizationId,
      format: input.format,
      tags: input.tags || [],
      schemaId: null,
      latestVersionId: null,
      totalRows: 0,
      totalSizeBytes: 0,
      createdAt: now,
      updatedAt: now,
      isPublic: input.isPublic ?? false,
    };

    const created = await this.datasets.insert(dataset);

    // Auto-grant owner access
    const grant: AccessGrant = {
      id: randomUUID(),
      datasetId: created.id,
      userId: input.ownerId,
      level: 'owner',
      grantedBy: input.ownerId,
      grantedAt: now,
      expiresAt: null,
    };
    await this.grants.insert(grant);

    await this.bus.publish(makeEvent('dataset.created', 'dataset-vault', { datasetId: created.id, name: created.name }));
    this.logger.info('Dataset created', { datasetId: created.id });
    return created;
  }

  async getDataset(id: string): Promise<Dataset> {
    const dataset = await this.datasets.findById(id);
    if (!dataset) throw new NotFoundError('Dataset', id);
    return dataset;
  }

  async listDatasets(organizationId?: string): Promise<Dataset[]> {
    return this.datasets.findAll(organizationId ? d => d.organizationId === organizationId : undefined);
  }

  async deleteDataset(id: string, requestingUserId: string): Promise<void> {
    const dataset = await this.getDataset(id);
    const access = await this._getAccessLevel(id, requestingUserId);
    if (access !== 'owner') {
      throw new AuthorizationError('Only dataset owners can delete datasets');
    }

    await this.datasets.delete(id);

    // Cascade: remove versions, grants, lineage, splits, usage stats for this dataset
    const allVersions = await this.versions.findAll(v => v.datasetId === id);
    for (const v of allVersions) await this.versions.delete(v.id);

    const allGrants = await this.grants.findAll(g => g.datasetId === id);
    for (const g of allGrants) await this.grants.delete(g.id);

    const allLineage = await this.lineage.findAll(l => l.datasetId === id);
    for (const l of allLineage) await this.lineage.delete(l.id);

    const allSplits = await this.splits.findAll(s => s.datasetId === id);
    for (const s of allSplits) await this.splits.delete(s.id);

    await this.bus.publish(makeEvent('dataset.deleted', 'dataset-vault', { datasetId: id }));
    this.logger.info('Dataset deleted', { datasetId: id });
  }

  async searchDatasets(input: SearchDatasetsInput): Promise<Dataset[]> {
    return this.datasets.findAll(d => {
      if (input.organizationId && d.organizationId !== input.organizationId) return false;
      if (input.ownerId && d.ownerId !== input.ownerId) return false;
      if (input.format && d.format !== input.format) return false;
      if (input.isPublic !== undefined && d.isPublic !== input.isPublic) return false;
      if (input.tags && input.tags.length > 0) {
        const hasAllTags = input.tags.every(t => d.tags.includes(t));
        if (!hasAllTags) return false;
      }
      if (input.query) {
        const q = input.query.toLowerCase();
        if (!d.name.toLowerCase().includes(q) && !d.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  // ─── Versioning ────────────────────────────────────────────────────────────

  async createVersion(input: CreateVersionInput): Promise<DatasetVersion> {
    const dataset = await this.getDataset(input.datasetId);

    if (input.rows < 0) throw new ValidationError('Row count cannot be negative');
    if (input.sizeBytes < 0) throw new ValidationError('Size cannot be negative');
    if (!input.checksum || input.checksum.trim().length === 0) {
      throw new ValidationError('Checksum is required');
    }

    // Verify parent version exists if provided
    if (input.parentVersionId) {
      const parent = await this.versions.findById(input.parentVersionId);
      if (!parent) throw new NotFoundError('Version', input.parentVersionId);
      if (parent.datasetId !== input.datasetId) {
        throw new ValidationError('Parent version belongs to a different dataset');
      }
    }

    const current = this.versionCounters.get(input.datasetId) || 0;
    const nextVersion = current + 1;
    this.versionCounters.set(input.datasetId, nextVersion);

    const version: DatasetVersion = {
      id: randomUUID(),
      datasetId: input.datasetId,
      versionNumber: nextVersion,
      description: input.description || '',
      createdBy: input.createdBy,
      rows: input.rows,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
      metadata: input.metadata || {},
      parentVersionId: input.parentVersionId || null,
      createdAt: new Date().toISOString(),
    };

    const created = await this.versions.insert(version);

    // Update dataset stats
    await this.datasets.update(input.datasetId, {
      latestVersionId: created.id,
      totalRows: input.rows,
      totalSizeBytes: input.sizeBytes,
      updatedAt: created.createdAt,
    });

    await this.bus.publish(makeEvent('dataset.version.created', 'dataset-vault', {
      datasetId: input.datasetId,
      versionId: created.id,
      versionNumber: nextVersion,
    }));
    this.logger.info('Version created', { datasetId: input.datasetId, versionId: created.id, versionNumber: nextVersion });
    return created;
  }

  async getVersion(versionId: string): Promise<DatasetVersion> {
    const version = await this.versions.findById(versionId);
    if (!version) throw new NotFoundError('Version', versionId);
    return version;
  }

  async listVersions(datasetId: string): Promise<DatasetVersion[]> {
    await this.getDataset(datasetId); // ensure dataset exists
    const all = await this.versions.findAll(v => v.datasetId === datasetId);
    return all.sort((a, b) => a.versionNumber - b.versionNumber);
  }

  // ─── Schema Validation ─────────────────────────────────────────────────────

  async setSchema(datasetId: string, columns: ColumnSchema[]): Promise<DatasetSchema> {
    const dataset = await this.getDataset(datasetId);

    if (!columns || columns.length === 0) {
      throw new ValidationError('Schema must have at least one column');
    }

    const names = columns.map(c => c.name);
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      throw new ValidationError('Schema columns must have unique names');
    }

    for (const col of columns) {
      if (!col.name || col.name.trim().length === 0) {
        throw new ValidationError('Column name is required');
      }
      const validTypes: ColumnType[] = ['string', 'integer', 'float', 'boolean', 'datetime', 'array', 'object'];
      if (!validTypes.includes(col.type)) {
        throw new ValidationError(`Invalid column type: ${col.type}`);
      }
      if (col.constraints?.min !== undefined && col.constraints?.max !== undefined) {
        if (col.constraints.min > col.constraints.max) {
          throw new ValidationError(`Column '${col.name}': min must be <= max`);
        }
      }
    }

    // Get existing schema version or start at 1
    const existingSchemas = await this.schemas.findAll(s => s.datasetId === datasetId);
    const schemaVersion = existingSchemas.length + 1;

    const schema: DatasetSchema = {
      id: randomUUID(),
      datasetId,
      columns,
      version: schemaVersion,
      createdAt: new Date().toISOString(),
    };

    const created = await this.schemas.insert(schema);

    // Update dataset to reference the new schema
    await this.datasets.update(datasetId, { schemaId: created.id, updatedAt: created.createdAt });

    this.logger.info('Schema set', { datasetId, schemaId: created.id });
    return created;
  }

  async validateSchema(datasetId: string, data: Record<string, unknown>[]): Promise<{ valid: boolean; errors: string[] }> {
    const dataset = await this.getDataset(datasetId);
    if (!dataset.schemaId) {
      return { valid: true, errors: [] }; // No schema = no validation
    }

    const schema = await this.schemas.findById(dataset.schemaId);
    if (!schema) throw new NotFoundError('Schema', dataset.schemaId);

    const errors: string[] = [];

    for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      for (const col of schema.columns) {
        const value = row[col.name];

        if (value === null || value === undefined) {
          if (!col.nullable) {
            errors.push(`Row ${rowIdx}: column '${col.name}' is not nullable`);
          }
          continue;
        }

        // Type checking
        const typeValid = checkColumnType(value, col.type);
        if (!typeValid) {
          errors.push(`Row ${rowIdx}: column '${col.name}' expected ${col.type}, got ${typeof value}`);
          continue;
        }

        // Constraint checking
        if (col.constraints) {
          const { min, max, pattern, enum: enumValues } = col.constraints;
          if (min !== undefined && typeof value === 'number' && value < min) {
            errors.push(`Row ${rowIdx}: column '${col.name}' value ${value} < min ${min}`);
          }
          if (max !== undefined && typeof value === 'number' && value > max) {
            errors.push(`Row ${rowIdx}: column '${col.name}' value ${value} > max ${max}`);
          }
          if (pattern && typeof value === 'string' && !new RegExp(pattern).test(value)) {
            errors.push(`Row ${rowIdx}: column '${col.name}' value '${value}' does not match pattern '${pattern}'`);
          }
          if (enumValues && !enumValues.includes(value as string | number | boolean)) {
            errors.push(`Row ${rowIdx}: column '${col.name}' value '${value}' not in enum`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── Dataset Splitting ─────────────────────────────────────────────────────

  async splitDataset(input: SplitDatasetInput): Promise<DatasetSplit> {
    const dataset = await this.getDataset(input.datasetId);
    const version = await this.getVersion(input.versionId);

    if (version.datasetId !== input.datasetId) {
      throw new ValidationError('Version does not belong to the specified dataset');
    }

    validateRatios(input.trainRatio, input.valRatio, input.testRatio);

    const seed = input.seed ?? 42;
    const totalRows = version.rows;

    const trainRows = Math.floor(totalRows * input.trainRatio);
    const valRows = Math.floor(totalRows * input.valRatio);
    const testRows = totalRows - trainRows - valRows;

    const split: DatasetSplit = {
      id: randomUUID(),
      datasetId: input.datasetId,
      versionId: input.versionId,
      name: input.name,
      strategy: input.strategy,
      trainRatio: input.trainRatio,
      valRatio: input.valRatio,
      testRatio: input.testRatio,
      trainRows,
      valRows,
      testRows,
      seed,
      stratifyColumn: input.stratifyColumn,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };

    const created = await this.splits.insert(split);
    await this._recordUsage(input.datasetId, input.createdBy, 'split');

    await this.bus.publish(makeEvent('dataset.split.created', 'dataset-vault', {
      datasetId: input.datasetId,
      splitId: created.id,
      strategy: input.strategy,
    }));
    this.logger.info('Dataset split created', { datasetId: input.datasetId, splitId: created.id });
    return created;
  }

  async listSplits(datasetId: string): Promise<DatasetSplit[]> {
    await this.getDataset(datasetId);
    return this.splits.findAll(s => s.datasetId === datasetId);
  }

  // ─── Access Control ────────────────────────────────────────────────────────

  async grantAccess(input: GrantAccessInput): Promise<AccessGrant> {
    await this.getDataset(input.datasetId);

    // Check grantor has owner rights
    const grantorAccess = await this._getAccessLevel(input.datasetId, input.grantedBy);
    if (grantorAccess !== 'owner') {
      throw new AuthorizationError('Only dataset owners can grant access');
    }

    // Check if user already has an active grant
    const existing = await this.grants.findAll(
      g => g.datasetId === input.datasetId && g.userId === input.userId && !this._isExpired(g)
    );
    if (existing.length > 0) {
      throw new ConflictError(`User '${input.userId}' already has access to dataset '${input.datasetId}'`);
    }

    const grant: AccessGrant = {
      id: randomUUID(),
      datasetId: input.datasetId,
      userId: input.userId,
      level: input.level,
      grantedBy: input.grantedBy,
      grantedAt: new Date().toISOString(),
      expiresAt: input.expiresAt || null,
    };

    const created = await this.grants.insert(grant);
    this.logger.info('Access granted', { datasetId: input.datasetId, userId: input.userId, level: input.level });
    return created;
  }

  async revokeAccess(datasetId: string, userId: string, revokingUserId: string): Promise<void> {
    const revokerAccess = await this._getAccessLevel(datasetId, revokingUserId);
    if (revokerAccess !== 'owner') {
      throw new AuthorizationError('Only dataset owners can revoke access');
    }

    const grants = await this.grants.findAll(g => g.datasetId === datasetId && g.userId === userId);
    if (grants.length === 0) {
      throw new NotFoundError('AccessGrant');
    }

    // Prevent owner from revoking their own access
    const dataset = await this.getDataset(datasetId);
    if (userId === dataset.ownerId) {
      throw new ValidationError('Cannot revoke access from the dataset owner');
    }

    for (const g of grants) {
      await this.grants.delete(g.id);
    }

    this.logger.info('Access revoked', { datasetId, userId });
  }

  async checkAccess(datasetId: string, userId: string): Promise<AccessLevel | null> {
    return this._getAccessLevel(datasetId, userId);
  }

  async listAccessGrants(datasetId: string): Promise<AccessGrant[]> {
    await this.getDataset(datasetId);
    const now = new Date().toISOString();
    return this.grants.findAll(g => g.datasetId === datasetId && (!g.expiresAt || g.expiresAt > now));
  }

  // ─── Lineage ───────────────────────────────────────────────────────────────

  async addLineageRecord(input: AddLineageInput): Promise<LineageRecord> {
    await this.getDataset(input.datasetId);
    await this.getVersion(input.versionId);

    // Validate source datasets exist
    for (const srcId of input.sourceDatasetIds) {
      const src = await this.datasets.findById(srcId);
      if (!src) throw new NotFoundError('Dataset', srcId);
    }

    const record: LineageRecord = {
      id: randomUUID(),
      datasetId: input.datasetId,
      versionId: input.versionId,
      eventType: input.eventType,
      sourceDatasetIds: input.sourceDatasetIds,
      transformationDescription: input.transformationDescription || '',
      parameters: input.parameters || {},
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };

    const created = await this.lineage.insert(record);
    await this.bus.publish(makeEvent('dataset.lineage.added', 'dataset-vault', {
      datasetId: input.datasetId,
      lineageId: created.id,
      eventType: input.eventType,
    }));
    this.logger.info('Lineage record added', { datasetId: input.datasetId, lineageId: created.id });
    return created;
  }

  async getLineage(datasetId: string): Promise<LineageRecord[]> {
    await this.getDataset(datasetId);
    const records = await this.lineage.findAll(l => l.datasetId === datasetId);
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getUpstreamLineage(datasetId: string, depth = 3): Promise<Map<string, LineageRecord[]>> {
    const result = new Map<string, LineageRecord[]>();
    const visited = new Set<string>();
    const queue: Array<{ id: string; d: number }> = [{ id: datasetId, d: 0 }];

    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (visited.has(id) || d > depth) continue;
      visited.add(id);

      const records = await this.lineage.findAll(l => l.datasetId === id);
      if (records.length > 0) {
        result.set(id, records);
      }

      for (const rec of records) {
        for (const srcId of rec.sourceDatasetIds) {
          if (!visited.has(srcId)) {
            queue.push({ id: srcId, d: d + 1 });
          }
        }
      }
    }

    return result;
  }

  // ─── Usage Tracking ────────────────────────────────────────────────────────

  async recordAccess(datasetId: string, userId: string, action: UsageStat['action']): Promise<void> {
    await this._recordUsage(datasetId, userId, action);
  }

  async getUsageStats(datasetId: string): Promise<UsageStats> {
    await this.getDataset(datasetId);
    const stats = await this.usageStats.findAll(s => s.datasetId === datasetId);

    const counts = { read: 0, write: 0, download: 0, split: 0 };
    const users = new Set<string>();
    let lastAccessed: string | null = null;

    for (const s of stats) {
      counts[s.action]++;
      users.add(s.userId);
      if (!lastAccessed || s.timestamp > lastAccessed) {
        lastAccessed = s.timestamp;
      }
    }

    return {
      datasetId,
      totalReads: counts.read,
      totalWrites: counts.write,
      totalDownloads: counts.download,
      totalSplits: counts.split,
      uniqueUsers: users.size,
      lastAccessed,
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async _getAccessLevel(datasetId: string, userId: string): Promise<AccessLevel | null> {
    const dataset = await this.datasets.findById(datasetId);
    if (!dataset) return null;

    // Check public read access
    if (dataset.isPublic) {
      // Public datasets allow read for everyone; still check for elevated grants
    }

    const now = new Date().toISOString();
    const grants = await this.grants.findAll(
      g => g.datasetId === datasetId && g.userId === userId && (!g.expiresAt || g.expiresAt > now)
    );

    if (grants.length === 0) {
      return dataset.isPublic ? 'read' : null;
    }

    // Return highest privilege level
    const levels: AccessLevel[] = ['read', 'write', 'owner'];
    let best: AccessLevel = 'read';
    for (const g of grants) {
      if (levels.indexOf(g.level) > levels.indexOf(best)) {
        best = g.level;
      }
    }
    return best;
  }

  private _isExpired(grant: AccessGrant): boolean {
    if (!grant.expiresAt) return false;
    return new Date(grant.expiresAt) < new Date();
  }

  private async _recordUsage(datasetId: string, userId: string, action: UsageStat['action']): Promise<void> {
    const stat: UsageStat = {
      id: randomUUID(),
      datasetId,
      userId,
      action,
      timestamp: new Date().toISOString(),
    };
    await this.usageStats.insert(stat);
  }

  // ─── Test Utilities ────────────────────────────────────────────────────────

  _resetForTesting(): void {
    this.datasets.clear();
    this.versions.clear();
    this.schemas.clear();
    this.splits.clear();
    this.grants.clear();
    this.lineage.clear();
    this.usageStats.clear();
    this.versionCounters.clear();
    this.bus.reset();
  }
}

// ─── Type Guards / Helpers ────────────────────────────────────────────────────

function checkColumnType(value: unknown, type: ColumnType): boolean {
  switch (type) {
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'float': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'datetime': return typeof value === 'string' && !isNaN(Date.parse(value));
    case 'array': return Array.isArray(value);
    case 'object': return typeof value === 'object' && !Array.isArray(value) && value !== null;
    default: return false;
  }
}

export function createDatasetVaultService(bus?: EventBus): DatasetVaultService {
  return new DatasetVaultService(bus);
}
