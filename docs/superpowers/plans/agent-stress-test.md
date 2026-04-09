# Agent Stress Test: Multi-Region FinTech Platform

## 压力测试任务 — 压力测试将驱动 CCB 跨越所有维度达到极限

---

## 任务背景 / CONTEXT

You are a Staff Engineer at **Meridian Financial Systems**, a mid-size fintech company processing $2.4B in annual transaction volume. The company provides payment infrastructure for 3,200+ SMBs across North America and EMEA. Your CTO has mandated a full platform rewrite to replace a crumbling Perl monolith and meet SOC2 Type II audit requirements before Q4.

**The deadline is 90 days. You have no external contractors. You must deliver the complete system alone.**

Your agent must produce a complete, production-grade platform spec and reference implementation across six independent service domains. Every service must be realistic enough to pass a senior engineer's review. Every architectural decision must be defensible under audit scrutiny.

**Scale context:**
- 3,200 merchant clients, growing 15% MoM
- 8,000 transactions per minute at peak (TPS),目标是 12,000
- 99.95% uptime SLA (4.38 hours of downtime/year max)
- P99 latency budget: 200ms for payment processing, 500ms for dashboard APIs
- 400GB transaction data/month, stored 7 years for compliance
- SOC2 Type II audit scope: all services, all data flows, all access logs

