import { describe, test, expect, beforeEach } from 'bun:test';
import { ExperimentService } from '../src/index.ts';
import { EventBus } from '../../../shared/events.ts';
import { ValidationError, ConflictError, AppError } from '../../../shared/errors.ts';

let service: ExperimentService;

beforeEach(() => {
  service = new ExperimentService(new EventBus());
});

// ── Name edge cases ───────────────────────────────────────────────────────────

describe('Name edge cases', () => {
  test('name at maximum length (200 chars) is accepted', async () => {
    const longName = 'A'.repeat(200);
    const exp = await service.create({ name: longName, createdBy: 'u1', organizationId: 'org-1' });
    expect(exp.name).toBe(longName);
  });

  test('name exceeding 200 chars is rejected', async () => {
    const tooLong = 'A'.repeat(201);
    await expect(service.create({ name: tooLong, createdBy: 'u1', organizationId: 'org-1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('whitespace-only name is rejected', async () => {
    await expect(service.create({ name: '   ', createdBy: 'u1', organizationId: 'org-1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('Unicode name with emoji is accepted', async () => {
    const unicodeName = '实验 🔬 Experiment-α';
    const exp = await service.create({ name: unicodeName, createdBy: 'u1', organizationId: 'org-1' });
    expect(exp.name).toBe(unicodeName);
  });

  test('name with special characters (slashes, dots, brackets) is accepted', async () => {
    const specialName = 'exp/v2.3 [trial#1] {config}';
    const exp = await service.create({ name: specialName, createdBy: 'u1', organizationId: 'org-1' });
    expect(exp.name).toBe(specialName);
  });
});

// ── Description edge cases ────────────────────────────────────────────────────

describe('Description edge cases', () => {
  test('description at maximum length (2000 chars) is accepted', async () => {
    const longDesc = 'D'.repeat(2000);
    const exp = await service.create({ name: 'DescMax', createdBy: 'u1', organizationId: 'org-1', description: longDesc });
    expect(exp.description).toBe(longDesc);
  });

  test('description exceeding 2000 chars is rejected', async () => {
    const tooLong = 'D'.repeat(2001);
    await expect(service.create({ name: 'DescOver', createdBy: 'u1', organizationId: 'org-1', description: tooLong }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('empty string description is accepted', async () => {
    const exp = await service.create({ name: 'EmptyDesc', createdBy: 'u1', organizationId: 'org-1', description: '' });
    expect(exp.description).toBe('');
  });
});

// ── Tags edge cases ───────────────────────────────────────────────────────────

describe('Tags edge cases', () => {
  test('exactly 50 tags are accepted', async () => {
    const tags = Array.from({ length: 50 }, (_, i) => `tag-${i}`);
    const exp = await service.create({ name: 'MaxTags', createdBy: 'u1', organizationId: 'org-1', tags });
    expect(exp.tags).toHaveLength(50);
  });

  test('51 tags are rejected', async () => {
    const tags = Array.from({ length: 51 }, (_, i) => `tag-${i}`);
    await expect(service.create({ name: 'TooManyTags', createdBy: 'u1', organizationId: 'org-1', tags }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('tag with maximum length (100 chars) is accepted', async () => {
    const longTag = 'T'.repeat(100);
    const exp = await service.create({ name: 'LongTag', createdBy: 'u1', organizationId: 'org-1', tags: [longTag] });
    expect(exp.tags[0]).toBe(longTag);
  });

  test('tag exceeding 100 chars is rejected', async () => {
    const tooLong = 'T'.repeat(101);
    await expect(service.create({ name: 'LongTagOver', createdBy: 'u1', organizationId: 'org-1', tags: [tooLong] }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('empty string tag is rejected', async () => {
    await expect(service.create({ name: 'EmptyTag', createdBy: 'u1', organizationId: 'org-1', tags: ['valid', ''] }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  test('non-string tag is rejected', async () => {
    await expect(service.create({ name: 'NonStringTag', createdBy: 'u1', organizationId: 'org-1', tags: [42 as unknown as string] }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

// ── Hyperparameter edge cases ─────────────────────────────────────────────────

describe('Hyperparameter edge cases', () => {
  test('duplicate hyperparameter keys in create input are rejected', async () => {
    await expect(service.create({
      name: 'DupHPCreate',
      createdBy: 'u1',
      organizationId: 'org-1',
      hyperparameters: [
        { key: 'lr', value: 0.01, type: 'float' },
        { key: 'lr', value: 0.001, type: 'float' },
      ],
    })).rejects.toBeInstanceOf(ValidationError);
  });

  test('hyperparameter with invalid type is rejected', async () => {
    await expect(service.create({
      name: 'BadHPType',
      createdBy: 'u1',
      organizationId: 'org-1',
      hyperparameters: [{ key: 'x', value: 1, type: 'tensor' as 'float' }],
    })).rejects.toBeInstanceOf(ValidationError);
  });

  test('hyperparameter with null value is rejected', async () => {
    await expect(service.create({
      name: 'NullHP',
      createdBy: 'u1',
      organizationId: 'org-1',
      hyperparameters: [{ key: 'x', value: null as unknown as number, type: 'float' }],
    })).rejects.toBeInstanceOf(ValidationError);
  });

  test('zero value hyperparameter is accepted', async () => {
    const exp = await service.create({
      name: 'ZeroHP',
      createdBy: 'u1',
      organizationId: 'org-1',
      hyperparameters: [{ key: 'dropout', value: 0, type: 'float' }],
    });
    expect(exp.hyperparameters[0].value).toBe(0);
  });

  test('false boolean hyperparameter is accepted', async () => {
    const exp = await service.create({
      name: 'FalseHP',
      createdBy: 'u1',
      organizationId: 'org-1',
      hyperparameters: [{ key: 'use_aug', value: false, type: 'bool' }],
    });
    expect(exp.hyperparameters[0].value).toBe(false);
  });
});

// ── Status machine boundary cases ─────────────────────────────────────────────

describe('Status machine boundary cases', () => {
  test('draft → failed transition is invalid', async () => {
    const exp = await service.create({ name: 'DraftFail', createdBy: 'u1', organizationId: 'org-1' });
    await expect(service.transitionStatus(exp.id, 'failed')).rejects.toBeInstanceOf(AppError);
  });

  test('failed → completed transition is invalid', async () => {
    const exp = await service.create({ name: 'FailComp', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await service.transitionStatus(exp.id, 'failed');
    await expect(service.transitionStatus(exp.id, 'completed')).rejects.toBeInstanceOf(AppError);
  });

  test('completed → failed transition is invalid', async () => {
    const exp = await service.create({ name: 'CompFail', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await service.transitionStatus(exp.id, 'completed');
    await expect(service.transitionStatus(exp.id, 'failed')).rejects.toBeInstanceOf(AppError);
  });

  test('finishedAt is set when transitioning to failed', async () => {
    const exp = await service.create({ name: 'FailTime', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    const failed = await service.transitionStatus(exp.id, 'failed');
    expect(failed.finishedAt).toBeTruthy();
    expect(new Date(failed.finishedAt!).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

// ── Metric logging boundary cases ─────────────────────────────────────────────

describe('Metric boundary cases', () => {
  test('step 0 is accepted', async () => {
    const exp = await service.create({ name: 'Step0', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    const m = await service.logMetric(exp.id, 'loss', 0.5, 0);
    expect(m.step).toBe(0);
  });

  test('very large step value is accepted', async () => {
    const exp = await service.create({ name: 'LargeStep', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    const m = await service.logMetric(exp.id, 'loss', 0.1, 1_000_000);
    expect(m.step).toBe(1_000_000);
  });

  test('metric name with unicode characters is accepted', async () => {
    const exp = await service.create({ name: 'UniMetric', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    const m = await service.logMetric(exp.id, '损失/train', 0.5, 0);
    expect(m.name).toBe('损失/train');
  });

  test('negative metric value is accepted (valid for some metrics)', async () => {
    const exp = await service.create({ name: 'NegMetric', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    const m = await service.logMetric(exp.id, 'grad_norm', -0.001, 0);
    expect(m.value).toBe(-0.001);
  });

  test('float step is rejected', async () => {
    const exp = await service.create({ name: 'FloatStep', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp.id, 'running');
    await expect(service.logMetric(exp.id, 'loss', 0.5, 1.5)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── Compare edge cases ────────────────────────────────────────────────────────

describe('Compare edge cases', () => {
  test('experiments with no overlapping metrics still compare correctly', async () => {
    const exp1 = await service.create({ name: 'CmpX', createdBy: 'u1', organizationId: 'org-1' });
    const exp2 = await service.create({ name: 'CmpY', createdBy: 'u1', organizationId: 'org-1' });
    await service.transitionStatus(exp1.id, 'running');
    await service.transitionStatus(exp2.id, 'running');
    await service.logMetric(exp1.id, 'train_loss', 1.0, 0);
    await service.logMetric(exp2.id, 'val_loss', 0.8, 0);

    const result = await service.compareExperiments([exp1.id, exp2.id]);
    // train_loss exists in exp1, val_loss exists in exp2
    expect(result.metricSummaries['train_loss']).toBeDefined();
    expect(result.metricSummaries['val_loss']).toBeDefined();
    // count for the experiment that doesn't have the metric should be 0
    const trainLossSummaries = result.metricSummaries['train_loss'];
    const expWithoutTrain = trainLossSummaries.find((_, idx) => result.experiments[idx].id === exp2.id);
    expect(expWithoutTrain?.count).toBe(0);
  });

  test('comparison includes hyperparameter diff for missing keys', async () => {
    const exp1 = await service.create({
      name: 'DiffHP1', createdBy: 'u1', organizationId: 'org-1',
      hyperparameters: [{ key: 'lr', value: 0.01, type: 'float' }],
    });
    const exp2 = await service.create({ name: 'DiffHP2', createdBy: 'u1', organizationId: 'org-1' });

    const result = await service.compareExperiments([exp1.id, exp2.id]);
    const lrDiff = result.hyperparameterDiff['lr'];
    expect(lrDiff).toBeDefined();
    const exp2Entry = lrDiff.find(e => e.experimentId === exp2.id);
    expect(exp2Entry?.value).toBeUndefined();
  });
});
