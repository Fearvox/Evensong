// R009 Evensong III — Training Pipeline: Edge Case Tests
import { describe, test, expect, beforeEach } from 'bun:test';
import { TrainingPipelineService } from '../src/index.ts';
import { EventBus } from '../../../shared/events.ts';
import { NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';
import type { TrainingConfig } from '../src/index.ts';

function makeConfig(overrides: Partial<TrainingConfig> = {}): TrainingConfig {
  return {
    modelArchitecture: 'gpt-small',
    datasetId: 'ds-edge',
    batchSize: 16,
    learningRate: 3e-4,
    epochs: 5,
    optimizer: 'adamw',
    lossFunction: 'mse',
    distributed: { strategy: 'none', numNodes: 1, gpusPerNode: 1, syncInterval: 1 },
    ...overrides,
  };
}

let svc: TrainingPipelineService;
let bus: EventBus;

beforeEach(() => {
  bus = new EventBus();
  svc = new TrainingPipelineService(bus);
});

// ── State machine edge cases ──────────────────────────────────────────────

describe('state machine edge cases', () => {
  test('cannot cancel a completed job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.completeJob(job.id);
    await expect(svc.cancelJob(job.id)).rejects.toThrow(ConflictError);
  });

  test('cannot cancel an already-cancelled job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.cancelJob(job.id);
    await expect(svc.cancelJob(job.id)).rejects.toThrow(ConflictError);
  });

  test('cannot complete an already-completed job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.completeJob(job.id);
    await expect(svc.completeJob(job.id)).rejects.toThrow(ConflictError);
  });

  test('cannot fail a completed job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.completeJob(job.id);
    await expect(svc.failJob(job.id, 'late error')).rejects.toThrow(ConflictError);
  });

  test('cannot fail a cancelled job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.cancelJob(job.id);
    await expect(svc.failJob(job.id, 'error')).rejects.toThrow(ConflictError);
  });

  test('cannot start an already running job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    // running → running not in valid transitions
    await expect(svc.startJob(job.id)).rejects.toThrow(ConflictError);
  });

  test('full happy-path lifecycle emits all events', async () => {
    const emitted: string[] = [];
    ['job.created','job.started','job.paused','job.resumed','job.completed'].forEach(type => {
      bus.subscribe(type, () => { emitted.push(type); });
    });
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.pauseJob(job.id);
    await svc.resumeJob(job.id);
    await svc.completeJob(job.id);
    expect(emitted).toContain('job.created');
    expect(emitted).toContain('job.started');
    expect(emitted).toContain('job.paused');
    expect(emitted).toContain('job.resumed');
    expect(emitted).toContain('job.completed');
  });
});

// ── Retry exhaustion edge cases ───────────────────────────────────────────

describe('retryJob edge cases', () => {
  test('retry increments retryCount each time', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1', maxRetries: 3 });
    for (let i = 0; i < 3; i++) {
      await svc.startJob(job.id);
      await svc.failJob(job.id, 'err');
      const retried = await svc.retryJob(job.id);
      expect(retried.retryCount).toBe(i + 1);
    }
  });

  test('retry resets errorMessage and timestamps', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.failJob(job.id, 'something broke');
    const retried = await svc.retryJob(job.id);
    expect(retried.errorMessage).toBeUndefined();
    expect(retried.failedAt).toBeUndefined();
    expect(retried.startedAt).toBeUndefined();
  });
});

// ── Checkpoint edge cases ─────────────────────────────────────────────────

