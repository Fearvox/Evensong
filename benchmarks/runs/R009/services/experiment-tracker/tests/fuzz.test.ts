import { describe, test, expect, beforeEach } from 'bun:test';
import { ExperimentService, Hyperparameter, ExperimentStatus } from '../src/index.ts';
import { EventBus } from '../../../shared/events.ts';
import { AppError } from '../../../shared/errors.ts';

let service: ExperimentService;

beforeEach(() => {
  service = new ExperimentService(new EventBus());
});

// ── Random helpers ────────────────────────────────────────────────────────────

function randomString(minLen = 1, maxLen = 50): string {
  const len = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_ áéíóú中文한국';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function randomFloat(min = -100, max = 100): number {
  return min + Math.random() * (max - min);
}

function randomInt(min = 0, max = 1000): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomHyperparameter(key: string): Hyperparameter {
  const types = ['float', 'int', 'string', 'bool'] as const;
  const type = types[Math.floor(Math.random() * types.length)];
  let value: number | string | boolean;
  switch (type) {
    case 'float': value = randomFloat(); break;
    case 'int': value = randomInt(); break;
    case 'string': value = randomString(1, 30); break;
    case 'bool': value = Math.random() > 0.5; break;
  }
  return { key, value, type };
}

function uniqueKeys(n: number): string[] {
  const keys = new Set<string>();
  let attempts = 0;
  while (keys.size < n && attempts < n * 10) {
    keys.add(`hp_${randomString(2, 10)}_${keys.size}`);
    attempts++;
  }
  return Array.from(keys);
}

// ── Fuzz: Random experiment creation ─────────────────────────────────────────

describe('Fuzz: Random experiment creation', () => {
  test('creates 10 experiments with random names without collision', async () => {
    const names = new Set<string>();
    while (names.size < 10) names.add(`fuzz-${randomString(3, 30)}-${names.size}`);

    const created = [];
    for (const name of names) {
      const exp = await service.create({
        name,
        description: Math.random() > 0.5 ? randomString(0, 200) : undefined,
        tags: Array.from({ length: randomInt(0, 5) }, () => randomString(1, 20)),
        createdBy: `user-${randomInt(1, 10)}`,
        organizationId: `org-${randomInt(1, 3)}`,
      });
      created.push(exp);
    }

    expect(created).toHaveLength(10);
    const allDraft = created.every(e => e.status === 'draft');
    expect(allDraft).toBe(true);
    const allHaveIds = created.every(e => typeof e.id === 'string' && e.id.length > 0);
    expect(allHaveIds).toBe(true);
  });
});

// ── Fuzz: Random hyperparameters ──────────────────────────────────────────────

