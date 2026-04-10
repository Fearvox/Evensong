// R009 Evensong III — Experiment Tracker Service
import { randomUUID } from 'crypto';
import { InMemoryStore } from '../../../shared/db.ts';
import { AppError, NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';
import { EventBus, DomainEvent } from '../../../shared/events.ts';
import { createLogger, Logger } from '../../../shared/logger.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExperimentStatus = 'draft' | 'running' | 'completed' | 'failed';

export interface Hyperparameter {
  key: string;
  value: number | string | boolean;
  type: 'float' | 'int' | 'string' | 'bool';
}

export interface Metric {
  id: string;
  experimentId: string;
  name: string;
  value: number;
  step: number;
  epoch?: number;
  timestamp: string;
  tags?: Record<string, string>;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  status: ExperimentStatus;
  tags: string[];
  hyperparameters: Hyperparameter[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  parentId?: string;
  organizationId: string;
}

export interface CreateExperimentInput {
  name: string;
  description?: string;
  tags?: string[];
  hyperparameters?: Hyperparameter[];
  createdBy: string;
  organizationId: string;
  parentId?: string;
}

export interface UpdateExperimentInput {
  name?: string;
  description?: string;
  tags?: string[];
}

export interface ListExperimentsFilter {
  status?: ExperimentStatus;
  createdBy?: string;
  organizationId?: string;
  tag?: string;
}

export interface MetricSummary {
  name: string;
  min: number;
  max: number;
  mean: number;
  last: number;
  count: number;
}

export interface ComparisonResult {
  experimentIds: string[];
  experiments: Experiment[];
  metricSummaries: Record<string, MetricSummary[]>;
  hyperparameterDiff: Record<string, Array<{ experimentId: string; value: number | string | boolean | undefined }>>;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  timestamp: string;
  experimentCount: number;
  metricCount: number;
}

// ─── State machine ────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  draft: ['running'],
  running: ['completed', 'failed'],
  completed: [],
  failed: [],
};

function isValidTransition(from: ExperimentStatus, to: ExperimentStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 100;
const MAX_HYPERPARAMETERS = 500;
const MAX_METRIC_NAME_LENGTH = 200;

function validateName(name: unknown, field = 'name'): string {
  if (typeof name !== 'string') throw new ValidationError(`${field} must be a string`);
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new ValidationError(`${field} must not be empty`);
  if (trimmed.length > MAX_NAME_LENGTH) throw new ValidationError(`${field} exceeds maximum length of ${MAX_NAME_LENGTH}`);
  return trimmed;
}

function validateDescription(desc: unknown): string {
  if (typeof desc !== 'string') throw new ValidationError('description must be a string');
  if (desc.length > MAX_DESCRIPTION_LENGTH) throw new ValidationError(`description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH}`);
  return desc;
}

function validateTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) throw new ValidationError('tags must be an array');
  if (tags.length > MAX_TAGS) throw new ValidationError(`too many tags: maximum is ${MAX_TAGS}`);
  return tags.map((t, i) => {
    if (typeof t !== 'string') throw new ValidationError(`tag at index ${i} must be a string`);
    const trimmed = t.trim();
    if (trimmed.length === 0) throw new ValidationError(`tag at index ${i} must not be empty`);
    if (trimmed.length > MAX_TAG_LENGTH) throw new ValidationError(`tag at index ${i} exceeds maximum length of ${MAX_TAG_LENGTH}`);
    return trimmed;
  });
}

function validateHyperparameters(params: unknown): Hyperparameter[] {
  if (!Array.isArray(params)) throw new ValidationError('hyperparameters must be an array');
  if (params.length > MAX_HYPERPARAMETERS) throw new ValidationError(`too many hyperparameters: maximum is ${MAX_HYPERPARAMETERS}`);
  const keys = new Set<string>();
  return params.map((p, i) => {
    if (typeof p !== 'object' || p === null) throw new ValidationError(`hyperparameter at index ${i} must be an object`);
    const hp = p as Record<string, unknown>;
    if (typeof hp.key !== 'string' || hp.key.trim().length === 0) throw new ValidationError(`hyperparameter at index ${i} must have a non-empty string key`);
    const key = hp.key.trim();
    if (keys.has(key)) throw new ValidationError(`duplicate hyperparameter key: '${key}'`);
    keys.add(key);
    if (!['float', 'int', 'string', 'bool'].includes(hp.type as string)) {
      throw new ValidationError(`hyperparameter '${key}' has invalid type: must be float, int, string, or bool`);
    }
    if (hp.value === undefined || hp.value === null) throw new ValidationError(`hyperparameter '${key}' must have a value`);
    return { key, value: hp.value as number | string | boolean, type: hp.type as Hyperparameter['type'] };
  });
}