describe('checkpoint edge cases', () => {
  test('multiple checkpoints for same epoch, sorted by step', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.saveCheckpoint({ jobId: job.id, epoch: 1, step: 150, loss: 0.45, filePath: '/f150', sizeBytes: 200 });
    await svc.saveCheckpoint({ jobId: job.id, epoch: 1, step: 50,  loss: 0.6,  filePath: '/f50',  sizeBytes: 200 });
    const cps = await svc.getCheckpoints(job.id);
    expect(cps[0].step).toBe(50);
    expect(cps[1].step).toBe(150);
  });

  test('restoring from a checkpoint updates job progress', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    const cp1 = await svc.saveCheckpoint({ jobId: job.id, epoch: 2, step: 200, loss: 0.3, filePath: '/f1', sizeBytes: 100 });
    await svc.saveCheckpoint({ jobId: job.id, epoch: 4, step: 400, loss: 0.15, filePath: '/f2', sizeBytes: 100 });
    await svc.pauseJob(job.id);
    // Restore to earlier checkpoint
    const restored = await svc.restoreFromCheckpoint(job.id, cp1.id);
    expect(restored.currentEpoch).toBe(2);
    expect(restored.currentStep).toBe(200);
  });

  test('cannot save checkpoint for failed job', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.failJob(job.id, 'oom');
    await expect(
      svc.saveCheckpoint({ jobId: job.id, epoch: 1, step: 10, loss: 0.5, filePath: '/f', sizeBytes: 100 })
    ).rejects.toThrow(ConflictError);
  });

  test('cannot restore from checkpoint of nonexistent checkpoint', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await expect(svc.restoreFromCheckpoint(job.id, 'ghost-cp')).rejects.toThrow(NotFoundError);
  });
});

// ── Resource allocation edge cases ────────────────────────────────────────

describe('resource allocation edge cases', () => {
  test('can re-allocate after releasing', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const alloc = await svc.allocateResources({ jobId: job.id, gpuCount: 2, gpuMemoryGb: 20, cpuCores: 8, ramGb: 64, estimatedDurationSeconds: 900 });
    await svc.releaseResources(alloc.id);
    // Now should be able to allocate again
    const alloc2 = await svc.allocateResources({ jobId: job.id, gpuCount: 4, gpuMemoryGb: 40, cpuCores: 16, ramGb: 128, estimatedDurationSeconds: 1800 });
    expect(alloc2.status).toBe('allocated');
    expect(alloc2.gpuCount).toBe(4);
  });

  test('cancelling job with allocation releases it', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const alloc = await svc.allocateResources({ jobId: job.id, gpuCount: 4, gpuMemoryGb: 40, cpuCores: 16, ramGb: 128, estimatedDurationSeconds: 1800 });
    await svc.cancelJob(job.id);
    const released = await svc.getAllocation(alloc.id);
    expect(released.status).toBe('released');
  });

  test('completing job with allocation releases it', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    const alloc = await svc.allocateResources({ jobId: job.id, gpuCount: 4, gpuMemoryGb: 40, cpuCores: 16, ramGb: 128, estimatedDurationSeconds: 1800 });
    await svc.startJob(job.id);
    await svc.completeJob(job.id);
    const released = await svc.getAllocation(alloc.id);
    expect(released.status).toBe('released');
  });

  test('getAllocation throws NotFoundError for unknown id', async () => {
    await expect(svc.getAllocation('nonexistent-alloc')).rejects.toThrow(NotFoundError);
  });

  test('throws ValidationError for negative estimatedDuration', async () => {
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await expect(
      svc.allocateResources({ jobId: job.id, gpuCount: 1, gpuMemoryGb: 16, cpuCores: 4, ramGb: 32, estimatedDurationSeconds: -1 })
    ).rejects.toThrow(ValidationError);
  });
});

// ── Event publishing edge cases ───────────────────────────────────────────

describe('event publishing', () => {
  test('job.failed event includes errorMessage', async () => {
    let capturedPayload: Record<string, unknown> = {};
    bus.subscribe('job.failed', (e) => { capturedPayload = e.payload; });
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.failJob(job.id, 'GPU OOM');
    expect(capturedPayload.errorMessage).toBe('GPU OOM');
  });

  test('checkpoint.restored event carries correct ids', async () => {
    let payload: Record<string, unknown> = {};
    bus.subscribe('checkpoint.restored', (e) => { payload = e.payload; });
    const job = await svc.createJob({ name: 'j', config: makeConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    const cp = await svc.saveCheckpoint({ jobId: job.id, epoch: 1, step: 10, loss: 0.5, filePath: '/f', sizeBytes: 100 });
    await svc.pauseJob(job.id);
    await svc.restoreFromCheckpoint(job.id, cp.id);
    expect(payload.jobId).toBe(job.id);
    expect(payload.checkpointId).toBe(cp.id);
  });
});
