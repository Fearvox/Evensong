// R009 Integration Tests — Chains 5–7
// Chain 5: Model → Compute → Audit
// Chain 6: Dataset → Paper → Review (conflict detection)
// Chain 7: Full Pipeline: Dataset → Experiment → Training → Model → Deploy → Audit

import { describe, test, expect, beforeEach } from 'bun:test';
import { ModelRegistryService } from '../services/model-registry/src/index.ts';
import { ComputeSchedulerService } from '../services/compute-scheduler/src/index.ts';
import { AuditTrailService } from '../services/audit-trail/src/index.ts';
import { DatasetVaultService } from '../services/dataset-vault/src/index.ts';
import { PaperEngineService } from '../services/paper-engine/src/index.ts';
import { ReviewSystemService } from '../services/review-system/src/index.ts';
import { ExperimentService } from '../services/experiment-tracker/src/index.ts';
import { TrainingPipelineService } from '../services/training-pipeline/src/index.ts';
import { InsightEngineService } from '../services/insight-engine/src/index.ts';
import { EventBus, eventBus } from '../shared/events.ts';
import * as CollabHub from '../services/collab-hub/src/index.ts';

const ORG = 'org-test';
const USER = 'user-test';
const EMAIL = 'user@test.org';

// ─── Chain 5: Model → Compute → Audit ────────────────────────────────────────

describe('Chain 5: Model → Compute → Audit', () => {
  let bus: EventBus;
  let registry: ModelRegistryService;
  let scheduler: ComputeSchedulerService;
  let audit: AuditTrailService;

  beforeEach(() => {
    bus = new EventBus();
    registry = new ModelRegistryService(bus);
    scheduler = new ComputeSchedulerService(bus);
    audit = new AuditTrailService(bus);
    registry._resetForTesting();
    scheduler._resetForTesting();
    audit._resetForTesting();
  });

  const mkModel = (name: string) => registry.registerModel({ name, framework: 'pytorch', task: 'cls', ownerId: USER, organizationId: ORG });
  const mkJob = (name: string) => scheduler.submitJob({ name, userId: USER, priority: 'high', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 2 });
  const logAudit = (audit: AuditTrailService, type: 'create'|'update'|'delete', resourceType: string, resourceId: string, action: string) =>
    audit.logEvent({ eventType: type, userId: USER, userEmail: EMAIL, userRoles: ['researcher'], organizationId: ORG, resourceType, resourceId, action, outcome: 'success' });

  test('5.1 register model and submit GPU job with model metadata', async () => {
    const model = await mkModel('Inf-Model-A');
    const job = await scheduler.submitJob({ name: `infer-${model.id}`, userId: USER, priority: 'high', resources: { type: 'A100', count: 2 }, estimatedDurationHours: 2, metadata: { modelId: model.id } });
    expect(job.status).toBe('queued');
    expect(job.metadata?.modelId).toBe(model.id);
  });

  test('5.2 GPU allocation transitions job to running state', async () => {
    const job = await mkJob('gpu-run');
    const alloc = await scheduler.allocateGPU(job.id, { type: 'A100', count: 1 });
    expect(alloc.status).toBe('active');
    expect(alloc.costEstimate).toBeGreaterThan(0);
  });

  test('5.3 release GPU marks allocation as released', async () => {
    const job = await mkJob('release-job');
    const alloc = await scheduler.allocateGPU(job.id, { type: 'A100', count: 1 });
    const released = await scheduler.releaseGPU(alloc.id);
    expect(released.status).toBe('released');
    expect(released.releasedAt).toBeTruthy();
  });

  test('5.4 audit log records model registration', async () => {
    const model = await mkModel('Audit-Model');
    const record = await logAudit(audit, 'create', 'model', model.id, 'registerModel');
    expect(record.resourceId).toBe(model.id);
    expect(record.sequenceNumber).toBe(1);
    expect(record.outcome).toBe('success');
  });

  test('5.5 audit logs GPU alloc and release with sequential integrity', async () => {
    const job = await mkJob('audit-alloc-job');
    const alloc = await scheduler.allocateGPU(job.id, { type: 'A100', count: 1 });
    await logAudit(audit, 'create', 'gpu_allocation', alloc.id, 'allocateGPU');
    await scheduler.releaseGPU(alloc.id);
    await logAudit(audit, 'update', 'gpu_allocation', alloc.id, 'releaseGPU');

    const records = await audit.getEventsByResource('gpu_allocation', alloc.id);
    expect(records.length).toBe(2);
    expect(records[0].action).toBe('allocateGPU');
    expect(records[1].action).toBe('releaseGPU');
    expect(records[0].sequenceNumber).toBeLessThan(records[1].sequenceNumber);
  });

  test('5.6 chain integrity verified after 5 audit events', async () => {
    for (let i = 0; i < 5; i++) await logAudit(audit, 'create', 'model', `m-${i}`, 'register');
    const r = await audit.verifyIntegrity();
    expect(r.valid).toBe(true);
    expect(r.chainLength).toBe(5);
  });

  test('5.7 audit query filters by outcome', async () => {
    await logAudit(audit, 'create', 'model', 'mx', 'register');
    await audit.logEvent({ eventType: 'delete', userId: USER, userEmail: EMAIL, userRoles: ['admin'], organizationId: ORG, resourceType: 'model', resourceId: 'my', action: 'delete', outcome: 'failure' });
    expect((await audit.queryEvents({ outcome: 'success' })).length).toBe(1);
    expect((await audit.queryEvents({ outcome: 'failure' })).length).toBe(1);
  });

  test('5.8 cost estimate correct for H100 x 4 over 3 hours', () => {
    const e = scheduler.estimateCost({ type: 'H100', count: 4 }, 3);
    expect(e.totalCost).toBeCloseTo(4 * 5.89 * 3, 2);
  });
});

