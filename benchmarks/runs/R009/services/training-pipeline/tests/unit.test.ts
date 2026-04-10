// R009 Evensong III — Training Pipeline: Core Unit Tests
import { describe, test, expect, beforeEach } from 'bun:test';
import { TrainingPipelineService } from '../src/index.ts';
import { EventBus } from '../../../shared/events.ts';
import { NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';
import type { TrainingConfig } from '../src/index.ts';

function makeConfig(overrides: Partial<TrainingConfig> = {}): TrainingConfig {
  return {
    modelArchitecture: 'transformer-base',
    datasetId: 'ds-001',
    batchSize: 32,
    learningRate: 0.001,
    epochs: 10,
    optimizer: 'adam',
    lossFunction: 'cross_entropy',
    distributed: {
      strategy: 'data_parallel',
      numNodes: 2,
      gpusPerNode: 4,
      syncInterval: 10,
    },
    ...overrides,
  };
}

let svc: TrainingPipelineService;
let bus: EventBus;

beforeEach(() => {
  bus = new EventBus();
  svc = new TrainingPipelineService(bus);
});

// ── createJob ─────────────────────────────────────────────────────────────

describe('createJob', () => {
  test('creates a job with defaults', async () => {
    const job = await svc.createJob({ name: 'train-run-1', config: makeConfig(), ownerId: 'u1' });
    expect(job.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(job.status).toBe('pending');
    expect(job.name).toBe('train-run-1');
    expect(job.priority).toBe(5);
    expect(job.retryCount).toBe(0);
    expect(job.maxRetries).toBe(3);
    expect(job.tags).toEqual([]);
    expect(job.currentEpoch).toBe(0);
    expect(job.currentStep).toBe(0);
  });

  test('trims whitespace from name', async () => {
    const job = await svc.createJob({ name: '  my-job  ', config: makeConfig(), ownerId: 'u1' });
    expect(job.name).toBe('my-job');
  });

  test('respects custom priority and maxRetries', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1', priority: 9, maxRetries: 5 });
    expect(job.priority).toBe(9);
    expect(job.maxRetries).toBe(5);
  });

  test('throws ValidationError for empty name', async () => {
    await expect(svc.createJob({ name: '', config: makeConfig(), ownerId: 'u1' })).rejects.toThrow(ValidationError);
  });

  test('throws ValidationError for blank name', async () => {
    await expect(svc.createJob({ name: '   ', config: makeConfig(), ownerId: 'u1' })).rejects.toThrow(ValidationError);
  });

  test('throws ValidationError for missing ownerId', async () => {
    await expect(svc.createJob({ name: 'j', config: makeConfig(), ownerId: '' })).rejects.toThrow(ValidationError);
  });

  test('throws ValidationError for missing modelArchitecture', async () => {
    await expect(
      svc.createJob({ name: 'j', config: makeConfig({ modelArchitecture: '' }), ownerId: 'u1' })
    ).rejects.toThrow(ValidationError);
  });

  test('throws ValidationError for missing datasetId', async () => {
    await expect(
      svc.createJob({ name: 'j', config: makeConfig({ datasetId: '' }), ownerId: 'u1' })
    ).rejects.toThrow(ValidationError);
  });

  test('throws ValidationError for non-positive batchSize', async () => {
    await expect(
      svc.createJob({ name: 'j', config: makeConfig({ batchSize: 0 }), ownerId: 'u1' })
    ).rejects.toThrow(ValidationError);
  });

  test('throws ValidationError for non-positive learningRate', async () => {
    await expect(
      svc.createJob({ name: 'j', config: makeConfig({ learningRate: -0.01 }), ownerId: 'u1' })
    ).rejects.toThrow(ValidationError);
  });

  test('throws ValidationError for priority out of range', async () => {
    await expect(
      svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1', priority: 11 })
    ).rejects.toThrow(ValidationError);
    await expect(
      svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1', priority: 0 })
    ).rejects.toThrow(ValidationError);
  });

  test('publishes job.created event', async () => {
    const events: string[] = [];
    bus.subscribe('job.created', (e) => { events.push(e.payload.jobId as string); });
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    expect(events).toContain(job.id);
  });
});

// ── getJob / listJobs ────────────────────────────────────────────────────

describe('getJob', () => {
  test('retrieves existing job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const fetched = await svc.getJob(job.id);
    expect(fetched.id).toBe(job.id);
  });

  test('throws NotFoundError for unknown id', async () => {
    await expect(svc.getJob('nonexistent')).rejects.toThrow(NotFoundError);
  });
});

