// R009 Evensong III — Model Registry Unit Tests (core)
import { describe, it, expect, beforeEach } from 'bun:test';
import { ModelRegistryService } from '../src/index.ts';
import {
  validateSemver,
  compareSemver,
  canPromote,
  getNextStage,
  canDemote,
} from '../src/index.ts';
import { NotFoundError, ValidationError, ConflictError, AuthorizationError } from '../../../shared/errors.ts';
import { EventBus } from '../../../shared/events.ts';
import { createUser } from '../../../shared/auth.ts';

let svc: ModelRegistryService;
let bus: EventBus;

function makeModelInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'bert-base',
    description: 'BERT base model',
    framework: 'pytorch' as const,
    task: 'text-classification',
    tags: ['nlp', 'bert'],
    ownerId: 'user-1',
    organizationId: 'org-1',
    ...overrides,
  };
}

function makeVersionInput(modelId: string, overrides: Record<string, unknown> = {}) {
  return {
    modelId,
    version: '1.0.0',
    description: 'Initial version',
    metrics: { accuracy: 0.92, f1: 0.91 },
    hyperparams: { lr: 0.001, epochs: 10 },
    createdBy: 'user-1',
    ...overrides,
  };
}

beforeEach(() => {
  bus = new EventBus();
  svc = new ModelRegistryService(bus);
});

// ─── Model Registration ───────────────────────────────────────────────────────

