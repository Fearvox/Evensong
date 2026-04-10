# Runbook: Paper Engine (Port 3005)

## Overview

The paper-engine service generates research paper drafts from experiment results. It accepts an experiment ID, fetches metrics and parameters from experiment-tracker, templates them into a structured paper scaffold (abstract, methodology, results, conclusions), and produces exportable artifacts in Markdown and LaTeX formats. It also tracks paper revisions and coordinates with review-system for submission workflow. It is a Wave 2 service depending on experiment-tracker.

---

## Health Check

```bash
curl http://localhost:3005/health
# Expected: {"status":"ok","service":"paper-engine","uptime":<seconds>}

# Verify experiment-tracker connectivity
curl http://localhost:3005/health/dependencies
# Expected: {"experimentTracker":"ok"}
```

---

## Common Issues

**Issue: `POST /papers/generate` returns 404 "experiment not found"**
- Cause: The experiment ID does not exist in experiment-tracker, or experiment-tracker is temporarily unreachable.
- Fix: Verify the experiment exists: `GET http://localhost:3001/experiments/:id`. If it exists but paper-engine still 404s, the service's experiment-tracker HTTP client may have a stale cached failure. Restart paper-engine.

**Issue: Paper generation hangs indefinitely (no response after 30s)**
- Cause: The LaTeX template renderer blocks on a large results table (> 500 rows). This was a known issue in R008 that caused the insight-engine to be blamed incorrectly.
- Fix: Set `MAX_RESULTS_TABLE_ROWS=100` env var to cap table size. Excess rows are summarized as "N additional results omitted for brevity."

**Issue: Exported LaTeX contains unescaped special characters**
- Cause: Experiment parameter names or metric labels contain `_`, `^`, `%`, or `&` which are LaTeX control characters.
- Fix: The `escapeLatex()` utility in `shared/formatting/` handles this but must be explicitly called. If a paper export is broken, call `POST /papers/:id/repair-latex` which re-runs the export with full escaping.

**Issue: Revision history is out of order**
- Cause: Multiple rapid `PATCH /papers/:id` calls arrived out of sequence due to network reordering.
- Fix: `GET /papers/:id/revisions` — if revision sequence numbers have gaps, call `POST /papers/:id/revisions/reorder` to sort by timestamp.

---

## Troubleshooting Steps

1. Logs: `docker compose logs --tail=100 paper-engine`
2. Paper list: `GET /papers` — verifies store is reachable and populated.
3. Generation status: `GET /papers/:id/status` — shows `generating`, `completed`, or `failed` with an error message.
4. Template debug: `GET /papers/:id/template-vars` — returns all variables injected into the paper template.
5. Re-trigger generation: `POST /papers/:id/regenerate` — safe to call multiple times; idempotent.

---

## Escalation

- LaTeX export produces malformed output after `repair-latex`: escalate to the research tooling team with the paper ID and the raw template variable dump.
- Paper generation failure rate > 30%: likely experiment-tracker is degraded. Escalate to platform on-call.
