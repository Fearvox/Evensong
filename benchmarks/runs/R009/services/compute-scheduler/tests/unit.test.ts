import { describe, it, expect, beforeEach } from 'bun:test';
import { ComputeSchedulerService, COST_PER_HOUR } from '../src/index.ts';
import { ValidationError, NotFoundError, ConflictError } from '../../../shared/errors.ts';
import { EventBus } from '../../../shared/events.ts';

let svc: ComputeSchedulerService;
let bus: EventBus;

beforeEach(() => {
  bus = new EventBus();
  svc = new ComputeSchedulerService(bus);
  svc._resetForTesting();
});

// ─── submitJob ────────────────────────────────────────────────────────────────

describe('submitJob', () => {
  it('creates a queued job with correct fields', async () => {
    const job = await svc.submitJob({
      name: 'train-gpt',
      userId: 'u1',
      priority: 'high',
      resources: { type: 'A100', count: 4 },
      estimatedDurationHours: 2,
    });
    expect(job.status).toBe('queued');
    expect(job.name).toBe('train-gpt');
    expect(job.priority).toBe('high');
    expect(job.resources.type).toBe('A100');
    expect(job.resources.count).toBe(4);
    expect(job.id).toBeTruthy();
    expect(job.submittedAt).toBeTruthy();
  });

  it('trims whitespace from job name', async () => {
    const job = await svc.submitJob({
      name: '  trimmed  ',
      userId: 'u1',
      priority: 'medium',
      resources: { type: 'H100', count: 1 },
      estimatedDurationHours: 1,
    });
    expect(job.name).toBe('trimmed');
  });

  it('rejects empty name', async () => {
    await expect(svc.submitJob({
      name: '   ',
      userId: 'u1',
      priority: 'low',
      resources: { type: 'V100', count: 1 },
      estimatedDurationHours: 1,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects invalid resource type', async () => {
    await expect(svc.submitJob({
      name: 'x',
      userId: 'u1',
      priority: 'low',
      resources: { type: 'RTX9090' as any, count: 1 },
      estimatedDurationHours: 1,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects zero resource count', async () => {
    await expect(svc.submitJob({
      name: 'x',
      userId: 'u1',
      priority: 'high',
      resources: { type: 'A100', count: 0 },
      estimatedDurationHours: 1,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects negative duration', async () => {
    await expect(svc.submitJob({
      name: 'x',
      userId: 'u1',
      priority: 'high',
      resources: { type: 'A100', count: 1 },
      estimatedDurationHours: -1,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects invalid priority', async () => {
    await expect(svc.submitJob({
      name: 'x',
      userId: 'u1',
      priority: 'critical' as any,
      resources: { type: 'A100', count: 1 },
      estimatedDurationHours: 1,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('publishes job.submitted event', async () => {
    const events: string[] = [];
    bus.subscribe('job.submitted', e => { events.push(e.type); });
    await svc.submitJob({ name: 'j', userId: 'u1', priority: 'low', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    expect(events).toContain('job.submitted');
  });

  it('stores metadata on job', async () => {
    const job = await svc.submitJob({
      name: 'meta-job',
      userId: 'u1',
      priority: 'medium',
      resources: { type: 'A100', count: 1 },
      estimatedDurationHours: 1,
      metadata: { experiment: 'run-42' },
    });
    expect(job.metadata?.experiment).toBe('run-42');
  });
});

// ─── allocateGPU ──────────────────────────────────────────────────────────────

describe('allocateGPU', () => {
  it('allocates resources and transitions job to running', async () => {
    const job = await svc.submitJob({ name: 'a', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 2 }, estimatedDurationHours: 1 });
    const alloc = await svc.allocateGPU(job.id, { type: 'A100', count: 2 });
    expect(alloc.status).toBe('active');
    expect(alloc.jobId).toBe(job.id);
    expect(alloc.costEstimate).toBeCloseTo(COST_PER_HOUR.A100 * 2 * 1);
  });

  it('rejects allocation for non-existent job', async () => {
    await expect(svc.allocateGPU('no-job', { type: 'A100', count: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects allocation if job not queued', async () => {
    const job = await svc.submitJob({ name: 'b', userId: 'u1', priority: 'low', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    await svc.allocateGPU(job.id, { type: 'V100', count: 1 });
    await expect(svc.allocateGPU(job.id, { type: 'V100', count: 1 })).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects when capacity exceeded', async () => {
    const job = await svc.submitJob({ name: 'c', userId: 'u1', priority: 'high', resources: { type: 'H100', count: 33 }, estimatedDurationHours: 1 });
    await expect(svc.allocateGPU(job.id, { type: 'H100', count: 33 })).rejects.toBeInstanceOf(ConflictError);
  });

  it('tracks pool utilization after allocation', async () => {
    const job = await svc.submitJob({ name: 'd', userId: 'u1', priority: 'high', resources: { type: 'V100', count: 10 }, estimatedDurationHours: 2 });
    await svc.allocateGPU(job.id, { type: 'V100', count: 10 });
    const util = await svc.getResourceUtilization();
    expect(util.V100.used).toBe(10);
  });

  it('publishes resource.allocated event', async () => {
    const events: string[] = [];
    bus.subscribe('resource.allocated', e => { events.push(e.type); });
    const job = await svc.submitJob({ name: 'e', userId: 'u1', priority: 'medium', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    await svc.allocateGPU(job.id, { type: 'A100', count: 1 });
    expect(events).toContain('resource.allocated');
  });
});

// ─── releaseGPU ───────────────────────────────────────────────────────────────

describe('releaseGPU', () => {
  it('releases allocation and frees pool', async () => {
    const job = await svc.submitJob({ name: 'f', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 4 }, estimatedDurationHours: 1 });
    const alloc = await svc.allocateGPU(job.id, { type: 'A100', count: 4 });
    const released = await svc.releaseGPU(alloc.id);
    expect(released.status).toBe('released');
    const util = await svc.getResourceUtilization();
    expect(util.A100.used).toBe(0);
  });

  it('marks job as completed', async () => {
    const job = await svc.submitJob({ name: 'g', userId: 'u1', priority: 'medium', resources: { type: 'V100', count: 2 }, estimatedDurationHours: 1 });
    const alloc = await svc.allocateGPU(job.id, { type: 'V100', count: 2 });
    await svc.releaseGPU(alloc.id);
    const queue = await svc.getQueue();
    expect(queue.find(j => j.id === job.id)).toBeUndefined();
  });

  it('rejects double release', async () => {
    const job = await svc.submitJob({ name: 'h', userId: 'u1', priority: 'low', resources: { type: 'H100', count: 1 }, estimatedDurationHours: 1 });
    const alloc = await svc.allocateGPU(job.id, { type: 'H100', count: 1 });
    await svc.releaseGPU(alloc.id);
    await expect(svc.releaseGPU(alloc.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects release of unknown allocation', async () => {
    await expect(svc.releaseGPU('ghost-alloc')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── cancelJob ────────────────────────────────────────────────────────────────

describe('cancelJob', () => {
  it('cancels a queued job', async () => {
    const job = await svc.submitJob({ name: 'cancel-me', userId: 'u1', priority: 'low', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    const cancelled = await svc.cancelJob(job.id, 'no longer needed');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeTruthy();
  });

  it('cancels a running job and releases resources', async () => {
    const job = await svc.submitJob({ name: 'running-cancel', userId: 'u1', priority: 'high', resources: { type: 'V100', count: 5 }, estimatedDurationHours: 2 });
    await svc.allocateGPU(job.id, { type: 'V100', count: 5 });
    await svc.cancelJob(job.id);
    const util = await svc.getResourceUtilization();
    expect(util.V100.used).toBe(0);
  });

  it('rejects cancelling already completed job', async () => {
    const job = await svc.submitJob({ name: 'done', userId: 'u1', priority: 'medium', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    const alloc = await svc.allocateGPU(job.id, { type: 'A100', count: 1 });
    await svc.releaseGPU(alloc.id);
    await expect(svc.cancelJob(job.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects cancelling non-existent job', async () => {
    await expect(svc.cancelJob('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('stores cancel reason in metadata', async () => {
    const job = await svc.submitJob({ name: 'cj', userId: 'u1', priority: 'low', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    const cancelled = await svc.cancelJob(job.id, 'test reason');
    expect(cancelled.metadata?.cancelReason).toBe('test reason');
  });
});

// ─── getQueue ─────────────────────────────────────────────────────────────────

describe('getQueue', () => {
  it('returns only queued jobs', async () => {
    await svc.submitJob({ name: 'q1', userId: 'u1', priority: 'low', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    const job2 = await svc.submitJob({ name: 'q2', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    await svc.allocateGPU(job2.id, { type: 'A100', count: 1 });
    const queue = await svc.getQueue();
    expect(queue.every(j => j.status === 'queued')).toBe(true);
    expect(queue.length).toBe(1);
  });

  it('sorts high before medium before low', async () => {
    await svc.submitJob({ name: 'low', userId: 'u1', priority: 'low', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    await svc.submitJob({ name: 'high', userId: 'u1', priority: 'high', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    await svc.submitJob({ name: 'med', userId: 'u1', priority: 'medium', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    const queue = await svc.getQueue();
    expect(queue[0].priority).toBe('high');
    expect(queue[1].priority).toBe('medium');
    expect(queue[2].priority).toBe('low');
  });

  it('filters by priority', async () => {
    await svc.submitJob({ name: 'lj', userId: 'u1', priority: 'low', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    await svc.submitJob({ name: 'hj', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    const highOnly = await svc.getQueue({ priority: 'high' });
    expect(highOnly.every(j => j.priority === 'high')).toBe(true);
  });

  it('filters by userId', async () => {
    await svc.submitJob({ name: 'u1j', userId: 'u1', priority: 'low', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    await svc.submitJob({ name: 'u2j', userId: 'u2', priority: 'low', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    const u1Jobs = await svc.getQueue({ userId: 'u1' });
    expect(u1Jobs.every(j => j.userId === 'u1')).toBe(true);
  });
});

// ─── estimateCost ─────────────────────────────────────────────────────────────

describe('estimateCost', () => {
  it('calculates correct cost for A100', () => {
    const est = svc.estimateCost({ type: 'A100', count: 2 }, 4);
    expect(est.hourlyRate).toBeCloseTo(COST_PER_HOUR.A100 * 2);
    expect(est.totalCost).toBeCloseTo(COST_PER_HOUR.A100 * 2 * 4);
  });

  it('calculates cost for H100', () => {
    const est = svc.estimateCost({ type: 'H100', count: 1 }, 8);
    expect(est.totalCost).toBeCloseTo(COST_PER_HOUR.H100 * 8);
  });

  it('rejects zero count', () => {
    expect(() => svc.estimateCost({ type: 'A100', count: 0 }, 1)).toThrow(ValidationError);
  });

  it('rejects zero duration', () => {
    expect(() => svc.estimateCost({ type: 'A100', count: 1 }, 0)).toThrow(ValidationError);
  });

  it('includes breakdown', () => {
    const est = svc.estimateCost({ type: 'V100', count: 3 }, 2);
    expect(Object.keys(est.breakdown).length).toBeGreaterThan(0);
  });
});

// ─── preemptJob ───────────────────────────────────────────────────────────────

describe('preemptJob', () => {
  it('preempts a running low-priority job', async () => {
    const job = await svc.submitJob({ name: 'preempt-me', userId: 'u1', priority: 'low', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    await svc.allocateGPU(job.id, { type: 'A100', count: 1 });
    const result = await svc.preemptJob(job.id, 'higher-priority workload');
    expect(result.status).toBe('preempted');
  });

  it('frees resources after preemption', async () => {
    const job = await svc.submitJob({ name: 'pj', userId: 'u1', priority: 'medium', resources: { type: 'A100', count: 8 }, estimatedDurationHours: 1 });
    await svc.allocateGPU(job.id, { type: 'A100', count: 8 });
    await svc.preemptJob(job.id);
    const util = await svc.getResourceUtilization();
    expect(util.A100.used).toBe(0);
  });

  it('rejects preemption of non-running job', async () => {
    const job = await svc.submitJob({ name: 'not-running', userId: 'u1', priority: 'low', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    await expect(svc.preemptJob(job.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects preemption of high-priority job', async () => {
    const job = await svc.submitJob({ name: 'hp', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    await svc.allocateGPU(job.id, { type: 'A100', count: 1 });
    await expect(svc.preemptJob(job.id)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── reserveResources ─────────────────────────────────────────────────────────

describe('reserveResources', () => {
  it('creates a reservation', async () => {
    const r = await svc.reserveResources({
      userId: 'u1',
      resources: { type: 'H100', count: 4 },
      startTime: new Date(Date.now() + 3600000).toISOString(),
      endTime: new Date(Date.now() + 7200000).toISOString(),
    });
    expect(r.id).toBeTruthy();
    expect(r.active).toBe(true);
  });

  it('rejects endTime before startTime', async () => {
    const now = Date.now();
    await expect(svc.reserveResources({
      userId: 'u1',
      resources: { type: 'A100', count: 1 },
      startTime: new Date(now + 7200000).toISOString(),
      endTime: new Date(now + 3600000).toISOString(),
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects count exceeding total capacity', async () => {
    await expect(svc.reserveResources({
      userId: 'u1',
      resources: { type: 'v5', count: 9999 },
      startTime: new Date(Date.now() + 1000).toISOString(),
      endTime: new Date(Date.now() + 2000).toISOString(),
    })).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── getSchedulerMetrics ──────────────────────────────────────────────────────

describe('getSchedulerMetrics', () => {
  it('counts jobs by status', async () => {
    await svc.submitJob({ name: 'm1', userId: 'u1', priority: 'low', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    const job2 = await svc.submitJob({ name: 'm2', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    await svc.allocateGPU(job2.id, { type: 'A100', count: 1 });
    const m = await svc.getSchedulerMetrics();
    expect(m.totalJobs).toBe(2);
    expect(m.queuedJobs).toBe(1);
    expect(m.runningJobs).toBe(1);
  });

  it('returns zero metrics on empty state', async () => {
    const m = await svc.getSchedulerMetrics();
    expect(m.totalJobs).toBe(0);
    expect(m.totalCostToDate).toBe(0);
  });
});

// ─── health ───────────────────────────────────────────────────────────────────

describe('health', () => {
  it('returns healthy when utilization is low', async () => {
    const h = await svc.health();
    expect(h.status).toBe('healthy');
  });

  it('includes resource utilization in details', async () => {
    const h = await svc.health();
    expect(h.details.resourceUtilization).toBeTruthy();
  });
});

// ─── listAllocations ──────────────────────────────────────────────────────────

describe('listAllocations', () => {
  it('lists allocations filtered by status', async () => {
    const job = await svc.submitJob({ name: 'la', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    const alloc = await svc.allocateGPU(job.id, { type: 'A100', count: 1 });
    const active = await svc.listAllocations({ status: 'active' });
    expect(active.some(a => a.id === alloc.id)).toBe(true);
    await svc.releaseGPU(alloc.id);
    const released = await svc.listAllocations({ status: 'released' });
    expect(released.some(a => a.id === alloc.id)).toBe(true);
  });
});
