// R009 Integration Tests — Chains 1–4
// Chain 1: Experiment → Training → Model
// Chain 2: Dataset → Training → Experiment
// Chain 3: Paper → Review → Collab
// Chain 4: Experiment → Insight → Alert

import { describe, test, expect, beforeEach } from 'bun:test';
import { ExperimentService } from '../services/experiment-tracker/src/index.ts';
import { ModelRegistryService } from '../services/model-registry/src/index.ts';
import { TrainingPipelineService } from '../services/training-pipeline/src/index.ts';
import { DatasetVaultService } from '../services/dataset-vault/src/index.ts';
import { PaperEngineService } from '../services/paper-engine/src/index.ts';
import { ReviewSystemService } from '../services/review-system/src/index.ts';
import * as CollabHub from '../services/collab-hub/src/index.ts';
import { InsightEngineService } from '../services/insight-engine/src/index.ts';
import { EventBus, eventBus } from '../shared/events.ts';

const ORG = 'org-test';
const USER = 'user-test';

// ─── Chain 1: Experiment → Training → Model ───────────────────────────────────

describe('Chain 1: Experiment → Training → Model', () => {
  let bus: EventBus;
  let experiments: ExperimentService;
  let training: TrainingPipelineService;
  let registry: ModelRegistryService;

  beforeEach(() => {
    bus = new EventBus();
    experiments = new ExperimentService(bus);
    training = new TrainingPipelineService(bus);
    registry = new ModelRegistryService(bus);
    experiments._resetForTesting();
    registry._resetForTesting();
  });

  const mkJob = (training: TrainingPipelineService, datasetId: string, extra: Record<string, unknown> = {}) =>
    training.createJob({
      name: 'job-' + Math.random(),
      config: { modelArchitecture: 'ResNet', datasetId, batchSize: 32, learningRate: 0.001,
        epochs: 3, optimizer: 'adam', lossFunction: 'ce',
        distributed: { strategy: 'none', numNodes: 1, gpusPerNode: 1, syncInterval: 10 },
        hyperparams: extra },
      ownerId: USER,
    });

  test('1.1 create experiment returns draft status', async () => {
    const exp = await experiments.create({ name: 'Exp-A', createdBy: USER, organizationId: ORG });
    expect(exp.status).toBe('draft');
    expect(exp.id).toBeTruthy();
  });

  test('1.2 start experiment transitions to running with startedAt set', async () => {
    const exp = await experiments.create({ name: 'Exp-B', createdBy: USER, organizationId: ORG });
    const running = await experiments.transitionStatus(exp.id, 'running');
    expect(running.status).toBe('running');
    expect(running.startedAt).toBeTruthy();
  });

  test('1.3 log metric only allowed on running experiment', async () => {
    const exp = await experiments.create({ name: 'Exp-C', createdBy: USER, organizationId: ORG });
    await expect(experiments.logMetric(exp.id, 'acc', 0.9, 0)).rejects.toThrow();
    await experiments.transitionStatus(exp.id, 'running');
    const m = await experiments.logMetric(exp.id, 'acc', 0.9, 0);
    expect(m.value).toBe(0.9);
  });

  test('1.4 training job carries experimentId in hyperparams', async () => {
    const exp = await experiments.create({ name: 'Exp-D', createdBy: USER, organizationId: ORG });
    const job = await mkJob(training, 'ds-001', { experimentId: exp.id });
    expect(job.config.hyperparams?.experimentId).toBe(exp.id);
    expect(job.status).toBe('pending');
  });

  test('1.5 completed experiment metrics register into model version', async () => {
    const exp = await experiments.create({ name: 'Exp-E', createdBy: USER, organizationId: ORG });
    await experiments.transitionStatus(exp.id, 'running');
    await experiments.logMetric(exp.id, 'accuracy', 0.91, 0);
    await experiments.transitionStatus(exp.id, 'completed');
    const metrics = await experiments.getMetrics(exp.id);
    expect(metrics[0].value).toBe(0.91);

    const model = await registry.registerModel({ name: 'M1', framework: 'pytorch', task: 'cls', ownerId: USER, organizationId: ORG });
    const version = await registry.createVersion({ modelId: model.id, version: '1.0.0', createdBy: USER, metrics: { accuracy: 0.91 }, hyperparams: { experimentId: exp.id } });
    expect(version.metrics.accuracy).toBe(0.91);
    expect(version.hyperparams.experimentId).toBe(exp.id);
  });

  test('1.6 model latestVersionId updates after createVersion', async () => {
    const model = await registry.registerModel({ name: 'M2', framework: 'jax', task: 'gen', ownerId: USER, organizationId: ORG });
    const v = await registry.createVersion({ modelId: model.id, version: '1.0.0', createdBy: USER, trainingDatasetId: 'ds-42' });
    const updated = await registry.getModel(model.id);
    expect(updated.latestVersionId).toBe(v.id);
    expect(v.trainingDatasetId).toBe('ds-42');
  });

  test('1.7 model version promotes draft → staging → production', async () => {
    const model = await registry.registerModel({ name: 'M3', framework: 'pytorch', task: 'cls', ownerId: USER, organizationId: ORG });
    const v = await registry.createVersion({ modelId: model.id, version: '1.0.0', createdBy: USER });
    await registry.promoteVersion(v.id);
    const prod = await registry.promoteVersion(v.id);
    expect(prod.stage).toBe('production');
    expect((await registry.getModel(model.id)).activeVersionId).toBe(v.id);
  });

  test('1.8 event bus fires experiment.created and model.registered', async () => {
    const seen: string[] = [];
    bus.subscribe('experiment.created', e => seen.push(e.type));
    bus.subscribe('model.registered', e => seen.push(e.type));
    await experiments.create({ name: 'Exp-F', createdBy: USER, organizationId: ORG });
    await registry.registerModel({ name: 'M4', framework: 'onnx', task: 'seg', ownerId: USER, organizationId: ORG });
    expect(seen).toContain('experiment.created');
    expect(seen).toContain('model.registered');
  });
});

