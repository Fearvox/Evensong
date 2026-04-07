# Phase 03 Deferred Items

## Pre-existing: sessionStorage.ts `await` in non-async function

**File:** `src/utils/sessionStorage.ts:2585-2598`
**Issue:** `appendEntryToFile()` is a sync function but contains `await import('fs')` -- a decompilation artifact. This causes intermittent "await can only be used inside an async function" errors when Bun evaluates the module as a side effect of deep import chains (e.g., withRetry.ts -> auth.js -> sessionStorage.ts).
**Impact:** Tests importing from `withRetry.ts` occasionally fail with an unrelated module-level error. Re-running typically succeeds.
**Fix:** Change `appendEntryToFile` to `async` or replace `await import('fs')` with a top-level import. Out of scope for Plan 03-01 (test-only plan).
