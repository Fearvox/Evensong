---
phase: 01-foundation-hardening
plan: 02
subsystem: api
tags: [zod, typescript, strict-mode, streaming, api-boundary, bun-test, coverage]

# Dependency graph
requires:
  - phase: 01-01
    provides: tsconfig.strict.json overlay and strict-shims.d.ts for module resolution
provides:
  - Zod discriminated union schema validating BetaRawMessageStreamEvent shapes at API boundary
  - parseStreamEvent and safeParseStreamEvent exported functions
  - Coverage tracking verified operational via bun test --coverage
affects: [03-streaming-resilience, 02-tool-interface]

# Tech tracking
tech-stack:
  added: [zod v4 (already in deps, first usage)]
  patterns: [Zod discriminated union for SDK event validation, passthrough for forward compatibility, parse-what-we-use boundary validation]

key-files:
  created:
    - src/services/api/streamEventSchema.ts
    - src/services/api/__tests__/streamEvents.test.ts
  modified:
    - tsconfig.strict.json

key-decisions:
  - "Schema covers exactly the 7 event types consumed in claude.ts switch statement -- no over-validation"
  - "betaDeltaSchema uses z.union (not discriminatedUnion) with unknownDeltaSchema fallback for extensibility"
  - "citations_delta included with passthrough since claude.ts has a case for it (even though handler is a TODO)"

patterns-established:
  - "API boundary validation: Zod schema defined separately, wired in at call site in later phase"
  - "Coverage tracking: bun test --coverage reports per-file line/function coverage to stdout"

requirements-completed: [TYPE-05, TEST-05]

# Metrics
duration: 4min
completed: 2026-04-07
---

# Phase 01 Plan 02: Zod Stream Event Schema and Coverage Tracking Summary

**Zod v4 discriminated union schema validating 7 BetaRawMessageStreamEvent types at the API boundary, with 26 tests and 100% coverage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-07T17:14:29Z
- **Completed:** 2026-04-07T17:18:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created streamEventSchema.ts with z.discriminatedUnion covering all 7 event types consumed in claude.ts
- 26 tests covering valid events, passthrough behavior, invalid input rejection, and safeParseStreamEvent
- 100% function and line coverage on streamEventSchema.ts
- Coverage tracking operational via `bun test --coverage` (TEST-05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zod stream event schema at API boundary** - `62ce56f` (feat)
2. **Task 2: Write schema tests and establish coverage tracking** - `ad36a26` (test)

## Files Created/Modified
- `src/services/api/streamEventSchema.ts` - Zod discriminated union schema with parseStreamEvent and safeParseStreamEvent exports
- `src/services/api/__tests__/streamEvents.test.ts` - 26 tests for schema validation (valid events, passthrough, rejection, safe parse)
- `tsconfig.strict.json` - Added both new files to strict overlay include array (now 13 entries)

## Event Types Covered by Schema

| Event Type | Fields Validated | Notes |
|-----------|-----------------|-------|
| message_start | message (id, type, role, content, model, usage) | message uses passthrough for SDK extensions |
| content_block_start | index, content_block (type) | content_block uses passthrough for varied block shapes |
| content_block_delta | index, delta (discriminated by delta.type) | Supports text_delta, input_json_delta, thinking_delta, signature_delta, citations_delta, plus unknown fallback |
| content_block_stop | index | Minimal -- only index consumed |
| message_delta | delta (stop_reason, stop_sequence), usage (output_tokens) | delta and usage use passthrough |
| message_stop | (none) | No fields accessed in claude.ts |
| error | error (type, message) | Error object uses passthrough |

## Test Counts

| Metric | Before | After |
|--------|--------|-------|
| Test files | 5 | 6 |
| Total tests | 72 | 98 |
| New schema tests | - | 26 |

## Coverage Tracking

Command: `bun test --coverage src/services/api/__tests__/streamEvents.test.ts`

Sample output:
```
File                                   | % Funcs | % Lines | Uncovered Line #s
All files                              |  100.00 |  100.00 |
 src/services/api/streamEventSchema.ts |  100.00 |  100.00 |
```

No additional configuration needed. Bun's built-in coverage is sufficient for Phase 1. Formal coverage thresholds are a Phase 2+ concern.

## Decisions Made
- Schema covers exactly the 7 event types from the switch statement in claude.ts -- not the full SDK type surface
- betaDeltaSchema uses z.union with an unknownDeltaSchema fallback (type: z.string().passthrough()) so future delta types from the SDK don't break parsing
- citations_delta included even though the handler is a TODO -- it has a case branch in claude.ts
- content_block_delta uses .passthrough() at the top level to preserve `research` field that claude.ts reads from `part`

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- streamEventSchema.ts is ready to be imported in claude.ts streaming loop (Phase 3 wiring)
- Schema is NOT imported from claude.ts in this phase -- wiring is intentionally deferred
- tsconfig.strict.json now has 13 files under strict mode (6 source + 3 declarations + 2 type tests + 1 schema + 1 schema test)

---
*Phase: 01-foundation-hardening*
*Completed: 2026-04-07*
