---
phase: 01-foundation-hardening
plan: 01
subsystem: testing
tags: [typescript, strict-mode, tsconfig, bun-test, type-safety]

# Dependency graph
requires: []
provides:
  - tsconfig.strict.json overlay for incremental strict-mode adoption
  - Type shape tests for message.ts and permissions.ts
  - Module declaration shims for strict-mode compilation
  - Hardened bootstrap/state.ts with strictNullChecks compliance
affects: [01-02, 02-tool-interface, 03-api-boundary]

# Tech tracking
tech-stack:
  added: []
  patterns: [tsconfig strict overlay, co-located __tests__ directories, module declaration shims for decompiled code]

key-files:
  created:
    - tsconfig.strict.json
    - src/types/__tests__/message.test.ts
    - src/types/__tests__/permissions.test.ts
    - src/types/strict-shims.d.ts
  modified:
    - src/bootstrap/state.ts

key-decisions:
  - "Created strict-shims.d.ts with minimal structural types for packages Bun resolves at runtime but tsc cannot find"
  - "Set noUncheckedIndexedAccess: false -- too aggressive for decompiled code with index signatures"
  - "Added types: [] to override base tsconfig's types: ['bun'] which has no installed type definitions"

patterns-established:
  - "Strict overlay pattern: tsconfig.strict.json extends base, only includes hardened files + d.ts declarations"
  - "Module shim pattern: strict-shims.d.ts provides minimal structural types for missing packages"
  - "Test co-location: src/types/__tests__/ for type shape validation tests"

requirements-completed: [TYPE-01, TYPE-02, TYPE-03, TEST-01]

# Metrics
duration: 6min
completed: 2026-04-07
---

# Phase 01 Plan 01: Strict-Mode Overlay and Core Type Hardening Summary

**tsconfig.strict.json overlay with 6 source files compiling cleanly under strict mode, plus 14 type shape tests for message and permission types**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-07T17:05:01Z
- **Completed:** 2026-04-07T17:11:05Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Established tsconfig.strict.json overlay pattern for incremental strict-mode adoption across the codebase
- All 6 source files (message.ts, permissions.ts, AppStateStore.ts, store.ts, bootstrap/state.ts, Tool.ts) compile cleanly under strict mode
- Created 14 runtime shape validation tests for message and permission types
- Built module declaration shims (strict-shims.d.ts) to bridge Bun runtime resolution vs tsc static analysis gap

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tsconfig.strict.json overlay and bootstrap type test scaffolding** - `156a835` (feat)
2. **Task 2: Harden bootstrap/state.ts under strict mode** - `4cc1a58` (fix)

## Files Created/Modified
- `tsconfig.strict.json` - Strict-mode overlay extending base tsconfig, includes 8 target files + 3 declaration files
- `src/types/__tests__/message.test.ts` - 7 runtime shape tests for message type hierarchy
- `src/types/__tests__/permissions.test.ts` - 7 runtime shape tests for permission types
- `src/types/strict-shims.d.ts` - Module declarations for packages Bun resolves at runtime but tsc cannot find
- `src/bootstrap/state.ts` - Fixed 2 strictNullChecks errors in hook registration functions

## Strict Errors Fixed Per File

| File | Errors Fixed | Details |
|------|-------------|---------|
| src/bootstrap/state.ts | 2 | strictNullChecks: undefined guard for Partial<Record> values in Object.entries() |
| src/types/message.ts | 0 | Already compiles cleanly under strict |
| src/types/permissions.ts | 0 | Already compiles cleanly under strict |
| src/state/AppStateStore.ts | 0 | Already compiles cleanly under strict |
| src/state/store.ts | 0 | Already compiles cleanly under strict |
| src/Tool.ts | 0 | Already compiles cleanly under strict |

## Intentional `unknown` Fields Preserved

| File | Field | Reason |
|------|-------|--------|
| src/types/message.ts | `toolUseResult?: unknown` | Runtime shape varies by tool -- callers must narrow before use |
| src/types/message.ts | `[key: string]: unknown` on Message base | Required for spread compatibility with SDK types; removing would cascade to 80+ consumers |
| src/types/message.ts | `message?: { [key: string]: unknown }` | Inner message shape varies by SDK version and provider |
| src/types/message.ts | `timestamp?: unknown` on CollapsedReadSearchGroup | Decompilation artifact -- runtime type inconsistent |
| src/types/permissions.ts | `toolResult: unknown` on permissionPromptTool reason | Tool results are opaque to the permission system |
| src/types/permissions.ts | `[key: string]: unknown` on PermissionCommandMetadata | Forward compatibility for command metadata |

## `as` Casts Added

None. The 2 fixes in bootstrap/state.ts used undefined guards (early `continue`) rather than type assertions, which is the preferred pattern for strictNullChecks compliance.

## Test Counts

| Metric | Before | After |
|--------|--------|-------|
| Test files | 3 | 5 |
| Total tests | 58 | 72 |
| New message type tests | - | 7 |
| New permission type tests | - | 7 |

## Decisions Made
- Created strict-shims.d.ts rather than installing @types packages, since many SDK subpath imports are Bun-specific and have no published type definitions
- Set `noUncheckedIndexedAccess: false` because enabling it on decompiled code with pervasive index signatures would require hundreds of non-null assertions
- Added `types: []` to strict overlay to override base tsconfig's `types: ["bun"]` which references uninstalled type definitions
- Included `src/types/global.d.ts`, `src/types/internal-modules.d.ts`, and `src/types/strict-shims.d.ts` in the overlay's include list for ambient type resolution

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created strict-shims.d.ts for module resolution**
- **Found during:** Task 1 (tsconfig.strict.json creation)
- **Issue:** tsc cannot resolve Bun-runtime-specific module paths (@anthropic-ai/sdk/resources/index.mjs, lodash-es/sumBy.js, bun:test, etc.) causing cascade errors
- **Fix:** Created src/types/strict-shims.d.ts with minimal structural type declarations for all missing modules
- **Files modified:** src/types/strict-shims.d.ts, tsconfig.strict.json
- **Verification:** `bunx tsc --project tsconfig.strict.json --noEmit` shows 0 errors in target files
- **Committed in:** 156a835 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for strict overlay to function. The shim file is a documented, maintainable pattern for bridging Bun runtime resolution vs tsc static analysis.

## Issues Encountered
- Base tsconfig.json has `types: ["bun"]` but no @types/bun installed -- this pre-existing issue was worked around in the strict overlay by setting `types: []` and providing ambient declarations via strict-shims.d.ts

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- tsconfig.strict.json overlay is ready for Plan 02 to add more files
- strict-shims.d.ts pattern established for handling additional module resolution issues
- Test infrastructure (co-located __tests__/) is in place for future type shape tests

---
*Phase: 01-foundation-hardening*
*Completed: 2026-04-07*
