# Architecture Diagrams — Evensong III ML Research Platform

Three Mermaid diagrams covering system topology, experiment lifecycle data flow, and event bus interactions.

---

## Diagram 1: System Overview

All 10 application services and 4 infrastructure services with their connections and ports.

```mermaid
graph TB
    subgraph Clients["Client Layer"]
        CLI["CLI / API Clients"]
    end

    subgraph Gateway["Auth Layer"]
        AG["auth-gateway\n:3010"]
    end

    subgraph Wave1["Wave 1 Services"]
        ET["experiment-tracker\n:3001"]
        MR["model-registry\n:3002"]
        DV["dataset-vault\n:3004"]
    end

    subgraph Wave2["Wave 2 Services"]
        TP["training-pipeline\n:3003"]
        PE["paper-engine\n:3005"]
        CS["compute-scheduler\n:3006"]
        RS["review-system\n:3007"]
        CH["collab-hub\n:3008"]
        IE["insight-engine\n:3009"]
    end

    subgraph Infra["Infrastructure"]
        PG[("postgres\n:5432")]
        RD[("redis\n:6379")]
        RMQ[("rabbitmq\n:5672")]
        MN[("minio\n:9000")]
    end

    CLI -->|"Bearer token"| AG
    CLI --> ET
    CLI --> MR
    CLI --> DV
    CLI --> TP
    CLI --> PE
    CLI --> CS
    CLI --> RS
    CLI --> CH
    CLI --> IE

    AG --> RD
    AG --> PG

    ET --> PG
    ET --> RD
    ET <-->|"events"| RMQ

    MR --> PG
    MR --> MN
    MR <-->|"events"| RMQ

    DV --> PG
    DV --> MN
    DV <-->|"events"| RMQ

    TP --> PG
    TP --> RD
    TP <-->|"events"| RMQ
    TP -->|"HTTP"| ET
    TP -->|"HTTP"| MR

    PE --> PG
    PE <-->|"events"| RMQ
    PE -->|"HTTP"| ET

    CS --> PG
    CS --> RD
    CS <-->|"events"| RMQ

    RS --> PG
    RS <-->|"events"| RMQ
    RS -->|"HTTP"| PE

    CH --> RD
    CH <-->|"events"| RMQ

    IE --> RD
    IE <-->|"events"| RMQ
    IE -->|"HTTP"| ET
    IE -->|"HTTP"| MR
    IE -->|"HTTP"| CS

    style Wave1 fill:#e8f4f8,stroke:#2196F3
    style Wave2 fill:#fff8e1,stroke:#FF9800
    style Infra fill:#f3e5f5,stroke:#9C27B0
    style Gateway fill:#e8f5e9,stroke:#4CAF50
```

---

## Diagram 2: Experiment Lifecycle Data Flow

The full lifecycle of a single ML experiment from creation through paper submission.

```mermaid
sequenceDiagram
    actor R as Researcher
    participant ET as experiment-tracker
    participant DV as dataset-vault
    participant CS as compute-scheduler
    participant TP as training-pipeline
    participant MR as model-registry
    participant PE as paper-engine
    participant RS as review-system
    participant CH as collab-hub
    participant IE as insight-engine

    R->>ET: POST /experiments (params, tags)
    ET-->>R: {experimentId, status: queued}

    R->>DV: GET /datasets/:id/versions/:v/download
    DV-->>R: presigned MinIO URL

    R->>TP: POST /jobs {experimentId, datasetVersionId, config}
    TP->>ET: PATCH /experiments/:id/status {running}
    TP->>CS: POST /resources/request {gpus, cpus, memory}
    CS-->>TP: {allocationId, allocated: true}

    Note over TP: Training executes

    loop Every N epochs
        TP->>ET: POST /experiments/:id/runs/:runId/metrics
        ET->>IE: event: experiment.metrics.updated
        IE-->>CH: event: insight.anomaly.detected (if z > 2.5)
        CH-->>R: notification: anomaly alert
    end

    TP->>MR: POST /models/:id/versions {artifactKey, checksum, hyperparams}
    MR-->>TP: {modelVersionId}
    TP->>ET: PATCH /experiments/:id/status {completed}
    TP->>CS: DELETE /resources/allocations/:allocationId

    ET->>IE: event: experiment.completed
    IE->>IE: update baseline statistics

    R->>PE: POST /papers/generate {experimentId, modelVersionId}
    PE->>ET: GET /experiments/:id (fetch metrics)
    PE-->>R: {paperId, status: ready}

    R->>RS: POST /reviews {paperId}
    RS->>CH: event: review.assigned (notify reviewers)
    CH-->>R: notification: reviewer assignments confirmed

    Note over RS: Peer review cycle

    RS->>PE: PATCH /papers/:id/status {accepted}
    RS->>CH: event: review.decided
    CH-->>R: notification: paper accepted
```