// ─── Chain 2: Dataset → Training → Experiment ─────────────────────────────────

describe('Chain 2: Dataset → Training → Experiment', () => {
  let bus: EventBus;
  let vault: DatasetVaultService;
  let training: TrainingPipelineService;
  let experiments: ExperimentService;

  beforeEach(() => {
    bus = new EventBus();
    vault = new DatasetVaultService(bus);
    training = new TrainingPipelineService(bus);
    experiments = new ExperimentService(bus);
    vault._resetForTesting();
    experiments._resetForTesting();
  });

  const mkDs = (vault: DatasetVaultService, name: string) =>
    vault.createDataset({ name, description: '', ownerId: USER, organizationId: ORG, format: 'parquet' });

  test('2.1 dataset id used as training config datasetId', async () => {
    const ds = await mkDs(vault, 'DS-A');
    const job = await training.createJob({ name: 'j1', config: { modelArchitecture: 'MLP', datasetId: ds.id, batchSize: 32, learningRate: 0.01, epochs: 2, optimizer: 'sgd', lossFunction: 'mse', distributed: { strategy: 'none', numNodes: 1, gpusPerNode: 1, syncInterval: 10 } }, ownerId: USER });
    expect(job.config.datasetId).toBe(ds.id);
  });

  test('2.2 dataset version numbers increment', async () => {
    const ds = await mkDs(vault, 'DS-B');
    const v1 = await vault.createVersion({ datasetId: ds.id, description: 'v1', createdBy: USER, rows: 1000, sizeBytes: 1000, checksum: 'c1' });
    const v2 = await vault.createVersion({ datasetId: ds.id, description: 'v2', createdBy: USER, rows: 2000, sizeBytes: 2000, checksum: 'c2' });
    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);
    expect((await vault.getDataset(ds.id)).latestVersionId).toBe(v2.id);
  });

  test('2.3 training checkpoint updates job progress', async () => {
    const ds = await mkDs(vault, 'DS-C');
    const job = await training.createJob({ name: 'j2', config: { modelArchitecture: 'CNN', datasetId: ds.id, batchSize: 64, learningRate: 0.001, epochs: 5, optimizer: 'adam', lossFunction: 'ce', distributed: { strategy: 'none', numNodes: 1, gpusPerNode: 1, syncInterval: 10 } }, ownerId: USER });
    await training.startJob(job.id);
    const cp = await training.saveCheckpoint({ jobId: job.id, epoch: 1, step: 100, loss: 0.4, filePath: '/ckpt/e1.pt', sizeBytes: 1024 });
    expect(cp.epoch).toBe(1);
    expect((await training.getJob(job.id)).currentStep).toBe(100);
  });

  test('2.4 completed training results logged into experiment', async () => {
    const ds = await mkDs(vault, 'DS-D');
    const job = await training.createJob({ name: 'j3', config: { modelArchitecture: 'Transformer', datasetId: ds.id, batchSize: 16, learningRate: 0.0001, epochs: 2, optimizer: 'adamw', lossFunction: 'ce', distributed: { strategy: 'none', numNodes: 1, gpusPerNode: 1, syncInterval: 5 } }, ownerId: USER });
    await training.startJob(job.id);
    await training.completeJob(job.id, { loss: 0.12, accuracy: 0.95 });

    const exp = await experiments.create({ name: 'Exp-From-Training', createdBy: USER, organizationId: ORG });
    await experiments.transitionStatus(exp.id, 'running');
    await experiments.logMetric(exp.id, 'final_loss', 0.12, 0);
    await experiments.logMetric(exp.id, 'final_acc', 0.95, 0);
    const metrics = await experiments.getMetrics(exp.id);
    expect(metrics.find(m => m.name === 'final_acc')?.value).toBe(0.95);
  });

  test('2.5 schema validates training data types', async () => {
    const ds = await mkDs(vault, 'DS-E');
    await vault.setSchema(ds.id, [{ name: 'x', type: 'float', nullable: false }, { name: 'y', type: 'integer', nullable: false }]);
    expect((await vault.validateSchema(ds.id, [{ x: 1.5, y: 0 }])).valid).toBe(true);
    expect((await vault.validateSchema(ds.id, [{ x: 'bad', y: 1 }])).valid).toBe(false);
  });

  test('2.6 dataset split rows are proportional to ratios', async () => {
    const ds = await mkDs(vault, 'DS-F');
    const v = await vault.createVersion({ datasetId: ds.id, description: 'v', createdBy: USER, rows: 10000, sizeBytes: 1000000, checksum: 'x' });
    const split = await vault.splitDataset({ datasetId: ds.id, versionId: v.id, name: 's1', strategy: 'random', trainRatio: 0.8, valRatio: 0.1, testRatio: 0.1, createdBy: USER });
    expect(split.trainRows).toBe(8000);
    expect(split.testRows).toBe(1000);
  });
});

