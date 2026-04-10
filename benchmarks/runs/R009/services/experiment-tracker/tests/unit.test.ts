import { describe, test, expect, beforeEach } from 'bun:test';
import { ExperimentService } from '../src/index.ts';
import { EventBus } from '../../../shared/events.ts';
import { NotFoundError, ValidationError, ConflictError, AppError } from '../../../shared/errors.ts';

let service: ExperimentService;
let bus: EventBus;

beforeEach(() => {
  bus = new EventBus();
  service = new ExperimentService(bus);
});

// ── Create ───────────────────────────────────────────────────────────────────

describe('ExperimentService.create', () => {
  test('creates an experiment with required fields', async () => {
    const exp = await service.create({
      name: 'ResNet-50 baseline',
      createdBy: 'researcher-1',
      organizationId: 'org-a',
    });
    expect(exp.id).toBeTruthy();
    expect(exp.name).toBe('ResNet-50 baseline');
    expect(exp.status).toBe('draft');
    expect(exp.tags).toEqual([]);
    expect(exp.hyperparameters).toEqual([]);
    expect(exp.createdBy).toBe('researcher-1');
    expect(exp.organizationId).toBe('org-a');
  });

  test('trims whitespace from name', async () => {
    const exp = await service.create({ name: '  trimmed  ', createdBy: 'u1', organizationId: 'org-1' });
    expect(exp.name).toBe('trimmed');
  });

  test('creates experiment with hyperparameters', async () => {
    const exp = await service.create({
      name: 'HP Sweep',
      createdBy: 'u1',
      organizationId: 'org-1',
      hyperparameters: [
        { key: 'lr', value: 0.001, type: 'float' },
        { key: 'batch_size', value: 32, type: 'int' },
        { key: 'optimizer', value: 'adam', type: 'string' },
        { key: 'use_aug', value: true, type: 'bool' },
      ],
    });
    expect(exp.hyperparameters).toHaveLength(4);
    expect(exp.hyperparameters.find(h => h.key === 'lr')?.value).toBe(0.001);
  });

  test('creates experiment with tags', async () => {
    const exp = await service.create({
      name: 'Tagged Exp',
      createdBy: 'u1',
      organizationId: 'org-1',
      tags: ['cv', 'classification', 'baseline'],
    });
    expect(exp.tags).toEqual(['cv', 'classification', 'baseline']);
  });

  test('creates experiment with parentId when parent exists', async () => {
    const parent = await service.create({ name: 'Parent', createdBy: 'u1', organizationId: 'org-1' });
    const child = await service.create({ name: 'Child', createdBy: 'u1', organizationId: 'org-1', parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
  });

  test('rejects duplicate name in same organization', async () => {
    await service.create({ name: 'DupTest', createdBy: 'u1', organizationId: 'org-1' });
    await expect(service.create({ name: 'DupTest', createdBy: 'u2', organizationId: 'org-1' }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  test('allows same name in different organizations', async () => {
    await service.create({ name: 'SharedName', createdBy: 'u1', organizationId: 'org-1' });
    const exp2 = await service.create({ name: 'SharedName', createdBy: 'u2', organizationId: 'org-2' });
    expect(exp2.id).toBeTruthy();
  });

  test('rejects empty name', async () => {
    await expect(service.create({ name: '', createdBy: 'u1', organizationId: 'org-1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects missing createdBy', async () => {
    await expect(service.create({ name: 'X', createdBy: '', organizationId: 'org-1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects invalid parentId', async () => {
    await expect(service.create({ name: 'X', createdBy: 'u1', organizationId: 'org-1', parentId: 'nonexistent' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  test('publishes experiment.created event', async () => {
    const events: string[] = [];
    bus.subscribe('experiment.created', e => { events.push(e.type); });
    await service.create({ name: 'EventTest', createdBy: 'u1', organizationId: 'org-1' });
    expect(events).toContain('experiment.created');
  });
});

// ── GetById ──────────────────────────────────────────────────────────────────

describe('ExperimentService.getById', () => {
  test('retrieves an existing experiment', async () => {
    const created = await service.create({ name: 'Fetch Me', createdBy: 'u1', organizationId: 'org-1' });
    const fetched = await service.getById(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe('Fetch Me');
  });

  test('throws NotFoundError for unknown id', async () => {
    await expect(service.getById('00000000-0000-0000-0000-000000000000'))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  test('throws ValidationError for empty id', async () => {
    await expect(service.getById('')).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── List ─────────────────────────────────────────────────────────────────────

describe('ExperimentService.list', () => {
  test('lists all experiments when no filter is applied', async () => {
    await service.create({ name: 'Exp1', createdBy: 'u1', organizationId: 'org-1' });
    await service.create({ name: 'Exp2', createdBy: 'u2', organizationId: 'org-2' });
    const all = await service.list();
    expect(all.length).toBe(2);
  });

  test('filters by status', async () => {
    const exp1 = await service.create({ name: 'Draft1', createdBy: 'u1', organizationId: 'org-1' });
    await service.create({ name: 'Draft2', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp1.id, 'running');

    const drafts = await service.list({ status: 'draft' });
    expect(drafts.every(e => e.status === 'draft')).toBe(true);
    const running = await service.list({ status: 'running' });
    expect(running.every(e => e.status === 'running')).toBe(true);
  });

  test('filters by organizationId', async () => {
    await service.create({ name: 'OrgA-Exp', createdBy: 'u1', organizationId: 'org-a' });
    await service.create({ name: 'OrgB-Exp', createdBy: 'u2', organizationId: 'org-b' });
    const orgA = await service.list({ organizationId: 'org-a' });
    expect(orgA).toHaveLength(1);
    expect(orgA[0].name).toBe('OrgA-Exp');
  });

  test('filters by tag', async () => {
    await service.create({ name: 'Tagged', createdBy: 'u1', organizationId: 'org-1', tags: ['nlp'] });
    await service.create({ name: 'Untagged', createdBy: 'u1', organizationId: 'org-1' });
    const nlp = await service.list({ tag: 'nlp' });
    expect(nlp).toHaveLength(1);
    expect(nlp[0].name).toBe('Tagged');
  });

  test('returns empty list when no experiments match filter', async () => {
    await service.create({ name: 'X', createdBy: 'u1', organizationId: 'org-1' });
    const result = await service.list({ status: 'completed' });
    expect(result).toHaveLength(0);
  });
});

// ── Update ───────────────────────────────────────────────────────────────────

describe('ExperimentService.update', () => {
  test('updates name successfully', async () => {
    const exp = await service.create({ name: 'OldName', createdBy: 'u1', organizationId: 'org-1' });
    const updated = await service.update(exp.id, { name: 'NewName' });
    expect(updated.name).toBe('NewName');
  });

  test('updates description and tags', async () => {
    const exp = await service.create({ name: 'DescTest', createdBy: 'u1', organizationId: 'org-1' });
    const updated = await service.update(exp.id, { description: 'New desc', tags: ['tag1'] });
    expect(updated.description).toBe('New desc');
    expect(updated.tags).toEqual(['tag1']);
  });

  test('rejects name conflict on update', async () => {
    await service.create({ name: 'OtherExp', createdBy: 'u1', organizationId: 'org-1' });
    const exp = await service.create({ name: 'OriginalName', createdBy: 'u1', organizationId: 'org-1' });
    await expect(service.update(exp.id, { name: 'OtherExp' })).rejects.toBeInstanceOf(ConflictError);
  });

  test('rejects update on completed experiment', async () => {
    const exp = await service.create({ name: 'DoneExp', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await service.transitionStatus(exp.id, 'completed');
    await expect(service.update(exp.id, { name: 'NewName' })).rejects.toBeInstanceOf(AppError);
  });

  test('rejects update on failed experiment', async () => {
    const exp = await service.create({ name: 'FailedExp', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await service.transitionStatus(exp.id, 'failed');
    await expect(service.update(exp.id, { name: 'AnyName' })).rejects.toBeInstanceOf(AppError);
  });

  test('throws NotFoundError for unknown id', async () => {
    await expect(service.update('bad-id', { name: 'X' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── Delete ───────────────────────────────────────────────────────────────────

describe('ExperimentService.delete', () => {
  test('deletes a draft experiment', async () => {
    const exp = await service.create({ name: 'ToDelete', createdBy: 'u1', organizationId: 'org-1' });
    await service.delete(exp.id);
    await expect(service.getById(exp.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  test('deletes associated metrics on experiment deletion', async () => {
    const exp = await service.create({ name: 'WithMetrics', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await service.logMetric(exp.id, 'loss', 1.5, 0);
    await service.transitionStatus(exp.id, 'completed');
    await service.delete(exp.id);
    await expect(service.getById(exp.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  test('rejects deleting a running experiment', async () => {
    const exp = await service.create({ name: 'RunningExp', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await expect(service.delete(exp.id)).rejects.toBeInstanceOf(AppError);
  });

  test('throws NotFoundError for unknown id', async () => {
    await expect(service.delete('nonexistent-id')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── Status transitions ────────────────────────────────────────────────────────

describe('ExperimentService.transitionStatus', () => {
  test('transitions draft → running', async () => {
    const exp = await service.create({ name: 'TST', createdBy: 'u1', organizationId: 'org-1' });
    const updated = await service.transitionStatus(exp.id, 'running');
    expect(updated.status).toBe('running');
    expect(updated.startedAt).toBeTruthy();
  });

  test('transitions running → completed', async () => {
    const exp = await service.create({ name: 'TST2', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    const updated = await service.transitionStatus(exp.id, 'completed');
    expect(updated.status).toBe('completed');
    expect(updated.finishedAt).toBeTruthy();
  });

  test('transitions running → failed', async () => {
    const exp = await service.create({ name: 'TST3', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    const updated = await service.transitionStatus(exp.id, 'failed');
    expect(updated.status).toBe('failed');
    expect(updated.finishedAt).toBeTruthy();
  });

  test('rejects invalid transition draft → completed', async () => {
    const exp = await service.create({ name: 'BadTrans', createdBy: 'u1', organizationId: 'org-1' });
    await expect(service.transitionStatus(exp.id, 'completed')).rejects.toBeInstanceOf(AppError);
  });

  test('rejects invalid transition completed → running', async () => {
    const exp = await service.create({ name: 'DoneRun', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await service.transitionStatus(exp.id, 'completed');
    await expect(service.transitionStatus(exp.id, 'running')).rejects.toBeInstanceOf(AppError);
  });

  test('publishes status_changed event', async () => {
    const events: Array<{ from: unknown; to: unknown }> = [];
    bus.subscribe('experiment.status_changed', e => {
      events.push({ from: e.payload.from, to: e.payload.to });
    });
    const exp = await service.create({ name: 'EventExp', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    expect(events.some(e => e.from === 'draft' && e.to === 'running')).toBe(true);
  });
});

// ── Hyperparameters ───────────────────────────────────────────────────────────

describe('ExperimentService.addHyperparameters', () => {
  test('adds hyperparameters to a draft experiment', async () => {
    const exp = await service.create({ name: 'HpTest', createdBy: 'u1', organizationId: 'org-1' });
    const updated = await service.addHyperparameters(exp.id, [
      { key: 'lr', value: 1e-3, type: 'float' },
    ]);
    expect(updated.hyperparameters).toHaveLength(1);
    expect(updated.hyperparameters[0].key).toBe('lr');
  });

  test('rejects adding hyperparameters to running experiment', async () => {
    const exp = await service.create({ name: 'RunHP', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await expect(service.addHyperparameters(exp.id, [{ key: 'x', value: 1, type: 'int' }]))
      .rejects.toBeInstanceOf(AppError);
  });

  test('rejects duplicate hyperparameter key', async () => {
    const exp = await service.create({
      name: 'DupHP',
      createdBy: 'u1',
      organizationId: 'org-1',
      hyperparameters: [{ key: 'lr', value: 0.01, type: 'float' }],
    });
    await expect(service.addHyperparameters(exp.id, [{ key: 'lr', value: 0.001, type: 'float' }]))
      .rejects.toBeInstanceOf(ConflictError);
  });
});

// ── Metrics ───────────────────────────────────────────────────────────────────

describe('ExperimentService.logMetric', () => {
  test('logs a metric for a running experiment', async () => {
    const exp = await service.create({ name: 'MetricExp', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    const metric = await service.logMetric(exp.id, 'train_loss', 0.5, 0);
    expect(metric.id).toBeTruthy();
    expect(metric.experimentId).toBe(exp.id);
    expect(metric.name).toBe('train_loss');
    expect(metric.value).toBe(0.5);
    expect(metric.step).toBe(0);
  });

  test('logs metric with optional epoch and tags', async () => {
    const exp = await service.create({ name: 'EpochExp', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    const metric = await service.logMetric(exp.id, 'val_loss', 0.3, 10, { epoch: 1, tags: { split: 'val' } });
    expect(metric.epoch).toBe(1);
    expect(metric.tags?.split).toBe('val');
  });

  test('rejects metric logging for draft experiment', async () => {
    const exp = await service.create({ name: 'DraftMetric', createdBy: 'u1', organizationId: 'org-1' });
    await expect(service.logMetric(exp.id, 'loss', 1.0, 0)).rejects.toBeInstanceOf(AppError);
  });

  test('rejects non-finite metric value', async () => {
    const exp = await service.create({ name: 'InfMetric', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await expect(service.logMetric(exp.id, 'loss', Infinity, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.logMetric(exp.id, 'loss', NaN, 0)).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects negative step', async () => {
    const exp = await service.create({ name: 'NegStep', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await expect(service.logMetric(exp.id, 'loss', 1.0, -1)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('ExperimentService.getMetrics', () => {
  test('returns metrics sorted by step', async () => {
    const exp = await service.create({ name: 'SortedMetrics', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await service.logMetric(exp.id, 'loss', 0.9, 2);
    await service.logMetric(exp.id, 'loss', 1.0, 0);
    await service.logMetric(exp.id, 'loss', 0.95, 1);
    const metrics = await service.getMetrics(exp.id);
    const steps = metrics.map(m => m.step);
    expect(steps).toEqual([0, 1, 2]);
  });

  test('filters metrics by name', async () => {
    const exp = await service.create({ name: 'FilterMetrics', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await service.logMetric(exp.id, 'loss', 1.0, 0);
    await service.logMetric(exp.id, 'accuracy', 0.5, 0);
    const losses = await service.getMetrics(exp.id, { name: 'loss' });
    expect(losses.every(m => m.name === 'loss')).toBe(true);
  });

  test('throws NotFoundError for unknown experiment', async () => {
    await expect(service.getMetrics('bad-exp-id')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── Compare ───────────────────────────────────────────────────────────────────

describe('ExperimentService.compareExperiments', () => {
  test('compares two experiments and returns metric summaries', async () => {
    const exp1 = await service.create({ name: 'CompA', createdBy: 'u1', organizationId: 'org-1', hyperparameters: [{ key: 'lr', value: 0.01, type: 'float' }] });
    const exp2 = await service.create({ name: 'CompB', createdBy: 'u1', organizationId: 'org-1', hyperparameters: [{ key: 'lr', value: 0.001, type: 'float' }] });
    await service.transitionStatus(exp1.id, 'running');
    await service.transitionStatus(exp2.id, 'running');
    await service.logMetric(exp1.id, 'loss', 1.0, 0);
    await service.logMetric(exp1.id, 'loss', 0.8, 1);
    await service.logMetric(exp2.id, 'loss', 0.9, 0);

    const result = await service.compareExperiments([exp1.id, exp2.id]);
    expect(result.experiments).toHaveLength(2);
    expect(result.metricSummaries['loss']).toHaveLength(2);
    expect(result.hyperparameterDiff['lr']).toHaveLength(2);
  });

  test('rejects comparison with fewer than 2 IDs', async () => {
    const exp = await service.create({ name: 'Solo', createdBy: 'u1', organizationId: 'org-1' });
    await expect(service.compareExperiments([exp.id])).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects comparison with more than 20 IDs', async () => {
    const ids = Array.from({ length: 21 }, () => 'fake-id');
    await expect(service.compareExperiments(ids)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── Clone ─────────────────────────────────────────────────────────────────────

describe('ExperimentService.cloneExperiment', () => {
  test('clones an experiment preserving hyperparameters', async () => {
    const source = await service.create({
      name: 'OriginalExp',
      createdBy: 'u1',
      organizationId: 'org-1',
      hyperparameters: [{ key: 'lr', value: 0.01, type: 'float' }],
      tags: ['baseline'],
    });
    const clone = await service.cloneExperiment(source.id);
    expect(clone.name).toBe('OriginalExp (copy)');
    expect(clone.hyperparameters).toHaveLength(1);
    expect(clone.hyperparameters[0].key).toBe('lr');
    expect(clone.tags).toEqual(['baseline']);
    expect(clone.parentId).toBe(source.id);
    expect(clone.status).toBe('draft');
  });

  test('clones with custom name override', async () => {
    const source = await service.create({ name: 'Base', createdBy: 'u1', organizationId: 'org-1' });
    const clone = await service.cloneExperiment(source.id, { name: 'CustomClone' });
    expect(clone.name).toBe('CustomClone');
  });

  test('rejects clone if resulting name already exists', async () => {
    await service.create({ name: 'Source (copy)', createdBy: 'u1', organizationId: 'org-1' });
    const source = await service.create({ name: 'Source', createdBy: 'u1', organizationId: 'org-1' });
    await expect(service.cloneExperiment(source.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

// ── Health ────────────────────────────────────────────────────────────────────

describe('ExperimentService.health', () => {
  test('returns ok status with counts', async () => {
    await service.create({ name: 'H1', createdBy: 'u1', organizationId: 'org-1' });
    const h = await service.health();
    expect(h.status).toBe('ok');
    expect(h.service).toBe('experiment-tracker');
    expect(h.experimentCount).toBe(1);
    expect(h.metricCount).toBe(0);
  });
});
