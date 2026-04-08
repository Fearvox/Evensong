---
phase: 03-api-streaming-resilience
plan: 03
subsystem: api-streaming
tags: [streaming, zod-validation, watchdog, abort-history, resilience]
dependency_graph:
  requires: [03-01, 03-02]
  provides: [streaming-validation, unconditional-watchdog, abort-history-wiring]
  affects: [src/services/api/claude.ts]
tech_stack:
  added: []
  patterns: [validate-then-continue, opt-out-env-var, api-boundary-validation]
key_files:
  created:
    - src/services/api/__tests__/streamWatchdog.test.ts
  modified:
    - src/services/api/claude.ts
    - tsconfig.strict.json
decisions:
  - "validate-then-continue pattern: Zod validates at stream entry, existing `part` variable continues in switch body to avoid 200+ line refactor"
  - "watchdog opt-out via CLAUDE_DISABLE_STREAM_WATCHDOG (was opt-in via CLAUDE_ENABLE_STREAM_WATCHDOG)"
  - "finalizeHistoryOnAbort uses getTranscriptPath()/getSessionId() from bootstrap state since Options type lacks session fields"
metrics:
  duration: 148s
  completed: "2026-04-07T21:51:25Z"
  tasks_completed: 2
  tasks_total: 2
  test_count: 12
  files_changed: 3
---

# Phase 03 Plan 03: Stream Validation Wiring & Unconditional Watchdog Summary

Wired Phase 1 Zod schema into the streaming loop, flipped watchdog to default-on with opt-out env var, and connected abort path to atomic history writer from Plan 02.

## One-liner

Zod validation at stream boundary with unconditional 90s idle watchdog and abort history finalization.

## What Was Done

### Task 1: Wire Zod schema, unconditional watchdog, and abort history into claude.ts

Three targeted edits to `src/services/api/claude.ts`:

1. **Watchdog flip**: Changed `isEnvTruthy(process.env.CLAUDE_ENABLE_STREAM_WATCHDOG)` to `!isEnvTruthy(process.env.CLAUDE_DISABLE_STREAM_WATCHDOG)`. Watchdog is now always on; set `CLAUDE_DISABLE_STREAM_WATCHDOG=1` to opt out for debugging.

2. **Zod validation wiring**: Added `safeParseStreamEvent(part)` call after `resetStreamIdleTimer()` in the `for await` loop. Unknown events are logged at warn level and skipped via `continue` for forward compatibility. The existing `part` variable continues to be used in the switch body (validate-then-continue pattern).

3. **Abort history**: Added `finalizeHistoryOnAbort(getTranscriptPath(), getSessionId())` call in the user abort catch block (after `APIUserAbortError` + `signal.aborted` check). Uses `getTranscriptPath()` and `getSessionId()` from existing imports since the `Options` type does not carry session fields.

### Task 2: Stream watchdog behavior tests

Created `src/services/api/__tests__/streamWatchdog.test.ts` with 12 tests in 4 groups:

- **Watchdog env var logic** (4 tests): Default-on, disabled with `1`/`true`, stays enabled for non-truthy values
- **Timeout configuration** (3 tests): Custom timeout via env var, 90s default, garbage input fallback
- **Mock stream patterns** (3 tests): Normal iteration, ECONNRESET mid-stream, stalling stream with measurable delay
- **Streaming loop validation** (2 tests): Known events pass safeParseStreamEvent, unknown events return null

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| validate-then-continue pattern | Avoids 200+ line refactor of switch body; Zod validates shape, `part` used for field access |
| CLAUDE_DISABLE_STREAM_WATCHDOG (opt-out) | 90s timeout is conservative; always-on is safer than requiring explicit opt-in |
| getTranscriptPath()/getSessionId() for abort | Options type lacks session fields; bootstrap state singletons are already imported |

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

```
bun test src/services/api/__tests__/ — 71 pass, 0 fail (4 files)
bun test (full suite) — 182 pass, 0 fail (15 files)
```

## Threat Surface Verification

All threat mitigations from the plan's threat model are implemented:

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-03-06 | safeParseStreamEvent validates at stream boundary | Implemented |
| T-03-07 | Watchdog unconditional with 90s default | Implemented |
| T-03-08 | finalizeHistoryOnAbort on user abort path | Implemented |
| T-03-09 | Only event type string logged, not full payload | Implemented |

No new threat surface introduced.