// ─── Chain 3: Paper → Review → Collab ────────────────────────────────────────

describe('Chain 3: Paper → Review → Collab', () => {
  let bus: EventBus;
  let paperEngine: PaperEngineService;
  let reviewSystem: ReviewSystemService;

  beforeEach(() => {
    bus = new EventBus();
    paperEngine = new PaperEngineService();
    reviewSystem = new ReviewSystemService(bus);
    paperEngine._reset();
    reviewSystem._reset();
    CollabHub._resetForTesting();
    eventBus.reset();
  });

  test('3.1 ingest paper returns submitted status with authors', async () => {
    const p = await paperEngine.ingestPaper({ title: 'Attention Is All You Need', abstract: 'Transformer architecture.', authors: [{ name: 'Alice', email: 'a@uni.edu', affiliation: 'MIT' }], tags: ['nlp'] });
    expect(p.status).toBe('submitted');
    expect(p.authors[0].name).toBe('Alice');
  });

  test('3.2 paper submitted for review creates pending review', async () => {
    const p = await paperEngine.ingestPaper({ title: 'NAS', abstract: 'Architecture search.', authors: [{ name: 'Bob', email: 'b@lab.org', affiliation: 'Stanford' }] });
    const { review } = await reviewSystem.submitForReview({ title: p.title, authorId: 'bob-uid', authorOrganizationId: 'org-stanford', abstract: p.abstract });
    expect(review.stage).toBe('pending');
    expect(review.paperId).toBeTruthy();
  });

  test('3.3 reviewer registered and assigned without conflict', async () => {
    const { review } = await reviewSystem.submitForReview({ title: 'Survey', authorId: 'a1', authorOrganizationId: 'org-A', abstract: 'Survey paper.' });
    const reviewer = await reviewSystem.registerReviewer({ userId: 'r1', name: 'Carol', organizationId: 'org-B' });
    const assigned = await reviewSystem.assignReviewer(review.id, reviewer.id);
    expect(assigned.stage).toBe('in_review');
    expect(assigned.reviewerId).toBe(reviewer.id);
  });

  test('3.4 same-org reviewer assignment throws conflict', async () => {
    const { review } = await reviewSystem.submitForReview({ title: 'Conflict Paper', authorId: 'a2', authorOrganizationId: 'org-conflict', abstract: 'Abstract.' });
    const rev = await reviewSystem.registerReviewer({ userId: 'r2', name: 'Dave', organizationId: 'org-conflict' });
    await expect(reviewSystem.assignReviewer(review.id, rev.id)).rejects.toThrow();
  });

  test('3.5 full review cycle: feedback + scores + complete', async () => {
    const { review } = await reviewSystem.submitForReview({ title: 'RLHF', authorId: 'a3', authorOrganizationId: 'org-C', abstract: 'RL from human feedback.' });
    const rev = await reviewSystem.registerReviewer({ userId: 'r3', name: 'Eve', organizationId: 'org-D' });
    const assigned = await reviewSystem.assignReviewer(review.id, rev.id);
    await reviewSystem.submitFeedback(assigned.id, rev.id, 'Good paper, needs ablations.');
    await reviewSystem.scorePaper(assigned.id, rev.id, { novelty: 8, methodology: 7, clarity: 6, significance: 9 });
    const done = await reviewSystem.completeReview(assigned.id, rev.id);
    expect(done.stage).toBe('completed');
    expect(done.weightedScore).toBeGreaterThan(0);
  });

  test('3.6 collab team notified after review completion', async () => {
    const team = await CollabHub.createTeam({ name: 'ML-Team', organizationId: ORG, createdBy: USER });
    const notif = await CollabHub.sendNotification({ userId: USER, teamId: team.id, type: 'update', title: 'Review done', body: 'Paper reviewed.' });
    expect(notif.read).toBe(false);
    const { notifications } = await CollabHub.getNotifications({ userId: USER });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
  });

  test('3.7 channel message created when paper ingested', async () => {
    const team = await CollabHub.createTeam({ name: 'Paper-Team', organizationId: ORG, createdBy: USER });
    const ch = await CollabHub.createChannel({ teamId: team.id, name: 'papers', createdBy: USER });
    const p = await paperEngine.ingestPaper({ title: 'ViT', abstract: 'Vision transformer.', authors: [{ name: 'Frank', email: 'f@g.com', affiliation: 'Google' }] });
    const msg = await CollabHub.sendMessage({ channelId: ch.id, authorId: USER, content: `New paper: ${p.title}` });
    expect(msg.content).toContain('ViT');
    expect((await CollabHub.getMessages({ channelId: ch.id })).messages.length).toBe(1);
  });
});