function validateMetricInput(name: unknown, value: unknown, step: unknown): { name: string; value: number; step: number } {
  if (typeof name !== 'string') throw new ValidationError('metric name must be a string');
  const trimmedName = name.trim();
  if (trimmedName.length === 0) throw new ValidationError('metric name must not be empty');
  if (trimmedName.length > MAX_METRIC_NAME_LENGTH) throw new ValidationError(`metric name exceeds maximum length of ${MAX_METRIC_NAME_LENGTH}`);

  if (typeof value !== 'number') throw new ValidationError('metric value must be a number');
  if (!isFinite(value)) throw new ValidationError('metric value must be finite');

  if (typeof step !== 'number') throw new ValidationError('metric step must be a number');
  if (!Number.isInteger(step) || step < 0) throw new ValidationError('metric step must be a non-negative integer');

  return { name: trimmedName, value, step };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ExperimentService {
  private experiments: InMemoryStore<Experiment>;
  private metrics: InMemoryStore<Metric>;
  private logger: Logger;
  private bus: EventBus;

  constructor(bus?: EventBus, logger?: Logger) {
    this.experiments = new InMemoryStore<Experiment>();
    this.metrics = new InMemoryStore<Metric>();
    this.logger = logger ?? createLogger('experiment-tracker');
    this.bus = bus ?? new EventBus();
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async create(input: CreateExperimentInput): Promise<Experiment> {
    const name = validateName(input.name);

    // Check for duplicate name within the same organization
    const existing = await this.experiments.findAll(e => e.organizationId === input.organizationId && e.name === name);
    if (existing.length > 0) throw new ConflictError(`Experiment named '${name}' already exists in this organization`);

    if (input.parentId) {
      const parent = await this.experiments.findById(input.parentId);
      if (!parent) throw new NotFoundError('Experiment', input.parentId);
    }

    const description = input.description !== undefined ? validateDescription(input.description) : '';
    const tags = input.tags !== undefined ? validateTags(input.tags) : [];
    const hyperparameters = input.hyperparameters !== undefined ? validateHyperparameters(input.hyperparameters) : [];

    if (!input.createdBy || typeof input.createdBy !== 'string' || input.createdBy.trim().length === 0) {
      throw new ValidationError('createdBy must be a non-empty string');
    }
    if (!input.organizationId || typeof input.organizationId !== 'string' || input.organizationId.trim().length === 0) {
      throw new ValidationError('organizationId must be a non-empty string');
    }

    const now = new Date().toISOString();
    const experiment: Experiment = {
      id: randomUUID(),
      name,
      description,
      status: 'draft',
      tags,
      hyperparameters,
      createdBy: input.createdBy.trim(),
      createdAt: now,
      updatedAt: now,
      organizationId: input.organizationId.trim(),
      ...(input.parentId ? { parentId: input.parentId } : {}),
    };

    const saved = await this.experiments.insert(experiment);
    this.logger.info('Experiment created', { id: saved.id, name: saved.name });

    await this.publishEvent('experiment.created', { experimentId: saved.id, name: saved.name, status: saved.status });
    return saved;
  }

  async getById(id: string): Promise<Experiment> {
    if (!id || typeof id !== 'string') throw new ValidationError('id must be a non-empty string');
    const experiment = await this.experiments.findById(id);
    if (!experiment) throw new NotFoundError('Experiment', id);
    return experiment;
  }

  async list(filter?: ListExperimentsFilter): Promise<Experiment[]> {
    return this.experiments.findAll(e => {
      if (filter?.status && e.status !== filter.status) return false;
      if (filter?.createdBy && e.createdBy !== filter.createdBy) return false;
      if (filter?.organizationId && e.organizationId !== filter.organizationId) return false;
      if (filter?.tag && !e.tags.includes(filter.tag)) return false;
      return true;
    });
  }

  async update(id: string, input: UpdateExperimentInput): Promise<Experiment> {
    const experiment = await this.getById(id);

    if (experiment.status === 'completed' || experiment.status === 'failed') {
      throw new AppError(
        `Cannot update experiment in terminal status '${experiment.status}'`,
        'TERMINAL_STATUS',
        409
      );
    }

    const updates: Partial<Experiment> = { updatedAt: new Date().toISOString() };

    if (input.name !== undefined) {
      const newName = validateName(input.name);
      if (newName !== experiment.name) {
        const conflict = await this.experiments.findAll(
          e => e.organizationId === experiment.organizationId && e.name === newName && e.id !== id
        );
        if (conflict.length > 0) throw new ConflictError(`Experiment named '${newName}' already exists in this organization`);
        updates.name = newName;
      }
    }
    if (input.description !== undefined) updates.description = validateDescription(input.description);
    if (input.tags !== undefined) updates.tags = validateTags(input.tags);

    const updated = await this.experiments.update(id, updates);
    if (!updated) throw new NotFoundError('Experiment', id);

    this.logger.info('Experiment updated', { id });
    await this.publishEvent('experiment.updated', { experimentId: id });
    return updated;
  }

  async delete(id: string): Promise<void> {
    const experiment = await this.getById(id);
    if (experiment.status === 'running') {
      throw new AppError(`Cannot delete a running experiment`, 'RUNNING_EXPERIMENT', 409);
    }

    // Delete associated metrics
    const experimentMetrics = await this.metrics.findAll(m => m.experimentId === id);
    for (const m of experimentMetrics) {
      await this.metrics.delete(m.id);
    }

    await this.experiments.delete(id);
    this.logger.info('Experiment deleted', { id });
    await this.publishEvent('experiment.deleted', { experimentId: id });
  }

  // ── Hyperparameters ─────────────────────────────────────────────────────────

  async addHyperparameters(experimentId: string, params: Hyperparameter[]): Promise<Experiment> {
    const experiment = await this.getById(experimentId);

    if (experiment.status !== 'draft') {
      throw new AppError(
        `Hyperparameters can only be added to experiments in 'draft' status`,
        'INVALID_STATUS',
        409
      );
    }

    const validated = validateHyperparameters(params);
    const existingKeys = new Set(experiment.hyperparameters.map(h => h.key));
    for (const p of validated) {
      if (existingKeys.has(p.key)) {
        throw new ConflictError(`Hyperparameter '${p.key}' already exists on this experiment`);
      }
    }

    const merged = [...experiment.hyperparameters, ...validated];
    if (merged.length > MAX_HYPERPARAMETERS) {
      throw new ValidationError(`total hyperparameters would exceed maximum of ${MAX_HYPERPARAMETERS}`);
    }

    const updated = await this.experiments.update(experimentId, {
      hyperparameters: merged,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new NotFoundError('Experiment', experimentId);

    this.logger.info('Hyperparameters added', { experimentId, count: validated.length });
    return updated;
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────

  async logMetric(
    experimentId: string,
    name: unknown,
    value: unknown,
    step: unknown,
    options?: { epoch?: number; tags?: Record<string, string> }
  ): Promise<Metric> {
    const experiment = await this.getById(experimentId);

    if (experiment.status !== 'running') {
      throw new AppError(
        `Metrics can only be logged for experiments with status 'running', current status: '${experiment.status}'`,
        'INVALID_STATUS',
        409
      );
    }

    const validated = validateMetricInput(name, value, step);

    if (options?.epoch !== undefined) {
      if (typeof options.epoch !== 'number' || !Number.isInteger(options.epoch) || options.epoch < 0) {
        throw new ValidationError('epoch must be a non-negative integer');
      }
    }

    const metric: Metric = {
      id: randomUUID(),
      experimentId,
      name: validated.name,
      value: validated.value,
      step: validated.step,
      timestamp: new Date().toISOString(),
      ...(options?.epoch !== undefined ? { epoch: options.epoch } : {}),
      ...(options?.tags ? { tags: options.tags } : {}),
    };

    const saved = await this.metrics.insert(metric);
    this.logger.debug('Metric logged', { experimentId, name: validated.name, value: validated.value, step: validated.step });
    await this.publishEvent('experiment.metric_logged', { experimentId, metricName: validated.name, value: validated.value });
    return saved;
  }

  async getMetrics(experimentId: string, filter?: { name?: string }): Promise<Metric[]> {
    await this.getById(experimentId); // ensure experiment exists
    const results = await this.metrics.findAll(m => {
      if (m.experimentId !== experimentId) return false;
      if (filter?.name && m.name !== filter.name) return false;
      return true;
    });
    return results.sort((a, b) => a.step - b.step);
  }

  // ── Comparison ──────────────────────────────────────────────────────────────

  async compareExperiments(ids: string[]): Promise<ComparisonResult> {
    if (!Array.isArray(ids) || ids.length < 2) {
      throw new ValidationError('compareExperiments requires at least 2 experiment IDs');
    }
    if (ids.length > 20) {
      throw new ValidationError('compareExperiments supports at most 20 experiments');
    }

    const experiments = await Promise.all(ids.map(id => this.getById(id)));

    // Gather all metric names across all experiments
    const allMetricNames = new Set<string>();
    const metricsByExp: Map<string, Metric[]> = new Map();
    for (const exp of experiments) {
      const expMetrics = await this.getMetrics(exp.id);
      metricsByExp.set(exp.id, expMetrics);
      expMetrics.forEach(m => allMetricNames.add(m.name));
    }

    // Build per-metric summaries indexed by experiment
    const metricSummaries: Record<string, MetricSummary[]> = {};
    for (const metricName of allMetricNames) {
      metricSummaries[metricName] = experiments.map(exp => {
        const values = (metricsByExp.get(exp.id) || [])
          .filter(m => m.name === metricName)
          .map(m => m.value);
        if (values.length === 0) {
          return { name: metricName, min: 0, max: 0, mean: 0, last: 0, count: 0 };
        }
        const sorted = [...values].sort((a, b) => a - b);
        return {
          name: metricName,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: values.reduce((s, v) => s + v, 0) / values.length,
          last: values[values.length - 1],
          count: values.length,
        };
      });
    }

    // Build hyperparameter diff — show keys present in any experiment
    const allHpKeys = new Set<string>();
    experiments.forEach(e => e.hyperparameters.forEach(h => allHpKeys.add(h.key)));
    const hyperparameterDiff: Record<string, Array<{ experimentId: string; value: number | string | boolean | undefined }>> = {};
    for (const key of allHpKeys) {
      hyperparameterDiff[key] = experiments.map(exp => ({
        experimentId: exp.id,
        value: exp.hyperparameters.find(h => h.key === key)?.value,
      }));
    }

    return { experimentIds: ids, experiments, metricSummaries, hyperparameterDiff };
  }

  // ── Clone ────────────────────────────────────────────────────────────────────

  async cloneExperiment(sourceId: string, overrides?: Partial<Pick<CreateExperimentInput, 'name' | 'description' | 'tags'>>): Promise<Experiment> {
    const source = await this.getById(sourceId);

    const newName = overrides?.name !== undefined ? validateName(overrides.name) : `${source.name} (copy)`;

    // Check for name conflict
    const conflict = await this.experiments.findAll(
      e => e.organizationId === source.organizationId && e.name === newName
    );
    if (conflict.length > 0) throw new ConflictError(`Experiment named '${newName}' already exists in this organization`);

    return this.create({
      name: newName,
      description: overrides?.description ?? source.description,
      tags: overrides?.tags ?? [...source.tags],
      hyperparameters: source.hyperparameters.map(h => ({ ...h })),
      createdBy: source.createdBy,
      organizationId: source.organizationId,
      parentId: sourceId,
    });
  }

  // ── Status transitions ───────────────────────────────────────────────────────

  async transitionStatus(id: string, newStatus: ExperimentStatus): Promise<Experiment> {
    const experiment = await this.getById(id);

    if (!isValidTransition(experiment.status, newStatus)) {
      throw new AppError(
        `Invalid status transition from '${experiment.status}' to '${newStatus}'`,
        'INVALID_TRANSITION',
        409
      );
    }

    const now = new Date().toISOString();
    const updates: Partial<Experiment> = { status: newStatus, updatedAt: now };

    if (newStatus === 'running') updates.startedAt = now;
    if (newStatus === 'completed' || newStatus === 'failed') updates.finishedAt = now;

    const updated = await this.experiments.update(id, updates);
    if (!updated) throw new NotFoundError('Experiment', id);

    this.logger.info('Experiment status transitioned', { id, from: experiment.status, to: newStatus });
    await this.publishEvent('experiment.status_changed', {
      experimentId: id,
      from: experiment.status,
      to: newStatus,
    });
    return updated;
  }

  // ── Health ───────────────────────────────────────────────────────────────────

  async health(): Promise<HealthStatus> {
    const experimentCount = await this.experiments.count();
    const metricCount = await this.metrics.count();
    return {
      status: 'ok',
      service: 'experiment-tracker',
      timestamp: new Date().toISOString(),
      experimentCount,
      metricCount,
    };
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private async publishEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    const event: DomainEvent = {
      id: randomUUID(),
      type,
      source: 'experiment-tracker',
      timestamp: new Date().toISOString(),
      correlationId: randomUUID(),
      payload,
    };
    await this.bus.publish(event);
  }

  // Expose stores for testing
  _resetForTesting(): void {
    this.experiments.clear();
    this.metrics.clear();
  }
}
