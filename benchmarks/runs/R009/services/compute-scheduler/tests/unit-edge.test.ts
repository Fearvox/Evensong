import { describe, it, expect, beforeEach } from 'bun:test';
import { ComputeSchedulerService, COST_PER_HOUR, resourcePool } from '../src/index.ts';
import { ValidationError, NotFoundError, ConflictError } from '../../../shared/errors.ts';
import { EventBus } from '../../../shared/events.ts';

let svc: ComputeSchedulerService;
let bus: EventBus;

beforeEach(() => {
  bus = new EventBus();
  svc = new ComputeSchedulerService(bus);
  svc._resetForTesting();
});

describe('edge: capacity boundary', () => {
  it('allows allocation at exact total capacity', async () => {
    // H100 total = 32
    const job = await svc.submitJob({ name: 'max', userId: 'u1', priority: 'high', resources: { type: 'H100', count: 32 }, estimatedDurationHours: 1 });
    const alloc = await svc.allocateGPU(job.id, { type: 'H100', count: 32 });
    expect(alloc.status).toBe('active');
    const util = await svc.getResourceUtilization();
    expect(util.H100.available).toBe(0);
    expect(util.H100.utilizationPct).toBe(100);
  });

  it('rejects allocation that exceeds capacity by 1', async () => {
    const job = await svc.submitJob({ name: 'over', userId: 'u1', priority: 'high', resources: { type: 'H100', count: 33 }, estimatedDurationHours: 1 });
    await expect(svc.allocateGPU(job.id, { type: 'H100', count: 33 })).rejects.toBeInstanceOf(ConflictError);
  });

  it('restores pool on cancel of running job', async () => {
    const job = await svc.submitJob({ name: 'restore', userId: 'u1', priority: 'medium', resources: { type: 'V100', count: 50 }, estimatedDurationHours: 1 });
    await svc.allocateGPU(job.id, { type: 'V100', count: 50 });
    await svc.cancelJob(job.id);
    const util = await svc.getResourceUtilization();
    expect(util.V100.used).toBe(0);
  });
});

describe('edge: concurrent jobs', () => {
  it('allows multiple jobs to use same resource type in sequence', async () => {
    const j1 = await svc.submitJob({ name: 'j1', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 8 }, estimatedDurationHours: 1 });
    const a1 = await svc.allocateGPU(j1.id, { type: 'A100', count: 8 });
    await svc.releaseGPU(a1.id);

    const j2 = await svc.submitJob({ name: 'j2', userId: 'u2', priority: 'high', resources: { type: 'A100', count: 8 }, estimatedDurationHours: 1 });
    const a2 = await svc.allocateGPU(j2.id, { type: 'A100', count: 8 });
    expect(a2.status).toBe('active');
  });

  it('tracks utilization correctly across multiple allocations', async () => {
    const j1 = await svc.submitJob({ name: 'p1', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 10 }, estimatedDurationHours: 1 });
    const j2 = await svc.submitJob({ name: 'p2', userId: 'u2', priority: 'high', resources: { type: 'A100', count: 10 }, estimatedDurationHours: 1 });
    await svc.allocateGPU(j1.id, { type: 'A100', count: 10 });
    await svc.allocateGPU(j2.id, { type: 'A100', count: 10 });
    const util = await svc.getResourceUtilization();
    expect(util.A100.used).toBe(20);
    expect(util.A100.available).toBe(44);
  });
});

