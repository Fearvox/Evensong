// R009 Evensong III — dataset-vault edge case tests
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DatasetVaultService,
  createDatasetVaultService,
} from '../src/index.ts';
import { NotFoundError, ValidationError, ConflictError, AuthorizationError } from '../../../shared/errors.ts';
import { EventBus } from '../../../shared/events.ts';

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'edge-dataset',
    description: 'Edge case dataset',
    ownerId: 'owner-1',
    organizationId: 'org-edge',
    format: 'parquet' as const,
    tags: ['edge'],
    isPublic: false,
    ...overrides,
  };
}

// ─── Access Control Edge Cases ─────────────────────────────────────────────

describe('DatasetVaultService — access control edge cases', () => {
  let svc: DatasetVaultService;
  let dsId: string;

  beforeEach(async () => {
    svc = createDatasetVaultService();
    const ds = await svc.createDataset(makeInput());
    dsId = ds.id;
  });

  it('public dataset grants read to any user without explicit grant', async () => {
    const ds = await svc.createDataset(makeInput({ name: 'public-ds', isPublic: true }));
    const access = await svc.checkAccess(ds.id, 'random-user');
    expect(access).toBe('read');
  });

  it('private dataset returns null for user without grant', async () => {
    const access = await svc.checkAccess(dsId, 'no-grant-user');
    expect(access).toBeNull();
  });

  it('explicit write grant beats public read on public dataset', async () => {
    const ds = await svc.createDataset(makeInput({ name: 'public-w', isPublic: true }));
    await svc.grantAccess({ datasetId: ds.id, userId: 'writer', level: 'write', grantedBy: 'owner-1' });
    const access = await svc.checkAccess(ds.id, 'writer');
    expect(access).toBe('write');
  });

  it('cannot grant access as non-owner', async () => {
    await svc.grantAccess({ datasetId: dsId, userId: 'reader', level: 'read', grantedBy: 'owner-1' });
    await expect(svc.grantAccess({ datasetId: dsId, userId: 'writer', level: 'write', grantedBy: 'reader' }))
      .rejects.toBeInstanceOf(AuthorizationError);
  });

  it('throws ConflictError granting access to user who already has it', async () => {
    await svc.grantAccess({ datasetId: dsId, userId: 'u1', level: 'read', grantedBy: 'owner-1' });
    await expect(svc.grantAccess({ datasetId: dsId, userId: 'u1', level: 'write', grantedBy: 'owner-1' }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  it('expired grants are treated as no access', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await svc.grantAccess({ datasetId: dsId, userId: 'temp-user', level: 'read', grantedBy: 'owner-1', expiresAt: past });
    const access = await svc.checkAccess(dsId, 'temp-user');
    expect(access).toBeNull();
  });

  it('future expiry grants are active', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await svc.grantAccess({ datasetId: dsId, userId: 'future-user', level: 'read', grantedBy: 'owner-1', expiresAt: future });
    const access = await svc.checkAccess(dsId, 'future-user');
    expect(access).toBe('read');
  });

  it('cannot revoke owner\'s own access', async () => {
    await expect(svc.revokeAccess(dsId, 'owner-1', 'owner-1')).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError revoking grant that does not exist', async () => {
    await expect(svc.revokeAccess(dsId, 'ghost-user', 'owner-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('non-owner cannot revoke access', async () => {
    await svc.grantAccess({ datasetId: dsId, userId: 'reader', level: 'read', grantedBy: 'owner-1' });
    await expect(svc.revokeAccess(dsId, 'reader', 'reader')).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ─── Split Edge Cases ─────────────────────────────────────────────────────────

describe('DatasetVaultService — split edge cases', () => {
  let svc: DatasetVaultService;
  let dsId: string;
  let versionId: string;

  beforeEach(async () => {
    svc = createDatasetVaultService();
    const ds = await svc.createDataset(makeInput());
    dsId = ds.id;
    const v = await svc.createVersion({ datasetId: dsId, description: 'v1', createdBy: 'owner-1', rows: 1000, sizeBytes: 10000, checksum: 'abc' });
    versionId = v.id;
  });

  it('throws ValidationError if ratios do not sum to 1', async () => {
    await expect(svc.splitDataset({
      datasetId: dsId, versionId, name: 'bad-split', strategy: 'random',
      trainRatio: 0.7, valRatio: 0.2, testRatio: 0.2, createdBy: 'owner-1',
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('allows val=0 with train+test=1', async () => {
    const split = await svc.splitDataset({
      datasetId: dsId, versionId, name: 'no-val', strategy: 'random',
      trainRatio: 0.8, valRatio: 0.0, testRatio: 0.2, createdBy: 'owner-1',
    });
    expect(split.valRows).toBe(0);
  });

  it('row counts sum to total rows', async () => {
    const split = await svc.splitDataset({
      datasetId: dsId, versionId, name: 'full', strategy: 'random',
      trainRatio: 0.7, valRatio: 0.15, testRatio: 0.15, createdBy: 'owner-1',
    });
    expect(split.trainRows + split.valRows + split.testRows).toBe(1000);
  });

  it('throws ValidationError if versionId belongs to different dataset', async () => {
    const ds2 = await svc.createDataset(makeInput({ name: 'ds2', organizationId: 'org-2' }));
    const v2 = await svc.createVersion({ datasetId: ds2.id, description: 'v1', createdBy: 'owner-1', rows: 100, sizeBytes: 100, checksum: 'zz' });
    await expect(svc.splitDataset({
      datasetId: dsId, versionId: v2.id, name: 'bad', strategy: 'random',
      trainRatio: 0.8, valRatio: 0.1, testRatio: 0.1, createdBy: 'owner-1',
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('uses default seed 42 when not provided', async () => {
    const split = await svc.splitDataset({
      datasetId: dsId, versionId, name: 'default-seed', strategy: 'random',
      trainRatio: 0.8, valRatio: 0.1, testRatio: 0.1, createdBy: 'owner-1',
    });
    expect(split.seed).toBe(42);
  });

  it('records usage stat on split', async () => {
    await svc.splitDataset({
      datasetId: dsId, versionId, name: 'usage-split', strategy: 'hash',
      trainRatio: 0.8, valRatio: 0.1, testRatio: 0.1, createdBy: 'owner-1',
    });
    const stats = await svc.getUsageStats(dsId);
    expect(stats.totalSplits).toBe(1);
  });
});

// ─── Lineage Edge Cases ───────────────────────────────────────────────────────

describe('DatasetVaultService — lineage edge cases', () => {
  let svc: DatasetVaultService;
  let dsId: string;
  let versionId: string;

  beforeEach(async () => {
    svc = createDatasetVaultService();
    const ds = await svc.createDataset(makeInput());
    dsId = ds.id;
    const v = await svc.createVersion({ datasetId: dsId, description: 'v1', createdBy: 'owner-1', rows: 100, sizeBytes: 100, checksum: 'abc' });
    versionId = v.id;
  });

  it('throws NotFoundError if source dataset does not exist', async () => {
    await expect(svc.addLineageRecord({
      datasetId: dsId, versionId, eventType: 'derived',
      sourceDatasetIds: ['no-such-dataset'],
      transformationDescription: 'filter',
      createdBy: 'owner-1',
    })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lineage records returned in chronological order', async () => {
    const src1 = await svc.createDataset(makeInput({ name: 'src1', organizationId: 'org-src' }));
    const src2 = await svc.createDataset(makeInput({ name: 'src2', organizationId: 'org-src' }));

    await svc.addLineageRecord({ datasetId: dsId, versionId, eventType: 'created', sourceDatasetIds: [], transformationDescription: 'init', createdBy: 'owner-1' });
    await svc.addLineageRecord({ datasetId: dsId, versionId, eventType: 'merged', sourceDatasetIds: [src1.id, src2.id], transformationDescription: 'merge', createdBy: 'owner-1' });

    const records = await svc.getLineage(dsId);
    expect(records.length).toBe(2);
    expect(records[0].createdAt <= records[1].createdAt).toBe(true);
  });

  it('getUpstreamLineage traverses depth correctly', async () => {
    const src = await svc.createDataset(makeInput({ name: 'upstream', organizationId: 'org-u' }));
    const vSrc = await svc.createVersion({ datasetId: src.id, description: 'v1', createdBy: 'owner-1', rows: 50, sizeBytes: 50, checksum: 'xy' });
    await svc.addLineageRecord({ datasetId: src.id, versionId: vSrc.id, eventType: 'created', sourceDatasetIds: [], transformationDescription: 'init', createdBy: 'owner-1' });
    await svc.addLineageRecord({ datasetId: dsId, versionId, eventType: 'derived', sourceDatasetIds: [src.id], transformationDescription: 'derive', createdBy: 'owner-1' });

    const upstream = await svc.getUpstreamLineage(dsId, 3);
    expect(upstream.has(dsId)).toBe(true);
    expect(upstream.has(src.id)).toBe(true);
  });
});

// ─── Usage Stats Edge Cases ───────────────────────────────────────────────────

describe('DatasetVaultService — usage stats', () => {
  let svc: DatasetVaultService;
  let dsId: string;

  beforeEach(async () => {
    svc = createDatasetVaultService();
    const ds = await svc.createDataset(makeInput());
    dsId = ds.id;
  });

  it('all counts start at zero for new dataset', async () => {
    const stats = await svc.getUsageStats(dsId);
    expect(stats.totalReads).toBe(0);
    expect(stats.totalWrites).toBe(0);
    expect(stats.totalDownloads).toBe(0);
    expect(stats.totalSplits).toBe(0);
    expect(stats.uniqueUsers).toBe(0);
    expect(stats.lastAccessed).toBeNull();
  });

  it('tracks unique users correctly across repeated access', async () => {
    await svc.recordAccess(dsId, 'u1', 'read');
    await svc.recordAccess(dsId, 'u1', 'read');
    await svc.recordAccess(dsId, 'u2', 'read');
    const stats = await svc.getUsageStats(dsId);
    expect(stats.uniqueUsers).toBe(2);
    expect(stats.totalReads).toBe(3);
  });

  it('lastAccessed reflects most recent access', async () => {
    await svc.recordAccess(dsId, 'u1', 'read');
    const stats = await svc.getUsageStats(dsId);
    expect(stats.lastAccessed).not.toBeNull();
  });

  it('throws NotFoundError for unknown dataset stats', async () => {
    await expect(svc.getUsageStats('no-such')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── Search Edge Cases ────────────────────────────────────────────────────────

describe('DatasetVaultService — searchDatasets', () => {
  let svc: DatasetVaultService;

  beforeEach(async () => {
    svc = createDatasetVaultService();
    await svc.createDataset({ name: 'image-data', description: 'Image classification data', ownerId: 'u1', organizationId: 'org-1', format: 'hdf5', tags: ['images', 'classification'] });
    await svc.createDataset({ name: 'tabular-data', description: 'Tabular regression data', ownerId: 'u1', organizationId: 'org-1', format: 'csv', tags: ['tabular', 'regression'] });
    await svc.createDataset({ name: 'public-text', description: 'NLP text corpus', ownerId: 'u2', organizationId: 'org-2', format: 'json', tags: ['nlp'], isPublic: true });
  });

  it('searches by query matching name', async () => {
    const results = await svc.searchDatasets({ query: 'image' });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('image-data');
  });

  it('searches by query matching description', async () => {
    const results = await svc.searchDatasets({ query: 'regression' });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('tabular-data');
  });

  it('filters by format', async () => {
    const results = await svc.searchDatasets({ format: 'csv' });
    expect(results.every(d => d.format === 'csv')).toBe(true);
  });

  it('filters by isPublic', async () => {
    const results = await svc.searchDatasets({ isPublic: true });
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('public-text');
  });

  it('filters by all required tags (AND logic)', async () => {
    const results = await svc.searchDatasets({ tags: ['images', 'classification'] });
    expect(results.length).toBe(1);
  });

  it('returns empty list when no results match', async () => {
    const results = await svc.searchDatasets({ query: 'nonexistent-xyz-data' });
    expect(results.length).toBe(0);
  });
});