// ─── Chain 6: Dataset → Paper → Review ────────────────────────────────────────

describe('Chain 6: Dataset → Paper → Review (conflict detection)', () => {
  let bus: EventBus;
  let vault: DatasetVaultService;
  let paperEngine: PaperEngineService;
  let reviewSystem: ReviewSystemService;

  beforeEach(() => {
    bus = new EventBus();
    vault = new DatasetVaultService(bus);
    paperEngine = new PaperEngineService();
    reviewSystem = new ReviewSystemService(bus);
    vault._resetForTesting();
    paperEngine._reset();
    reviewSystem._reset();
    CollabHub._resetForTesting();
    eventBus.reset();
  });

  test('6.1 dataset id referenced in paper abstract', async () => {
    const ds = await vault.createDataset({ name: 'BenchDS', description: '', ownerId: USER, organizationId: ORG, format: 'parquet' });
    const p = await paperEngine.ingestPaper({ title: 'Using BenchDS', abstract: `Evaluated on dataset ${ds.id}`, authors: [{ name: 'A', email: 'a@x.com', affiliation: 'MIT' }] });
    expect(p.abstract).toContain(ds.id);
  });

  test('6.2 dataset access usage stats track reads and downloads', async () => {
    const ds = await vault.createDataset({ name: 'CitedDS', description: '', ownerId: USER, organizationId: ORG, format: 'json' });
    await vault.recordAccess(ds.id, 'paper-author', 'read');
    await vault.recordAccess(ds.id, 'paper-author', 'download');
    const usage = await vault.getUsageStats(ds.id);
    expect(usage.totalReads).toBe(1);
    expect(usage.totalDownloads).toBe(1);
  });

  test('6.3 paper submitted for review after dataset reference', async () => {
    const ds = await vault.createDataset({ name: 'ReviewDS', description: '', ownerId: USER, organizationId: ORG, format: 'csv' });
    const p = await paperEngine.ingestPaper({ title: 'Study on ReviewDS', abstract: `Uses ${ds.id}`, authors: [{ name: 'B', email: 'b@y.com', affiliation: 'CMU' }] });
    const { review } = await reviewSystem.submitForReview({ title: p.title, authorId: 'b-uid', authorOrganizationId: 'org-cmu', abstract: p.abstract });
    expect(review.stage).toBe('pending');
  });

  test('6.4 same-org reviewer has conflict detected', async () => {
    const { review } = await reviewSystem.submitForReview({ title: 'Org Conflict', authorId: 'a-auth', authorOrganizationId: 'org-conflict', abstract: 'Testing.' });
    const rev = await reviewSystem.registerReviewer({ userId: 'rev-same', name: 'Conflicted', organizationId: 'org-conflict' });
    const result = await reviewSystem.detectConflicts(review.id, rev.id);
    expect(result.hasConflict).toBe(true);
    expect(result.reasons.some(r => r.includes('same organization'))).toBe(true);
  });

  test('6.5 co-author reviewer conflict detected', async () => {
    const { review } = await reviewSystem.submitForReview({ title: 'Coauthor Paper', authorId: 'auth-main', authorOrganizationId: 'org-a', coAuthorIds: ['coauth-x'], abstract: 'Testing.' });
    const rev = await reviewSystem.registerReviewer({ userId: 'coauth-x', name: 'CoAuth Reviewer', organizationId: 'org-b' });
    const r = await reviewSystem.detectConflicts(review.id, rev.id);
    expect(r.hasConflict).toBe(true);
  });

  test('6.6 non-conflicted reviewer assigned successfully', async () => {
    const { review } = await reviewSystem.submitForReview({ title: 'Clean Paper', authorId: 'auth-clean', authorOrganizationId: 'org-clean', abstract: 'No conflicts.' });
    const rev = await reviewSystem.registerReviewer({ userId: 'rev-clean', name: 'Clean Rev', organizationId: 'org-other' });
    const assigned = await reviewSystem.assignReviewer(review.id, rev.id);
    expect(assigned.stage).toBe('in_review');
  });

  test('6.7 dataset lineage records derived relationship', async () => {
    const src = await vault.createDataset({ name: 'SourceDS', description: '', ownerId: USER, organizationId: ORG, format: 'parquet' });
    const derived = await vault.createDataset({ name: 'DerivedDS', description: '', ownerId: USER, organizationId: ORG, format: 'parquet' });
    const v = await vault.createVersion({ datasetId: derived.id, description: 'v1', createdBy: USER, rows: 5000, sizeBytes: 250000, checksum: 'ch1' });
    const lineage = await vault.addLineageRecord({ datasetId: derived.id, versionId: v.id, eventType: 'derived', sourceDatasetIds: [src.id], transformationDescription: 'Filtered', createdBy: USER });
    expect(lineage.sourceDatasetIds).toContain(src.id);
    expect((await vault.getLineage(derived.id)).length).toBe(1);
  });

  test('6.8 three completed reviews aggregate correct stats', async () => {
    const rev = await reviewSystem.registerReviewer({ userId: 'stats-rev', name: 'Stats', organizationId: 'org-stats' });
    for (let i = 0; i < 3; i++) {
      const { review } = await reviewSystem.submitForReview({ title: `P${i}`, authorId: `a${i}`, authorOrganizationId: `org-x${i}`, abstract: `Abstract ${i}` });
      const a = await reviewSystem.assignReviewer(review.id, rev.id);
      await reviewSystem.submitFeedback(a.id, rev.id, `Feedback ${i}`);
      await reviewSystem.scorePaper(a.id, rev.id, { novelty: 7, methodology: 8, clarity: 7, significance: 8 });
      await reviewSystem.completeReview(a.id, rev.id);
    }
    const stats = await reviewSystem.getStats();
    expect(stats.completedReviews).toBe(3);
    expect(stats.averageScore).toBeGreaterThan(0);
    expect((await reviewSystem.getReviewerWorkload(rev.id)).completedCount).toBe(3);
  });
});

