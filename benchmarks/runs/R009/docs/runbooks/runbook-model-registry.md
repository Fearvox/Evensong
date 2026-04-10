# Runbook: Model Registry (Port 3002)

## Overview

The model-registry service versions, stores metadata for, and tracks lineage of trained model artifacts. It receives model registration events from training-pipeline, exposes version history and promotion workflows (e.g. promoting a checkpoint to `staging` or `production` status), and records a full audit chain of all version transitions. Model binary artifacts are stored in MinIO; the registry stores only metadata and checksums. It is a Wave 1 service.

---

## Health Check

```bash
curl http://localhost:3002/health
# Expected: {"status":"ok","service":"model-registry","uptime":<seconds>}

# Verify MinIO connectivity
curl http://localhost:3002/health/storage
# Expected: {"status":"ok","bucket":"models","accessible":true}
```

---

## Common Issues

**Issue: `POST /models` returns 500 with "storage write failed"**
- Cause: MinIO is unavailable or the `models` bucket does not exist.
- Fix: Check MinIO health (`docker compose ps minio`). Create the bucket manually: `docker compose exec minio mc mb /data/models`.

**Issue: Model version promotion returns 409 Conflict**
- Cause: Another process is already promoting the same version, or the version is locked pending a review decision from the review-system.
- Fix: Check the version lock status: `GET /models/:id/versions/:version/lock`. If stale (lock age > 10 minutes), release it with `DELETE /models/:id/versions/:version/lock`.

**Issue: Lineage graph query times out (`GET /models/:id/lineage`)**
- Cause: Lineage traversal is recursive and can be expensive for deep fine-tuning chains (depth > 20).
- Fix: Set `LINEAGE_MAX_DEPTH=10` env var to cap traversal. For deeper queries, use the paginated `GET /models/:id/lineage?depth=5&cursor=<hash>` endpoint.

**Issue: Checksum mismatch on model download**
- Cause: MinIO object was overwritten externally, or the registration event arrived out of order with a duplicate model ID.
- Fix: Re-register the model with a new version number. Do not overwrite the existing version record — the audit chain must remain intact.

---

## Troubleshooting Steps

1. Logs: `docker compose logs --tail=100 model-registry`
2. Storage probe: `GET /health/storage` — confirms MinIO bucket accessibility.
3. Version state: `GET /models/:id/versions` — lists all versions with their status and lock state.
4. Audit chain: `GET /admin/audit/verify` — returns broken index on chain corruption.
5. MinIO direct check: `docker compose exec minio mc ls /data/models/` — lists raw objects.

---

## Escalation

- Checksum mismatch on a production-promoted model: treat as a security incident. Isolate the affected model version, notify the ML platform lead, and initiate a full lineage audit.
- MinIO data loss: escalate to infrastructure. Model binary re-registration from training logs may be required.
