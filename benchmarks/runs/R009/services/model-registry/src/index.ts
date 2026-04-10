// R009 Evensong III — Model Registry Service
import { randomUUID } from 'crypto';
import { InMemoryStore } from '../../../shared/db.ts';
import { NotFoundError, ValidationError, ConflictError, AuthorizationError } from '../../../shared/errors.ts';
import { createLogger, Logger } from '../../../shared/logger.ts';
import { EventBus, DomainEvent, eventBus as globalEventBus } from '../../../shared/events.ts';
import { Role, requirePermission } from '../../../shared/auth.ts';

// ─── Domain Types ────────────────────────────────────────────────────────────

export type DeploymentStage = 'draft' | 'staging' | 'production' | 'archived';

export type ModelFramework =
  | 'pytorch'
  | 'tensorflow'
  | 'jax'
  | 'onnx'
  | 'sklearn'
  | 'other';

export type ArtifactType =
  | 'weights'
  | 'checkpoint'
  | 'config'
  | 'tokenizer'
  | 'onnx_export'
  | 'other';

export interface Model {
  id: string;
  name: string;
  description: string;
  framework: ModelFramework;
  task: string; // e.g. 'text-classification', 'image-segmentation'
  tags: string[];
  ownerId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  latestVersionId: string | null;
  activeVersionId: string | null; // currently in production
}

export interface ModelVersion {
  id: string;
  modelId: string;
  version: string; // semver: major.minor.patch
  stage: DeploymentStage;
  description: string;
  parentVersionId: string | null; // lineage
  metrics: Record<string, number>; // e.g. { accuracy: 0.95, f1: 0.93 }
  hyperparams: Record<string, unknown>;
  trainingDatasetId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  promotedAt: string | null;
  archivedAt: string | null;
}

export interface Artifact {
  id: string;
  modelId: string;
  versionId: string;
  type: ArtifactType;
  name: string;
  uri: string; // storage URI
  sizeBytes: number;
  checksum: string; // sha256
  contentType: string;
  createdBy: string;
  createdAt: string;
}

export interface ModelLineage {
  modelId: string;
  versionId: string;
  version: string;
  stage: DeploymentStage;
  parentVersionId: string | null;
  children: ModelLineage[];
}

export interface ComparisonResult {
  versionA: Pick<ModelVersion, 'id' | 'version' | 'stage' | 'metrics'>;
  versionB: Pick<ModelVersion, 'id' | 'version' | 'stage' | 'metrics'>;
  metricDiffs: Record<string, { a: number; b: number; delta: number; pctChange: number }>;
  winner: 'a' | 'b' | 'tie' | 'insufficient_data';
}

// ─── Stage Machine ────────────────────────────────────────────────────────────

const FORWARD_TRANSITIONS: Record<DeploymentStage, DeploymentStage | null> = {
  draft: 'staging',
  staging: 'production',
  production: 'archived',
  archived: null,
};

// Admin rollback paths (non-forward only)
const ADMIN_ROLLBACK_TRANSITIONS: Record<DeploymentStage, DeploymentStage[]> = {
  draft: [],
  staging: ['draft'],
  production: ['staging', 'draft'],
  archived: ['production', 'staging', 'draft'],
};

export function canPromote(current: DeploymentStage): boolean {
  return FORWARD_TRANSITIONS[current] !== null;
}

export function getNextStage(current: DeploymentStage): DeploymentStage {
  const next = FORWARD_TRANSITIONS[current];
  if (!next) throw new ValidationError(`Cannot promote from stage '${current}': no forward stage`);
  return next;
}

export function canDemote(current: DeploymentStage, target: DeploymentStage): boolean {
  return ADMIN_ROLLBACK_TRANSITIONS[current].includes(target);
}

// ─── Semver Validation ────────────────────────────────────────────────────────

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validateSemver(version: string): void {
  if (!SEMVER_RE.test(version)) {
    throw new ValidationError(`Invalid semantic version '${version}': must match major.minor.patch`);
  }
}

