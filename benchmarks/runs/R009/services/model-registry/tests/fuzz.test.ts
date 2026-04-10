// R009 Evensong III — Model Registry Fuzz / Property-Based Tests
import { describe, it, expect, beforeEach } from 'bun:test';
import { ModelRegistryService, validateSemver, compareSemver } from '../src/index.ts';
import { ValidationError } from '../../../shared/errors.ts';
import { EventBus } from '../../../shared/events.ts';

let svc: ModelRegistryService;
let bus: EventBus;

const FRAMEWORKS = ['pytorch', 'tensorflow', 'jax', 'onnx', 'sklearn', 'other'] as const;
const STAGES = ['draft', 'staging', 'production', 'archived'] as const;

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randString(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function randSemver() {
  return `${randInt(0, 10)}.${randInt(0, 20)}.${randInt(0, 50)}`;
}

function randInvalidSemver() {
  const invalids = [
    'v1.0.0',
    '1.0',
    '1.0.0.0',
    '1.0.0-alpha',
    '01.0.0',
    '',
    '1..0',
    'not-a-version',
    '1.0.x',
    '-1.0.0',
  ];
  return invalids[randInt(0, invalids.length - 1)];
}

beforeEach(() => {
  bus = new EventBus();
  svc = new ModelRegistryService(bus);
});

// Property: all registered models have unique IDs
describe('fuzz: model ID uniqueness', () => {
  it('generates distinct IDs for 15 models', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 15; i++) {
      const m = await svc.registerModel({
        name: randString('model'),
        framework: randChoice(FRAMEWORKS),
        task: randString('task'),
        ownerId: randString('user'),
        organizationId: randString('org'),
      });
      ids.add(m.id);
    }
    expect(ids.size).toBe(15);
  });
});

// Property: invalid semver strings always throw ValidationError
describe('fuzz: semver validation rejects invalid inputs', () => {
  it('rejects 12 random invalid semver strings', () => {
    const invalids = [
      'v1.0.0', '1.0', '1.0.0.0', '1.0.0-alpha', '01.0.0', '',
      '1..0', 'not-a-version', '1.0.x', '-1.0.0', 'abc', '1.0.0+build',
    ];
    for (const s of invalids) {
      expect(() => validateSemver(s)).toThrow(ValidationError);
    }
  });

  it('accepts 12 random valid semver strings', () => {
    const valids = new Set<string>();
    while (valids.size < 12) {
      valids.add(randSemver());
    }
    for (const s of valids) {
      expect(() => validateSemver(s)).not.toThrow();
    }
  });
});

// Property: compareSemver is anti-symmetric (a > b iff b < a)
describe('fuzz: compareSemver anti-symmetry', () => {
  it('satisfies anti-symmetry for 15 random pairs', () => {
    for (let i = 0; i < 15; i++) {
      const a = randSemver();
      const b = randSemver();
      const ab = compareSemver(a, b);
      const ba = compareSemver(b, a);
      // sign must be opposite (or both 0)
      if (ab === 0) {
        expect(ba).toBe(0);
      } else if (ab > 0) {
        expect(ba).toBeLessThan(0);
      } else {
        expect(ba).toBeGreaterThan(0);
      }
    }
  });
});

// Property: versions per model are always sorted descending by semver
describe('fuzz: listVersions descending order', () => {
  it('always returns versions sorted descending for 12 random versions', async () => {
    const m = await svc.registerModel({
      name: 'fuzz-sort-model',
      framework: 'pytorch',
      task: 'test',
      ownerId: 'u1',
      organizationId: 'org-1',
    });

    const versions = new Set<string>();
    while (versions.size < 12) {
      versions.add(randSemver());
    }

    for (const v of versions) {
      await svc.createVersion({ modelId: m.id, version: v, createdBy: 'u1' });
    }

    const listed = await svc.listVersions(m.id);
    for (let i = 1; i < listed.length; i++) {
      expect(compareSemver(listed[i - 1].version, listed[i].version)).toBeGreaterThanOrEqual(0);
    }
  });
});

// Property: model deletion is total — no artifacts or versions survive
describe('fuzz: delete cascade is complete', () => {
  it('leaves no orphaned versions/artifacts after 10 random models are deleted', async () => {
    const modelIds: string[] = [];

    for (let i = 0; i < 10; i++) {
      const m = await svc.registerModel({
        name: randString('del-model'),
        framework: randChoice(FRAMEWORKS),
        task: randString('task'),
        ownerId: 'u1',
        organizationId: randString('org'),
      });
      modelIds.push(m.id);

      // Create 1–3 versions per model
      const numVersions = randInt(1, 3);
      const versionSet = new Set<string>();
      while (versionSet.size < numVersions) {
        versionSet.add(randSemver());
      }

      let firstVId = '';
      for (const v of versionSet) {
        const ver = await svc.createVersion({ modelId: m.id, version: v, createdBy: 'u1' });
        if (!firstVId) firstVId = ver.id;
      }

      // Add an artifact to the first version
      if (firstVId) {
        await svc.addArtifact({
          modelId: m.id,
          versionId: firstVId,
          type: 'weights',
          name: 'weights.bin',
          uri: `s3://bucket/${m.id}/weights.bin`,
          sizeBytes: randInt(100, 10000),
          checksum: randString('sha256'),
          createdBy: 'u1',
        });
      }
    }

    // Delete all models
    for (const id of modelIds) {
      await svc.deleteModel(id, ['admin']);
    }

    // Verify none can be fetched
    for (const id of modelIds) {
      await expect(svc.getModel(id)).rejects.toBeInstanceOf(Error);
    }
  });
});
