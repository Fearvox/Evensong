// R009 Evensong III — dataset-vault unit tests (core)
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DatasetVaultService,
  createDatasetVaultService,
} from '../src/index.ts';
import { NotFoundError, ValidationError, ConflictError, AuthorizationError } from '../../../shared/errors.ts';
import { EventBus } from '../../../shared/events.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test-dataset',
    description: 'A test dataset',
    ownerId: 'user-owner',
    organizationId: 'org-1',
    format: 'csv' as const,
    tags: ['test'],
    isPublic: false,
    ...overrides,
  };
}

// ─── Dataset CRUD ─────────────────────────────────────────────────────────────

describe('DatasetVaultService — createDataset', () => {
  let svc: DatasetVaultService;

  beforeEach(() => { svc = createDatasetVaultService(); });

  it('creates a dataset with valid input', async () => {
    const ds = await svc.createDataset(makeInput());
    expect(ds.id).toBeTruthy();
    expect(ds.name).toBe('test-dataset');
    expect(ds.ownerId).toBe('user-owner');
    expect(ds.organizationId).toBe('org-1');
    expect(ds.format).toBe('csv');
    expect(ds.latestVersionId).toBeNull();
    expect(ds.schemaId).toBeNull();
    expect(ds.totalRows).toBe(0);
  });

  it('auto-grants owner access on creation', async () => {
    const ds = await svc.createDataset(makeInput());
    const access = await svc.checkAccess(ds.id, 'user-owner');
    expect(access).toBe('owner');
  });

  it('throws ValidationError if name is empty', async () => {
    await expect(svc.createDataset(makeInput({ name: '' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError if name is whitespace only', async () => {
    await expect(svc.createDataset(makeInput({ name: '   ' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError if ownerId missing', async () => {
    await expect(svc.createDataset(makeInput({ ownerId: '' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError if organizationId missing', async () => {
    await expect(svc.createDataset(makeInput({ organizationId: '' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ConflictError on duplicate name+org', async () => {
    await svc.createDataset(makeInput());
    await expect(svc.createDataset(makeInput())).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows same name in different org', async () => {
    await svc.createDataset(makeInput({ organizationId: 'org-a' }));
    const ds2 = await svc.createDataset(makeInput({ organizationId: 'org-b' }));
    expect(ds2.organizationId).toBe('org-b');
  });

  it('trims whitespace from name', async () => {
    const ds = await svc.createDataset(makeInput({ name: '  trimmed  ' }));
    expect(ds.name).toBe('trimmed');
  });

  it('defaults isPublic to false', async () => {
    const ds = await svc.createDataset(makeInput({ isPublic: undefined }));
    expect(ds.isPublic).toBe(false);
  });

  it('publishes dataset.created event', async () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.subscribe('dataset.created', e => { events.push(e.type); });
    const localSvc = createDatasetVaultService(bus);
    await localSvc.createDataset(makeInput());
    expect(events).toContain('dataset.created');
  });
});

describe('DatasetVaultService — getDataset / listDatasets', () => {
  let svc: DatasetVaultService;

  beforeEach(() => { svc = createDatasetVaultService(); });

  it('retrieves a dataset by id', async () => {
    const created = await svc.createDataset(makeInput());
    const fetched = await svc.getDataset(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('throws NotFoundError for unknown id', async () => {
    await expect(svc.getDataset('no-such-id')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists all datasets without filter', async () => {
    await svc.createDataset(makeInput({ name: 'ds1', organizationId: 'org-1' }));
    await svc.createDataset(makeInput({ name: 'ds2', organizationId: 'org-2' }));
    const all = await svc.listDatasets();
    expect(all.length).toBe(2);
  });

  it('filters list by organizationId', async () => {
    await svc.createDataset(makeInput({ name: 'ds1', organizationId: 'org-1' }));
    await svc.createDataset(makeInput({ name: 'ds2', organizationId: 'org-2' }));
    const org1 = await svc.listDatasets('org-1');
    expect(org1.every(d => d.organizationId === 'org-1')).toBe(true);
    expect(org1.length).toBe(1);
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

describe('DatasetVaultService — deleteDataset', () => {
  let svc: DatasetVaultService;

  beforeEach(() => { svc = createDatasetVaultService(); });

  it('owner can delete dataset', async () => {
    const ds = await svc.createDataset(makeInput());
    await svc.deleteDataset(ds.id, 'user-owner');
    await expect(svc.getDataset(ds.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('non-owner cannot delete dataset', async () => {
    const ds = await svc.createDataset(makeInput());
    await expect(svc.deleteDataset(ds.id, 'user-other')).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('cascades: versions are removed on delete', async () => {
    const ds = await svc.createDataset(makeInput());
    const v = await svc.createVersion({ datasetId: ds.id, description: 'v1', createdBy: 'user-owner', rows: 100, sizeBytes: 1000, checksum: 'abc123' });
    await svc.deleteDataset(ds.id, 'user-owner');
    await expect(svc.getVersion(v.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── Versioning ───────────────────────────────────────────────────────────────

describe('DatasetVaultService — versioning', () => {
  let svc: DatasetVaultService;
  let dsId: string;

  beforeEach(async () => {
    svc = createDatasetVaultService();
    const ds = await svc.createDataset(makeInput());
    dsId = ds.id;
  });

  it('creates a version with auto-incrementing number', async () => {
    const v1 = await svc.createVersion({ datasetId: dsId, description: 'first', createdBy: 'u1', rows: 100, sizeBytes: 512, checksum: 'abc' });
    const v2 = await svc.createVersion({ datasetId: dsId, description: 'second', createdBy: 'u1', rows: 200, sizeBytes: 1024, checksum: 'def' });
    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);
  });

  it('updates dataset latestVersionId after version creation', async () => {
    const v = await svc.createVersion({ datasetId: dsId, description: 'v1', createdBy: 'u1', rows: 50, sizeBytes: 256, checksum: 'xxx' });
    const ds = await svc.getDataset(dsId);
    expect(ds.latestVersionId).toBe(v.id);
  });

  it('throws ValidationError for negative rows', async () => {
    await expect(svc.createVersion({ datasetId: dsId, description: 'bad', createdBy: 'u1', rows: -1, sizeBytes: 0, checksum: 'x' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for missing checksum', async () => {
    await expect(svc.createVersion({ datasetId: dsId, description: 'bad', createdBy: 'u1', rows: 0, sizeBytes: 0, checksum: '' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for unknown datasetId', async () => {
    await expect(svc.createVersion({ datasetId: 'no-such', description: '', createdBy: 'u1', rows: 0, sizeBytes: 0, checksum: 'x' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('supports parent version reference', async () => {
    const v1 = await svc.createVersion({ datasetId: dsId, description: 'v1', createdBy: 'u1', rows: 100, sizeBytes: 512, checksum: 'abc' });
    const v2 = await svc.createVersion({ datasetId: dsId, description: 'v2', createdBy: 'u1', rows: 150, sizeBytes: 768, checksum: 'def', parentVersionId: v1.id });
    expect(v2.parentVersionId).toBe(v1.id);
  });

  it('rejects parent version from different dataset', async () => {
    const ds2 = await svc.createDataset(makeInput({ name: 'other', organizationId: 'org-2' }));
    const v2 = await svc.createVersion({ datasetId: ds2.id, description: 'v2', createdBy: 'u1', rows: 10, sizeBytes: 10, checksum: 'zzz' });
    await expect(svc.createVersion({ datasetId: dsId, description: 'bad', createdBy: 'u1', rows: 10, sizeBytes: 10, checksum: 'bad', parentVersionId: v2.id }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('lists versions sorted by version number', async () => {
    await svc.createVersion({ datasetId: dsId, description: 'v1', createdBy: 'u1', rows: 10, sizeBytes: 10, checksum: 'a' });
    await svc.createVersion({ datasetId: dsId, description: 'v2', createdBy: 'u1', rows: 20, sizeBytes: 20, checksum: 'b' });
    await svc.createVersion({ datasetId: dsId, description: 'v3', createdBy: 'u1', rows: 30, sizeBytes: 30, checksum: 'c' });
    const versions = await svc.listVersions(dsId);
    expect(versions.map(v => v.versionNumber)).toEqual([1, 2, 3]);
  });
});

// ─── Schema Validation ────────────────────────────────────────────────────────

describe('DatasetVaultService — schema validation', () => {
  let svc: DatasetVaultService;
  let dsId: string;

  beforeEach(async () => {
    svc = createDatasetVaultService();
    const ds = await svc.createDataset(makeInput());
    dsId = ds.id;
  });

  it('sets a schema on a dataset', async () => {
    const schema = await svc.setSchema(dsId, [
      { name: 'id', type: 'integer', nullable: false },
      { name: 'label', type: 'string', nullable: false },
    ]);
    expect(schema.columns.length).toBe(2);
    expect(schema.version).toBe(1);
  });

  it('updates dataset schemaId after setSchema', async () => {
    const schema = await svc.setSchema(dsId, [{ name: 'x', type: 'float', nullable: true }]);
    const ds = await svc.getDataset(dsId);
    expect(ds.schemaId).toBe(schema.id);
  });

  it('increments schema version on subsequent sets', async () => {
    await svc.setSchema(dsId, [{ name: 'x', type: 'integer', nullable: false }]);
    const s2 = await svc.setSchema(dsId, [{ name: 'x', type: 'float', nullable: false }]);
    expect(s2.version).toBe(2);
  });

  it('throws ValidationError on empty columns', async () => {
    await expect(svc.setSchema(dsId, [])).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError on duplicate column names', async () => {
    await expect(svc.setSchema(dsId, [
      { name: 'x', type: 'integer', nullable: false },
      { name: 'x', type: 'float', nullable: false },
    ])).rejects.toBeInstanceOf(ValidationError);
  });

  it('validates data against integer column', async () => {
    await svc.setSchema(dsId, [{ name: 'count', type: 'integer', nullable: false }]);
    const result = await svc.validateSchema(dsId, [{ count: 42 }, { count: 'not-int' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('count'))).toBe(true);
  });

  it('validates non-nullable constraint', async () => {
    await svc.setSchema(dsId, [{ name: 'name', type: 'string', nullable: false }]);
    const result = await svc.validateSchema(dsId, [{ name: null }]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('passes validation for nullable null values', async () => {
    await svc.setSchema(dsId, [{ name: 'opt', type: 'string', nullable: true }]);
    const result = await svc.validateSchema(dsId, [{ opt: null }]);
    expect(result.valid).toBe(true);
  });

  it('validates min/max constraints', async () => {
    await svc.setSchema(dsId, [{
      name: 'score', type: 'float', nullable: false,
      constraints: { min: 0, max: 1 },
    }]);
    const result = await svc.validateSchema(dsId, [{ score: 0.5 }, { score: 1.5 }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('> max'))).toBe(true);
  });

  it('validates enum constraint', async () => {
    await svc.setSchema(dsId, [{
      name: 'status', type: 'string', nullable: false,
      constraints: { enum: ['active', 'inactive'] },
    }]);
    const result = await svc.validateSchema(dsId, [{ status: 'active' }, { status: 'unknown' }]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not in enum'))).toBe(true);
  });

  it('returns valid=true when no schema is set', async () => {
    const result = await svc.validateSchema(dsId, [{ anything: 'goes' }]);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});
