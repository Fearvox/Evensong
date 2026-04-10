# Data Dictionary — Evensong III ML Research Platform

All entity types across all 10 services. Fields marked `*` are required. Cross-service references are noted as `→ ServiceName.EntityType`.

---

## experiment-tracker

### Experiment

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Unique experiment identifier |
| name * | string | Human-readable experiment name |
| description | string | Optional longer description |
| projectId * | string | Logical project grouping |
| status * | enum: queued, running, completed, failed, cancelled | Current lifecycle state |
| parameters * | Record<string, string \| number \| boolean> | Hyperparameters and config at launch time; immutable after `completed` |
| tags | string[] | Arbitrary labels for filtering |
| ownerId * | string | User ID of the researcher who created the experiment |
| createdAt * | ISO 8601 datetime | Creation timestamp |
| updatedAt * | ISO 8601 datetime | Last mutation timestamp |
| completedAt | ISO 8601 datetime | Set when status transitions to `completed` or `failed` |

**Relationships:**
- Has many `Run`
- Has many `AuditEntry`
- Referenced by `Paper.experimentId` → paper-engine

### Run

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Unique run identifier |
| experimentId * | string | → experiment-tracker.Experiment.id |
| status * | enum: queued, running, completed, failed | Run lifecycle state |
| metrics | Record<string, number> | Key-value metric snapshots logged during training |
| metricHistory | Array<{step: number, metrics: Record<string, number>}> | Time-series metric log |
| jobId | string | → compute-scheduler.Job.id (if scheduled) |
| startedAt | ISO 8601 datetime | When run transitioned to `running` |
| finishedAt | ISO 8601 datetime | When run reached terminal state |

### AuditEntry

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Entry identifier |
| entityType * | string | Type of mutated entity (`Experiment`, `Run`) |
| entityId * | string | ID of the mutated entity |
| action * | enum: create, update, delete, status_change | Type of mutation |
| actorId * | string | User or service ID that performed the action |
| before | object | Serialized state before mutation (null for create) |
| after | object | Serialized state after mutation (null for delete) |
| chainHash * | string (hex) | SHA-256 hash linking this entry to the previous one |
| timestamp * | ISO 8601 datetime | Exact time of mutation |

---

## model-registry

### ModelRecord

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Unique model identifier |
| name * | string | Human-readable model name |
| architecture * | string | Model architecture family (e.g. `transformer`, `cnn`, `mlp`) |
| frameworkVersion * | string | Training framework and version (e.g. `pytorch-2.3`) |
| ownerId * | string | Researcher who registered the model |
| createdAt * | ISO 8601 datetime | Registration timestamp |

**Relationships:**
- Has many `ModelVersion`
- Has many `AuditEntry` (same schema as experiment-tracker)

### ModelVersion

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Version record identifier |
| modelId * | string | → model-registry.ModelRecord.id |
| versionNumber * | integer | Monotonically increasing version number |
| status * | enum: candidate, staging, production, deprecated | Promotion stage |
| artifactKey * | string | MinIO object key for the binary artifact |
| artifactChecksum * | string (SHA-256 hex) | Integrity checksum of the binary |
| artifactSizeBytes * | integer | Binary file size |
| parentVersionId | string | → ModelVersion.id (null for initial training; set for fine-tune or checkpoint) |
| experimentRunId | string | → experiment-tracker.Run.id |
| datasetVersionId | string | → dataset-vault.DatasetVersion.id |
| hyperparameters | Record<string, any> | Training hyperparameters snapshot |
| evaluationMetrics | Record<string, number> | Evaluation scores at registration time |
| lockedAt | ISO 8601 datetime | Set when version is locked pending promotion review |
| lockedBy | string | User ID that initiated the lock |
| createdAt * | ISO 8601 datetime | Version creation timestamp |

---

## training-pipeline

