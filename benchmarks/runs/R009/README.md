# Evensong III — ML Research Platform (R009)

Benchmark run R009 implements a full ML research lifecycle platform across 10 microservices. The system covers experiment tracking, model versioning, training pipeline orchestration, dataset management, paper authoring, compute scheduling, peer review, collaboration, insight analytics, and authentication.

---

## Services

| Service | Port | Responsibility |
|---|---|---|
| experiment-tracker | 3001 | Create and track ML experiments; log metrics, parameters, and run state |
| model-registry | 3002 | Version and store trained model artifacts with lineage tracking |
| training-pipeline | 3003 | Orchestrate distributed training jobs; emit progress events |
| dataset-vault | 3004 | Manage dataset versions, splits, and binary storage via MinIO |
| paper-engine | 3005 | Generate, draft, and export research papers from experiment results |
| compute-scheduler | 3006 | Allocate GPU/CPU resources; queue and prioritize training jobs |
| review-system | 3007 | Peer review workflow for papers; scoring, comments, decisions |
| collab-hub | 3008 | Real-time collaboration channels; notifications and presence |
| insight-engine | 3009 | Cross-experiment analytics; Z-score anomaly detection; trend reports |
| auth-gateway | 3010 | JWT token issuance, validation, and RBAC enforcement |

## Infrastructure

| Service | Port | Purpose |
|---|---|---|
| postgres | 5432 | Persistent relational store |
| redis | 6379 | Cache, sessions, rate limiting |
| rabbitmq | 5672 / 15672 | Async event bus between services |
| minio | 9000 / 9001 | Object storage for models and datasets |

---

## Quick Start

```bash
# Bring up all infrastructure and services
docker compose up -d

# Tail logs for a specific service
docker compose logs -f experiment-tracker

# Run full benchmark suite
bun test services/ --coverage

# Run a single service in isolation
cd services/experiment-tracker && bun run dev
```

Health endpoints are available at `http://localhost:<port>/health` for every service.

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for three Mermaid diagrams:
- System overview (services + infra topology)
- Experiment lifecycle data flow
- Event bus interaction map

---

## ADRs

Architectural Decision Records are in [`docs/adrs/`](docs/adrs/). Key decisions:

| ADR | Decision |
|---|---|
| ADR-001 | In-memory stores for benchmark runs (no live DB migrations during test) |
| ADR-002 | RabbitMQ event bus for all cross-service communication |
| ADR-003 | Simulated JWT auth (no real crypto overhead in benchmark) |
| ADR-004 | Two-wave agent dispatch to maximize parallel build throughput |
| ADR-005 | 500-line test file cap for Bun 1.3.x compatibility |
| ADR-006 | Property-based fuzz testing for edge-case discovery |
| ADR-007 | SHA-256 hash chain for immutable audit trail |
| ADR-008 | Z-score threshold of 2.5 for anomaly detection alerts |

---

## Runbooks

Operational runbooks for each service are in [`docs/runbooks/`](docs/runbooks/). Each covers health checks, common failure modes, and escalation paths.

---

## Compliance

SOC 2 control mapping is in [`docs/soc2-compliance.md`](docs/soc2-compliance.md) (26+ controls across Access Control, Audit Logging, Data Encryption, Change Management, Incident Response, AI Governance, and Data Retention).

---

## Data Dictionary

All entity types, fields, and cross-service relationships are documented in [`docs/data-dictionary.md`](docs/data-dictionary.md).

---

## Test Stats (R009 Target)

| Metric | Target |
|---|---|
| Total tests | 700+ |
| Pass rate | 100% |
| Services covered | 10/10 |
| Test files per service | ≤ 500 lines each |
| Wall clock | < 15 min |

---

## Prior Runs

| Run | Tests | Result |
|---|---|---|
| R007 | 448 | 0 fail, 24/24 services, ~12 min |
| R008 | 664 | 0 fail, 28/28 services, B grade (insight-engine hang) |
| R009 | TBD | Target: 700+, A grade |
