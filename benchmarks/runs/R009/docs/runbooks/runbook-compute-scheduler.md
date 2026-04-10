# Runbook: Compute Scheduler (Port 3006)

## Overview

The compute-scheduler service manages allocation of virtual GPU and CPU resources across training jobs. It maintains a resource pool (configurable via `COMPUTE_POOL_GPUS` and `COMPUTE_POOL_CPUS` env vars), a priority queue of pending resource requests, and a preemption policy for high-priority jobs. It publishes allocation and deallocation events to the event bus so training-pipeline can act on them. It is a Wave 2 service.

---

## Health Check

```bash
curl http://localhost:3006/health
# Expected: {"status":"ok","service":"compute-scheduler","uptime":<seconds>}

# Resource pool status
curl http://localhost:3006/resources/pool
# Expected: {"totalGPUs":<n>,"availableGPUs":<n>,"totalCPUs":<n>,"availableCPUs":<n>,"queueDepth":<n>}
```

---

## Common Issues

**Issue: All resource requests queue indefinitely — `queueDepth` grows without bound**
- Cause: Resource pool was initialized with 0 GPUs/CPUs (default when env vars are unset).
- Fix: Set `COMPUTE_POOL_GPUS=8` and `COMPUTE_POOL_CPUS=32` in docker-compose or env and restart the service. Queued requests will be processed immediately after restart.

**Issue: Allocated resources not released after job completion**
- Cause: training-pipeline failed to publish the `training.events.completed` event, so the deallocation callback was never triggered.
- Fix: Force-release resources: `DELETE /resources/allocations/:allocationId`. Check training-pipeline logs for the failed publish.

**Issue: High-priority job does not preempt lower-priority running jobs**
- Cause: Preemption is disabled by default (`PREEMPTION_ENABLED=false`).
- Fix: Set `PREEMPTION_ENABLED=true` and define the priority threshold with `PREEMPTION_PRIORITY_THRESHOLD=8` (jobs with priority ≥ 8 can preempt jobs with priority < 5).

**Issue: Scheduler returns 429 Too Many Requests on rapid job submissions**
- Cause: Request rate limiter (100 requests/minute per caller) is triggered by benchmark load generators.
- Fix: Increase the limit with `RATE_LIMIT_RPM=500` for benchmark environments.

---

## Troubleshooting Steps

1. Logs: `docker compose logs --tail=100 compute-scheduler`
2. Pool status: `GET /resources/pool` — immediate resource overview.
3. Allocation list: `GET /resources/allocations?status=active` — lists all currently held allocations.
4. Queue inspection: `GET /resources/queue` — shows pending requests in priority order.
5. Force drain: `POST /admin/queue/drain` — rejects all queued requests with 503. Use only during maintenance windows.

---

## Escalation

- Pool stuck at 0 available resources despite no active jobs: this is a resource accounting bug. Escalate to engineering with the full allocation log (`GET /resources/allocations/history`).
- Queue depth > 1000 sustained for > 5 minutes: platform scaling incident. Escalate to infrastructure lead.