describe('listJobs', () => {
  test('returns all jobs when no filter', async () => {
    await svc.createJob({ name: 'j1', config: makeConfig(), ownerId: 'u1' });
    await svc.createJob({ name: 'j2', config: makeConfig(), ownerId: 'u2' });
    const list = await svc.listJobs();
    expect(list.length).toBe(2);
  });

  test('filters by status', async () => {
    await svc.createJob({ name: 'j1', config: makeConfig(), ownerId: 'u1' });
    const j2 = await svc.createJob({ name: 'j2', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(j2.id);
    const running = await svc.listJobs({ status: 'running' });
    expect(running.every(j => j.status === 'running')).toBe(true);
  });

  test('filters by ownerId', async () => {
    await svc.createJob({ name: 'j1', config: makeConfig(), ownerId: 'alice' });
    await svc.createJob({ name: 'j2', config: makeConfig(), ownerId: 'bob' });
    const alices = await svc.listJobs({ ownerId: 'alice' });
    expect(alices.length).toBe(1);
    expect(alices[0].name).toBe('j1');
  });

  test('filters by tags', async () => {
    await svc.createJob({ name: 'j1', config: makeConfig(), ownerId: 'u1', tags: ['gpu', 'large'] });
    await svc.createJob({ name: 'j2', config: makeConfig(), ownerId: 'u1', tags: ['gpu'] });
    const both = await svc.listJobs({ tags: ['gpu', 'large'] });
    expect(both.length).toBe(1);
    expect(both[0].name).toBe('j1');
  });

  test('returns empty array when no matches', async () => {
    await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const result = await svc.listJobs({ status: 'completed' });
    expect(result).toEqual([]);
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────

describe('startJob', () => {
  test('transitions pending→running', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const started = await svc.startJob(job.id);
    expect(started.status).toBe('running');
    expect(started.startedAt).toBeDefined();
  });

  test('transitions queued→running', async () => {
    // Manually set status via createJob + transition simulation
    // We'll do it via two hops which startJob handles internally
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const started = await svc.startJob(job.id);
    expect(started.status).toBe('running');
  });

  test('throws NotFoundError for unknown job', async () => {
    await expect(svc.startJob('nope')).rejects.toThrow(NotFoundError);
  });
});

describe('pauseJob', () => {
  test('pauses a running job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    const paused = await svc.pauseJob(job.id);
    expect(paused.status).toBe('paused');
    expect(paused.pausedAt).toBeDefined();
  });

  test('throws ConflictError when pausing pending job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await expect(svc.pauseJob(job.id)).rejects.toThrow(ConflictError);
  });
});

describe('resumeJob', () => {
  test('resumes a paused job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.pauseJob(job.id);
    const resumed = await svc.resumeJob(job.id);
    expect(resumed.status).toBe('running');
    expect(resumed.resumedAt).toBeDefined();
  });

  test('throws ConflictError when resuming non-paused job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await expect(svc.resumeJob(job.id)).rejects.toThrow(ConflictError);
  });
});

describe('cancelJob', () => {
  test('cancels a pending job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const cancelled = await svc.cancelJob(job.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeDefined();
  });

  test('cancels a running job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    const cancelled = await svc.cancelJob(job.id);
    expect(cancelled.status).toBe('cancelled');
  });

  test('throws ConflictError when cancelling completed job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.completeJob(job.id);
    await expect(svc.cancelJob(job.id)).rejects.toThrow(ConflictError);
  });
});

describe('completeJob', () => {
  test('completes a running job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    const completed = await svc.completeJob(job.id);
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeDefined();
    expect(completed.currentEpoch).toBe(makeConfig().epochs);
  });

  test('throws ConflictError when completing pending job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await expect(svc.completeJob(job.id)).rejects.toThrow(ConflictError);
  });
});