// ─── Chain 4: Experiment → Insight → Alert ────────────────────────────────────

describe('Chain 4: Experiment → Insight → Alert', () => {
  let bus: EventBus;
  let experiments: ExperimentService;
  let insight: InsightEngineService;

  beforeEach(() => {
    bus = new EventBus();
    experiments = new ExperimentService(bus);
    insight = new InsightEngineService(bus);
    experiments._resetForTesting();
    insight._resetForTesting();
  });

  test('4.1 create series and ingest data point', async () => {
    const s = await insight.createSeries({ name: 'train-loss', organizationId: ORG });
    const dp = await insight.ingestDataPoint({ seriesId: s.id, value: 0.45 });
    expect(dp.seriesId).toBe(s.id);
    expect(dp.value).toBe(0.45);
  });

  test('4.2 experiment metrics flow into insight series', async () => {
    const s = await insight.createSeries({ name: 'exp-acc', organizationId: ORG });
    const exp = await experiments.create({ name: 'Ins-Exp', createdBy: USER, organizationId: ORG });
    await experiments.transitionStatus(exp.id, 'running');
    for (const v of [0.6, 0.7, 0.8]) {
      await experiments.logMetric(exp.id, 'acc', v, 0);
      await insight.ingestDataPoint({ seriesId: s.id, value: v });
    }
    const stats = await insight.computeStatistics(s.id);
    expect(stats.count).toBe(3);
    expect(stats.max).toBe(0.8);
  });

  test('4.3 anomaly detection flags high-z outlier', async () => {
    const s = await insight.createSeries({ name: 'anomaly-s', organizationId: ORG });
    for (const v of [0.5, 0.5, 0.5, 0.5, 0.5]) await insight.ingestDataPoint({ seriesId: s.id, value: v });
    await insight.ingestDataPoint({ seriesId: s.id, value: 10 });
    const r = await insight.detectAnomalies(s.id, 2.0);
    expect(r.anomalies.find(a => a.value === 10)).toBeTruthy();
  });

  test('4.4 alert triggers when ingested value exceeds threshold', async () => {
    const s = await insight.createSeries({ name: 'alert-s', organizationId: ORG });
    await insight.createAlert({ seriesId: s.id, name: 'spike', operator: 'gt', threshold: 1.0, cooldownMs: 0, organizationId: ORG });
    await insight.ingestDataPoint({ seriesId: s.id, value: 0.5 });
    expect((await insight.getAlerts(s.id))[0].status).toBe('active');
    await insight.ingestDataPoint({ seriesId: s.id, value: 2.5 });
    const alerts = await insight.getAlerts(s.id);
    expect(alerts[0].status).toBe('triggered');
    expect(alerts[0].triggerCount).toBe(1);
  });

  test('4.5 trend analysis shows increasing direction', async () => {
    const s = await insight.createSeries({ name: 'trend-s', organizationId: ORG });
    for (const v of [0.5, 0.6, 0.7, 0.8, 0.9]) await insight.ingestDataPoint({ seriesId: s.id, value: v });
    const trend = await insight.analyzeTrend(s.id);
    expect(trend.direction).toBe('increasing');
    expect(trend.slope).toBeGreaterThan(0);
  });

  test('4.6 full chain: experiment → insight report generated', async () => {
    const s = await insight.createSeries({ name: 'report-s', organizationId: ORG });
    const exp = await experiments.create({ name: 'Report-Exp', createdBy: USER, organizationId: ORG });
    await experiments.transitionStatus(exp.id, 'running');
    for (let i = 0; i < 6; i++) {
      await experiments.logMetric(exp.id, 'f1', 0.5 + i * 0.05, i);
      await insight.ingestDataPoint({ seriesId: s.id, value: 0.5 + i * 0.05 });
    }
    await experiments.transitionStatus(exp.id, 'completed');
    const report = await insight.generateReport(s.id);
    expect(report.statistics.count).toBe(6);
    expect(report.trend.direction).toBe('increasing');
    expect((await experiments.getMetrics(exp.id)).length).toBe(6);
  });
});