### TrainingJob

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Job identifier |
| experimentId * | string | → experiment-tracker.Experiment.id |
| runId * | string | → experiment-tracker.Run.id |
| datasetVersionId * | string | → dataset-vault.DatasetVersion.id |
| modelId | string | → model-registry.ModelRecord.id (if fine-tuning) |
| config * | TrainingConfig | Training configuration (see below) |
| status * | enum: queued, scheduled, running, completed, failed | Job lifecycle state |
| allocationId | string | → compute-scheduler.ResourceAllocation.id |
| submittedBy * | string | User ID |
| submittedAt * | ISO 8601 datetime | Submission timestamp |
| startedAt | ISO 8601 datetime | When training actually began |
| finishedAt | ISO 8601 datetime | When job reached terminal state |
| resultModelVersionId | string | → model-registry.ModelVersion.id (set on completion) |
| errorMessage | string | Failure reason on `failed` status |

### TrainingConfig

| Field | Type | Description |
|---|---|---|
| epochs * | integer | Number of training epochs |
| batchSize * | integer | Mini-batch size |
| learningRate * | number | Initial learning rate |
| optimizer * | string | Optimizer name (e.g. `adam`, `sgd`) |
| lossFunction * | string | Loss function name |
| gpuCount | integer | Requested GPU count (default 1) |
| cpuCount | integer | Requested CPU count (default 4) |
| memoryGiB | number | Requested memory in GiB (default 8) |
| checkpointIntervalEpochs | integer | Save checkpoint every N epochs (default 5) |

---

## dataset-vault

### Dataset

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Dataset identifier |
| name * | string | Human-readable dataset name |
| domain * | string | Domain category (e.g. `nlp`, `vision`, `tabular`) |
| description | string | Dataset description |
| ownerId * | string | Researcher who registered the dataset |
| createdAt * | ISO 8601 datetime | Registration timestamp |

**Relationships:**
- Has many `DatasetVersion`

### DatasetVersion

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Version identifier |
| datasetId * | string | → dataset-vault.Dataset.id |
| versionNumber * | integer | Monotonically increasing version |
| splits * | DatasetSplit | Train/val/test split configuration |
| totalSamples * | integer | Total sample count |
| artifactKey * | string | MinIO object key for the archive |
| artifactChecksum * | string (SHA-256) | Integrity checksum |
| artifactSizeBytes * | integer | Archive size |
| parentVersionId | string | → DatasetVersion.id (for derived datasets) |
| preprocessingSteps | string[] | Ordered list of transformations applied |
| schema | object | Column/feature schema description |
| createdAt * | ISO 8601 datetime | Version creation timestamp |

### DatasetSplit

| Field | Type | Description |
|---|---|---|
| trainPercent * | integer | Training split percentage (0–100) |
| valPercent * | integer | Validation split percentage (0–100) |
| testPercent * | integer | Test split percentage (0–100) |
| stratified | boolean | Whether splits are stratified by label |
| seed | integer | Random seed for reproducibility |

---

## paper-engine

### Paper

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Paper identifier |
| title * | string | Paper title |
| status * | enum: draft, generating, ready, submitted, accepted, rejected | Lifecycle state |
| experimentId * | string | → experiment-tracker.Experiment.id |
| modelVersionId | string | → model-registry.ModelVersion.id |
| authorIds * | string[] | Ordered list of author user IDs |
| abstract | string | Paper abstract (auto-generated or edited) |
| sections * | PaperSection[] | Ordered list of paper sections |
| exportFormats | Array<enum: markdown, latex, pdf> | Available export formats |
| submittedToReviewAt | ISO 8601 datetime | When submitted to review-system |
| createdAt * | ISO 8601 datetime | Creation timestamp |
| updatedAt * | ISO 8601 datetime | Last edit timestamp |

### PaperSection

| Field | Type | Description |
|---|---|---|
| type * | enum: abstract, introduction, methodology, results, discussion, conclusion, references | Section type |
| content * | string | Section body text (Markdown) |
| order * | integer | Display order |
| generatedFrom | string | Template key used for auto-generation |

### PaperRevision

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Revision identifier |
| paperId * | string | → paper-engine.Paper.id |
| sequence * | integer | Monotonically increasing revision number |
| diff | object | Field-level diff from previous revision |
| editedBy * | string | User ID of editor |
| editedAt * | ISO 8601 datetime | Revision timestamp |