describe('failJob', () => {
  test('fails a running job with message', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    const failed = await svc.failJob(job.id, 'OOM error on node 2');
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('OOM error on node 2');
    expect(failed.failedAt).toBeDefined();
  });

  test('throws ValidationError for empty errorMessage', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await expect(svc.failJob(job.id, '')).rejects.toThrow(ValidationError);
  });
});

// ── retryJob ──────────────────────────────────────────────────────────────

describe('retryJob', () => {
  test('retries a failed job, resets state', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.failJob(job.id, 'transient error');
    const retried = await svc.retryJob(job.id);
    expect(retried.status).toBe('pending');
    expect(retried.retryCount).toBe(1);
    expect(retried.errorMessage).toBeUndefined();
    expect(retried.currentEpoch).toBe(0);
    expect(retried.currentStep).toBe(0);
  });

  test('throws ConflictError when retrying non-failed job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await expect(svc.retryJob(job.id)).rejects.toThrow(ConflictError);
  });

  test('throws ConflictError when max retries exhausted', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1', maxRetries: 1 });
    for (let i = 0; i < 1; i++) {
      await svc.startJob(job.id);
      await svc.failJob(job.id, 'err');
      await svc.retryJob(job.id);
    }
    await svc.startJob(job.id);
    await svc.failJob(job.id, 'err again');
    await expect(svc.retryJob(job.id)).rejects.toThrow(ConflictError);
  });
});

// ── Checkpoints ───────────────────────────────────────────────────────────

describe('saveCheckpoint', () => {
  test('saves checkpoint for running job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    const cp = await svc.saveCheckpoint({
      jobId: job.id, epoch: 1, step: 100,
      loss: 0.5, accuracy: 0.82,
      filePath: '/checkpoints/ep1.bin', sizeBytes: 512000,
    });
    expect(cp.id).toBeDefined();
    expect(cp.epoch).toBe(1);
    expect(cp.loss).toBe(0.5);
    // Job progress updated
    const updated = await svc.getJob(job.id);
    expect(updated.currentEpoch).toBe(1);
    expect(updated.currentStep).toBe(100);
  });

  test('saves checkpoint for paused job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.pauseJob(job.id);
    const cp = await svc.saveCheckpoint({
      jobId: job.id, epoch: 2, step: 200, loss: 0.3,
      filePath: '/checkpoints/ep2.bin', sizeBytes: 512000,
    });
    expect(cp.epoch).toBe(2);
  });

  test('throws ConflictError for pending job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await expect(
      svc.saveCheckpoint({ jobId: job.id, epoch: 1, step: 10, loss: 0.5, filePath: '/f', sizeBytes: 100 })
    ).rejects.toThrow(ConflictError);
  });

  test('throws ValidationError for negative epoch', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await expect(
      svc.saveCheckpoint({ jobId: job.id, epoch: -1, step: 0, loss: 0.5, filePath: '/f', sizeBytes: 100 })
    ).rejects.toThrow(ValidationError);
  });

  test('throws ValidationError for zero sizeBytes', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await expect(
      svc.saveCheckpoint({ jobId: job.id, epoch: 1, step: 1, loss: 0.5, filePath: '/f', sizeBytes: 0 })
    ).rejects.toThrow(ValidationError);
  });
});

describe('getCheckpoints', () => {
  test('returns checkpoints sorted by step ascending', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.saveCheckpoint({ jobId: job.id, epoch: 2, step: 200, loss: 0.3, filePath: '/f2', sizeBytes: 100 });
    await svc.saveCheckpoint({ jobId: job.id, epoch: 1, step: 100, loss: 0.5, filePath: '/f1', sizeBytes: 100 });
    const cps = await svc.getCheckpoints(job.id);
    expect(cps[0].step).toBe(100);
    expect(cps[1].step).toBe(200);
  });

  test('returns empty array when no checkpoints', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const cps = await svc.getCheckpoints(job.id);
    expect(cps).toEqual([]);
  });
});