describe('registerModel', () => {
  it('registers a model with required fields', async () => {
    const model = await svc.registerModel(makeModelInput());
    expect(model.id).toBeTruthy();
    expect(model.name).toBe('bert-base');
    expect(model.framework).toBe('pytorch');
    expect(model.task).toBe('text-classification');
    expect(model.latestVersionId).toBeNull();
    expect(model.activeVersionId).toBeNull();
  });

  it('stores createdAt and updatedAt as ISO strings', async () => {
    const model = await svc.registerModel(makeModelInput());
    expect(() => new Date(model.createdAt)).not.toThrow();
    expect(() => new Date(model.updatedAt)).not.toThrow();
  });

  it('trims whitespace from name and task', async () => {
    const model = await svc.registerModel(makeModelInput({ name: '  my-model  ', task: '  classification  ' }));
    expect(model.name).toBe('my-model');
    expect(model.task).toBe('classification');
  });

  it('rejects empty name', async () => {
    await expect(svc.registerModel(makeModelInput({ name: '' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.registerModel(makeModelInput({ name: '   ' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects empty task', async () => {
    await expect(svc.registerModel(makeModelInput({ task: '' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects duplicate name within same org', async () => {
    await svc.registerModel(makeModelInput());
    await expect(svc.registerModel(makeModelInput())).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows same name in different orgs', async () => {
    await svc.registerModel(makeModelInput({ organizationId: 'org-1' }));
    const m2 = await svc.registerModel(makeModelInput({ organizationId: 'org-2' }));
    expect(m2.organizationId).toBe('org-2');
  });

  it('requires write permission', async () => {
    await expect(svc.registerModel(makeModelInput(), ['viewer'])).rejects.toBeInstanceOf(AuthorizationError);
    await expect(svc.registerModel(makeModelInput(), ['reviewer'])).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('publishes model.registered event', async () => {
    const events: string[] = [];
    bus.subscribe('model.registered', e => { events.push(e.type); });
    await svc.registerModel(makeModelInput());
    expect(events).toHaveLength(1);
    expect(events[0]).toBe('model.registered');
  });
});

// ─── getModel ─────────────────────────────────────────────────────────────────

describe('getModel', () => {
  it('retrieves registered model by id', async () => {
    const created = await svc.registerModel(makeModelInput());
    const found = await svc.getModel(created.id);
    expect(found.id).toBe(created.id);
    expect(found.name).toBe('bert-base');
  });

  it('throws NotFoundError for unknown id', async () => {
    await expect(svc.getModel('nonexistent')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── listModels ───────────────────────────────────────────────────────────────

describe('listModels', () => {
  beforeEach(async () => {
    await svc.registerModel(makeModelInput({ name: 'model-a', framework: 'pytorch', task: 'nlp', tags: ['nlp'] }));
    await svc.registerModel(makeModelInput({ name: 'model-b', framework: 'tensorflow', task: 'cv', tags: ['cv'] }));
    await svc.registerModel(makeModelInput({ name: 'model-c', framework: 'pytorch', task: 'nlp', organizationId: 'org-2', tags: ['nlp'] }));
  });

  it('lists all models without filter', async () => {
    const models = await svc.listModels();
    expect(models).toHaveLength(3);
  });

  it('filters by framework', async () => {
    const models = await svc.listModels({ framework: 'pytorch' });
    expect(models).toHaveLength(2);
    models.forEach(m => expect(m.framework).toBe('pytorch'));
  });

  it('filters by task', async () => {
    const models = await svc.listModels({ task: 'cv' });
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('model-b');
  });

  it('filters by organizationId', async () => {
    const models = await svc.listModels({ organizationId: 'org-1' });
    expect(models).toHaveLength(2);
  });

  it('filters by tag', async () => {
    const models = await svc.listModels({ tag: 'nlp' });
    expect(models).toHaveLength(2);
  });
});

// ─── deleteModel ──────────────────────────────────────────────────────────────

describe('deleteModel', () => {
  it('deletes model and cascades to versions and artifacts', async () => {
    const model = await svc.registerModel(makeModelInput());
    const v = await svc.createVersion(makeVersionInput(model.id));
    await svc.addArtifact({
      modelId: model.id,
      versionId: v.id,
      type: 'weights',
      name: 'model.pt',
      uri: 's3://bucket/model.pt',
      sizeBytes: 1024,
      checksum: 'abc123',
      createdBy: 'user-1',
    });

    await svc.deleteModel(model.id, ['admin']);
    await expect(svc.getModel(model.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.getVersion(v.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('requires delete permission', async () => {
    const model = await svc.registerModel(makeModelInput());
    await expect(svc.deleteModel(model.id, ['researcher'])).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('throws NotFoundError for nonexistent model', async () => {
    await expect(svc.deleteModel('no-such-model', ['admin'])).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── createVersion ────────────────────────────────────────────────────────────

describe('createVersion', () => {
  let modelId: string;

  beforeEach(async () => {
    const m = await svc.registerModel(makeModelInput());
    modelId = m.id;
  });

  it('creates a version in draft stage', async () => {
    const v = await svc.createVersion(makeVersionInput(modelId));
    expect(v.stage).toBe('draft');
    expect(v.version).toBe('1.0.0');
    expect(v.parentVersionId).toBeNull();
  });

  it('updates model latestVersionId after creation', async () => {
    await svc.createVersion(makeVersionInput(modelId, { version: '1.0.0' }));
    await svc.createVersion(makeVersionInput(modelId, { version: '2.0.0' }));
    const model = await svc.getModel(modelId);
    const latest = await svc.getVersion(model.latestVersionId!);
    expect(latest.version).toBe('2.0.0');
  });

  it('rejects duplicate version string for same model', async () => {
    await svc.createVersion(makeVersionInput(modelId));
    await expect(svc.createVersion(makeVersionInput(modelId))).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects invalid semver', async () => {
    await expect(svc.createVersion(makeVersionInput(modelId, { version: '1.0' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.createVersion(makeVersionInput(modelId, { version: 'v1.0.0' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.createVersion(makeVersionInput(modelId, { version: '1.0.0.0' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts valid parentVersionId', async () => {
    const parent = await svc.createVersion(makeVersionInput(modelId, { version: '1.0.0' }));
    const child = await svc.createVersion(makeVersionInput(modelId, { version: '1.1.0', parentVersionId: parent.id }));
    expect(child.parentVersionId).toBe(parent.id);
  });

  it('rejects parentVersionId from different model', async () => {
    const m2 = await svc.registerModel(makeModelInput({ name: 'other', organizationId: 'org-2' }));
    const otherV = await svc.createVersion(makeVersionInput(m2.id, { version: '1.0.0' }));
    await expect(
      svc.createVersion(makeVersionInput(modelId, { version: '1.1.0', parentVersionId: otherV.id }))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws for nonexistent model', async () => {
    await expect(svc.createVersion(makeVersionInput('bad-model-id'))).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── listVersions ─────────────────────────────────────────────────────────────

describe('listVersions', () => {
  let modelId: string;

  beforeEach(async () => {
    const m = await svc.registerModel(makeModelInput());
    modelId = m.id;
    await svc.createVersion(makeVersionInput(modelId, { version: '1.0.0', createdBy: 'alice' }));
    await svc.createVersion(makeVersionInput(modelId, { version: '1.1.0', createdBy: 'bob' }));
    await svc.createVersion(makeVersionInput(modelId, { version: '2.0.0', createdBy: 'alice' }));
  });

  it('lists versions sorted by semver descending', async () => {
    const versions = await svc.listVersions(modelId);
    expect(versions[0].version).toBe('2.0.0');
    expect(versions[1].version).toBe('1.1.0');
    expect(versions[2].version).toBe('1.0.0');
  });

  it('filters by stage', async () => {
    const versions = await svc.listVersions(modelId, { stage: 'draft' });
    expect(versions).toHaveLength(3);
    const staged = await svc.listVersions(modelId, { stage: 'staging' });
    expect(staged).toHaveLength(0);
  });

  it('filters by createdBy', async () => {
    const versions = await svc.listVersions(modelId, { createdBy: 'alice' });
    expect(versions).toHaveLength(2);
  });
});

// ─── promoteVersion ───────────────────────────────────────────────────────────

describe('promoteVersion', () => {
  let modelId: string;
  let versionId: string;

  beforeEach(async () => {
    const m = await svc.registerModel(makeModelInput());
    modelId = m.id;
    const v = await svc.createVersion(makeVersionInput(modelId));
    versionId = v.id;
  });

  it('promotes draft → staging', async () => {
    const v = await svc.promoteVersion(versionId);
    expect(v.stage).toBe('staging');
    expect(v.promotedAt).not.toBeNull();
  });

  it('promotes staging → production and sets activeVersionId', async () => {
    await svc.promoteVersion(versionId); // draft → staging
    await svc.promoteVersion(versionId); // staging → production
    const model = await svc.getModel(modelId);
    expect(model.activeVersionId).toBe(versionId);
  });

  it('promotes production → archived and clears activeVersionId', async () => {
    await svc.promoteVersion(versionId); // → staging
    await svc.promoteVersion(versionId); // → production
    await svc.promoteVersion(versionId); // → archived
    const v = await svc.getVersion(versionId);
    expect(v.stage).toBe('archived');
    expect(v.archivedAt).not.toBeNull();
    const model = await svc.getModel(modelId);
    expect(model.activeVersionId).toBeNull();
  });

  it('throws when promoting from archived (no forward path)', async () => {
    await svc.promoteVersion(versionId); // draft → staging
    await svc.promoteVersion(versionId); // staging → production
    await svc.promoteVersion(versionId); // production → archived
    await expect(svc.promoteVersion(versionId)).rejects.toBeInstanceOf(ValidationError);
  });

  it('publishes model.version.promoted event', async () => {
    const events: string[] = [];
    bus.subscribe('model.version.promoted', e => events.push(e.type));
    await svc.promoteVersion(versionId);
    expect(events).toHaveLength(1);
  });
});

// ─── demoteVersion ────────────────────────────────────────────────────────────

describe('demoteVersion', () => {
  let modelId: string;
  let versionId: string;

  beforeEach(async () => {
    const m = await svc.registerModel(makeModelInput());
    modelId = m.id;
    const v = await svc.createVersion(makeVersionInput(modelId));
    versionId = v.id;
    await svc.promoteVersion(versionId); // draft → staging
    await svc.promoteVersion(versionId); // staging → production
  });

  it('admin can demote production → staging', async () => {
    const v = await svc.demoteVersion(versionId, 'staging', ['admin']);
    expect(v.stage).toBe('staging');
  });

  it('admin can demote production → draft', async () => {
    const v = await svc.demoteVersion(versionId, 'draft', ['admin']);
    expect(v.stage).toBe('draft');
  });

  it('clears activeVersionId when demoting from production', async () => {
    await svc.demoteVersion(versionId, 'staging', ['admin']);
    const model = await svc.getModel(modelId);
    expect(model.activeVersionId).toBeNull();
  });

  it('rejects invalid demote path (cannot go forward via demote)', async () => {
    // version is in production; cannot "demote" to archived (that's promotion)
    await expect(svc.demoteVersion(versionId, 'archived', ['admin'])).rejects.toBeInstanceOf(ValidationError);
  });

  it('requires manage permission', async () => {
    await expect(svc.demoteVersion(versionId, 'staging', ['researcher'])).rejects.toBeInstanceOf(AuthorizationError);
  });
});
