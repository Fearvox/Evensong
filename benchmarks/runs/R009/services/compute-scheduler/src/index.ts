// R009 Evensong III — Compute Scheduler Service
import { randomUUID } from 'crypto';
import { AppError, NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';
import { createLogger } from '../../../shared/logger.ts';
import { EventBus, DomainEvent, eventBus } from '../../../shared/events.ts';
import { InMemoryStore } from '../../../shared/db.ts';

const logger = createLogger('compute-scheduler');

// ─── Types ────────────────────────────────────────────────────────────────────

export type GPUType = 'A100' | 'H100' | 'V100';
export type TPUType = 'v4' | 'v5';
export type ResourceType = GPUType | TPUType;
export type JobPriority = 'high' | 'medium' | 'low';
export type JobStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed' | 'preempted';
export type AllocationStatus = 'active' | 'released';

export interface ResourceSpec {
  type: ResourceType;
  count: number;
  memoryGB?: number;
}

export interface ComputeJob {
  id: string;
  name: string;
  userId: string;
  priority: JobPriority;
  status: JobStatus;
  resources: ResourceSpec;
  estimatedDurationHours: number;
  submittedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  allocationId?: string;
  metadata?: Record<string, unknown>;
}

export interface ResourceAllocation {
  id: string;
  jobId: string;
  userId: string;
  resources: ResourceSpec;
  status: AllocationStatus;
  allocatedAt: string;
  releasedAt?: string;
  costEstimate: number;
}

export interface ResourceReservation {
  id: string;
  userId: string;
  resources: ResourceSpec;
  startTime: string;
  endTime: string;
  createdAt: string;
  active: boolean;
}

export interface SchedulerMetrics {
  totalJobs: number;
  runningJobs: number;
  queuedJobs: number;
  completedJobs: number;
  failedJobs: number;
  cancelledJobs: number;
  totalAllocations: number;
  activeAllocations: number;
  totalCostToDate: number;
  avgWaitTimeMs: number;
  avgRunTimeMs: number;
}

// ─── Cost Model (per GPU-hour) ────────────────────────────────────────────────

const COST_PER_HOUR: Record<ResourceType, number> = {
  A100: 3.20,
  H100: 5.89,
  V100: 2.10,
  v4: 4.50,
  v5: 6.20,
};

const PRIORITY_ORDER: Record<JobPriority, number> = { high: 0, medium: 1, low: 2 };

// ─── Resource Pool (available capacity) ──────────────────────────────────────

interface ResourcePool {
  total: number;
  used: number;
}

const resourcePool: Record<ResourceType, ResourcePool> = {
  A100: { total: 64, used: 0 },
  H100: { total: 32, used: 0 },
  V100: { total: 128, used: 0 },
  v4: { total: 16, used: 0 },
  v5: { total: 8, used: 0 },
};

// ─── Stores ───────────────────────────────────────────────────────────────────

const jobs = new InMemoryStore<ComputeJob>();
const allocations = new InMemoryStore<ResourceAllocation>();
const reservations = new InMemoryStore<ResourceReservation>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(type: string, payload: Record<string, unknown>): DomainEvent {
  return {
    id: randomUUID(),
    type,
    source: 'compute-scheduler',
    timestamp: new Date().toISOString(),
    correlationId: randomUUID(),
    payload,
  };
}

function validateResourceType(type: string): asserts type is ResourceType {
  const valid: ResourceType[] = ['A100', 'H100', 'V100', 'v4', 'v5'];
  if (!valid.includes(type as ResourceType)) {
    throw new ValidationError(`Invalid resource type: ${type}`, { valid });
  }
}

function validatePriority(p: string): asserts p is JobPriority {
  if (!['high', 'medium', 'low'].includes(p)) {
    throw new ValidationError(`Invalid priority: ${p}`);
  }
}

function availableCount(type: ResourceType): number {
  const pool = resourcePool[type];
  return pool.total - pool.used;
}

function reservedCount(type: ResourceType, excludeJobId?: string): number {
  // Count resources held by active reservations that overlap "now"
  return 0; // simplified: reservations do time-based holds but don't block pool directly
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComputeSchedulerService {
  constructor(private bus: EventBus = eventBus) {}

  // Allocate GPU/TPU resources for a job
  async allocateGPU(jobId: string, resources: ResourceSpec): Promise<ResourceAllocation> {
    validateResourceType(resources.type);
    if (resources.count <= 0) throw new ValidationError('Resource count must be positive');

    const job = await jobs.findById(jobId);
    if (!job) throw new NotFoundError('Job', jobId);
    if (job.status !== 'queued') {
      throw new ConflictError(`Job ${jobId} is not in queued state (current: ${job.status})`);
    }

    const pool = resourcePool[resources.type];
    if (pool.used + resources.count > pool.total) {
      throw new ConflictError(
        `Insufficient ${resources.type} capacity: need ${resources.count}, available ${pool.total - pool.used}`
      );
    }

    const costEstimate = COST_PER_HOUR[resources.type] * resources.count * job.estimatedDurationHours;
    const now = new Date().toISOString();

    pool.used += resources.count;

    const allocation: ResourceAllocation = {
      id: randomUUID(),
      jobId,
      userId: job.userId,
      resources,
      status: 'active',
      allocatedAt: now,
      costEstimate,
    };

    await allocations.insert(allocation);
    await jobs.update(jobId, { status: 'running', startedAt: now, allocationId: allocation.id });

    await this.bus.publish(makeEvent('resource.allocated', { allocationId: allocation.id, jobId, resources }));
    logger.info('Resource allocated', { allocationId: allocation.id, jobId });
    return allocation;
  }

  // Release GPU/TPU resources
  async releaseGPU(allocationId: string): Promise<ResourceAllocation> {
    const allocation = await allocations.findById(allocationId);
    if (!allocation) throw new NotFoundError('Allocation', allocationId);
    if (allocation.status === 'released') {
      throw new ConflictError(`Allocation ${allocationId} already released`);
    }

    const now = new Date().toISOString();
    const pool = resourcePool[allocation.resources.type];
    pool.used = Math.max(0, pool.used - allocation.resources.count);

    const updated = await allocations.update(allocationId, { status: 'released', releasedAt: now });
    await jobs.update(allocation.jobId, { status: 'completed', completedAt: now });

    await this.bus.publish(makeEvent('resource.released', { allocationId, jobId: allocation.jobId }));
    logger.info('Resource released', { allocationId });
    return updated!;
  }

  // Get the job queue, sorted by priority then submission time
  async getQueue(filter?: { priority?: JobPriority; userId?: string }): Promise<ComputeJob[]> {
    const all = await jobs.findAll(j => {
      if (j.status !== 'queued') return false;
      if (filter?.priority && j.priority !== filter.priority) return false;
      if (filter?.userId && j.userId !== filter.userId) return false;
      return true;
    });

    return all.sort((a, b) => {
      const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pd !== 0) return pd;
      return a.submittedAt.localeCompare(b.submittedAt);
    });
  }

  // Submit a new job to the queue
  async submitJob(params: {
    name: string;
    userId: string;
    priority: JobPriority;
    resources: ResourceSpec;
    estimatedDurationHours: number;
    metadata?: Record<string, unknown>;
  }): Promise<ComputeJob> {
    validateResourceType(params.resources.type);
    validatePriority(params.priority);
    if (!params.name?.trim()) throw new ValidationError('Job name is required');
    if (params.resources.count <= 0) throw new ValidationError('Resource count must be positive');
    if (params.estimatedDurationHours <= 0) throw new ValidationError('Estimated duration must be positive');

    const job: ComputeJob = {
      id: randomUUID(),
      name: params.name.trim(),
      userId: params.userId,
      priority: params.priority,
      status: 'queued',
      resources: params.resources,
      estimatedDurationHours: params.estimatedDurationHours,
      submittedAt: new Date().toISOString(),
      metadata: params.metadata,
    };

    await jobs.insert(job);
    await this.bus.publish(makeEvent('job.submitted', { jobId: job.id, priority: job.priority }));
    logger.info('Job submitted', { jobId: job.id });
    return job;
  }

  // Cancel a queued or running job
  async cancelJob(jobId: string, reason?: string): Promise<ComputeJob> {
    const job = await jobs.findById(jobId);
    if (!job) throw new NotFoundError('Job', jobId);
    if (job.status === 'completed' || job.status === 'cancelled') {
      throw new ConflictError(`Job ${jobId} is already ${job.status}`);
    }

    const now = new Date().toISOString();

    // Release allocation if running
    if (job.status === 'running' && job.allocationId) {
      const alloc = await allocations.findById(job.allocationId);
      if (alloc && alloc.status === 'active') {
        const pool = resourcePool[alloc.resources.type];
        pool.used = Math.max(0, pool.used - alloc.resources.count);
        await allocations.update(job.allocationId, { status: 'released', releasedAt: now });
      }
    }

    const updated = await jobs.update(jobId, {
      status: 'cancelled',
      cancelledAt: now,
      metadata: { ...job.metadata, cancelReason: reason },
    });

    await this.bus.publish(makeEvent('job.cancelled', { jobId, reason }));
    return updated!;
  }

  // Estimate cost for a job configuration
  estimateCost(resources: ResourceSpec, durationHours: number): {
    hourlyRate: number;
    totalCost: number;
    breakdown: Record<string, number>;
  } {
    validateResourceType(resources.type);
    if (resources.count <= 0) throw new ValidationError('Resource count must be positive');
    if (durationHours <= 0) throw new ValidationError('Duration must be positive');

    const hourlyRate = COST_PER_HOUR[resources.type] * resources.count;
    const totalCost = hourlyRate * durationHours;
    return {
      hourlyRate,
      totalCost,
      breakdown: {
        [`${resources.type}_x${resources.count}`]: totalCost,
      },
    };
  }

  // Get current resource utilization
  async getResourceUtilization(): Promise<Record<ResourceType, {
    total: number;
    used: number;
    available: number;
    utilizationPct: number;
  }>> {
    const result = {} as Record<ResourceType, { total: number; used: number; available: number; utilizationPct: number }>;
    for (const [type, pool] of Object.entries(resourcePool)) {
      result[type as ResourceType] = {
        total: pool.total,
        used: pool.used,
        available: pool.total - pool.used,
        utilizationPct: pool.total > 0 ? (pool.used / pool.total) * 100 : 0,
      };
    }
    return result;
  }

  // List all allocations, optionally filtered
  async listAllocations(filter?: {
    userId?: string;
    status?: AllocationStatus;
    jobId?: string;
  }): Promise<ResourceAllocation[]> {
    return jobs.findAll ? allocations.findAll(a => {
      if (filter?.userId && a.userId !== filter.userId) return false;
      if (filter?.status && a.status !== filter.status) return false;
      if (filter?.jobId && a.jobId !== filter.jobId) return false;
      return true;
    }) : [];
  }

  // Preempt a running low-priority job to free resources for high-priority
  async preemptJob(jobId: string, reason: string = 'higher-priority job'): Promise<ComputeJob> {
    const job = await jobs.findById(jobId);
    if (!job) throw new NotFoundError('Job', jobId);
    if (job.status !== 'running') {
      throw new ConflictError(`Cannot preempt job in state: ${job.status}`);
    }
    if (job.priority === 'high') {
      throw new ValidationError('High-priority jobs cannot be preempted');
    }

    const now = new Date().toISOString();

    if (job.allocationId) {
      const alloc = await allocations.findById(job.allocationId);
      if (alloc && alloc.status === 'active') {
        const pool = resourcePool[alloc.resources.type];
        pool.used = Math.max(0, pool.used - alloc.resources.count);
        await allocations.update(job.allocationId, { status: 'released', releasedAt: now });
      }
    }

    const updated = await jobs.update(jobId, {
      status: 'preempted',
      metadata: { ...job.metadata, preemptReason: reason, preemptedAt: now },
    });

    await this.bus.publish(makeEvent('job.preempted', { jobId, reason }));
    logger.info('Job preempted', { jobId, reason });
    return updated!;
  }

  // Reserve resources for a future time window
  async reserveResources(params: {
    userId: string;
    resources: ResourceSpec;
    startTime: string;
    endTime: string;
  }): Promise<ResourceReservation> {
    validateResourceType(params.resources.type);
    if (params.resources.count <= 0) throw new ValidationError('Resource count must be positive');

    const start = new Date(params.startTime);
    const end = new Date(params.endTime);
    if (isNaN(start.getTime())) throw new ValidationError('Invalid startTime');
    if (isNaN(end.getTime())) throw new ValidationError('Invalid endTime');
    if (end <= start) throw new ValidationError('endTime must be after startTime');

    const pool = resourcePool[params.resources.type];
    if (params.resources.count > pool.total) {
      throw new ValidationError(
        `Cannot reserve ${params.resources.count} ${params.resources.type}: total capacity is ${pool.total}`
      );
    }

    const reservation: ResourceReservation = {
      id: randomUUID(),
      userId: params.userId,
      resources: params.resources,
      startTime: params.startTime,
      endTime: params.endTime,
      createdAt: new Date().toISOString(),
      active: true,
    };

    await reservations.insert(reservation);
    await this.bus.publish(makeEvent('resources.reserved', { reservationId: reservation.id, resources: params.resources }));
    return reservation;
  }

  // Get scheduler metrics
  async getSchedulerMetrics(): Promise<SchedulerMetrics> {
    const allJobs = await jobs.findAll();
    const allAllocs = await allocations.findAll();

    const running = allJobs.filter(j => j.status === 'running');
    const queued = allJobs.filter(j => j.status === 'queued');
    const completed = allJobs.filter(j => j.status === 'completed');
    const failed = allJobs.filter(j => j.status === 'failed');
    const cancelled = allJobs.filter(j => j.status === 'cancelled' || j.status === 'preempted');
    const activeAllocs = allAllocs.filter(a => a.status === 'active');

    // Avg wait time: queued jobs (submitted → now) or completed (submitted → started)
    const waitTimes = completed
      .filter(j => j.startedAt)
      .map(j => new Date(j.startedAt!).getTime() - new Date(j.submittedAt).getTime());
    const avgWaitTimeMs = waitTimes.length > 0
      ? waitTimes.reduce((s, v) => s + v, 0) / waitTimes.length
      : 0;

    // Avg run time
    const runTimes = completed
      .filter(j => j.startedAt && j.completedAt)
      .map(j => new Date(j.completedAt!).getTime() - new Date(j.startedAt!).getTime());
    const avgRunTimeMs = runTimes.length > 0
      ? runTimes.reduce((s, v) => s + v, 0) / runTimes.length
      : 0;

    const totalCostToDate = allAllocs
      .filter(a => a.status === 'released')
      .reduce((s, a) => s + a.costEstimate, 0);

    return {
      totalJobs: allJobs.length,
      runningJobs: running.length,
      queuedJobs: queued.length,
      completedJobs: completed.length,
      failedJobs: failed.length,
      cancelledJobs: cancelled.length,
      totalAllocations: allAllocs.length,
      activeAllocations: activeAllocs.length,
      totalCostToDate,
      avgWaitTimeMs,
      avgRunTimeMs,
    };
  }

  // Health check
  async health(): Promise<{ status: 'healthy' | 'degraded'; details: Record<string, unknown> }> {
    const util = await this.getResourceUtilization();
    const highLoad = Object.values(util).some(r => r.utilizationPct > 90);
    return {
      status: highLoad ? 'degraded' : 'healthy',
      details: {
        resourceUtilization: util,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Reset all state (for testing)
  _resetForTesting(): void {
    jobs.clear();
    allocations.clear();
    reservations.clear();
    for (const pool of Object.values(resourcePool)) {
      pool.used = 0;
    }
  }
}

export const computeScheduler = new ComputeSchedulerService();
export { COST_PER_HOUR, resourcePool };
