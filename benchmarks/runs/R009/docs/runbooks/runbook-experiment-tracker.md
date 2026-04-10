# Runbook: Experiment Tracker (Port 3001)

## Overview

The experiment-tracker service is the central ledger for all ML experiments. It creates experiment records, accepts metric and parameter updates during training runs, tracks run state transitions (queued → running → completed / failed), and maintains a tamper-evident audit chain. All other services that need experiment context call this service. It is a Wave 1 service with no upstream service dependencies.

---

## Health Check

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","service":"experiment-tracker","uptime":<seconds>}

# Deep check — verifies in-memory store is initialized
curl http://localhost:3001/health/deep
# Expected: {"status":"ok","storeSize":<n>,"auditChainValid":true}
```

---

## Common Issues

**Issue: Service returns 503 on all routes**
- Cause: RabbitMQ connection failed during startup. The service retries 5 times with 2-second backoff before marking itself unhealthy.
- Fix: Confirm RabbitMQ is healthy (`docker compose ps rabbitmq`). Restart the service after the broker is up.

**Issue: `auditChainValid: false` in deep health check**
- Cause: A bug caused an audit entry to be written with an incorrect `chainHash`. This corrupts all subsequent entries.
- Fix: Call `POST /admin/audit/reset` (benchmark-only endpoint) to truncate the audit log and reinitialize the genesis hash. Alert the oncall engineer before doing this in any non-benchmark environment.

**Issue: Experiment status stuck in `running` after training completes**
- Cause: The `training.events.completed` RabbitMQ message was not delivered (broker restart, network partition, or queue overflow).
- Fix: Manually transition via `PATCH /experiments/:id/status` with `{"status":"completed"}`. Check RabbitMQ dead-letter queue for the lost event.

**Issue: High latency on `GET /experiments?page=N&limit=M`**
- Cause: In-memory pagination is O(n) — scanning the full store for large experiment counts. Normal at benchmark scale; a problem if store grows beyond ~50,000 entries.
- Fix: Enable Redis caching for list queries via `CACHE_LIST_RESULTS=true` env var.

---

## Troubleshooting Steps

1. Check service logs: `docker compose logs --tail=100 experiment-tracker`
2. Verify RabbitMQ connectivity: `docker compose exec experiment-tracker curl -s amqp://rabbitmq:5672` — expect a connection or "Connection refused" (not a timeout).
3. Verify in-memory store size: `GET /admin/store/stats` returns `{"experimentCount":<n>,"runCount":<n>}`.
4. Re-run audit chain verification: `GET /admin/audit/verify` returns the first broken index if any.
5. If store is corrupt and cannot be recovered, restart the service to reinitialize: `docker compose restart experiment-tracker`.

---

## Escalation

- If audit chain corruption is confirmed in a non-benchmark environment: immediately isolate the service, preserve a snapshot of the store via `GET /admin/store/export`, and escalate to the platform security lead.
- If the service cannot stay healthy after 3 restarts: escalate to the infrastructure team. Do not attempt to patch the running container.
