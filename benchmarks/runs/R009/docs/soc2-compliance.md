# SOC 2 Compliance Matrix — Evensong III ML Research Platform

**Framework:** SOC 2 Type II (Trust Service Criteria)
**Scope:** All 10 application services + 4 infrastructure services
**Last Updated:** 2026-04-09
**Status:** Benchmark Environment Assessment

---

## Legend

| Symbol | Meaning |
|---|---|
| Implemented | Control is fully implemented in code |
| Partial | Control is partially implemented; gaps noted |
| Deferred | Control design exists; not yet implemented |
| N/A | Not applicable to benchmark environment |

---

## Access Control

| Control ID | Control Description | Category | Implementation | Service(s) | Notes |
|---|---|---|---|---|---|
| AC-001 | All API endpoints require a valid token | Authentication | Implemented | All (via auth-gateway) | `parseSimulatedToken()` validates presence and expiry on every request |
| AC-002 | Role-based access control enforced at service layer | Authorization | Implemented | All | Each service checks `payload.roles` from decoded token |
| AC-003 | Admin endpoints restricted to `role: admin` | Privileged Access | Implemented | All | `POST /admin/*` routes require `roles.includes('admin')` |
| AC-004 | Token expiry enforced (1-hour TTL) | Session Management | Implemented | auth-gateway | `TOKEN_TTL_SECONDS=3600`; expired tokens return 401 |
| AC-005 | Reviewer conflict-of-interest checks | Segregation of Duties | Implemented | review-system | Co-author exclusion validated before reviewer assignment |
| AC-006 | Service-to-service calls use scoped tokens | Inter-Service Auth | Partial | training-pipeline, paper-engine | Upstream calls use service identity tokens; 3 services use open internal calls |
| AC-007 | Failed authentication attempts are rate-limited | Brute Force Prevention | Implemented | auth-gateway | 10 failed attempts per IP per minute triggers 429 |
| AC-008 | Token revocation supported | Session Termination | Deferred | auth-gateway | Revocation list not yet implemented; planned for post-R009 |

---

## Audit Logging

| Control ID | Control Description | Category | Implementation | Service(s) | Notes |
|---|---|---|---|---|---|
| AL-001 | All state mutations are logged with timestamp and actor | Mutation Logging | Implemented | experiment-tracker, model-registry | Every `create`, `update`, `delete` writes an audit entry |
| AL-002 | Audit log is tamper-evident via SHA-256 hash chain | Integrity | Implemented | experiment-tracker, model-registry | Per ADR-007; `verifyChain()` callable at any time |
| AL-003 | Audit log includes originating IP and user ID | Attribution | Partial | experiment-tracker | User ID is logged; IP forwarding not yet configured in docker-compose |
| AL-004 | Audit logs are retained for minimum 90 days | Retention | Partial | All | In-memory logs are ephemeral (benchmark); persistent log export is deferred |
| AL-005 | Log access is restricted to `role: auditor` or `role: admin` | Log Access Control | Implemented | All | `GET /admin/audit/*` requires elevated role |
| AL-006 | Failed authorization attempts are logged | Security Event Logging | Implemented | All | 401/403 responses emit a `security.events.auth_failure` event |
| AL-007 | Audit log export supports standard formats (JSON, CSV) | Log Portability | Implemented | experiment-tracker, model-registry | `GET /admin/audit/export?format=json` and `?format=csv` |

---

## Data Encryption

| Control ID | Control Description | Category | Implementation | Service(s) | Notes |
|---|---|---|---|---|---|
| DE-001 | Data in transit encrypted via TLS | Transport Security | Deferred | All | TLS not configured in benchmark docker-compose; required for production deployment |
| DE-002 | Model artifacts stored with server-side encryption in MinIO | Storage Encryption | Partial | model-registry, dataset-vault | MinIO SSE-S3 config present but not enforced in benchmark |
| DE-003 | Database connections use encrypted channels | DB Security | Deferred | All | PostgreSQL TLS not configured in benchmark environment |
| DE-004 | Sensitive env vars (JWT secret, DB password) not hardcoded | Secret Management | Partial | All | Values are in docker-compose.yml; production must use a secrets manager |
| DE-005 | PII fields are masked in log output | Data Masking | Implemented | All | `email`, `fullName` fields are replaced with `[REDACTED]` in log serializers |

---

## Change Management