export function compareSemver(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = a.split('.').map(Number);
  const [bMaj, bMin, bPatch] = b.split('.').map(Number);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface RegisterModelInput {
  name: string;
  description?: string;
  framework: ModelFramework;
  task: string;
  tags?: string[];
  ownerId: string;
  organizationId: string;
}

export interface CreateVersionInput {
  modelId: string;
  version: string;
  description?: string;
  parentVersionId?: string;
  metrics?: Record<string, number>;
  hyperparams?: Record<string, unknown>;
  trainingDatasetId?: string;
  createdBy: string;
}

export interface AddArtifactInput {
  modelId: string;
  versionId: string;
  type: ArtifactType;
  name: string;
  uri: string;
  sizeBytes: number;
  checksum: string;
  contentType?: string;
  createdBy: string;
}

export interface ListModelsFilter {
  framework?: ModelFramework;
  task?: string;
  organizationId?: string;
  tag?: string;
}

export interface ListVersionsFilter {
  stage?: DeploymentStage;
  createdBy?: string;
}

export class ModelRegistryService {
  private models: InMemoryStore<Model>;
  private versions: InMemoryStore<ModelVersion>;
  private artifacts: InMemoryStore<Artifact>;
  private logger: Logger;
  private bus: EventBus;

  constructor(bus?: EventBus) {
    this.models = new InMemoryStore<Model>();
    this.versions = new InMemoryStore<ModelVersion>();
    this.artifacts = new InMemoryStore<Artifact>();
    this.logger = createLogger('model-registry');
    this.bus = bus ?? globalEventBus;
  }

  // ── Model CRUD ──────────────────────────────────────────────────────────────

  async registerModel(input: RegisterModelInput, actorRoles: Role[] = ['researcher']): Promise<Model> {
    requirePermission(actorRoles, 'write');

    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('Model name is required');
    }
    if (!input.framework) {
      throw new ValidationError('Model framework is required');
    }
    if (!input.task || input.task.trim().length === 0) {
      throw new ValidationError('Model task is required');
    }

    // Check name uniqueness within org
    const existing = await this.models.findAll(
      m => m.name === input.name.trim() && m.organizationId === input.organizationId
    );
    if (existing.length > 0) {
      throw new ConflictError(`Model '${input.name}' already exists in organization '${input.organizationId}'`);
    }

    const now = new Date().toISOString();
    const model: Model = {
      id: randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      framework: input.framework,
      task: input.task.trim(),
      tags: input.tags ?? [],
      ownerId: input.ownerId,
      organizationId: input.organizationId,
      createdAt: now,
      updatedAt: now,
      latestVersionId: null,
      activeVersionId: null,
    };

    const saved = await this.models.insert(model);
    this.logger.info('Model registered', { modelId: saved.id, name: saved.name });

    await this.publishEvent('model.registered', { modelId: saved.id, name: saved.name });
    return saved;
  }

  async getModel(id: string): Promise<Model> {
    const model = await this.models.findById(id);
    if (!model) throw new NotFoundError('Model', id);
    return model;
  }

  async listModels(filter?: ListModelsFilter): Promise<Model[]> {
    return this.models.findAll(m => {
      if (filter?.framework && m.framework !== filter.framework) return false;
      if (filter?.task && m.task !== filter.task) return false;
      if (filter?.organizationId && m.organizationId !== filter.organizationId) return false;
      if (filter?.tag && !m.tags.includes(filter.tag)) return false;
      return true;
    });
  }

  async deleteModel(id: string, actorRoles: Role[] = ['admin']): Promise<void> {
    requirePermission(actorRoles, 'delete');

    const model = await this.getModel(id);

    // Delete associated artifacts and versions
    const modelVersions = await this.versions.findAll(v => v.modelId === id);
    for (const v of modelVersions) {
      const vArtifacts = await this.artifacts.findAll(a => a.versionId === v.id);
      for (const a of vArtifacts) {
        await this.artifacts.delete(a.id);
      }
      await this.versions.delete(v.id);
    }

    await this.models.delete(id);
    this.logger.info('Model deleted', { modelId: id, name: model.name });
    await this.publishEvent('model.deleted', { modelId: id });
  }

  // ── Version Management ──────────────────────────────────────────────────────

  async createVersion(input: CreateVersionInput, actorRoles: Role[] = ['researcher']): Promise<ModelVersion> {
    requirePermission(actorRoles, 'write');

    // Validate model exists
    await this.getModel(input.modelId);

    // Validate semver
    validateSemver(input.version);

    // Check version uniqueness within model
    const existing = await this.versions.findAll(
      v => v.modelId === input.modelId && v.version === input.version
    );
    if (existing.length > 0) {
      throw new ConflictError(`Version '${input.version}' already exists for model '${input.modelId}'`);
    }

    // Validate parent version if provided
    if (input.parentVersionId) {
      const parent = await this.versions.findById(input.parentVersionId);
      if (!parent) throw new NotFoundError('Parent version', input.parentVersionId);
      if (parent.modelId !== input.modelId) {
        throw new ValidationError('Parent version belongs to a different model');
      }
    }

    const now = new Date().toISOString();
    const version: ModelVersion = {
      id: randomUUID(),
      modelId: input.modelId,
      version: input.version,
      stage: 'draft',
      description: input.description?.trim() ?? '',
      parentVersionId: input.parentVersionId ?? null,
      metrics: input.metrics ?? {},
      hyperparams: input.hyperparams ?? {},
      trainingDatasetId: input.trainingDatasetId ?? null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
      promotedAt: null,
      archivedAt: null,
    };

    const saved = await this.versions.insert(version);

    // Update model's latestVersionId (highest semver)
    await this.updateModelLatestVersion(input.modelId);

    this.logger.info('Version created', { modelId: input.modelId, versionId: saved.id, version: saved.version });
    await this.publishEvent('model.version.created', {
      modelId: input.modelId,
      versionId: saved.id,
      version: saved.version,
    });

    return saved;
  }

  async getVersion(versionId: string): Promise<ModelVersion> {
    const version = await this.versions.findById(versionId);
    if (!version) throw new NotFoundError('ModelVersion', versionId);
    return version;
  }

  async listVersions(modelId: string, filter?: ListVersionsFilter): Promise<ModelVersion[]> {
    await this.getModel(modelId); // ensure model exists
    const versions = await this.versions.findAll(v => {
      if (v.modelId !== modelId) return false;
      if (filter?.stage && v.stage !== filter.stage) return false;
      if (filter?.createdBy && v.createdBy !== filter.createdBy) return false;
      return true;
    });
    return versions.sort((a, b) => compareSemver(b.version, a.version));
  }

  async promoteVersion(versionId: string, actorRoles: Role[] = ['researcher']): Promise<ModelVersion> {
    requirePermission(actorRoles, 'write');

    const version = await this.getVersion(versionId);
    const nextStage = getNextStage(version.stage);

    const now = new Date().toISOString();
    const updates: Partial<ModelVersion> = {
      stage: nextStage,
      updatedAt: now,
      promotedAt: now,
    };

    if (nextStage === 'archived') {
      updates.archivedAt = now;
    }

    const updated = await this.versions.update(versionId, updates);
    if (!updated) throw new NotFoundError('ModelVersion', versionId);

    // If promoted to production, update model's activeVersionId
    if (nextStage === 'production') {
      await this.models.update(version.modelId, { activeVersionId: versionId, updatedAt: now });
    }

    // If archived and was active, clear activeVersionId
    if (nextStage === 'archived') {
      const model = await this.getModel(version.modelId);
      if (model.activeVersionId === versionId) {
        await this.models.update(version.modelId, { activeVersionId: null, updatedAt: now });
      }
    }

    this.logger.info('Version promoted', {
      versionId,
      from: version.stage,
      to: nextStage,
    });

    await this.publishEvent('model.version.promoted', {
      modelId: version.modelId,
      versionId,
      fromStage: version.stage,
      toStage: nextStage,
    });

    return updated;
  }

  async demoteVersion(
    versionId: string,
    targetStage: DeploymentStage,
    actorRoles: Role[] = ['admin']
  ): Promise<ModelVersion> {
    requirePermission(actorRoles, 'manage');

    const version = await this.getVersion(versionId);

    if (!canDemote(version.stage, targetStage)) {
      throw new ValidationError(
        `Cannot demote version from '${version.stage}' to '${targetStage}': not a valid rollback path`
      );
    }

    const now = new Date().toISOString();
    const updated = await this.versions.update(versionId, {
      stage: targetStage,
      updatedAt: now,
    });
    if (!updated) throw new NotFoundError('ModelVersion', versionId);

    // If demoted from production, clear activeVersionId
    if (version.stage === 'production') {
      const model = await this.getModel(version.modelId);
      if (model.activeVersionId === versionId) {
        await this.models.update(version.modelId, { activeVersionId: null, updatedAt: now });
      }
    }

    this.logger.info('Version demoted (admin override)', {
      versionId,
      from: version.stage,
      to: targetStage,
    });

    await this.publishEvent('model.version.demoted', {
      modelId: version.modelId,
      versionId,
      fromStage: version.stage,
      toStage: targetStage,
    });

    return updated;
  }

  // ── Artifact Management ─────────────────────────────────────────────────────

  async addArtifact(input: AddArtifactInput, actorRoles: Role[] = ['researcher']): Promise<Artifact> {
    requirePermission(actorRoles, 'write');

    await this.getModel(input.modelId);
    const version = await this.getVersion(input.versionId);

    if (version.modelId !== input.modelId) {
      throw new ValidationError('Version does not belong to the specified model');
    }

    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('Artifact name is required');
    }
    if (!input.uri || input.uri.trim().length === 0) {
      throw new ValidationError('Artifact URI is required');
    }
    if (input.sizeBytes < 0) {
      throw new ValidationError('Artifact sizeBytes must be non-negative');
    }
    if (!input.checksum || input.checksum.trim().length === 0) {
      throw new ValidationError('Artifact checksum is required');
    }

    const artifact: Artifact = {
      id: randomUUID(),
      modelId: input.modelId,
      versionId: input.versionId,
      type: input.type,
      name: input.name.trim(),
      uri: input.uri.trim(),
      sizeBytes: input.sizeBytes,
      checksum: input.checksum.trim(),
      contentType: input.contentType ?? 'application/octet-stream',
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };

    const saved = await this.artifacts.insert(artifact);
    this.logger.info('Artifact added', { artifactId: saved.id, versionId: input.versionId });

    await this.publishEvent('model.artifact.added', {
      modelId: input.modelId,
      versionId: input.versionId,
      artifactId: saved.id,
      type: input.type,
    });

    return saved;
  }

  async getArtifacts(versionId: string, typeFilter?: ArtifactType): Promise<Artifact[]> {
    await this.getVersion(versionId); // ensure version exists
    return this.artifacts.findAll(a => {
      if (a.versionId !== versionId) return false;
      if (typeFilter && a.type !== typeFilter) return false;
      return true;
    });
  }

  // ── Comparison ──────────────────────────────────────────────────────────────

  async compareVersions(versionIdA: string, versionIdB: string): Promise<ComparisonResult> {
    const [vA, vB] = await Promise.all([
      this.getVersion(versionIdA),
      this.getVersion(versionIdB),
    ]);

    if (vA.modelId !== vB.modelId) {
      throw new ValidationError('Cannot compare versions from different models');
    }

    const metricDiffs: ComparisonResult['metricDiffs'] = {};
    const allKeys = new Set([...Object.keys(vA.metrics), ...Object.keys(vB.metrics)]);

    for (const key of allKeys) {
      const a = vA.metrics[key] ?? 0;
      const b = vB.metrics[key] ?? 0;
      const delta = b - a;
      const pctChange = a !== 0 ? (delta / Math.abs(a)) * 100 : 0;
      metricDiffs[key] = { a, b, delta, pctChange };
    }

    // Determine winner by average metric improvement
    let winner: ComparisonResult['winner'] = 'insufficient_data';
    const keys = Object.keys(metricDiffs);
    if (keys.length > 0) {
      const avgDelta = keys.reduce((sum, k) => sum + metricDiffs[k].delta, 0) / keys.length;
      if (Math.abs(avgDelta) < 1e-9) winner = 'tie';
      else winner = avgDelta > 0 ? 'b' : 'a';
    }

    return {
      versionA: { id: vA.id, version: vA.version, stage: vA.stage, metrics: vA.metrics },
      versionB: { id: vB.id, version: vB.version, stage: vB.stage, metrics: vB.metrics },
      metricDiffs,
      winner,
    };
  }

  // ── Lineage ─────────────────────────────────────────────────────────────────

  async getLineage(modelId: string): Promise<ModelLineage[]> {
    await this.getModel(modelId);
    const allVersions = await this.versions.findAll(v => v.modelId === modelId);
    return this.buildLineageTree(allVersions, null);
  }

  private buildLineageTree(
    versions: ModelVersion[],
    parentId: string | null
  ): ModelLineage[] {
    return versions
      .filter(v => v.parentVersionId === parentId)
      .map(v => ({
        modelId: v.modelId,
        versionId: v.id,
        version: v.version,
        stage: v.stage,
        parentVersionId: v.parentVersionId,
        children: this.buildLineageTree(versions, v.id),
      }));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async updateModelLatestVersion(modelId: string): Promise<void> {
    const allVersions = await this.versions.findAll(v => v.modelId === modelId);
    if (allVersions.length === 0) {
      await this.models.update(modelId, { latestVersionId: null, updatedAt: new Date().toISOString() });
      return;
    }
    const latest = allVersions.reduce((best, v) =>
      compareSemver(v.version, best.version) > 0 ? v : best
    );
    await this.models.update(modelId, {
      latestVersionId: latest.id,
      updatedAt: new Date().toISOString(),
    });
  }

  private async publishEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    const event: DomainEvent = {
      id: randomUUID(),
      type,
      source: 'model-registry',
      timestamp: new Date().toISOString(),
      correlationId: randomUUID(),
      payload,
    };
    await this.bus.publish(event);
  }

  // ── Test helpers ─────────────────────────────────────────────────────────────

  _resetForTesting(): void {
    this.models.clear();
    this.versions.clear();
    this.artifacts.clear();
  }
}
