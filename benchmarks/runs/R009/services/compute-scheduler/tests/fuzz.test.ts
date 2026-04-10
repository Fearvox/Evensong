import { describe, it, expect, beforeEach } from 'bun:test';
import { ComputeSchedulerService } from '../src/index.ts';
import { ValidationError, ConflictError, NotFoundError } from '../../../shared/errors.ts';
import { EventBus } from '../../../shared/events.ts';

const RESOURCE_TYPES = ['A100', 'H100', 'V100', 'v4', 'v5'] as const;
const PRIORITIES = ['high', 'medium', 'low'] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

let svc: ComputeSchedulerService;

beforeEach(() => {
  const bus = new EventBus();
  svc = new ComputeSchedulerService(bus);
  svc._resetForTesting();
});

describe('fuzz: submitJob with random inputs', () => {
  it('rejects all invalid resource types without crashing', async () => {
    const invalidTypes = ['GPU', 'TPU', 'A200', '', 'null', '0', 'undefined', 'h100', 'a100', 'RTX'];
    for (const type of invalidTypes) {
      await expect(svc.submitJob({
        name: `job-${type}`,
        userId: 'u1',
        priority: 'high',
        resources: { type: type as any, count: 1 },
        estimatedDurationHours: 1,
      })).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('accepts 10 valid random job submissions', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        svc.submitJob({
          name: `fuzz-job-${i}`,
          userId: `user-${i % 3}`,
          priority: pick(PRIORITIES),
          resources: { type: pick(RESOURCE_TYPES), count: randInt(1, 4) },
          estimatedDurationHours: randFloat(0.5, 48),
        })
      )
    );
    expect(results.length).toBe(10);
    expect(results.every(j => j.status === 'queued')).toBe(true);
  });

  it('rejects negative and extreme count values', async () => {
    const badCounts = [-1, -100, 0, -0.5];
    for (const count of badCounts) {
      await expect(svc.submitJob({
        name: 'bad-count',
        userId: 'u1',
        priority: 'medium',
        resources: { type: 'A100', count },
        estimatedDurationHours: 1,
      })).rejects.toBeInstanceOf(ValidationError);
    }
  });
});

describe('fuzz: estimateCost with random inputs', () => {
  it('produces positive cost for all valid resource types and random durations', () => {
    const inputs = Array.from({ length: 10 }, () => ({
      type: pick(RESOURCE_TYPES),
      count: randInt(1, 8),
      duration: randFloat(0.1, 100),
    }));
    for (const { type, count, duration } of inputs) {
      const est = svc.estimateCost({ type, count }, duration);
      expect(est.totalCost).toBeGreaterThan(0);
      expect(est.hourlyRate).toBeGreaterThan(0);
      expect(est.totalCost).toBeCloseTo(est.hourlyRate * duration);
    }
  });

  it('rejects all invalid durations', () => {
    const badDurations = [0, -1, -0.001, -100];
    for (const d of badDurations) {
      expect(() => svc.estimateCost({ type: 'A100', count: 1 }, d)).toThrow(ValidationError);
    }
  });
});

describe('fuzz: allocate + release cycles', () => {
  it('pool stays consistent after 10 allocate+release cycles', async () => {
    const resourceType = 'A100';
    for (let i = 0; i < 10; i++) {
      const count = randInt(1, 5);
      const job = await svc.submitJob({
        name: `cycle-${i}`,
        userId: 'u1',
        priority: pick(PRIORITIES),
        resources: { type: resourceType, count },
        estimatedDurationHours: 1,
      });
      const alloc = await svc.allocateGPU(job.id, { type: resourceType, count });
      await svc.releaseGPU(alloc.id);
    }
    const util = await svc.getResourceUtilization();
    expect(util.A100.used).toBe(0);
  });
});

describe('fuzz: random cancel operations', () => {
  it('cancelling non-existent IDs always throws NotFoundError', async () => {
    const fakeIds = Array.from({ length: 10 }, () => `fake-${Math.random().toString(36).slice(2)}`);
    for (const id of fakeIds) {
      await expect(svc.cancelJob(id)).rejects.toBeInstanceOf(NotFoundError);
    }
  });
});

describe('fuzz: reservation boundary conditions', () => {
  it('rejects reservations with random invalid date strings', async () => {
    const badDates = ['', 'yesterday', '2024-13-45', 'NaN', String(NaN), '9999-99-99T99:99:99'];
    for (const d of badDates) {
      await expect(svc.reserveResources({
        userId: 'u1',
        resources: { type: 'A100', count: 1 },
        startTime: d,
        endTime: new Date(Date.now() + 100000).toISOString(),
      })).rejects.toBeInstanceOf(ValidationError);
    }
  });
});