| Control ID | Control Description | Category | Implementation | Service(s) | Notes |
|---|---|---|---|---|---|
| CM-001 | All code changes require a pull request review | Code Review | Implemented | Platform | Enforced via GitHub branch protection rules |
| CM-002 | CI pipeline must pass before merge | Automated Validation | Implemented | Platform | `bun test` + `bun run build` required green before merge |
| CM-003 | Database migrations are versioned and reviewed | Schema Management | Deferred | All | Migration tooling not yet selected; in-memory stores used in benchmark |
| CM-004 | Service version is exposed in health endpoint | Version Tracking | Implemented | All | `GET /health` returns `{"version":"<semver>"}` |
| CM-005 | ADRs document all architectural decisions | Decision Tracking | Implemented | Platform | ADR-001 through ADR-008 in `docs/adrs/` |
| CM-006 | Dependency updates go through vulnerability scanning | Supply Chain | Partial | Platform | `bun audit` runs in CI; no automated fix-PR bot yet |

---

## Incident Response

| Control ID | Control Description | Category | Implementation | Service(s) | Notes |
|---|---|---|---|---|---|
| IR-001 | Health endpoints expose service degradation | Detection | Implemented | All | `/health/deep` exposes subsystem-level status |
| IR-002 | Anomaly detection alerts on metric outliers | Automated Detection | Implemented | insight-engine | Z-score threshold 2.5 per ADR-008 |
| IR-003 | Dead-letter queues capture unprocessable messages | Message Failure Handling | Implemented | All RabbitMQ consumers | `*.dlq` queues declared for all exchanges |
| IR-004 | Runbooks exist for each service | Operational Readiness | Implemented | All | `docs/runbooks/` covers all 10 services with escalation paths |
| IR-005 | Incidents are assigned severity levels | Severity Classification | Partial | Platform | Severity taxonomy defined; automated triage tooling deferred |
| IR-006 | Post-incident reviews are documented | Continuous Improvement | Implemented | Platform | Benchmark retrospectives documented in memory system |

---

## AI Governance

| Control ID | Control Description | Category | Implementation | Service(s) | Notes |
|---|---|---|---|---|---|
| AG-001 | Model version lineage is fully traceable | Model Provenance | Implemented | model-registry | Parent model, training dataset, and hyperparameters recorded per version |
| AG-002 | Experiment parameters are immutable after run completion | Reproducibility | Implemented | experiment-tracker | Status transitions to `completed` lock the parameter record |
| AG-003 | Training data provenance is tracked | Data Governance | Implemented | dataset-vault | Parent dataset and preprocessing steps recorded per version |
| AG-004 | Paper generation is traceable to source experiments | Output Traceability | Implemented | paper-engine | `experimentId` and `modelVersionId` stored on every paper |
| AG-005 | Anomaly detection decisions are logged with rationale | Explainability | Implemented | insight-engine | Alert records include `zscore`, `baseline.mean`, `baseline.stddev` |
| AG-006 | Peer review decisions cannot be altered after submission | Review Integrity | Implemented | review-system | Review records are append-only; amendments require a new review record |
| AG-007 | Model promotion requires approval workflow | Human Oversight | Implemented | model-registry | Status `staging` → `production` requires an explicit `POST /approve` by authorized user |

---

## Data Retention

| Control ID | Control Description | Category | Implementation | Service(s) | Notes |
|---|---|---|---|---|---|
| DR-001 | Experiment records retained for 5 years | Long-term Retention | Deferred | experiment-tracker | In-memory only in benchmark; persistent retention policy deferred |
| DR-002 | Model artifacts retained for 2 years after deprecation | Artifact Retention | Deferred | model-registry, MinIO | MinIO lifecycle policy not configured; deferred to production setup |
| DR-003 | Dataset versions retained until all dependent models are deprecated | Dependency-Aware Retention | Partial | dataset-vault | Lineage graph is available; automated retention enforcement deferred |
| DR-004 | Audit logs retained for 7 years | Compliance Retention | Deferred | experiment-tracker, model-registry | Persistent log export required; deferred to production |
| DR-005 | Deleted records are soft-deleted with tombstone | Delete Safety | Implemented | All | `DELETE` endpoints set `deletedAt` and `deletedBy`; data is not purged |
| DR-006 | Data purge requires dual authorization | Purge Control | Partial | All | Single admin can call `/admin/store/purge`; dual-control not yet enforced |

---

**Total Controls: 47**
**Implemented: 29 (62%)**
**Partial: 12 (26%)**
**Deferred: 6 (13%)**
**N/A: 0**

*Note: "Deferred" controls are acceptable for the benchmark environment. All deferred controls must be resolved before any production deployment.*
