// R009 Evensong III — Model Registry Edge Case Tests
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ModelRegistryService,
  validateSemver,
  compareSemver,
  canPromote,
  canDemote,
  getNextStage,
} from '../src/index.ts';
import { NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';
import { EventBus } from '../../../shared/events.ts';

let svc: ModelRegistryService;
let bus: EventBus;

function mkModel(overrides: Record<string, unknown> = {}) {
  return {
    name: 'edge-model',
    framework: 'pytorch' as const,
    task: 'classification',
    ownerId: 'u1',
    organizationId: 'org-1',
    ...overrides,
  };
}

beforeEach(() => {
  bus = new EventBus();
  svc = new ModelRegistryService(bus);
});

// ─── Semver edge cases ────────────────────────────────────────────────────────

describe('validateSemver edge cases', () => {
  it('accepts 0.0.0', () => {
    expect(() => validateSemver('0.0.0')).not.toThrow();
  });

  it('accepts large version numbers', () => {
    expect(() => validateSemver('100.999.9999')).not.toThrow();
  });

  it('rejects leading zeros in segments', () => {
    expect(() => validateSemver('01.0.0')).toThrow(ValidationError);
    expect(() => validateSemver('1.00.0')).toThrow(ValidationError);
    expect(() => validateSemver('1.0.00')).toThrow(ValidationError);
  });

  it('rejects empty string', () => {
    expect(() => validateSemver('')).toThrow(ValidationError);
  });

  it('rejects pre-release suffix', () => {
    expect(() => validateSemver('1.0.0-alpha')).toThrow(ValidationError);
    expect(() => validateSemver('1.0.0+build')).toThrow(ValidationError);
  });
});

describe('compareSemver', () => {
  it('correctly orders major versions', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('correctly orders minor versions', () => {
    expect(compareSemver('1.2.0', '1.1.0')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '1.1.0')).toBeLessThan(0);
  });

  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });
});

// ─── Stage machine edge cases ─────────────────────────────────────────────────

describe('stage machine', () => {
  it('canPromote returns false for archived', () => {
    expect(canPromote('archived')).toBe(false);
  });

  it('canPromote returns true for all non-archived stages', () => {
    expect(canPromote('draft')).toBe(true);
    expect(canPromote('staging')).toBe(true);
    expect(canPromote('production')).toBe(true);
  });

  it('getNextStage throws for archived', () => {
    expect(() => getNextStage('archived')).toThrow(ValidationError);
  });

  it('canDemote: staging can go back to draft', () => {
    expect(canDemote('staging', 'draft')).toBe(true);
    expect(canDemote('staging', 'production')).toBe(false);
  });

  it('canDemote: archived can go to any earlier stage', () => {
    expect(canDemote('archived', 'production')).toBe(true);
    expect(canDemote('archived', 'staging')).toBe(true);
    expect(canDemote('archived', 'draft')).toBe(true);
  });

  it('canDemote: draft has no valid rollback', () => {
    expect(canDemote('draft', 'staging')).toBe(false);
    expect(canDemote('draft', 'production')).toBe(false);
  });
});

// ─── Artifacts edge cases ─────────────────────────────────────────────────────