---

## Diagram 3: Event Bus Interaction Map

All events published to and consumed from the RabbitMQ event bus, organized by exchange.

```mermaid
graph LR
    subgraph Producers["Event Producers"]
        ET2["experiment-tracker"]
        MR2["model-registry"]
        TP2["training-pipeline"]
        DV2["dataset-vault"]
        CS2["compute-scheduler"]
        RS2["review-system"]
        PE2["paper-engine"]
    end

    subgraph Bus["RabbitMQ Exchanges"]
        EX_EXP["experiment.events"]
        EX_MODEL["model.events"]
        EX_TRAIN["training.events"]
        EX_DATA["dataset.events"]
        EX_SCHED["scheduler.events"]
        EX_REVIEW["review.events"]
        EX_PAPER["paper.events"]
        EX_SEC["security.events"]
    end

    subgraph Consumers["Event Consumers"]
        TP3["training-pipeline"]
        PE3["paper-engine"]
        IE3["insight-engine"]
        CH3["collab-hub"]
        MR3["model-registry"]
        ET3["experiment-tracker"]
    end

    %% Producers → Exchanges
    ET2 -->|"experiment.created\nexperiment.updated\nexperiment.completed\nexperiment.failed"| EX_EXP
    ET2 -->|"security.events.auth_failure"| EX_SEC

    MR2 -->|"model.version.registered\nmodel.version.promoted\nmodel.version.deprecated"| EX_MODEL

    TP2 -->|"training.started\ntraining.progress\ntraining.completed\ntraining.failed"| EX_TRAIN

    DV2 -->|"dataset.registered\ndataset.version.created"| EX_DATA

    CS2 -->|"scheduler.allocated\nscheduler.released\nscheduler.preempted"| EX_SCHED

    RS2 -->|"review.assigned\nreview.submitted\nreview.decided\nreview.appealed"| EX_REVIEW

    PE2 -->|"paper.generated\npaper.submitted\npaper.revision.created"| EX_PAPER

    %% Exchanges → Consumers
    EX_EXP -->|"experiment.completed"| TP3
    EX_EXP -->|"experiment.*"| IE3
    EX_EXP -->|"experiment.completed\nexperiment.failed"| CH3

    EX_MODEL -->|"model.version.promoted"| PE3
    EX_MODEL -->|"model.version.*"| IE3
    EX_MODEL -->|"model.version.promoted"| CH3

    EX_TRAIN -->|"training.completed"| ET3
    EX_TRAIN -->|"training.completed"| MR3
    EX_TRAIN -->|"training.*"| IE3
    EX_TRAIN -->|"training.progress"| CH3

    EX_SCHED -->|"scheduler.allocated\nscheduler.preempted"| TP3

    EX_REVIEW -->|"review.assigned"| CH3
    EX_REVIEW -->|"review.decided"| PE3
    EX_REVIEW -->|"review.*"| CH3

    EX_PAPER -->|"paper.submitted"| CH3

    EX_SEC -->|"security.*"| CH3

    style Bus fill:#fff3e0,stroke:#E65100
    style Producers fill:#e3f2fd,stroke:#1565C0
    style Consumers fill:#e8f5e9,stroke:#2E7D32
```

---

## Notes on the Diagrams

**Wave topology (Diagram 1):** The Wave 1 / Wave 2 boundary reflects the two-wave agent dispatch strategy in ADR-004. Wave 1 services (experiment-tracker, model-registry, dataset-vault, auth-gateway) have no upstream service HTTP dependencies and can start in parallel. Wave 2 services depend on Wave 1 health checks before startup.

**Event bus mock (Diagrams 2 & 3):** In unit and integration tests, the RabbitMQ exchanges are replaced by the in-process `EventEmitter` mock from `@evensong/event-bus/mock` (per ADR-002). The event naming and routing key conventions are identical between real and mock bus implementations, so diagrams represent both modes accurately.

**Auth flow:** auth-gateway is shown separately from Wave 1 because its role is cross-cutting — it validates tokens for all other services but is not an upstream dependency for service startup. Services validate tokens locally via the shared `@evensong/auth` package; they do not make synchronous calls to auth-gateway per request.