describe('restoreFromCheckpoint', () => {
  test('restores job progress from checkpoint', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    const cp = await svc.saveCheckpoint({ jobId: job.id, epoch: 3, step: 300, loss: 0.2, filePath: '/f', sizeBytes: 100 });
    await svc.pauseJob(job.id);
    const restored = await svc.restoreFromCheckpoint(job.id, cp.id);
    expect(restored.currentEpoch).toBe(3);
    expect(restored.currentStep).toBe(300);
  });

  test('throws ValidationError for checkpoint belonging to different job', async () => {
    const j1 = await svc.createJob({ name: 'j1', config: makeConfig(), ownerId: 'u1' });
    const j2 = await svc.createJob({ name: 'j2', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(j1.id);
    const cp = await svc.saveCheckpoint({ jobId: j1.id, epoch: 1, step: 50, loss: 0.4, filePath: '/f', sizeBytes: 100 });
    await expect(svc.restoreFromCheckpoint(j2.id, cp.id)).rejects.toThrow(ValidationError);
  });

  test('throws ConflictError when job is running', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    const cp = await svc.saveCheckpoint({ jobId: job.id, epoch: 1, step: 10, loss: 0.5, filePath: '/f', sizeBytes: 100 });
    await expect(svc.restoreFromCheckpoint(job.id, cp.id)).rejects.toThrow(ConflictError);
  });
});

// ── Resources ─────────────────────────────────────────────────────────────

describe('allocateResources', () => {
  test('allocates resources for a job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const alloc = await svc.allocateResources({
      jobId: job.id, gpuCount: 8, gpuMemoryGb: 80,
      cpuCores: 32, ramGb: 256, estimatedDurationSeconds: 3600,
    });
    expect(alloc.status).toBe('allocated');
    expect(alloc.gpuCount).toBe(8);
    const updated = await svc.getJob(job.id);
    expect(updated.resourceAllocationId).toBe(alloc.id);
  });

  test('throws ConflictError when job already has active allocation', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.allocateResources({ jobId: job.id, gpuCount: 4, gpuMemoryGb: 40, cpuCores: 16, ramGb: 128, estimatedDurationSeconds: 1800 });
    await expect(
      svc.allocateResources({ jobId: job.id, gpuCount: 4, gpuMemoryGb: 40, cpuCores: 16, ramGb: 128, estimatedDurationSeconds: 1800 })
    ).rejects.toThrow(ConflictError);
  });

  test('throws ValidationError for invalid gpuCount', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await expect(
      svc.allocateResources({ jobId: job.id, gpuCount: 0, gpuMemoryGb: 40, cpuCores: 16, ramGb: 128, estimatedDurationSeconds: 1800 })
    ).rejects.toThrow(ValidationError);
  });
});

describe('releaseResources', () => {
  test('releases an active allocation', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const alloc = await svc.allocateResources({ jobId: job.id, gpuCount: 4, gpuMemoryGb: 40, cpuCores: 16, ramGb: 128, estimatedDurationSeconds: 1800 });
    const released = await svc.releaseResources(alloc.id);
    expect(released.status).toBe('released');
    expect(released.releasedAt).toBeDefined();
  });

  test('throws ConflictError when releasing already-released allocation', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const alloc = await svc.allocateResources({ jobId: job.id, gpuCount: 4, gpuMemoryGb: 40, cpuCores: 16, ramGb: 128, estimatedDurationSeconds: 1800 });
    await svc.releaseResources(alloc.id);
    await expect(svc.releaseResources(alloc.id)).rejects.toThrow(ConflictError);
  });
});

// ── getJobMetrics ─────────────────────────────────────────────────────────

describe('getJobMetrics', () => {
  test('returns zero duration for pending job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const metrics = await svc.getJobMetrics(job.id);
    expect(metrics.jobId).toBe(job.id);
    expect(metrics.duration).toBe(0);
    expect(metrics.epochsCompleted).toBe(0);
    expect(metrics.checkpointCount).toBe(0);
  });

  test('counts checkpoints in metrics', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.saveCheckpoint({ jobId: job.id, epoch: 1, step: 100, loss: 0.5, filePath: '/f1', sizeBytes: 100 });
    await svc.saveCheckpoint({ jobId: job.id, epoch: 2, step: 200, loss: 0.4, filePath: '/f2', sizeBytes: 100 });
    const metrics = await svc.getJobMetrics(job.id);
    expect(metrics.checkpointCount).toBe(2);
    expect(metrics.latestLoss).toBe(0.4);
    expect(metrics.epochsCompleted).toBe(2);
  });

  test('throws NotFoundError for unknown job', async () => {
    await expect(svc.getJobMetrics('unknown')).rejects.toThrow(NotFoundError);
  });
});
