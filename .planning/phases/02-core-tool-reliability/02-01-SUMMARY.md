---
phase: 02-core-tool-reliability
plan: 01
subsystem: testing
tags: [bun-test, bash-tool, shell-error, integration-tests, tool-use-context]

# Dependency graph
requires:
  - phase: 01-foundation-hardening
    provides: tsconfig.strict.json overlay, co-located __tests__/ pattern
provides:
  - Shared ToolUseContext test factory (createTestToolUseContext)
  - BashTool integration test suite (5 tests)
affects: [02-02, 02-03, all future tool test plans]

# Tech tracking
tech-stack:
  added: []
  patterns: [ToolUseContext test factory with Partial overrides, lazy BashTool import for env setup]

key-files:
  created:
    - src/tools/__tests__/createTestToolUseContext.ts
    - src/tools/__tests__/createTestToolUseContext.test.ts
    - src/tools/BashTool/__tests__/BashTool.test.ts
  modified:
    - tsconfig.strict.json

key-decisions:
  - "Lazy dynamic import for BashTool to ensure CLAUDE_CODE_DISABLE_SANDBOX env is set before module-level side effects"
  - "Used 'as any' casts for mockCanUseTool and mockParentMessage since full type satisfaction requires deep mock graphs"

patterns-established:
  - "Pattern: createTestToolUseContext(overrides?) factory for all tool integration tests"
  - "Pattern: beforeAll env setup + lazy import for tools with module-level side effects"
  - "Pattern: ShellError assertion via try/catch + expect.unreachable for async throw tests"

requirements-completed: [TOOL-01, TOOL-05, TEST-02]

# Metrics
duration: 3min
completed: 2026-04-07
---

# Phase 2 Plan 01: BashTool Integration Tests Summary

**Shared ToolUseContext test factory and 5 BashTool integration tests covering exit codes, stderr, timeout, and command semantics**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T20:59:24Z
- **Completed:** 2026-04-07T21:02:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created shared `createTestToolUseContext(overrides?)` factory used by all tool tests in Phase 2
- BashTool integration tests prove ShellError propagation with correct exit codes (exit 42 -> code=42)
- Verified grep exit=1 is NOT treated as error (command semantics working correctly)
- Timeout handling test confirms long-running commands get killed
- All 107 tests pass across full suite (49 new tests added: 4 factory + 5 BashTool + existing 98)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared ToolUseContext test factory** - `eea8d13` (test)
2. **Task 2: Write BashTool integration tests** - `ff0c6db` (feat)

## Files Created/Modified
- `src/tools/__tests__/createTestToolUseContext.ts` - Shared factory exporting createTestToolUseContext(overrides?)
- `src/tools/__tests__/createTestToolUseContext.test.ts` - 4 tests for the factory itself
- `src/tools/BashTool/__tests__/BashTool.test.ts` - 5 BashTool integration tests (happy path, exit code, stderr, timeout, command semantics)
- `tsconfig.strict.json` - Added both new test files to strict include list

## Decisions Made
- Lazy dynamic import (`await import('../BashTool.js')`) instead of top-level import to ensure `CLAUDE_CODE_DISABLE_SANDBOX=1` is set before BashTool module loads (module-level side effects read env at import time)
- Used `as any` casts for mockCanUseTool and mockParentMessage because full type-accurate mocks would require constructing deep object graphs from decompiled types with no testing benefit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ran bun install for missing lru-cache dependency**
- **Found during:** Task 1 (factory test run)
- **Issue:** `lru-cache` package not installed despite being in package.json (node_modules stale)
- **Fix:** Ran `bun install` to resolve all dependencies
- **Files modified:** None committed (node_modules is gitignored)
- **Verification:** Tests run successfully after install
- **Committed in:** N/A (runtime-only fix)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial runtime fix. No scope creep.

## Issues Encountered
None beyond the dependency installation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ToolUseContext factory ready for Plans 02-02 (FileEditTool) and 02-03 (GrepTool/AgentTool)
- Pattern established for lazy import + env setup before tool module loading
- All tests green, strict tsc clean for new files

---
*Phase: 02-core-tool-reliability*
*Completed: 2026-04-07*
