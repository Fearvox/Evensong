---
phase: 05-infrastructure-gate-override
plan: 01
subsystem: infra
tags: [feature-flags, bun-bundle, migration, tdd]

# Dependency graph
requires: []
provides:
  - "Configurable feature flag module (src/utils/featureFlag.ts)"
  - "All 197 files import feature() from centralized module instead of bun:bundle"
  - "_reloadFlagsForTesting() for test-time flag cache reset"
affects: [05-02, 05-03, all-phases-using-feature-flags]

# Tech tracking
tech-stack:
  added: []
  patterns: ["feature flag override via ~/.claude/feature-flags.json", "env var CLAUDE_FEATURE_X override pattern", "boolean-only config validation"]

key-files:
  created:
    - src/utils/featureFlag.ts
    - src/utils/__tests__/featureFlag.test.ts
  modified:
    - src/entrypoints/cli.tsx
    - src/types/internal-modules.d.ts
    - "197 files total (import migration)"

key-decisions:
  - "Added _reloadFlagsForTesting() export to support test isolation without dynamic import hacks"
  - "Changed cli.tsx to named import (not bare side-effect import) since cli.tsx uses feature() inline"

patterns-established:
  - "Feature flag import: import { feature } from 'src/utils/featureFlag.js'"
  - "Config file location: ~/.claude/feature-flags.json (boolean values only)"
  - "Env var naming: CLAUDE_FEATURE_{NAME}=true|1|false"
  - "Priority: CLAUDE_FEATURE_ALL > per-flag env var > config file > false"

requirements-completed: [INFRA-01]

# Metrics
duration: 4min
completed: 2026-04-08
---

# Phase 5 Plan 1: Feature Flag Infrastructure Summary

**Configurable feature flag module replacing bun:bundle polyfill -- 197 files migrated, 9 TDD tests, env var + JSON config override support**

## Performance

- **Duration:** 3min 52s
- **Started:** 2026-04-08T07:33:22Z
- **Completed:** 2026-04-08T07:37:14Z
- **Tasks:** 2
- **Files modified:** 199 (2 created + 197 modified)

## Accomplishments
- Created `src/utils/featureFlag.ts` with configurable feature() function reading from `~/.claude/feature-flags.json` and environment variables
- Migrated all 197 files from `import { feature } from 'bun:bundle'` to `import { feature } from 'src/utils/featureFlag.js'`
- 9 comprehensive TDD tests covering: no-config default, env var true/false/1, CLAUDE_FEATURE_ALL, config file read, non-boolean validation, getAllFlags() copy semantics, env-over-config precedence
- Full test suite passes (237 tests), CLI runtime boots successfully

## Task Commits

Each task was committed atomically:

1. **Task 1: Create featureFlag.ts module with TDD tests** - `49338d0` (feat)
2. **Task 2: Replace all bun:bundle imports with featureFlag.ts imports** - `70025e5` (feat)

## Files Created/Modified
- `src/utils/featureFlag.ts` - Configurable feature flag module with feature(), getAllFlags(), _reloadFlagsForTesting()
- `src/utils/__tests__/featureFlag.test.ts` - 9 test cases for feature flag behavior
- `src/entrypoints/cli.tsx` - Removed 22-line polyfill, replaced with named import from featureFlag.js
- `src/types/internal-modules.d.ts` - Added @deprecated JSDoc on bun:bundle feature() declaration
- 195 additional source files - import path migration from bun:bundle to src/utils/featureFlag.js

## Decisions Made
- **_reloadFlagsForTesting() export:** The IIFE-based flag cache runs once at import time, making test isolation impossible without module cache busting (which Bun doesn't support via query params). Added an explicit test-only reload function instead. This is cleaner than dynamic import hacks and clearly marked `@internal`.
- **Named import in cli.tsx:** Plan specified bare `import 'src/utils/featureFlag.js'` side-effect import, but cli.tsx uses `feature()` directly in module-scope code (ABLATION_BASELINE, DUMP_SYSTEM_PROMPT, etc.). Changed to `import { feature } from 'src/utils/featureFlag.js'` to keep feature in scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] cli.tsx bare import insufficient -- feature() not in scope**
- **Found during:** Task 2 Sub-step D (runtime sanity check)
- **Issue:** Plan specified `import 'src/utils/featureFlag.js'` (bare side-effect import) for cli.tsx, but cli.tsx has ~12 direct `feature()` calls in module scope that need the function in lexical scope
- **Fix:** Changed to `import { feature } from 'src/utils/featureFlag.js'` (named import)
- **Files modified:** src/entrypoints/cli.tsx
- **Verification:** `bun run dev --help` exits 0, full test suite passes
- **Committed in:** 70025e5 (Task 2 commit)

**2. [Rule 3 - Blocking] featureFlag.ts needed _reloadFlagsForTesting() for test isolation**
- **Found during:** Task 1 RED phase (test design)
- **Issue:** Bun does not support query-param cache busting for dynamic imports (`import('../featureFlag.ts?t=xxx')` fails with module not found). The IIFE flag cache cannot be reset between tests without re-importing.
- **Fix:** Extracted IIFE into `loadFlagsFromDisk()` helper, changed `const _flagCache` to `let _flagCache`, exported `_reloadFlagsForTesting()` marked `@internal`
- **Files modified:** src/utils/featureFlag.ts
- **Verification:** All 9 tests pass with proper isolation between test cases
- **Committed in:** 49338d0 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for correctness. No scope creep. Module API unchanged for consumers.

## Issues Encountered
None beyond the deviations documented above.

## Threat Surface Scan

No new threat surface introduced beyond what is documented in the plan's threat model. The `_reloadFlagsForTesting()` function modifies internal state but is only callable by in-process code (no external API surface), consistent with T-05-03 disposition (accept).

## Known Stubs
None -- all functionality is fully wired. No placeholder text, mock data, or TODO markers.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Feature flag infrastructure is complete and operational
- Any future plan can enable features by adding entries to `~/.claude/feature-flags.json`
- Plans 05-02 and 05-03 can build on this foundation for gate override UI and runtime toggle

---
*Phase: 05-infrastructure-gate-override*
*Completed: 2026-04-08*
