# Runbook: Training Pipeline (Port 3003)

## Overview

The training-pipeline service orchestrates distributed ML training jobs. It accepts job submissions, coordinates with compute-scheduler for resource allocation, emits progress events to the event bus, and reports completion or failure back to experiment-tracker and model-registry. It is a Wave 2 service — depends on experiment-tracker and model-registry being healthy before startup.

---

## Health Check

```bash
curl http://localhost:3003/health
# Expected: {"status":"ok","service":"training-pipeline","uptime":<seconds>,"activeJobs":<n>}

# Check upstream dependencies
curl http://localhost:3003/health/dependencies
# Expected: {"experimentTracker":"ok","modelRegistry":"ok","computeScheduler":"ok"}
```

---

## Common Issues

**Issue: Job stuck in `scheduled` state, never transitions to `running`**
- Cause: compute-scheduler returned no available resources, or the resource allocation event was lost.
- Fix: Check compute-scheduler health. Manually requeue: `POST /jobs/:id/requeue`. If compute-scheduler shows capacity, the event bus may have dropped the allocation message — check RabbitMQ dead-letter queue `training.dlq`.

**Issue: Job completes successfully but experiment-tracker still shows `running`**
- Cause: The `training.events.completed` publish failed (broker connectivity issue during teardown).
- Fix: Manually publish the completion event: `POST /admin/events/replay/:jobId`. This replays the completion event from the job's stored result.

**Issue: `POST /jobs` returns 503 "upstream unavailable"**
- Cause: experiment-tracker or model-registry health check failed.
- Fix: Restore the failing upstream service first. The training-pipeline performs a live dependency check before accepting new jobs.

**Issue: Memory usage climbs unboundedly during long benchmark runs**
- Cause: Completed job state is never evicted from the in-memory job store.
- Fix: Call `POST /admin/store/evict-completed` to purge jobs in terminal states older than 60 seconds. Set `AUTO_EVICT_COMPLETED=true` for automatic eviction.

---

## Troubleshooting Steps

1. Logs: `docker compose logs --tail=100 training-pipeline`
2. Active jobs: `GET /jobs?status=running` — shows all currently running jobs.
3. Job detail: `GET /jobs/:id` — full state including resource allocation and emitted events.
4. Event replay: `GET /admin/events/log/:jobId` — shows all events emitted for a job.
5. Force-fail a stuck job: `PATCH /jobs/:id/status {"status":"failed","reason":"manual-operator-intervention"}`.

---

## Escalation

- Multiple jobs stuck simultaneously: likely a compute-scheduler or RabbitMQ partition. Escalate to infrastructure rather than requeuing individually.
- Job failure rate > 20% in a 5-minute window: trigger the ML platform incident response playbook.