describe('edge: TPU resources', () => {
  it('allocates TPU v4 resources correctly', async () => {
    const job = await svc.submitJob({ name: 'tpu-job', userId: 'u1', priority: 'high', resources: { type: 'v4', count: 4 }, estimatedDurationHours: 3 });
    const alloc = await svc.allocateGPU(job.id, { type: 'v4', count: 4 });
    expect(alloc.costEstimate).toBeCloseTo(COST_PER_HOUR.v4 * 4 * 3);
  });

  it('allocates TPU v5 resources correctly', async () => {
    const job = await svc.submitJob({ name: 'v5-job', userId: 'u1', priority: 'medium', resources: { type: 'v5', count: 2 }, estimatedDurationHours: 2 });
    const alloc = await svc.allocateGPU(job.id, { type: 'v5', count: 2 });
    expect(alloc.costEstimate).toBeCloseTo(COST_PER_HOUR.v5 * 2 * 2);
  });

  it('rejects TPU over-capacity', async () => {
    const job = await svc.submitJob({ name: 'v5-over', userId: 'u1', priority: 'high', resources: { type: 'v5', count: 9 }, estimatedDurationHours: 1 });
    await expect(svc.allocateGPU(job.id, { type: 'v5', count: 9 })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('edge: queue ordering stability', () => {
  it('same-priority jobs sorted by submission time (FIFO)', async () => {
    const j1 = await svc.submitJob({ name: 'first', userId: 'u1', priority: 'medium', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    await new Promise(r => setTimeout(r, 5));
    const j2 = await svc.submitJob({ name: 'second', userId: 'u1', priority: 'medium', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 1 });
    const queue = await svc.getQueue({ priority: 'medium' });
    const ids = queue.map(j => j.id);
    expect(ids.indexOf(j1.id)).toBeLessThan(ids.indexOf(j2.id));
  });
});

describe('edge: preemption cascades', () => {
  it('preempted job resources are available for new allocation', async () => {
    const low = await svc.submitJob({ name: 'low-job', userId: 'u1', priority: 'low', resources: { type: 'A100', count: 16 }, estimatedDurationHours: 4 });
    await svc.allocateGPU(low.id, { type: 'A100', count: 16 });
    await svc.preemptJob(low.id, 'high-priority job arrived');

    const high = await svc.submitJob({ name: 'high-job', userId: 'u2', priority: 'high', resources: { type: 'A100', count: 16 }, estimatedDurationHours: 1 });
    const alloc = await svc.allocateGPU(high.id, { type: 'A100', count: 16 });
    expect(alloc.status).toBe('active');
  });
});

describe('edge: metrics accuracy', () => {
  it('counts cancelled+preempted jobs together', async () => {
    const j1 = await svc.submitJob({ name: 'will-cancel', userId: 'u1', priority: 'low', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    const j2 = await svc.submitJob({ name: 'will-preempt', userId: 'u1', priority: 'medium', resources: { type: 'V100', count: 1 }, estimatedDurationHours: 1 });
    await svc.cancelJob(j1.id);
    await svc.allocateGPU(j2.id, { type: 'V100', count: 1 });
    await svc.preemptJob(j2.id);
    const m = await svc.getSchedulerMetrics();
    expect(m.cancelledJobs).toBe(2); // cancelled + preempted
  });

  it('totalCostToDate accumulates from completed allocations', async () => {
    const job = await svc.submitJob({ name: 'cost-job', userId: 'u1', priority: 'high', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 10 });
    const alloc = await svc.allocateGPU(job.id, { type: 'A100', count: 1 });
    await svc.releaseGPU(alloc.id);
    const m = await svc.getSchedulerMetrics();
    expect(m.totalCostToDate).toBeCloseTo(COST_PER_HOUR.A100 * 1 * 10);
  });
});

describe('edge: reservation validation', () => {
  it('rejects same start and end time', async () => {
    const t = new Date(Date.now() + 3600000).toISOString();
    await expect(svc.reserveResources({
      userId: 'u1',
      resources: { type: 'A100', count: 1 },
      startTime: t,
      endTime: t,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects invalid ISO date strings', async () => {
    await expect(svc.reserveResources({
      userId: 'u1',
      resources: { type: 'A100', count: 1 },
      startTime: 'not-a-date',
      endTime: 'also-not-a-date',
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts reservation for minimum 1 resource', async () => {
    const r = await svc.reserveResources({
      userId: 'u1',
      resources: { type: 'v4', count: 1 },
      startTime: new Date(Date.now() + 1000).toISOString(),
      endTime: new Date(Date.now() + 2000).toISOString(),
    });
    expect(r.resources.count).toBe(1);
  });
});
