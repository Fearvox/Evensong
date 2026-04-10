// R009 Evensong III — Training Pipeline: Fuzz / Property-Based Tests
import { describe, test, expect, beforeEach } from 'bun:test';
import { TrainingPipelineService } from '../src/index.ts';
import { EventBus } from '../../../shared/events.ts';
import type { TrainingConfig } from '../src/index.ts';

function makeValidConfig(): TrainingConfig {
  return {
    modelArchitecture: 'bert-base',
    datasetId: 'fuzz-ds',
    batchSize: 32,
    learningRate: 1e-4,
    epochs: 3,
    optimizer: 'adam',
    lossFunction: 'bce',
    distributed: { strategy: 'data_parallel', numNodes: 1, gpusPerNode: 1, syncInterval: 5 },
  };
}

let svc: TrainingPipelineService;
let bus: EventBus;

beforeEach(() => {
  bus = new EventBus();
  svc = new TrainingPipelineService(bus);
});

// ── Property 1: any invalid name always rejects ───────────────────────────

describe('fuzz: invalid job names always rejected', () => {
  const invalidNames = ['', ' ', '\t', '\n', '   ', '\t\n', '\r\n', '  \t  ', '   \n   ', '\u0000'];

  test('all blank/empty names throw ValidationError', async () => {
    for (const name of invalidNames) {
      await expect(
        svc.createJob({ name, config: makeValidConfig(), ownerId: 'u1' })
      ).rejects.toThrow();
    }
  });
});

// ── Property 2: random priorities out of [1..10] always rejected ─────────

describe('fuzz: priority bounds always enforced', () => {
  const outOfRange = [0, -1, -100, 11, 100, 999, -999, 1.5, 10.1, 0.5];

  test('all out-of-range priorities throw ValidationError', async () => {
    for (const priority of outOfRange) {
      await expect(
        svc.createJob({ name: 'j', config: makeValidConfig(), ownerId: 'u1', priority })
      ).rejects.toThrow();
    }
  });
});

// ── Property 3: completed/cancelled jobs never allow further state changes ─

describe('fuzz: terminal states block all transitions', () => {
  test('completed job rejects start, pause, fail, complete', async () => {
    const job = await svc.createJob({ name: 'j', config: makeValidConfig(), ownerId: 'u1' });
    await svc.startJob(job.id);
    await svc.completeJob(job.id);
    await expect(svc.startJob(job.id)).rejects.toThrow();
    await expect(svc.pauseJob(job.id)).rejects.toThrow();
    await expect(svc.failJob(job.id, 'err')).rejects.toThrow();
    await expect(svc.completeJob(job.id)).rejects.toThrow();
  });

  test('cancelled job rejects all lifecycle transitions', async () => {
    const job = await svc.createJob({ name: 'j', config: makeValidConfig(), ownerId: 'u1' });
    await svc.cancelJob(job.id);
    await expect(svc.startJob(job.id)).rejects.toThrow();
    await expect(svc.pauseJob(job.id)).rejects.toThrow();
    await expect(svc.resumeJob(job.id)).rejects.toThrow();
    await expect(svc.failJob(job.id, 'err')).rejects.toThrow();
    await expect(svc.completeJob(job.id)).rejects.toThrow();
    await expect(svc.retryJob(job.id)).rejects.toThrow();
  });
});

// ── Property 4: many jobs — listJobs always consistent with createJob count

describe('fuzz: listJobs count consistent with creation', () => {
  test('N random jobs created → listJobs returns exactly N', async () => {
    const counts = [1, 3, 5, 8, 10, 13, 15, 20, 25, 30];
    for (const n of counts) {
      bus = new EventBus();
      svc = new TrainingPipelineService(bus);
      for (let i = 0; i < n; i++) {
        await svc.createJob({ name: `job-${i}`, config: makeValidConfig(), ownerId: 'u1' });
      }
      const list = await svc.listJobs();
      expect(list.length).toBe(n);
    }
  });
});

// ── Property 5: checkpoint ordering always monotonically non-decreasing ──

describe('fuzz: checkpoints always returned sorted by step', () => {
  test('randomly ordered checkpoint saves produce sorted output', async () => {
    const stepSequences = [
      [500, 100, 300, 200, 400],
      [1, 10, 5, 8, 3, 7, 2, 9, 4, 6],
      [1000, 1, 999, 2, 500],
      [50, 50, 100, 25, 75], // duplicate step
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      [100, 90, 80, 70, 60, 50, 40, 30, 20, 10],
    ];

    for (const steps of stepSequences) {
      bus = new EventBus();
      svc = new TrainingPipelineService(bus);
      const job = await svc.createJob({ name: 'j', config: makeValidConfig(), ownerId: 'u1' });
      await svc.startJob(job.id);
      for (let i = 0; i < steps.length; i++) {
        await svc.saveCheckpoint({
          jobId: job.id,
          epoch: Math.floor(steps[i] / 100),
          step: steps[i],
          loss: 1 / (1 + steps[i]),
          filePath: `/cp-${steps[i]}.bin`,
          sizeBytes: 1024,
        });
      }
      const cps = await svc.getCheckpoints(job.id);
      for (let i = 1; i < cps.length; i++) {
        expect(cps[i].step >= cps[i - 1].step).toBe(true);
      }
    }
  });
});
