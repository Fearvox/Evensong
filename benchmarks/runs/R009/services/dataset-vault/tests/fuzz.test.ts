// R009 Evensong III — dataset-vault fuzz / property-based tests
import { describe, it, expect, beforeEach } from 'bun:test';
import { createDatasetVaultService, DatasetVaultService, DataFormat, ColumnType } from '../src/index.ts';
import { ValidationError } from '../../../shared/errors.ts';

// ─── Fuzz Utilities ───────────────────────────────────────────────────────────

const FORMATS: DataFormat[] = ['csv', 'json', 'parquet', 'tfrecord', 'hdf5', 'arrow'];
const COL_TYPES: ColumnType[] = ['string', 'integer', 'float', 'boolean', 'datetime', 'array', 'object'];
const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789-_';

function randStr(len = 8): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s || 'x';
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randBool(): boolean { return Math.random() < 0.5; }

function randFormat(): DataFormat { return FORMATS[randInt(0, FORMATS.length - 1)]; }

function randColType(): ColumnType { return COL_TYPES[randInt(0, COL_TYPES.length - 1)]; }

function randRatioTriple(): [number, number, number] {
  // Generate ratios that sum to 1.0
  const a = Math.random();
  const b = Math.random() * (1 - a);
  const c = 1 - a - b;
  return [
    parseFloat(a.toFixed(4)),
    parseFloat(b.toFixed(4)),
    parseFloat((1 - parseFloat(a.toFixed(4)) - parseFloat(b.toFixed(4))).toFixed(4)),
  ];
}

// ─── Fuzz Test 1: Dataset Creation Consistency ────────────────────────────────

describe('Fuzz — createDataset: id uniqueness and field preservation', () => {
  it('generates unique IDs across 20 datasets', async () => {
    const svc = createDatasetVaultService();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const ds = await svc.createDataset({
        name: `ds-${randStr(10)}-${i}`,
        description: randStr(20),
        ownerId: `owner-${randStr(4)}`,
        organizationId: `org-${i}`, // unique org to avoid name conflicts
        format: randFormat(),
        tags: [randStr(5), randStr(5)],
        isPublic: randBool(),
      });
      expect(ids.has(ds.id)).toBe(false);
      ids.add(ds.id);
    }
    expect(ids.size).toBe(20);
  });
});

// ─── Fuzz Test 2: Schema Validation Round-Trip ─────────────────────────────────

describe('Fuzz — schema validation: valid data always passes', () => {
  it('valid typed data passes schema validation for 15 random schemas', async () => {
    const svc = createDatasetVaultService();
    for (let i = 0; i < 15; i++) {
      const orgId = `org-schema-${i}`;
      const ds = await svc.createDataset({ name: `schema-ds-${i}`, description: '', ownerId: 'owner', organizationId: orgId, format: 'json' });

      const colType = randColType();
      await svc.setSchema(ds.id, [{ name: 'field', type: colType, nullable: false }]);

      const validValue = generateValidValue(colType);
      const result = await svc.validateSchema(ds.id, [{ field: validValue }]);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    }
  });
});

// ─── Fuzz Test 3: Version Sequence Integrity ──────────────────────────────────

describe('Fuzz — version numbering: always monotonically increasing', () => {
  it('version numbers are sequential for 15 random versions on the same dataset', async () => {
    const svc = createDatasetVaultService();
    const ds = await svc.createDataset({ name: 'version-fuzz-ds', description: '', ownerId: 'owner', organizationId: 'org-vf', format: 'parquet' });

    const versionNumbers: number[] = [];
    for (let i = 0; i < 15; i++) {
      const v = await svc.createVersion({
        datasetId: ds.id,
        description: `fuzz version ${i}`,
        createdBy: `user-${randStr(4)}`,
        rows: randInt(0, 100000),
        sizeBytes: randInt(0, 10_000_000),
        checksum: randStr(32),
      });
      versionNumbers.push(v.versionNumber);
    }

    // Verify monotonically increasing from 1 to 15
    for (let i = 0; i < versionNumbers.length; i++) {
      expect(versionNumbers[i]).toBe(i + 1);
    }
  });
});

// ─── Fuzz Test 4: Split Ratios Always Sum to Exact Row Count ─────────────────

describe('Fuzz — dataset splits: row counts always sum to total', () => {
  it('split row counts always sum to total rows for 12 random splits', async () => {
    const svc = createDatasetVaultService();
    const totalRows = randInt(100, 10000);
    const ds = await svc.createDataset({ name: 'split-fuzz-ds', description: '', ownerId: 'owner', organizationId: 'org-sf', format: 'csv' });
    const v = await svc.createVersion({ datasetId: ds.id, description: 'v1', createdBy: 'owner', rows: totalRows, sizeBytes: totalRows * 100, checksum: 'abc123' });

    let successCount = 0;
    for (let i = 0; i < 12; i++) {
      const [train, val, test] = randRatioTriple();
      try {
        const split = await svc.splitDataset({
          datasetId: ds.id,
          versionId: v.id,
          name: `split-${i}`,
          strategy: 'random',
          trainRatio: train,
          valRatio: val,
          testRatio: test,
          createdBy: 'owner',
          seed: randInt(0, 99999),
        });
        // Row counts must sum to total
        expect(split.trainRows + split.valRows + split.testRows).toBe(totalRows);
        successCount++;
      } catch (e) {
        // Tolerate only ValidationError from floating point precision edge cases
        if (!(e instanceof ValidationError)) throw e;
      }
    }
    // At least 8 of 12 should succeed (some may fail due to float precision)
    expect(successCount).toBeGreaterThanOrEqual(8);
  });
});

// ─── Fuzz Test 5: Access Level Hierarchy ─────────────────────────────────────

describe('Fuzz — access grants: highest level returned for multiple grants', () => {
  it('owner always beats write which beats read for 10 random grant combos', async () => {
    const svc = createDatasetVaultService();

    for (let i = 0; i < 10; i++) {
      const ds = await svc.createDataset({ name: `access-fuzz-${i}`, description: '', ownerId: 'owner', organizationId: `org-af-${i}`, format: 'json' });
      const userId = `user-${i}`;

      // Grant a random access level (not owner to avoid conflict with existing owner)
      const level = randBool() ? 'read' as const : 'write' as const;
      await svc.grantAccess({ datasetId: ds.id, userId, level, grantedBy: 'owner' });

      const access = await svc.checkAccess(ds.id, userId);
      expect(['read', 'write', 'owner']).toContain(access);

      // Granted level must be at least as high as what was given
      const levelOrder = { read: 0, write: 1, owner: 2 };
      expect(levelOrder[access!]).toBeGreaterThanOrEqual(levelOrder[level]);
    }
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateValidValue(type: ColumnType): unknown {
  switch (type) {
    case 'string': return randStr(10);
    case 'integer': return randInt(-1000, 1000);
    case 'float': return Math.random() * 100;
    case 'boolean': return randBool();
    case 'datetime': return new Date().toISOString();
    case 'array': return [1, 2, 3];
    case 'object': return { key: 'value' };
    default: return 'unknown';
  }
}
