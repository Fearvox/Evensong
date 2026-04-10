# Runbook: Dataset Vault (Port 3004)

## Overview

The dataset-vault service manages versioned ML datasets. It handles dataset registration, split management (train/val/test), binary storage in MinIO, download URL generation, and dataset lineage (tracking which datasets derive from others via preprocessing or augmentation). It is a Wave 1 service and depends on MinIO for all binary operations.

---

## Health Check

```bash
curl http://localhost:3004/health
# Expected: {"status":"ok","service":"dataset-vault","uptime":<seconds>}

# Verify MinIO bucket for datasets
curl http://localhost:3004/health/storage
# Expected: {"status":"ok","bucket":"datasets","accessible":true,"objectCount":<n>}
```

---

## Common Issues

**Issue: `POST /datasets/:id/versions` returns 413 Payload Too Large**
- Cause: The dataset metadata JSON exceeds the 1MB in-memory request limit.
- Fix: Upload large manifests to MinIO directly and reference the object key in the registration payload via `manifestObjectKey`.

**Issue: Download URL expires before client retrieves the file**
- Cause: Presigned MinIO URL default TTL is 5 minutes. Slow clients or large transfers can exceed this.
- Fix: Request a longer TTL: `GET /datasets/:id/download?ttlSeconds=3600`. Maximum is 86400 (24 hours) for benchmark environments.

**Issue: Dataset split ratios do not sum to 1.0**
- Cause: Floating-point accumulation error in split calculation for very large datasets with non-round split percentages.
- Fix: This is a known edge case. Use integer percentage splits (e.g. 70/15/15) rather than fractional splits. The service normalizes integer splits exactly.

**Issue: `GET /datasets/:id/lineage` returns empty graph despite registered parent**
- Cause: The parent dataset was registered after the child (out-of-order registration), and the lineage link was not backfilled.
- Fix: `POST /datasets/:id/lineage/recompute` — triggers a full lineage graph rebuild from all registered datasets.

---

## Troubleshooting Steps

1. Logs: `docker compose logs --tail=100 dataset-vault`
2. Storage health: `GET /health/storage` — confirms MinIO connectivity and object count.
3. Dataset list: `GET /datasets?page=1&limit=20` — verifies store is populated.
4. MinIO direct inspection: `docker compose exec minio mc ls /data/datasets/` — lists raw dataset objects.
5. Lineage graph: `GET /datasets/:id/lineage` — returns parent/child relationships as an adjacency list.

---

## Escalation

- MinIO bucket inaccessible and datasets cannot be served: declare a data availability incident. Do not attempt to recreate objects from memory — wait for MinIO recovery.
- Dataset version integrity check failure: `GET /datasets/:id/versions/:v/verify` — if checksum fails, escalate to the data engineering lead.
