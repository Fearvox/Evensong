# Runbook: Collab Hub (Port 3008)

## Overview

The collab-hub service provides real-time collaboration infrastructure for the platform: notification delivery, presence tracking (who is currently viewing or editing a resource), threaded comment channels, and activity feeds. It subscribes to events from all other services and fans them out to connected clients. It uses Redis for presence state (short TTL keys) and the event bus for receiving platform-wide events. It is a Wave 2 service.

---

## Health Check

```bash
curl http://localhost:3008/health
# Expected: {"status":"ok","service":"collab-hub","uptime":<seconds>,"connectedClients":<n>}

# Redis connectivity check
curl http://localhost:3008/health/presence
# Expected: {"status":"ok","presenceKeyCount":<n>,"redisLatencyMs":<n>}
```

---

## Common Issues

**Issue: Notifications not delivered to clients despite events being published**
- Cause: The service subscribes to RabbitMQ exchanges at startup. If the broker was not ready when the service started, subscriptions were silently skipped.
- Fix: Restart collab-hub after confirming RabbitMQ is fully healthy. Subscriptions are re-established on each startup.

**Issue: Presence state shows users as online after they have disconnected**
- Cause: Redis TTL for presence keys defaults to 30 seconds. If a client disconnects without sending a `leave` event, their presence key persists until expiry.
- Fix: This is expected behavior. The 30-second stale presence window is acceptable. To reduce it, set `PRESENCE_TTL_SECONDS=10`. Do not set below 5 seconds or legitimate slow clients will flicker.

**Issue: Activity feed missing events from training-pipeline**
- Cause: collab-hub subscribes to `training.events.*` but the binding key may have been misconfigured during startup if RabbitMQ exchange did not exist yet.
- Fix: `POST /admin/subscriptions/rebind` — re-declares all exchange bindings. Safe to call without restarting.

**Issue: Comment thread IDs collide across services**
- Cause: Each service generates thread IDs independently using sequential integers in benchmark mode.
- Fix: Use the globally unique thread ID format: `<servicePrefix>-<localId>` (e.g. `exp-42`, `paper-17`). The collab-hub enforces this format from v1.2 onward; older clients may send bare integers.

---

## Troubleshooting Steps

1. Logs: `docker compose logs --tail=100 collab-hub`
2. Notification log: `GET /notifications?userId=<id>&limit=50` — recent notifications for a user.
3. Presence state: `GET /presence?resourceId=<id>` — who is currently present on a resource.
4. Subscription status: `GET /admin/subscriptions` — lists all active exchange bindings.
5. Force re-subscribe: `POST /admin/subscriptions/rebind`.

---

## Escalation

- Notification delivery failure rate > 10%: escalate to infrastructure (likely RabbitMQ or Redis issue).
- Presence data leaking across users (user A seeing user B's private presence): treat as a security incident. Take service offline and escalate to security lead immediately.