// ─── Chain 7: Full Pipeline ───────────────────────────────────────────────────

describe('Chain 7: Full Pipeline (Dataset → Experiment → Training → Model → Deploy → Audit)', () => {
  let bus: EventBus;
  let vault: DatasetVaultService;
  let experiments: ExperimentService;
  let training: TrainingPipelineService;
  let registry: ModelRegistryService;
  let scheduler: ComputeSchedulerService;
  let audit: AuditTrailService;
  let insight: InsightEngineService;

  beforeEach(() => {
    bus = new EventBus();
    vault = new DatasetVaultService(bus);
    experiments = new ExperimentService(bus);
    training = new TrainingPipelineService(bus);
    registry = new ModelRegistryService(bus);
    scheduler = new ComputeSchedulerService(bus);
    audit = new AuditTrailService(bus);
    insight = new InsightEngineService(bus);
    vault._resetForTesting();
    experiments._resetForTesting();
    registry._resetForTesting();
    scheduler._resetForTesting();
    audit._resetForTesting();
    insight._resetForTesting();
    CollabHub._resetForTesting();
    eventBus.reset();
  });

  test('7.1 dataset created and versioned', async () => {
    const ds = await vault.createDataset({ name: 'Pipeline-DS', description: 'E2E', ownerId: USER, organizationId: ORG, format: 'parquet' });
    const v = await vault.createVersion({ datasetId: ds.id, description: 'v1', createdBy: USER, rows: 100000, sizeBytes: 5000000, checksum: 'sha256-x' });
    expect(v.versionNumber).toBe(1);
    expect((await vault.getDataset(ds.id)).latestVersionId).toBe(v.id);
  });

  test('7.2 experiment hyperparams carry dataset id', async () => {
    const ds = await vault.createDataset({ name: 'Exp-Link-DS', description: '', ownerId: USER, organizationId: ORG, format: 'json' });
    const exp = await experiments.create({ name: 'Pipeline-Exp', createdBy: USER, organizationId: ORG, hyperparameters: [{ key: 'dataset_id', value: ds.id, type: 'string' }] });
    expect(exp.hyperparameters.find(h => h.key === 'dataset_id')?.value).toBe(ds.id);
  });

  test('7.3 training job uses dataset_id from experiment hyperparams', async () => {
    const ds = await vault.createDataset({ name: 'Src-DS', description: '', ownerId: USER, organizationId: ORG, format: 'parquet' });
    const exp = await experiments.create({ name: 'Train-Exp', createdBy: USER, organizationId: ORG, hyperparameters: [{ key: 'dataset_id', value: ds.id, type: 'string' }] });
    const datasetId = exp.hyperparameters.find(h => h.key === 'dataset_id')!.value as string;
    const job = await training.createJob({ name: 'Pipeline-Job', config: { modelArchitecture: 'Transformer', datasetId, batchSize: 64, learningRate: 0.001, epochs: 5, optimizer: 'adamw', lossFunction: 'ce', distributed: { strategy: 'none', numNodes: 1, gpusPerNode: 1, syncInterval: 10 }, hyperparams: { experimentId: exp.id } }, ownerId: USER });
    expect(job.config.datasetId).toBe(ds.id);
    expect(job.config.hyperparams?.experimentId).toBe(exp.id);
  });

  test('7.4 training completes and metrics stored in experiment', async () => {
    const ds = await vault.createDataset({ name: 'Metric-DS', description: '', ownerId: USER, organizationId: ORG, format: 'csv' });
    const exp = await experiments.create({ name: 'Metric-Exp', createdBy: USER, organizationId: ORG });
    await experiments.transitionStatus(exp.id, 'running');
    const job = await training.createJob({ name: 'Metric-Job', config: { modelArchitecture: 'MLP', datasetId: ds.id, batchSize: 32, learningRate: 0.01, epochs: 3, optimizer: 'sgd', lossFunction: 'mse', distributed: { strategy: 'none', numNodes: 1, gpusPerNode: 1, syncInterval: 10 } }, ownerId: USER });
    await training.startJob(job.id);
    await training.completeJob(job.id, { loss: 0.08, accuracy: 0.97 });
    await experiments.logMetric(exp.id, 'final_acc', 0.97, 0);
    await experiments.transitionStatus(exp.id, 'completed');
    expect((await experiments.getMetrics(exp.id)).find(m => m.name === 'final_acc')?.value).toBe(0.97);
    expect((await experiments.getById(exp.id)).status).toBe('completed');
  });

  test('7.5 model registered from completed experiment', async () => {
    const exp = await experiments.create({ name: 'Src-Exp', createdBy: USER, organizationId: ORG });
    await experiments.transitionStatus(exp.id, 'running');
    await experiments.logMetric(exp.id, 'acc', 0.94, 0);
    await experiments.transitionStatus(exp.id, 'completed');
    const model = await registry.registerModel({ name: 'Pipeline-Model', framework: 'pytorch', task: 'cls', ownerId: USER, organizationId: ORG });
    const version = await registry.createVersion({ modelId: model.id, version: '1.0.0', createdBy: USER, metrics: { accuracy: 0.94 }, hyperparams: { experimentId: exp.id } });
    expect(version.metrics.accuracy).toBe(0.94);
    expect(version.hyperparams.experimentId).toBe(exp.id);
  });

  test('7.6 model version promoted to production (deploy)', async () => {
    const model = await registry.registerModel({ name: 'Deploy-Model', framework: 'onnx', task: 'inf', ownerId: USER, organizationId: ORG });
    const v = await registry.createVersion({ modelId: model.id, version: '2.0.0', createdBy: USER });
    await registry.promoteVersion(v.id);
    await registry.promoteVersion(v.id);
    expect((await registry.getModel(model.id)).activeVersionId).toBe(v.id);
  });

  test('7.7 compute job submitted and GPU allocated for inference', async () => {
    const model = await registry.registerModel({ name: 'Infer-Deploy', framework: 'pytorch', task: 'gen', ownerId: USER, organizationId: ORG });
    const job = await scheduler.submitJob({ name: `infer-${model.id}`, userId: USER, priority: 'high', resources: { type: 'A100', count: 2 }, estimatedDurationHours: 4, metadata: { modelId: model.id } });
    const alloc = await scheduler.allocateGPU(job.id, { type: 'A100', count: 2 });
    expect(alloc.costEstimate).toBeCloseTo(2 * 3.20 * 4, 2);
    expect(alloc.resources.count).toBe(2);
  });

  test('7.8 pipeline actions recorded in audit trail with valid chain', async () => {
    const ds = await vault.createDataset({ name: 'Audit-DS', description: '', ownerId: USER, organizationId: ORG, format: 'parquet' });
    const model = await registry.registerModel({ name: 'Audit-Model', framework: 'pytorch', task: 'cls', ownerId: USER, organizationId: ORG });
    await audit.logEvent({ eventType: 'create', userId: USER, userEmail: EMAIL, userRoles: ['researcher'], organizationId: ORG, resourceType: 'dataset', resourceId: ds.id, action: 'createDataset', outcome: 'success' });
    await audit.logEvent({ eventType: 'create', userId: USER, userEmail: EMAIL, userRoles: ['researcher'], organizationId: ORG, resourceType: 'model', resourceId: model.id, action: 'registerModel', outcome: 'success' });
    await audit.logEvent({ eventType: 'update', userId: USER, userEmail: EMAIL, userRoles: ['researcher'], organizationId: ORG, resourceType: 'model_version', resourceId: 'v1', action: 'promoteToProduction', outcome: 'success' });
    expect((await audit.queryEvents({ organizationId: ORG })).length).toBe(3);
    expect((await audit.verifyIntegrity()).valid).toBe(true);
  });

  test('7.9 insight series tracks post-deploy model latency', async () => {
    const s = await insight.createSeries({ name: 'latency', organizationId: ORG, unit: 'ms' });
    for (const v of [15, 14, 13, 16, 14, 15, 12]) await insight.ingestDataPoint({ seriesId: s.id, value: v });
    const stats = await insight.computeStatistics(s.id);
    expect(stats.count).toBe(7);
    expect(stats.min).toBe(12);
    expect(stats.max).toBe(16);
  });

  test('7.10 end-to-end: events fire across all services on shared bus', async () => {
    const seen: string[] = [];
    bus.subscribe('dataset.created', e => seen.push(e.type));
    bus.subscribe('experiment.created', e => seen.push(e.type));
    bus.subscribe('model.registered', e => seen.push(e.type));
    bus.subscribe('job.submitted', e => seen.push(e.type));
    bus.subscribe('resource.allocated', e => seen.push(e.type));

    const ds = await vault.createDataset({ name: 'E2E-DS', description: '', ownerId: USER, organizationId: ORG, format: 'parquet' });
    const exp = await experiments.create({ name: 'E2E-Exp', createdBy: USER, organizationId: ORG, hyperparameters: [{ key: 'dataset_id', value: ds.id, type: 'string' }] });
    await experiments.transitionStatus(exp.id, 'running');
    await experiments.logMetric(exp.id, 'acc', 0.93, 0);
    await experiments.transitionStatus(exp.id, 'completed');
    const model = await registry.registerModel({ name: 'E2E-Model', framework: 'pytorch', task: 'cls', ownerId: USER, organizationId: ORG });
    const version = await registry.createVersion({ modelId: model.id, version: '1.0.0', createdBy: USER, metrics: { accuracy: 0.93 }, trainingDatasetId: ds.id });
    const job = await scheduler.submitJob({ name: 'E2E-Job', userId: USER, priority: 'high', resources: { type: 'A100', count: 1 }, estimatedDurationHours: 2, metadata: { modelId: model.id, versionId: version.id } });
    const alloc = await scheduler.allocateGPU(job.id, { type: 'A100', count: 1 });

    // Verify data connections across services
    expect(version.trainingDatasetId).toBe(ds.id);
    expect(version.metrics.accuracy).toBe(0.93);
    expect(job.metadata?.modelId).toBe(model.id);
    expect(alloc.jobId).toBe(job.id);

    // Verify cross-service events on shared bus
    expect(seen).toContain('dataset.created');
    expect(seen).toContain('experiment.created');
    expect(seen).toContain('model.registered');
    expect(seen).toContain('job.submitted');
    expect(seen).toContain('resource.allocated');

    // Cleanup
    await scheduler.releaseGPU(alloc.id);
    expect((await scheduler.listAllocations({ jobId: job.id }))[0].status).toBe('released');
  });
});