**Tech stack constraints:**
- Runtime: Bun (this codebase's constraint)
- Services: TypeScript/Node.js microservices (no Python, no Java)
- Database: PostgreSQL 16 (primary), Redis 7 (cache/queue)
- Message broker: RabbitMQ (no Kafka — cost constraint)
- Cloud: AWS multi-region (us-east-1 primary, eu-west-1 secondary)
- Observability: OpenTelemetry + Grafana Cloud (not Datadog — cost constraint)
- Container: Docker, orchestrated via Docker Compose (no Kubernetes yet)
- IaC: Terraform (not Pulumi — team familiarity)

**Team topology:**
- 4 engineers (you are the most senior), each owns 1-2 service domains
- 1 DevOps engineer managing CI/CD and IaC
- 1 compliance officer (non-technical, reviews all architecture decisions)
- External SOC2 auditor (tests your controls in week 12)

---

## 系统架构 / SYSTEM ARCHITECTURE

Design and document the complete system across **six independent service domains**. Each domain must be specified as a complete microservice with API contracts, data models, security controls, and operational runbooks.

---

### Domain 1: Payment Processing Engine (支付处理引擎)

**Service name:** `payment-engine`
**Owner:** You (Staff Engineer, payment domain expert)
**Responsibility:** Authorize, capture, and settle payment transactions in real time.

**Functional requirements:**
- Accept payment authorization requests via REST API (`POST /v1/authorizations`) and async webhooks from payment gateways (Stripe, Adyen, Braintree)
- Support card-present (POS), card-not-present (e-commerce), and ACH payment types
- Idempotency via `Idempotency-Key` header — duplicate requests within 24h must return the original response, not re-process
- Support partial captures, full captures, and voids
- Settlement batch job runs every 15 minutes, groups captures by merchant and batch-sends to acquiring bank via SFTP
- Retry failed settlements up to 3x with exponential backoff (base: 30s), then dead-letter to `settlement-failures` queue for manual review
- Rate limit: 50 req/s per merchant, tracked via Redis sliding window

**API contract:**

```
POST   /v1/authorizations         # Create auth (blocking, <100ms p99)
POST   /v1/authorizations/:id/capture  # Capture funds
POST   /v1/authorizations/:id/void     # Void auth
GET    /v1/authorizations/:id           # Get auth status
POST   /v1/webhooks/gateway           # Inbound webhook from payment gateways
GET    /v1/settlements                  # List settlement batches
GET    /v1/settlements/:batch_id       # Get batch details
```

**Data model (PostgreSQL):**

```sql
-- authorizations table
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
merchant_id     UUID NOT NULL REFERENCES merchants(id)
gateway         TEXT NOT NULL CHECK (gateway IN ('stripe','adyen','braintree','ach'))
gateway_txn_id  TEXT NOT NULL  -- ID assigned by the payment gateway
amount          BIGINT NOT NULL  -- in cents
currency        CHAR(3) NOT NULL
status          TEXT NOT NULL CHECK (status IN ('pending','authorized','captured','voided','expired','failed'))
idempotency_key TEXT UNIQUE NOT NULL
gateway_raw     JSONB  -- raw response from gateway, for debugging/audit
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
expires_at      TIMESTAMPTZ NOT NULL  -- auth expires after 7 days

-- settlements table
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
batch_id        TEXT NOT NULL UNIQUE  -- e.g. "BATCH-2026-04-09-1430"
merchant_id     UUID NOT NULL REFERENCES merchants(id)
settlement_date DATE NOT NULL
total_amount    BIGINT NOT NULL
currency        CHAR(3) NOT NULL
status          TEXT NOT NULL CHECK (status IN ('pending','submitted','confirmed','failed'))
submitted_at    TIMESTAMPTZ
confirmed_at    TIMESTAMPTZ
gateway_confirm_ref TEXT
retry_count    INTEGER NOT NULL DEFAULT 0

-- settlement_line_items (one per authorization in batch)
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
settlement_id   UUID NOT NULL REFERENCES settlements(id)
authorization_id UUID NOT NULL REFERENCES authorizations(id)
amount          BIGINT NOT NULL
```

**Non-functional requirements:**
- p99 latency < 100ms for authorization endpoint
- Zero data loss on crash — use PostgreSQL transactions + write-ahead log
- All gateway responses stored in `gateway_raw` JSONB for PCI-DSS compliance audit trail
- TLS 1.3 only for all inbound and outbound connections
- mTLS with payment gateways using client certificates stored in AWS Secrets Manager

**Scaling:** Horizontally scalable via Docker Compose replica set. 3 instances behind an AWS ALB. Sticky sessions disabled (stateless service design).

**Chaos engineering (Domain 1 specific):**
- Test: Kill one of 3 service instances during peak traffic. System must reroute within 5 seconds with zero failed transactions.
- Test: Simulate PostgreSQL connection pool exhaustion (50 connections). Service must queue requests and fail gracefully with 503, not deadlock.
- Test: Simulate gateway timeout (5s). Service must return 504 with idempotent retry hint, not drop the transaction.

---

### Domain 2: Merchant Portal & Dashboard API (商户门户)

**Service name:** `merchant-portal-api`
**Owner:** You (UX-adjacent Staff Engineer)
**Responsibility:** Multi-tenant SaaS dashboard for merchants to view transactions, manage payouts, configure webhook integrations, and monitor health.

**Functional requirements:**
- JWT-based authentication — RS256 signed tokens, 1-hour expiry, refresh token rotation (7-day refresh tokens stored in Redis with TTL)
- Role-based access control: `owner`, `admin`, `viewer` roles per merchant; global `support` role for internal staff
- GraphQL API (not REST) for dashboard queries — merchants need flexible ad-hoc reporting
- WebSocket endpoint (`/ws`) for live transaction feed — merchants subscribe to their own merchant_id channel only; cross-tenant subscription attempts must be rejected and logged as security events
- Payout management: merchants configure payout schedule (daily/weekly/monthly), minimum payout threshold ($100), and destination bank account (Plaid-verified)
- Webhook configuration: merchants register outbound webhooks with HMAC-SHA256 signature verification; max 5 webhooks per merchant; payload delivered with 3-retry exponential backoff
- Export: CSV and PDF export of transaction history (last 90 days); async job queued to RabbitMQ, completion notified via WebSocket

**API contract (GraphQL):**

```graphql
type Query {
  transactions(merchantId: ID!, cursor: String, limit: Int = 50): TransactionConnection!
  transaction(id: ID!): Transaction
  settlements(merchantId: ID!): [Settlement!]!
  merchant(id: ID!): Merchant
  webhookConfigs(merchantId: ID!): [WebhookConfig!]!
  healthMetrics(merchantId: ID!): HealthMetrics!
}

type Mutation {
  updatePayoutSettings(merchantId: ID!, input: PayoutSettingsInput!): PayoutSettings!
  registerWebhook(merchantId: ID!, input: WebhookInput!): WebhookConfig!
  deleteWebhook(merchantId: ID!, webhookId: ID!): Boolean!
  requestExport(merchantId: ID!, format: ExportFormat!): ExportJob!
}

type Subscription {
  transactionStream(merchantId: ID!): Transaction!
}
```

**Security controls:**
- JWT tokens must contain `merchant_id` and `role` claims; verify signature against JWKS endpoint
- Row-level security: all queries must scope to `merchant_id` from JWT; no cross-tenant data access
- WebSocket: validate `merchant_id` in subscription message against authenticated user's token
- HMAC webhook signatures: `SHA256(secret, timestamp + "." + payload)` — verify timestamp within 5 minutes to prevent replay
- Rate limit: 1000 req/min per merchant for GraphQL, 100 req/min for export jobs
- Audit log: every mutation writes to `audit_log` table with actor ID, IP, timestamp, and mutation name

**Non-functional requirements:**
- GraphQL query p99 < 500ms for standard dashboards, < 2s for complex ad-hoc reports
- WebSocket must handle 50,000 concurrent connections per instance (test with `wscat`)
- Export jobs must complete within 60 seconds for 90-day CSV; return presigned S3 URL
- All PII fields (bank account numbers, names) must be encrypted at rest using AES-256-GCM; keys in AWS KMS

---

### Domain 3: Compliance & Anti-Fraud Engine (合规与反欺诈)

**Service name:** `compliance-engine`
**Owner:** You (with compliance officer collaboration)
**Responsibility:** Real-time transaction monitoring, fraud scoring, SAR (Suspicious Activity Report) generation, and SOC2 audit log pipeline.

**Functional requirements:**
- Real-time fraud scoring via a rules engine + ML model inference:
  - Rules engine (homegrown, no external vendor): velocity checks (transactions per card/hour), amount thresholds per merchant category, geolocation anomalies, time-of-day heuristics
  - ML model: binary fraud probability score (0.0–1.0) via ONNX runtime running a scikit-learn model converted to ONNX; model served locally, not via external API (latency budget: 20ms per inference)
  - Combined score = 0.6 * rules_score + 0.4 * ml_score; threshold of 0.75 triggers review queue
- Transaction deduplication: hash (`SHA256(pan + amount + timestamp)`) indexed in Redis with 24h TTL — duplicate detection before scoring
- SAR generation: when a transaction is flagged and confirmed fraudulent, auto-generate SAR document (JSON + PDF) filed to internal SAR store; compliance officer reviews and e-signs
- Case management: compliance officer can mark transactions as `false_positive`, `confirmed_fraud`, or `under_investigation`; all decisions audit-logged
- SOC2 audit log pipeline: every service writes structured JSON logs to a Kafka-less RabbitMQ fanout exchange; `compliance-engine` consumes all logs, validates schema, and archives to PostgreSQL `audit_events` table with 7-year retention; logs immutable (no UPDATE/DELETE)
- PII anonymization: for analytics, PII is hashed with HMAC-SHA256 (separate key per environment) before storage; reversal only available via compliance officer MFA-gated lookup

**Rules engine DSL (simplified):**

```
RULE "velocity_card"
  IF card_hash IN (SELECT card_hash FROM transactions WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY card_hash HAVING COUNT(*) > 5)
  THEN score += 0.3

RULE "high_amount_merchant"
  IF amount > merchant_avg * 3 AND amount > 50000  -- $500 in cents
  THEN score += 0.2

RULE "geolocation_mismatch"
  IF EXISTS (SELECT 1 FROM geo_check WHERE ip_prefix = current_ip_prefix AND country != card_country)
  THEN score += 0.25
```

**Data model:**

```sql
-- fraud_scores table
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
transaction_id  UUID NOT NULL REFERENCES authorizations(id)
rules_score     REAL NOT NULL CHECK (rules_score >= 0 AND rules_score <= 1)
ml_score        REAL NOT NULL CHECK (ml_score >= 0 AND ml_score <= 1)
combined_score  REAL NOT NULL CHECK (combined_score >= 0 AND combined_score <= 1)
decision        TEXT CHECK (decision IN ('approve','review','reject'))
reviewed_by     UUID REFERENCES users(id)
reviewed_at     TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()

-- sarfilings table
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
transaction_id  UUID NOT NULL REFERENCES authorizations(id)
sar_number      TEXT UNIQUE NOT NULL  -- e.g. "SAR-2026-Q1-0042"
status          TEXT CHECK (status IN ('draft','submitted','under_review','closed'))
filed_at        TIMESTAMPTZ
closed_at       TIMESTAMPTZ
closure_reason  TEXT
filed_by        UUID NOT NULL REFERENCES users(id)

-- audit_events table (append-only, no FK to avoid FK lock contention)
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
service_name    TEXT NOT NULL
event_type      TEXT NOT NULL
actor_id        TEXT  -- null for system events
actor_ip        TEXT
resource_type    TEXT
resource_id      TEXT
payload         JSONB NOT NULL
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
-- Partitioned by month on created_at for efficient archival
```

**Non-functional requirements:**
- ML inference p99 < 20ms (including Redis lookup)
- Fraud scoring pipeline total p99 < 80ms end-to-end
- Audit log throughput: must handle 8,000 events/second with < 5ms write latency to PostgreSQL (use connection pooling + prepared statements)
- Audit events immutable — enforce via PostgreSQL rule: `DENY UPDATE AND DELETE ON audit_events`

---

### Domain 4: Multi-Region Data Pipeline (多区域数据管道)

**Service name:** `data-pipeline`
**Owner:** You (data engineering)
**Responsibility:** Move transaction data from us-east-1 to eu-west-1 in near-real time; manage cross-region replication lag, schema migrations, and data residency compliance (GDPR).

**Functional requirements:**
- Change Data Capture (CDC) from PostgreSQL us-east-1 using `pg_logical_replication` — publish to RabbitMQ exchange `cdc.transactions`
- Consumer in eu-west-1 subscribes and applies to replica DB with < 30 second replication lag target
- Schema migration strategy: sequential migrations via `migrate` tool; zero-downtime migrations for adding columns (backward-compatible only); hard locks banned for any migration affecting `authorizations` or `settlements` tables
- GDPR compliance: EU customers can request data deletion ("right to be forgotten"); deletion requests queued to `gdpr.deletion` RabbitMQ queue; consumer deletes from EU replica within 72 hours; source US record anonymized (not deleted — required for SOC2 audit trail) with `deleted_at` timestamp and PII fields zeroed
- Data residency: all EU citizen PII must exist only in eu-west-1; US region must not hold EU PII; enforced via automated `pg_row_security` policies and quarterly compliance scans
- Real-time aggregation: Redis Streams consumer aggregates hourly/daily merchant volume metrics for dashboard; Redis key TTL: 90 days
- Data quality checks: at each CDC hop, validate row count checksum against source; alert if drift > 0.01%

**CDC event schema:**

```json
{
  "operation": "insert|update|delete|truncate",
  "relation": "authorizations|settlements|fraud_scores",
  "timestamp": "2026-04-09T14:23:11.000Z",
  "lsn": "0/1234ABC",
  "data": { /* row data for insert/update */ },
  "old_data": { /* row data for update/delete */ },
  "checksum": "sha256:abc123..."
}
```

**Non-functional requirements:**
- Replication lag < 30 seconds for 99% of events
- Schema migrations: no more than 5 minutes of migration lock time
- GDPR deletion requests processed within 72 hours (automated, no manual intervention)
- Data drift alert: Prometheus alert fires if checksum drift > 0.01% for 2+ consecutive checks

---

### Domain 5: ML Model Training & Retraining Pipeline (ML模型训练)

**Service name:** `ml-pipeline`
**Owner:** You (ML engineering, this is a stretch domain)
**Responsibility:** Train, evaluate, and deploy fraud detection ML models. The ONNX model served by `compliance-engine` is produced here.

**Functional requirements:**
- Training data: fetch labeled fraud data from PostgreSQL (`fraud_scores` table where `decision = 'confirmed_fraud'` as positive, `decision = 'approve'` as negative); 80/20 train/test split; retraining triggers when model performance degrades (AUC < 0.87) or monthly cadence
- Feature engineering (offline, not real-time):
  - `card_velocity_1h`: count of transactions on same card in last hour
  - `card_velocity_24h`: count in last 24h
  - `merchant_avg_amount`: rolling 30-day merchant average
  - `amount_z_score`: (amount - merchant_avg) / merchant_stddev
  - `geo_distance_from_last_txn`: haversine distance from previous transaction
  - `time_since_last_card_txn`: minutes since last transaction on same card
  - `card_country_vs_ip_country`: binary mismatch flag
- Model: scikit-learn RandomForestClassifier (100 trees, max_depth=10); converted to ONNX via `skl2onnx`; validated against test set before promotion
- Evaluation metrics: AUC-ROC, AUC-PR, F1 (at 0.5 threshold), confusion matrix; report published to Grafana dashboard
- Model registry: store model artifacts (`.onnx` file + metadata JSON) in S3; versioning via S3 prefix `models/v1/`, `models/v2/`; promotion gate: AUC-ROC > 0.87 AND F1 > 0.72
- Deployment: ONNX model copied to `compliance-engine` service volume; hot-reload without restart via `POST /admin/reload-model` endpoint (reads new file, re-initializes runtime)
- A/B inference: 10% of transactions scored with new model alongside production model; results compared for 24 hours before full cutover

**Model metadata JSON:**

```json
{
  "version": "v3",
  "trained_at": "2026-04-09T08:00:00Z",
  "training_samples": 2847291,
  "test_samples": 711823,
  "auc_roc": 0.9134,
  "auc_pr": 0.7801,
  "f1_score": 0.7632,
  "feature_names": ["card_velocity_1h", "card_velocity_24h", "merchant_avg_amount", "amount_z_score", "geo_distance_from_last_txn", "time_since_last_card_txn", "card_country_vs_ip_country"],
  "s3_uri": "s3://meridian-ml-models/models/v3/fraud_model.onnx",
  "parent_version": "v2"
}
```

**Non-functional requirements:**
- Full training pipeline must complete within 4 hours on c6i.4xlarge (32 vCPU, 64GB RAM) for 3.5M row dataset
- Model reload endpoint must not drop in-flight scoring requests (use read-copy-update pattern)
- Monthly retraining must not interfere with real-time inference latency budget

---

### Domain 6: Observability & Incident Response Platform (可观测性与事件响应)

**Service name:** `observability-platform`
**Owner:** DevOps engineer + Staff Engineer (you)
**Responsibility:** Centralize metrics, logs, traces, and alerting. Provide on-call runbooks and SLO dashboards. Integrate with PagerDuty for incidents.

**Functional requirements:**
- **Metrics:** OpenTelemetry SDK instrumented in all services; metrics exported via OTLP to Grafana Cloud; custom business metrics: authorization latency p50/p95/p99, fraud review queue depth, settlement batch lag, GDPR deletion queue depth
- **Logging:** Structured JSON logs from all services via RabbitMQ to Logstash (no ELK — cost constraint); Grafana Loki as log aggregator; retention: 30 days hot, 7 years cold (S3 archival)
- **Tracing:** OpenTelemetry distributed traces with trace IDs propagated across all RabbitMQ message headers; Grafana Tempo as trace backend; sampling rate: 10% for normal traffic, 100% for errors
- **SLOs:** Define SLOs as code in ` slo-config.yaml`; error budget alerts at 50%, 100%, 200% burn rate; SLO dashboard in Grafana showing 30-day rolling window
- **Alerting:** Grafana Alerting rules translated to Alertmanager; PagerDuty integration for Critical alerts; Slack integration for Warning/Info; alert fatigue prevention: no page for the same alert within 30 minutes (cooldown)
- **On-call runbooks:** Markdown files in `/runbooks/` directory; each alert rule references a runbook by name; runbooks must include: symptom description, diagnosis steps, mitigation steps, escalation path, post-incident checklist
- **Chaos injection:** `chaos-engine` service (based on Chaos Monkey, open-source) injected into Docker Compose; randomly kills service instances, introduces network latency (50-200ms), and simulates disk I/O saturation; runs weekly via CI/CD scheduled job; incidents auto-filed if SLO drops below 99.95%

**SLO definitions:**

```yaml
# slo-config.yaml
slos:
  - name: payment-authorization-latency
    target: p99 < 200ms
    window: 30d
    service: payment-engine
    metric: histogram.authorization.latency
    bucket: [0.05, 0.1, 0.2, 0.5, 1.0]

  - name: payment-availability
    target: 99.95% uptime
    window: 30d
    service: payment-engine
    metric: gauge.availability
    alert_at: [50, 100, 200]  # % error budget consumed

  - name: fraud-scoring-latency
    target: p99 < 80ms
    window: 30d
    service: compliance-engine
    metric: histogram.scoring.latency

  - name: audit-log-throughput
    target: < 5ms write latency
    window: 5m rolling
    service: compliance-engine
    metric: histogram.audit-write.latency
    alert_at: [3, 4, 5]  # ms

  - name: gdpr-deletion-sla
    target: 100% processed within 72h
    window: 7d
    service: data-pipeline
    metric: gauge.gdpr-queue-depth
    alert_at: [10, 20, 50]  # pending deletions
```

**Runbook structure:**

```
# /runbooks/SRE/high-authorization-latency.md
# Runbook: High Payment Authorization Latency
# Alert: payment-authorization-latency > 200ms p99

## Symptoms
- Merchant portal shows slow transaction processing
- Dashboard latency metrics spiking

## Diagnosis
1. Check Grafana dashboard: is it a single instance or all instances?
2. Check PostgreSQL connection pool utilization: `SELECT count(*) FROM pg_stat_activity WHERE datname = 'meridian'`
3. Check payment gateway health status (Stripe, Adyen dashboards)
4. Check Redis latency: `redis-cli --latency-history`

## Mitigation
1. If gateway issue: circuit-break the failing gateway (`POST /admin/circuit-break/gateway/stripe`)
2. If DB issue: scale connection pool from 50 to 100; restart instances
3. If Redis issue: failover to replica; restart Redis primary

## Escalation
- On-call SRE: PagerDuty policy `sre-primary`
- Engineering lead: Slack #incidents

## Post-Incident
- [ ] Document root cause in incident report
- [ ] Add regression test if applicable
- [ ] Update runbook if diagnosis steps changed
```

---

## 实现要求 / IMPLEMENTATION REQUIREMENTS

### What you must produce

For each domain, you must deliver:

1. **API specification:** Complete OpenAPI 3.1 YAML or GraphQL schema for all endpoints
2. **Data model:** PostgreSQL DDL with indexes, constraints, and comments (all tables must have `created_at` and `updated_at`)
3. **Service implementation:** A runnable TypeScript service stub with:
   - Full project structure (`package.json`, `tsconfig.json`, `src/`)
   - All route handlers wired (can be minimal business logic)
   - Database connection pool setup
   - Redis client setup
   - RabbitMQ consumer/producer setup
   - OpenTelemetry instrumentation (tracer + meter)
   - Health check endpoint (`GET /health` returning service name, version, uptime, dependencies status)
   - Graceful shutdown handler (SIGTERM: finish in-flight requests, close connections)
4. **Security controls:** Implementation of all security requirements (TLS, mTLS, HMAC, JWT, row-level security)
5. **Unit tests:** At minimum 5 unit tests per service covering core logic (auth, fraud scoring, idempotency)
6. **Dockerfile:** Multi-stage build, production image < 200MB
7. **Docker Compose file:** Full stack local development environment (all 6 services + PostgreSQL + Redis + RabbitMQ)
8. **Compliance artifacts:**
   - SOC2 controls mapping document (CSV: Control ID, Description, Implementation, Evidence)
   - Data flow diagram (Mermaid format in a `.architecture/` file)
   - PII data map (which fields, which services, which retention period)

### Cross-cutting concerns

- **Error handling:** All services use a shared error type hierarchy (`AppError` base class with `ValidationError`, `NotFoundError`, `ForbiddenError`, `GatewayError` subclasses); all errors logged with correlation ID
- **Structured logging:** All log output in JSON format with fields: `timestamp`, `level`, `service`, `traceId`, `spanId`, `message`, `meta`
- **Dependency injection:** All services use constructor injection for DB/Redis/RabbitMQ clients (no module-level singletons except for the tracer)
- **Configuration:** All config via environment variables; use a validated config schema (Zod); no hardcoded values; `.env.example` provided for every service
- **TLS/mTLS:** All external connections use TLS 1.3; internal service-to-service communication uses mTLS with certificates generated via a local CA (mkcert for local dev); certificates rotated every 90 days

### Testing requirements

**Unit tests** (per service, minimum):
- Idempotency key deduplication logic
- Fraud scoring rules engine evaluation
- JWT verification and claims extraction
- HMAC webhook signature verification
- GDPR anonymization function (PII zeroing)

**Integration tests** (end-to-end, Docker Compose):
- Full payment flow: auth → capture → settlement batch
- WebSocket multi-tenant isolation (subscribe to wrong tenant, verify rejection)
- GDPR deletion flow: request from EU region → verify US record anonymized, EU record deleted
- ML model hot-reload: deploy new ONNX model, verify scoring uses new model within 10 seconds without restart

**Load tests** (using `k6` or `bombardier`):
- Payment engine: 8,000 TPS sustained for 5 minutes, p99 < 200ms
- Merchant portal: 500 concurrent GraphQL connections for 10 minutes
- Compliance engine: 8,000 fraud scoring requests/second for 2 minutes, p99 < 80ms

### Documentation requirements

- **Architecture Decision Records (ADRs):** For each significant decision (why PostgreSQL over CockroachDB, why RabbitMQ over Kafka, why ONNX over cloud ML API), write a 1-page ADR in `/docs/adr/`
- **Data dictionary:** Every table column documented with type, description, PII flag, retention period
- **API changelog:** SemVer API versioning; breaking changes documented in `/docs/changelog/`
- **SOC2 evidence matrix:** Maps each SOC2 control to the artifact that provides evidence (e.g., Control AC-1.2 → `audit_events` table + `audit_log` mutation in `merchant-portal-api`)

---

## 验收标准 / SUCCESS CRITERIA

All items below must be objectively verifiable:

1. **All 6 services start** in Docker Compose with `docker compose up --build` and pass health checks
2. **Payment flow end-to-end** completes in local environment: auth → capture → settlement batch visible in DB
3. **Webhook HMAC verification** rejects payloads with wrong signatures and accepts correct ones
4. **JWT authentication** correctly scopes queries to the authenticated merchant (cross-tenant access returns empty, not an error)
5. **WebSocket** subscription to wrong tenant merchant_id is rejected and security event logged
6. **Fraud scoring** produces a combined score for a sample transaction (run test fixture)
7. **ML model hot-reload** loads a new ONNX model file without service restart
8. **GDPR deletion** correctly anonymizes US record and deletes EU replica record
9. **Audit log** records all mutations across all services in `audit_events` table
10. **CDC pipeline** replicates data to eu-west-1 consumer within target lag
11. **Load test** on payment engine achieves 8,000 TPS for 5 minutes with p99 < 200ms
12. **Load test** on compliance engine achieves 8,000 scoring requests/second for 2 minutes with p99 < 80ms
13. **Chaos test** kill one payment engine instance; verify transactions reroute with zero failures within 5 seconds
14. **All unit tests pass** via `bun test` in each service directory
15. **SOC2 controls matrix** exists and maps every control to at least one evidence artifact
16. **SLO config** parses and validates; Grafana dashboard renders SLO error budget gauges
17. **Runbook** exists for every alert defined in `slo-config.yaml`
18. **ADR** exists for at least 5 major architectural decisions

---

## 约束边界 / BOUNDARY CONDITIONS

The following are explicitly **out of scope** for this stress test:

- Mobile SDK implementation (webhooks and direct API only)
- Real payment gateway integration (use mock responses with realistic delays: 80-150ms)
- Actual cloud infrastructure (Terraform configs for AWS, but deploy to local Docker Compose for the stress test)
- Real ML model training (use a pre-trained ONNX model file committed to the repo; training pipeline logic is specified but model weights are stubbed)
- Actual PagerDuty/Slack integration (webhook URLs stubbed with `http://placeholder`, but logic fully implemented)
- Production certificate management (use mkcert for local dev; document production cert rotation process in runbook)

---

## 提示 / HINTS

- Start with Domain 1 (payment engine) as the anchor — it is the most critical and the others reference its data models
- Build Domain 3 (compliance engine) as the second anchor — it consumes data from all other services via audit log
- Domain 5 (ML pipeline) is intentionally the most complex to specify — treat it as the ceiling for prompt complexity
- Use `pg_stat_activity` and `EXPLAIN ANALYZE` for query performance work
- For chaos testing, look at `chaos-monkey` open-source project for Docker Compose integration patterns
- For SOC2 evidence, the auditor will want to see: who had access, what they did, when they did it, and proof the logs haven't been tampered with (immutability via append-only table + hash chain)
- The 90-day deadline is deliberately unrealistic for one engineer — prioritize and sequence carefully; do not attempt parallel implementation of all 6 domains without a worktree strategy

---

## 输出格式 / OUTPUT FORMAT

Produce the complete artifact set in a directory structure as follows:

```
/
├── payment-engine/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   ├── db/
│   │   ├── services/
│   │   ├── middleware/
│   │   └── __tests__/
│   ├── Dockerfile
│   └── .env.example
├── merchant-portal-api/
│   └── ...
├── compliance-engine/
│   └── ...
├── data-pipeline/
│   └── ...
├── ml-pipeline/
│   └── ...
├── observability-platform/
│   ├── slo-config.yaml
│   ├── runbooks/
│   └── ...
├── docker-compose.yml
├── docs/
│   ├── adr/
│   ├── soc2-controls-matrix.csv
│   ├── data-dictionary.md
│   └── architecture/
│       └── data-flow.mmd
├── terraform/
│   └── (stubbed AWS configs)
└── README.md
```

All services must be runnable in Docker Compose. The `docker-compose.yml` at the root must wire all services, databases, Redis, and RabbitMQ into a coherent local development environment.

---

*End of stress test prompt. Timer starts on first input.*