---

## compute-scheduler

### ResourcePool

| Field | Type | Description |
|---|---|---|
| id * | string | Fixed: `"default"` |
| totalGPUs * | integer | Total GPU units in pool |
| totalCPUs * | integer | Total CPU units in pool |
| totalMemoryGiB * | number | Total memory in pool |
| availableGPUs * | integer | Currently unallocated GPUs |
| availableCPUs * | integer | Currently unallocated CPUs |
| availableMemoryGiB * | number | Currently unallocated memory |
| updatedAt * | ISO 8601 datetime | Last pool state update |

### Job (Scheduler View)

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Job identifier (shared with training-pipeline.TrainingJob.id) |
| priority * | integer | Priority score (1–10, higher = more urgent) |
| requestedGPUs * | integer | GPUs required |
| requestedCPUs * | integer | CPUs required |
| requestedMemoryGiB * | number | Memory required |
| status * | enum: queued, allocated, running, releasing, released | Scheduler-side lifecycle |
| allocationId | string | → ResourceAllocation.id (set when allocated) |
| queuedAt * | ISO 8601 datetime | When job entered the queue |

### ResourceAllocation

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Allocation identifier |
| jobId * | string | → compute-scheduler.Job.id |
| allocatedGPUs * | integer | GPUs allocated |
| allocatedCPUs * | integer | CPUs allocated |
| allocatedMemoryGiB * | number | Memory allocated |
| allocatedAt * | ISO 8601 datetime | Allocation timestamp |
| releasedAt | ISO 8601 datetime | Deallocation timestamp (null if still active) |

---

## review-system

### PaperReview

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Review record identifier |
| paperId * | string | → paper-engine.Paper.id |
| status * | enum: open, in_progress, submitted, decided, appealed | Review lifecycle state |
| reviewers * | ReviewerAssignment[] | Assigned reviewers |
| decision | enum: accept, reject, revise, undecided | Aggregated decision |
| aggregatedScore | number | Mean reviewer score (1.0–10.0) |
| quorumMet * | boolean | Whether minimum reviewer count has submitted |
| decidedAt | ISO 8601 datetime | When decision was finalized |
| createdAt * | ISO 8601 datetime | Review round creation timestamp |

### ReviewerAssignment

| Field | Type | Description |
|---|---|---|
| reviewerId * | string | User ID of the reviewer |
| assignedAt * | ISO 8601 datetime | Assignment timestamp |
| dueAt * | ISO 8601 datetime | Review deadline |
| submittedAt | ISO 8601 datetime | When review was submitted |
| score | number | Reviewer score (1.0–10.0) |
| comment | string | Written review comment |
| recommendation * | enum: accept, reject, revise | Individual recommendation |
| senior | boolean | Whether this reviewer is a senior reviewer |

### ReviewAppeal

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Appeal identifier |
| reviewId * | string | → review-system.PaperReview.id |
| appellantId * | string | User ID of appellant (must be a paper author) |
| reason * | string | Appeal justification |
| status * | enum: filed, under_review, upheld, denied | Appeal state |
| seniorReviewerId | string | → ReviewerAssignment.reviewerId (must be senior) |
| filedAt * | ISO 8601 datetime | Appeal filing timestamp |
| resolvedAt | ISO 8601 datetime | Resolution timestamp |

---

## collab-hub

### Notification

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Notification identifier |
| recipientId * | string | User ID of recipient |
| type * | string | Notification type (e.g. `review.assigned`, `experiment.completed`) |
| title * | string | Short notification title |
| body | string | Notification body text |
| resourceType | string | Entity type the notification relates to |
| resourceId | string | Entity ID the notification relates to |
| read * | boolean | Whether recipient has read the notification |
| createdAt * | ISO 8601 datetime | Notification creation timestamp |
| readAt | ISO 8601 datetime | When notification was marked read |

### PresenceRecord