describe('Fuzz: Random hyperparameters', () => {
  test('adds random hyperparameters and retrieves them intact', async () => {
    const hpCount = randomInt(1, 20);
    const keys = uniqueKeys(hpCount);
    const params = keys.map(key => randomHyperparameter(key));

    const exp = await service.create({
      name: `hp-fuzz-${randomString(5, 15)}`,
      createdBy: 'u1',
      organizationId: 'org-1',
      hyperparameters: params,
    });

    expect(exp.hyperparameters).toHaveLength(hpCount);

    for (const original of params) {
      const stored = exp.hyperparameters.find(h => h.key === original.key);
      expect(stored).toBeDefined();
      expect(stored!.value).toBe(original.value);
      expect(stored!.type).toBe(original.type);
    }
  });

  test('hyperparameter keys are preserved under addHyperparameters for 10 random rounds', async () => {
    const exp = await service.create({ name: `addHP-fuzz-${randomString(4)}`, createdBy: 'u1', organizationId: 'org-1' });
    const allKeys = new Set<string>();

    for (let i = 0; i < 10; i++) {
      const newKey = `round_${i}_${randomString(3, 8)}`;
      if (allKeys.has(newKey)) continue;
      allKeys.add(newKey);
      const hp = randomHyperparameter(newKey);
      const updated = await service.addHyperparameters(exp.id, [hp]);
      expect(updated.hyperparameters.some(h => h.key === newKey)).toBe(true);
    }

    const final = await service.getById(exp.id);
    expect(final.hyperparameters.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Fuzz: Random metric sequences ─────────────────────────────────────────────

describe('Fuzz: Random metric sequences', () => {
  test('logs 10+ random metrics and statistical summaries hold', async () => {
    const exp = await service.create({ name: `metric-fuzz-${randomString(5)}`, createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');

    const values: number[] = [];
    const metricCount = randomInt(10, 30);
    for (let step = 0; step < metricCount; step++) {
      const value = randomFloat(-10, 10);
      values.push(value);
      await service.logMetric(exp.id, 'loss', value, step);
    }

    const metrics = await service.getMetrics(exp.id);
    expect(metrics).toHaveLength(metricCount);

    // Steps should be in ascending order (service sorts by step)
    for (let i = 1; i < metrics.length; i++) {
      expect(metrics[i].step).toBeGreaterThan(metrics[i - 1].step);
    }

    // All recorded values should appear in the stored metrics
    const storedValues = metrics.map(m => m.value);
    for (const v of values) {
      expect(storedValues).toContain(v);
    }
  });

  test('compare returns consistent metric summaries over 10 random experiments', async () => {
    const expIds: string[] = [];
    const expValues: Map<string, number[]> = new Map();

    for (let i = 0; i < 10; i++) {
      const exp = await service.create({ name: `cmp-fuzz-${i}-${randomString(4)}`, createdBy: 'u1', organizationId: 'org-1' });
      await service.transitionStatus(exp.id, 'running');
      const nMetrics = randomInt(2, 8);
      const vals: number[] = [];
      for (let s = 0; s < nMetrics; s++) {
        const v = randomFloat(0, 1);
        vals.push(v);
        await service.logMetric(exp.id, 'accuracy', v, s);
      }
      expIds.push(exp.id);
      expValues.set(exp.id, vals);
    }

    const result = await service.compareExperiments(expIds);
    expect(result.experimentIds).toHaveLength(10);

    const summaries = result.metricSummaries['accuracy'];
    expect(summaries).toHaveLength(10);

    for (let i = 0; i < 10; i++) {
      const summary = summaries[i];
      const expId = result.experiments[i].id;
      const vals = expValues.get(expId)!;

      expect(summary.count).toBe(vals.length);
      expect(summary.min).toBeCloseTo(Math.min(...vals), 10);
      expect(summary.max).toBeCloseTo(Math.max(...vals), 10);
      expect(summary.last).toBeCloseTo(vals[vals.length - 1], 10);
      const expectedMean = vals.reduce((s, v) => s + v, 0) / vals.length;
      expect(summary.mean).toBeCloseTo(expectedMean, 10);
    }
  });
});

// ── Fuzz: Random status transitions ──────────────────────────────────────────

describe('Fuzz: Random status transitions', () => {
  const ALL_STATUSES: ExperimentStatus[] = ['draft', 'running', 'completed', 'failed'];
  const VALID_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
    draft: ['running'],
    running: ['completed', 'failed'],
    completed: [],
    failed: [],
  };

  test('valid transitions always succeed for 10 random experiments', async () => {
    for (let i = 0; i < 10; i++) {
      const exp = await service.create({ name: `trans-valid-${i}-${randomString(4)}`, createdBy: 'u1', organizationId: 'org-1' });
      let currentStatus: ExperimentStatus = 'draft';

      while (VALID_TRANSITIONS[currentStatus].length > 0) {
        const options = VALID_TRANSITIONS[currentStatus];
        const next = options[Math.floor(Math.random() * options.length)];
        const updated = await service.transitionStatus(exp.id, next);
        expect(updated.status).toBe(next);
        currentStatus = next;
      }
      // Now in a terminal state — verify no more transitions possible
      expect(VALID_TRANSITIONS[currentStatus]).toHaveLength(0);
    }
  });

  test('invalid transitions always fail for 10 random attempts', async () => {
    const errors: string[] = [];

    for (let i = 0; i < 10; i++) {
      const exp = await service.create({ name: `trans-invalid-${i}-${randomString(4)}`, createdBy: 'u1', organizationId: 'org-1' });
      let currentStatus: ExperimentStatus = 'draft';

      // Advance to a random terminal state
      const path = Math.random() > 0.5
        ? ['running', 'completed'] as ExperimentStatus[]
        : ['running', 'failed'] as ExperimentStatus[];

      for (const next of path) {
        await service.transitionStatus(exp.id, next);
        currentStatus = next;
      }

      // Pick an invalid target (not in valid transitions)
      const invalidTargets = ALL_STATUSES.filter(s => !VALID_TRANSITIONS[currentStatus].includes(s) && s !== currentStatus);
      if (invalidTargets.length === 0) continue;

      const invalidTarget = invalidTargets[Math.floor(Math.random() * invalidTargets.length)];
      try {
        await service.transitionStatus(exp.id, invalidTarget);
        errors.push(`Should have failed: ${currentStatus} → ${invalidTarget}`);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
      }
    }

    expect(errors).toHaveLength(0);
  });
});

// ── Fuzz: Mixed concurrent-style operations ───────────────────────────────────

describe('Fuzz: Mixed operations stability', () => {
  test('interleaved creates and reads remain consistent for 10 random sequences', async () => {
    const created: string[] = [];

    for (let op = 0; op < 10; op++) {
      const name = `mix-${op}-${randomString(4, 10)}`;
      const exp = await service.create({ name, createdBy: `u${randomInt(1, 5)}`, organizationId: `org-${randomInt(1, 3)}` });
      created.push(exp.id);

      // Randomly read back a previously created experiment
      const readIdx = Math.floor(Math.random() * created.length);
      const fetched = await service.getById(created[readIdx]);
      expect(fetched.id).toBe(created[readIdx]);
    }

    const all = await service.list();
    expect(all.length).toBe(created.length);
  });
});