describe('addArtifact edge cases', () => {
  it('rejects artifact with mismatched modelId/versionId', async () => {
    const m1 = await svc.registerModel(mkModel({ name: 'model-1' }));
    const m2 = await svc.registerModel(mkModel({ name: 'model-2', organizationId: 'org-2' }));
    const v2 = await svc.createVersion({ modelId: m2.id, version: '1.0.0', createdBy: 'u1' });

    await expect(
      svc.addArtifact({
        modelId: m1.id, // wrong model
        versionId: v2.id,
        type: 'weights',
        name: 'model.pt',
        uri: 's3://bucket/model.pt',
        sizeBytes: 100,
        checksum: 'abc',
        createdBy: 'u1',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects artifact with negative sizeBytes', async () => {
    const m = await svc.registerModel(mkModel());
    const v = await svc.createVersion({ modelId: m.id, version: '1.0.0', createdBy: 'u1' });
    await expect(
      svc.addArtifact({
        modelId: m.id,
        versionId: v.id,
        type: 'weights',
        name: 'model.pt',
        uri: 's3://bucket/model.pt',
        sizeBytes: -1,
        checksum: 'abc',
        createdBy: 'u1',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts artifact with sizeBytes = 0', async () => {
    const m = await svc.registerModel(mkModel());
    const v = await svc.createVersion({ modelId: m.id, version: '1.0.0', createdBy: 'u1' });
    const a = await svc.addArtifact({
      modelId: m.id,
      versionId: v.id,
      type: 'config',
      name: 'config.json',
      uri: 's3://bucket/config.json',
      sizeBytes: 0,
      checksum: 'sha256:empty',
      createdBy: 'u1',
    });
    expect(a.sizeBytes).toBe(0);
  });

  it('defaults contentType to application/octet-stream', async () => {
    const m = await svc.registerModel(mkModel());
    const v = await svc.createVersion({ modelId: m.id, version: '1.0.0', createdBy: 'u1' });
    const a = await svc.addArtifact({
      modelId: m.id,
      versionId: v.id,
      type: 'weights',
      name: 'weights.bin',
      uri: 's3://bucket/weights.bin',
      sizeBytes: 512,
      checksum: 'deadbeef',
      createdBy: 'u1',
    });
    expect(a.contentType).toBe('application/octet-stream');
  });
});

// ─── compareVersions edge cases ───────────────────────────────────────────────

describe('compareVersions edge cases', () => {
  it('returns tie when both versions have identical metrics', async () => {
    const m = await svc.registerModel(mkModel());
    const v1 = await svc.createVersion({ modelId: m.id, version: '1.0.0', metrics: { acc: 0.9 }, createdBy: 'u1' });
    const v2 = await svc.createVersion({ modelId: m.id, version: '1.1.0', metrics: { acc: 0.9 }, createdBy: 'u1' });
    const result = await svc.compareVersions(v1.id, v2.id);
    expect(result.winner).toBe('tie');
  });

  it('returns insufficient_data when both have no metrics', async () => {
    const m = await svc.registerModel(mkModel());
    const v1 = await svc.createVersion({ modelId: m.id, version: '1.0.0', metrics: {}, createdBy: 'u1' });
    const v2 = await svc.createVersion({ modelId: m.id, version: '1.1.0', metrics: {}, createdBy: 'u1' });
    const result = await svc.compareVersions(v1.id, v2.id);
    expect(result.winner).toBe('insufficient_data');
  });

  it('throws when comparing versions from different models', async () => {
    const m1 = await svc.registerModel(mkModel({ name: 'model-a' }));
    const m2 = await svc.registerModel(mkModel({ name: 'model-b', organizationId: 'org-2' }));
    const v1 = await svc.createVersion({ modelId: m1.id, version: '1.0.0', createdBy: 'u1' });
    const v2 = await svc.createVersion({ modelId: m2.id, version: '1.0.0', createdBy: 'u1' });
    await expect(svc.compareVersions(v1.id, v2.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('reports correct winner when b is better', async () => {
    const m = await svc.registerModel(mkModel());
    const v1 = await svc.createVersion({ modelId: m.id, version: '1.0.0', metrics: { acc: 0.8 }, createdBy: 'u1' });
    const v2 = await svc.createVersion({ modelId: m.id, version: '1.1.0', metrics: { acc: 0.95 }, createdBy: 'u1' });
    const result = await svc.compareVersions(v1.id, v2.id);
    expect(result.winner).toBe('b');
  });

  it('reports correct winner when a is better', async () => {
    const m = await svc.registerModel(mkModel());
    const v1 = await svc.createVersion({ modelId: m.id, version: '1.0.0', metrics: { acc: 0.99 }, createdBy: 'u1' });
    const v2 = await svc.createVersion({ modelId: m.id, version: '1.1.0', metrics: { acc: 0.7 }, createdBy: 'u1' });
    const result = await svc.compareVersions(v1.id, v2.id);
    expect(result.winner).toBe('a');
  });
});

// ─── Lineage edge cases ───────────────────────────────────────────────────────

describe('getLineage', () => {
  it('returns empty array for model with no versions', async () => {
    const m = await svc.registerModel(mkModel());
    const lineage = await svc.getLineage(m.id);
    expect(lineage).toHaveLength(0);
  });

  it('builds two-level lineage tree', async () => {
    const m = await svc.registerModel(mkModel());
    const root = await svc.createVersion({ modelId: m.id, version: '1.0.0', createdBy: 'u1' });
    await svc.createVersion({ modelId: m.id, version: '1.1.0', parentVersionId: root.id, createdBy: 'u1' });
    await svc.createVersion({ modelId: m.id, version: '2.0.0', parentVersionId: root.id, createdBy: 'u1' });

    const lineage = await svc.getLineage(m.id);
    expect(lineage).toHaveLength(1);
    expect(lineage[0].version).toBe('1.0.0');
    expect(lineage[0].children).toHaveLength(2);
  });

  it('throws for nonexistent model', async () => {
    await expect(svc.getLineage('no-such-model')).rejects.toBeInstanceOf(NotFoundError);
  });
});