| Field | Type | Description |
|---|---|---|
| userId * | string | User currently present |
| resourceType * | string | Entity type being viewed/edited |
| resourceId * | string | Entity ID being viewed/edited |
| action * | enum: viewing, editing | Presence action |
| since * | ISO 8601 datetime | When presence was established |
| expiresAt * | ISO 8601 datetime | TTL expiry (kept alive by heartbeat) |

### Comment

| Field | Type | Description |
|---|---|---|
| id * | string | Thread-scoped ID in format `<servicePrefix>-<localId>` |
| threadId * | string | Thread identifier |
| resourceType * | string | Entity type the thread belongs to |
| resourceId * | string | Entity ID the thread belongs to |
| authorId * | string | User ID of comment author |
| body * | string | Comment text (Markdown) |
| parentCommentId | string | → Comment.id (for replies; null for top-level) |
| createdAt * | ISO 8601 datetime | Comment creation timestamp |
| editedAt | ISO 8601 datetime | Last edit timestamp |
| deletedAt | ISO 8601 datetime | Soft-delete timestamp |

---

## insight-engine

### InsightReport

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Report identifier |
| reportType * | enum: trend, anomaly_summary, top_models, cross_experiment | Report category |
| generatedAt * | ISO 8601 datetime | Report generation timestamp |
| parameters | object | Parameters used to generate the report |
| results * | object | Report payload (type-specific structure) |
| experimentCount * | integer | Number of experiments included |
| cacheExpiresAt * | ISO 8601 datetime | When cached report becomes stale |

### AnomalyAlert

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | Alert identifier |
| experimentId * | string | → experiment-tracker.Experiment.id |
| runId * | string | → experiment-tracker.Run.id |
| metric * | string | Metric name that triggered the alert |
| observedValue * | number | The anomalous value observed |
| baselineMean * | number | Population mean used for comparison |
| baselineStddev * | number | Population standard deviation |
| zScore * | number | Computed Z-score |
| severity * | enum: warning, critical | Alert severity (warning: |z|≥2.5, critical: |z|≥4.0) |
| direction * | enum: high, low | Whether the anomaly is above or below the baseline |
| detectedAt * | ISO 8601 datetime | Alert detection timestamp |
| acknowledgedAt | ISO 8601 datetime | When a researcher acknowledged the alert |
| acknowledgedBy | string | User ID who acknowledged |

---

## auth-gateway

### TokenPayload

| Field | Type | Description |
|---|---|---|
| sub * | string | Subject — user ID |
| email * | string | User email (masked in logs) |
| roles * | string[] | Granted roles (e.g. `researcher`, `reviewer`, `admin`, `auditor`) |
| scopes * | string[] | Granted OAuth-style scopes |
| iat * | integer | Issued-at Unix timestamp |
| exp * | integer | Expiry Unix timestamp |
| jti * | string (UUID) | JWT ID — unique per token |

### UserRecord

| Field | Type | Description |
|---|---|---|
| id * | string (UUID) | User identifier |
| email * | string | User email address (unique) |
| fullName * | string | Display name |
| roles * | string[] | Assigned roles |
| active * | boolean | Whether account is active |
| createdAt * | ISO 8601 datetime | Account creation timestamp |
| lastLoginAt | ISO 8601 datetime | Most recent successful authentication |

---

## Cross-Service Relationship Map

```
experiment-tracker.Experiment
  └── has many Run
  └── referenced by training-pipeline.TrainingJob.experimentId
  └── referenced by paper-engine.Paper.experimentId
  └── aggregated by insight-engine

model-registry.ModelVersion
  └── referenced by training-pipeline.TrainingJob.resultModelVersionId
  └── referenced by paper-engine.Paper.modelVersionId
  └── parent of next ModelVersion via parentVersionId

dataset-vault.DatasetVersion
  └── referenced by training-pipeline.TrainingJob.datasetVersionId
  └── referenced by model-registry.ModelVersion.datasetVersionId

paper-engine.Paper
  └── submitted to review-system.PaperReview
  └── notifies collab-hub

compute-scheduler.ResourceAllocation
  └── referenced by training-pipeline.TrainingJob.allocationId

auth-gateway.UserRecord
  └── referenced as ownerId/authorId/reviewerId across all services
```
