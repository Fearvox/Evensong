// R009 Evensong III — Training Pipeline Service
import { randomUUID } from 'crypto';
import { InMemoryStore } from '../../../shared/db.ts';
import { NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';
import { createLogger } from '../../../shared/logger.ts';
import { EventBus, DomainEvent } from '../../../shared/events.ts';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DistributedConfig {
  strategy: 'data_parallel' | 'model_parallel' | 'pipeline_parallel' | 'none';
  numNodes: number;
  gpusPerNode: number;
  syncInterval: number; // steps between gradient sync
}

export interface TrainingConfig {
  modelArchitecture: string;
  datasetId: string;
  batchSize: number;
  learningRate: number;
  epochs: number;
  optimizer: 'adam' | 'sgd' | 'adamw' | 'rmsprop';
  lossFunction: string;
  distributed: DistributedConfig;
  hyperparams?: Record<string, number | string | boolean>;
}

export interface ResourceAllocation {
  id: string;
  jobId: string;
  gpuCount: number;
  gpuMemoryGb: number;
  cpuCores: number;
  ramGb: number;
  estimatedDurationSeconds: number;
  allocatedAt: string;
  releasedAt?: string;
  status: 'allocated' | 'released';
}

export interface Checkpoint {
  id: string;
  jobId: string;
  epoch: number;
  step: number;
  loss: number;
  accuracy?: number;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface TrainingJob {
  id: string;
  name: string;
  status: JobStatus;
  config: TrainingConfig;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  currentEpoch: number;
  currentStep: number;
  totalSteps: number;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  priority: number; // 1 (low) – 10 (high)
  tags: string[];
  ownerId: string;
  resourceAllocationId?: string;
}

export interface JobMetrics {
  jobId: string;
  duration: number; // seconds
  epochsCompleted: number;
  stepsCompleted: number;
  latestLoss?: number;
  latestAccuracy?: number;
  checkpointCount: number;
  resourceEfficiency: number; // 0-1 ratio of active compute
}

// ────────────────────────────────────────────────────────────────────────────
// State machine transitions
// ────────────────────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  pending:   ['queued', 'cancelled'],
  queued:    ['running', 'cancelled'],
  running:   ['paused', 'completed', 'failed', 'cancelled'],
  paused:    ['running', 'cancelled'],
  completed: [],
  failed:    ['pending'], // retry resets to pending
  cancelled: [],
};

function canTransition(from: JobStatus, to: JobStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

export class TrainingPipelineService {
  private jobs: InMemoryStore<TrainingJob>;
  private checkpoints: InMemoryStore<Checkpoint>;
  private allocations: InMemoryStore<ResourceAllocation>;
  private logger = createLogger('training-pipeline');

  constructor(private readonly bus: EventBus) {
    this.jobs = new InMemoryStore<TrainingJob>();
    this.checkpoints = new InMemoryStore<Checkpoint>();
    this.allocations = new InMemoryStore<ResourceAllocation>();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private makeEvent(type: string, payload: Record<string, unknown>): DomainEvent {
    return {
      id: randomUUID(),
      type,
      source: 'training-pipeline',
      timestamp: new Date().toISOString(),
      correlationId: randomUUID(),
      payload,
    };
  }

  private async applyTransition(
    jobId: string,
    to: JobStatus,
    extra: Partial<TrainingJob> = {}
  ): Promise<TrainingJob> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundError('TrainingJob', jobId);
    if (!canTransition(job.status, to)) {
      throw new ConflictError(
        `Cannot transition job '${jobId}' from '${job.status}' to '${to}'`
      );
    }
    const now = new Date().toISOString();
    const updated = await this.jobs.update(jobId, {
      ...extra,
      status: to,
      updatedAt: now,
    });
    return updated!;
  }

  // ── Job CRUD ──────────────────────────────────────────────────────────────

  async createJob(params: {
    name: string;
    config: TrainingConfig;
    ownerId: string;
    priority?: number;
    maxRetries?: number;
    tags?: string[];
  }): Promise<TrainingJob> {
    const { name, config, ownerId } = params;

    // Reject blank, whitespace-only, or null-byte names
    const cleanName = name ? name.replace(/\u0000/g, '').trim() : '';
    if (!cleanName) {
      throw new ValidationError('Job name is required');
    }
    if (!ownerId) throw new ValidationError('ownerId is required');
    if (!config.modelArchitecture) throw new ValidationError('modelArchitecture is required');
    if (!config.datasetId) throw new ValidationError('datasetId is required');
    if (config.batchSize <= 0) throw new ValidationError('batchSize must be positive');
    if (config.learningRate <= 0) throw new ValidationError('learningRate must be positive');
    if (config.epochs <= 0) throw new ValidationError('epochs must be positive');
    if (config.distributed.numNodes <= 0) throw new ValidationError('numNodes must be positive');
    if (config.distributed.gpusPerNode <= 0) throw new ValidationError('gpusPerNode must be positive');

    const priority = params.priority ?? 5;
    if (!Number.isInteger(priority) || priority < 1 || priority > 10) {
      throw new ValidationError('priority must be an integer between 1 and 10');
    }

    const now = new Date().toISOString();
    const stepsPerEpoch = Math.ceil(1000 / config.batchSize); // estimate
    const job: TrainingJob = {
      id: randomUUID(),
      name: cleanName,
      status: 'pending',
      config,
      createdAt: now,
      updatedAt: now,
      currentEpoch: 0,
      currentStep: 0,
      totalSteps: stepsPerEpoch * config.epochs,
      retryCount: 0,
      maxRetries: params.maxRetries ?? 3,
      priority,
      tags: params.tags ?? [],
      ownerId,
    };

    const created = await this.jobs.insert(job);
    await this.bus.publish(this.makeEvent('job.created', { jobId: created.id, name: created.name }));
    this.logger.info('Job created', { jobId: created.id });
    return created;
  }

  async getJob(jobId: string): Promise<TrainingJob> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundError('TrainingJob', jobId);
    return job;
  }

  async listJobs(filter?: {
    status?: JobStatus;
    ownerId?: string;
    tags?: string[];
  }): Promise<TrainingJob[]> {
    return this.jobs.findAll((job) => {
      if (filter?.status && job.status !== filter.status) return false;
      if (filter?.ownerId && job.ownerId !== filter.ownerId) return false;
      if (filter?.tags && !filter.tags.every(t => job.tags.includes(t))) return false;
      return true;
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async startJob(jobId: string): Promise<TrainingJob> {
    // pending→queued→running allowed; queued→running also valid
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundError('TrainingJob', jobId);

    let current = job;
    if (current.status === 'pending') {
      current = await this.applyTransition(jobId, 'queued');
    }
    current = await this.applyTransition(jobId, 'running', { startedAt: new Date().toISOString() });
    await this.bus.publish(this.makeEvent('job.started', { jobId }));
    return current;
  }

  async pauseJob(jobId: string): Promise<TrainingJob> {
    const updated = await this.applyTransition(jobId, 'paused', { pausedAt: new Date().toISOString() });
    await this.bus.publish(this.makeEvent('job.paused', { jobId }));
    return updated;
  }

  async resumeJob(jobId: string): Promise<TrainingJob> {
    const updated = await this.applyTransition(jobId, 'running', { resumedAt: new Date().toISOString() });
    await this.bus.publish(this.makeEvent('job.resumed', { jobId }));
    return updated;
  }

  async cancelJob(jobId: string): Promise<TrainingJob> {
    const updated = await this.applyTransition(jobId, 'cancelled', { cancelledAt: new Date().toISOString() });
    // Release any resource allocation
    const job = updated;
    if (job.resourceAllocationId) {
      await this.releaseResources(job.resourceAllocationId);
    }
    await this.bus.publish(this.makeEvent('job.cancelled', { jobId }));
    return updated;
  }

  async completeJob(jobId: string, finalMetrics?: { loss: number; accuracy?: number }): Promise<TrainingJob> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundError('TrainingJob', jobId);
    const updated = await this.applyTransition(jobId, 'completed', {
      completedAt: new Date().toISOString(),
      currentEpoch: job.config.epochs,
      currentStep: job.totalSteps,
    });
    if (job.resourceAllocationId) {
      await this.releaseResources(job.resourceAllocationId);
    }
    await this.bus.publish(this.makeEvent('job.completed', { jobId, finalMetrics }));
    return updated;
  }

  async failJob(jobId: string, errorMessage: string): Promise<TrainingJob> {
    if (!errorMessage || errorMessage.trim().length === 0) {
      throw new ValidationError('errorMessage is required when failing a job');
    }
    const updated = await this.applyTransition(jobId, 'failed', {
      failedAt: new Date().toISOString(),
      errorMessage: errorMessage.trim(),
    });
    await this.bus.publish(this.makeEvent('job.failed', { jobId, errorMessage }));
    return updated;
  }

  async retryJob(jobId: string): Promise<TrainingJob> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundError('TrainingJob', jobId);
    if (job.status !== 'failed') {
      throw new ConflictError(`Only failed jobs can be retried; job is '${job.status}'`);
    }
    if (job.retryCount >= job.maxRetries) {
      throw new ConflictError(
        `Job '${jobId}' has exhausted ${job.maxRetries} retries`
      );
    }
    // failed→pending (special retry transition)
    const now = new Date().toISOString();
    const updated = await this.jobs.update(jobId, {
      status: 'pending',
      updatedAt: now,
      retryCount: job.retryCount + 1,
      errorMessage: undefined,
      failedAt: undefined,
      startedAt: undefined,
      completedAt: undefined,
      currentEpoch: 0,
      currentStep: 0,
    });
    await this.bus.publish(this.makeEvent('job.retried', { jobId, retryCount: updated!.retryCount }));
    return updated!;
  }

  // ── Checkpoints ───────────────────────────────────────────────────────────

  async saveCheckpoint(params: {
    jobId: string;
    epoch: number;
    step: number;
    loss: number;
    accuracy?: number;
    filePath: string;
    sizeBytes: number;
    metadata?: Record<string, unknown>;
  }): Promise<Checkpoint> {
    const { jobId } = params;
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundError('TrainingJob', jobId);
    if (job.status !== 'running' && job.status !== 'paused') {
      throw new ConflictError(`Cannot save checkpoint for job in '${job.status}' status`);
    }
    if (params.epoch < 0) throw new ValidationError('epoch must be non-negative');
    if (params.step < 0) throw new ValidationError('step must be non-negative');
    if (params.sizeBytes <= 0) throw new ValidationError('sizeBytes must be positive');
    if (!params.filePath) throw new ValidationError('filePath is required');

    const checkpoint: Checkpoint = {
      id: randomUUID(),
      jobId,
      epoch: params.epoch,
      step: params.step,
      loss: params.loss,
      accuracy: params.accuracy,
      filePath: params.filePath,
      sizeBytes: params.sizeBytes,
      createdAt: new Date().toISOString(),
      metadata: params.metadata,
    };

    const created = await this.checkpoints.insert(checkpoint);
    // Update job progress
    await this.jobs.update(jobId, {
      currentEpoch: params.epoch,
      currentStep: params.step,
      updatedAt: new Date().toISOString(),
    });
    await this.bus.publish(this.makeEvent('checkpoint.saved', { jobId, checkpointId: created.id }));
    return created;
  }

  async getCheckpoints(jobId: string): Promise<Checkpoint[]> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundError('TrainingJob', jobId);
    const cps = await this.checkpoints.findAll(c => c.jobId === jobId);
    // Sort ascending by step
    return cps.sort((a, b) => a.step - b.step || a.epoch - b.epoch);
  }

  async restoreFromCheckpoint(jobId: string, checkpointId: string): Promise<TrainingJob> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundError('TrainingJob', jobId);

    const checkpoint = await this.checkpoints.findById(checkpointId);
    if (!checkpoint) throw new NotFoundError('Checkpoint', checkpointId);
    if (checkpoint.jobId !== jobId) {
      throw new ValidationError(`Checkpoint '${checkpointId}' does not belong to job '${jobId}'`);
    }
    if (!['pending', 'paused', 'failed'].includes(job.status)) {
      throw new ConflictError(`Cannot restore checkpoint for job in '${job.status}' status`);
    }

    const updated = await this.jobs.update(jobId, {
      currentEpoch: checkpoint.epoch,
      currentStep: checkpoint.step,
      updatedAt: new Date().toISOString(),
    });
    await this.bus.publish(this.makeEvent('checkpoint.restored', { jobId, checkpointId }));
    return updated!;
  }

  // ── Resources ─────────────────────────────────────────────────────────────

  async allocateResources(params: {
    jobId: string;
    gpuCount: number;
    gpuMemoryGb: number;
    cpuCores: number;
    ramGb: number;
    estimatedDurationSeconds: number;
  }): Promise<ResourceAllocation> {
    const job = await this.jobs.findById(params.jobId);
    if (!job) throw new NotFoundError('TrainingJob', params.jobId);
    if (job.resourceAllocationId) {
      // Check if existing allocation is still active
      const existing = await this.allocations.findById(job.resourceAllocationId);
      if (existing && existing.status === 'allocated') {
        throw new ConflictError(`Job '${params.jobId}' already has an active resource allocation`);
      }
    }
    if (params.gpuCount <= 0) throw new ValidationError('gpuCount must be positive');
    if (params.gpuMemoryGb <= 0) throw new ValidationError('gpuMemoryGb must be positive');
    if (params.cpuCores <= 0) throw new ValidationError('cpuCores must be positive');
    if (params.ramGb <= 0) throw new ValidationError('ramGb must be positive');
    if (params.estimatedDurationSeconds <= 0) {
      throw new ValidationError('estimatedDurationSeconds must be positive');
    }

    const allocation: ResourceAllocation = {
      id: randomUUID(),
      jobId: params.jobId,
      gpuCount: params.gpuCount,
      gpuMemoryGb: params.gpuMemoryGb,
      cpuCores: params.cpuCores,
      ramGb: params.ramGb,
      estimatedDurationSeconds: params.estimatedDurationSeconds,
      allocatedAt: new Date().toISOString(),
      status: 'allocated',
    };

    const created = await this.allocations.insert(allocation);
    await this.jobs.update(params.jobId, {
      resourceAllocationId: created.id,
      updatedAt: new Date().toISOString(),
    });
    await this.bus.publish(this.makeEvent('resources.allocated', { jobId: params.jobId, allocationId: created.id }));
    return created;
  }

  async releaseResources(allocationId: string): Promise<ResourceAllocation> {
    const allocation = await this.allocations.findById(allocationId);
    if (!allocation) throw new NotFoundError('ResourceAllocation', allocationId);
    if (allocation.status === 'released') {
      throw new ConflictError(`Allocation '${allocationId}' is already released`);
    }
    const updated = await this.allocations.update(allocationId, {
      status: 'released',
      releasedAt: new Date().toISOString(),
    });
    await this.bus.publish(this.makeEvent('resources.released', { allocationId, jobId: allocation.jobId }));
    return updated!;
  }

  async getAllocation(allocationId: string): Promise<ResourceAllocation> {
    const alloc = await this.allocations.findById(allocationId);
    if (!alloc) throw new NotFoundError('ResourceAllocation', allocationId);
    return alloc;
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  async getJobMetrics(jobId: string): Promise<JobMetrics> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundError('TrainingJob', jobId);

    const cps = await this.checkpoints.findAll(c => c.jobId === jobId);
    const sorted = cps.sort((a, b) => b.step - a.step);
    const latest = sorted[0];

    let durationSeconds = 0;
    if (job.startedAt) {
      const end = job.completedAt || job.failedAt || job.cancelledAt || new Date().toISOString();
      durationSeconds = (new Date(end).getTime() - new Date(job.startedAt).getTime()) / 1000;
    }

    const progress = job.totalSteps > 0 ? job.currentStep / job.totalSteps : 0;

    return {
      jobId,
      duration: Math.round(durationSeconds),
      epochsCompleted: job.currentEpoch,
      stepsCompleted: job.currentStep,
      latestLoss: latest?.loss,
      latestAccuracy: latest?.accuracy,
      checkpointCount: cps.length,
      resourceEfficiency: job.status === 'running' ? Math.min(1, progress + 0.1) : progress,
    };
  }
}
