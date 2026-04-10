# Runbook: Insight Engine (Port 3009)

## Overview

The insight-engine service performs cross-experiment analytics and anomaly detection. It aggregates metrics from multiple experiments via experiment-tracker, applies Z-score based anomaly detection (threshold 2.5, per ADR-008), generates trend reports, surfaces top-performing model configurations, and powers the platform's research intelligence dashboard. It is the heaviest service in the platform and is always placed last in Wave 2 dispatch with a 90-second startup timeout (per ADR-004). Known to have caused R008's wall clock overrun due to a LaTeX rendering hang misattributed to this service.

---

## Health Check

```bash
curl http://localhost:3009/health
# Expected: {"status":"ok","service":"insight-engine","uptime":<seconds>}

# Analytics pipeline status
curl http://localhost:3009/health/deep
# Expected: {"status":"ok","anomalyDetectorReady":true,"lastAggregationAgeMs":<n>,"experimentTrackerOk":true}
```

---

## Common Issues

**Issue: Service takes > 60 seconds to become healthy**
- Cause: On first startup, the service pre-loads experiment data from experiment-tracker and builds an in-memory statistics baseline. With large experiment counts (> 5,000), this can take up to 90 seconds.
- Fix: This is within the expected 90-second startup timeout. If it exceeds 90 seconds, check experiment-tracker response time. Use `LAZY_BASELINE=true` to defer baseline computation to the first query.

**Issue: Anomaly detection returns no alerts despite clear outliers in test data**
- Cause: The Z-score threshold (`ANOMALY_ZSCORE_THRESHOLD`) is too high, or the baseline has too few data points (< 30) to compute a meaningful standard deviation.
- Fix: Verify `ANOMALY_ZSCORE_THRESHOLD` is set to 2.5. Ensure at least 30 experiments exist in the tracker before running anomaly detection. Use `POST /admin/anomaly/force-run` to trigger detection on demand.

**Issue: `GET /insights/trends` returns stale data**
- Cause: The aggregation cache TTL is 5 minutes by default. In fast-moving benchmark scenarios, this can make trends appear stale.
- Fix: Set `AGGREGATION_CACHE_TTL_SECONDS=30` for benchmark environments. Invalidate immediately: `POST /admin/cache/invalidate`.

**Issue: Service OOMs during large aggregation queries**
- Cause: Aggregating > 10,000 experiments without pagination loads all records into memory simultaneously.
- Fix: Enable streaming aggregation: `STREAM_AGGREGATION=true`. This processes experiments in batches of 500 and reduces peak memory usage by ~80%.

**Issue: Service hangs indefinitely on startup (the R008 issue)**
- Cause: This was traced to paper-engine's LaTeX rendering blocking an HTTP response, not a bug in insight-engine itself. The insight-engine's startup dependency check waits on experiment-tracker, which was waiting on a blocked paper-engine event. Fix: ensure paper-engine startup completes before Wave 2 begins (guaranteed by the two-wave dispatch strategy in ADR-004).

---

## Troubleshooting Steps

1. Logs: `docker compose logs --tail=100 insight-engine`
2. Deep health: `GET /health/deep` — shows all subsystem readiness.
3. Baseline stats: `GET /admin/anomaly/baseline` — returns current mean, stddev per metric.
4. Force aggregation: `POST /admin/aggregate/run` — triggers a fresh aggregation pass.
5. Memory profile: `GET /admin/memory` — returns heap usage and aggregation buffer sizes.
6. If hanging: send SIGUSR1 to dump a thread trace (`docker compose exec insight-engine kill -USR1 1`).

---

## Escalation

- Startup hang persisting beyond 120 seconds: kill and restart the service. If it hangs on the second start, it is likely upstream (experiment-tracker or RabbitMQ) — escalate to infrastructure.
- Anomaly alerts firing on healthy experiments (false positive storm): set `ANOMALY_DETECTION_ENABLED=false` temporarily to silence alerts, then recalibrate the baseline with `POST /admin/anomaly/recalibrate`. Notify ML platform lead before recalibration.
