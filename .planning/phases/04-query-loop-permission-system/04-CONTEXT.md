# Phase 4: Query Loop & Permission System — Context

**Gathered:** 2026-04-07 (--auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the multi-turn query loop correctly handles tool-use responses, compaction, session resume, and abort. Verify permission enforcement (ask/allow/deny modes) works correctly and persists across turns. Deliver integration tests proving all six success criteria. No new features — test-and-fix existing behavior.

</domain>

<decisions>
## Implementation Decisions

### D-01: Query Loop Test Strategy — Mock Dependency Injection
[auto] Test via the exported `query()` function in `src/query.ts` with a mocked `deps` object.
The `deps` parameter (contains `callTool`, `microcompact`, etc.) enables clean unit testing
without a live API. Follow the Phase 2 `createTestToolUseContext(overrides?)` factory pattern.
Do NOT test via CLI subprocess — too slow, too brittle.

### D-02: Multi-Tool-Use Test (QUERY-01) — Direct Turn Loop
[auto] For QUERY-01 (multiple tool_use blocks), create a test where the mocked API stream returns
a message with N tool_use blocks, assert `deps.callTool` is called N times, assert the follow-up
user message contains N tool_result blocks. Test the "all tools execute, results batch" invariant
directly in the turn loop.

### D-03: Permission Tests — Two-Layer Strategy
[auto]
- Layer 1 (unit): Test `hasPermissionsToUseTool()` from `src/utils/permissions/permissions.js`
  directly. This function has no React dependencies. Test 'allow', 'deny', 'ask' behaviors
  with constructed tool+context inputs.
- Layer 2 (integration): In query loop tests, pass a mock `canUseTool` that returns 'deny' or
  'ask', assert that tool execution is skipped/blocked correctly.
Avoid testing `useCanUseTool` React hook directly — it requires Ink rendering and React Compiler
output makes the hook hard to isolate.

### D-04: Compaction — Test-Only, No Logic Changes
[auto] Phase 4 scope is testing, not fixing. Test `calculateTokenWarningState()` and
`isAutoCompactEnabled()` from `src/services/compact/autoCompact.js` with controlled token count
inputs. Verify the boundary triggers at the expected threshold. Do NOT modify compaction logic —
that would expand scope beyond Phase 4.

### D-05: Session Resume — sessionStorage Direct + Light Integration
[auto] Test `src/utils/sessionStorage.js` functions directly using temp files (same pattern as
Phase 3 atomic history writes used native `fs` with temp paths). Write a session → read it back →
assert correct shape. Light integration: verify QueryEngine initializes correctly from a
pre-written session file. Do NOT require live API for resume tests.

### D-06: Abort/Cancel — AbortController Mock Injection
[auto] Create an AbortController, signal it mid-stream, pass it into `toolUseContext` in query
loop tests. Assert the loop exits with `reason: 'aborted_streaming'` or `reason: 'aborted_tools'`
and leaves messages in a recoverable state. Follows Phase 3 abort history test pattern.

### D-07: Permission Persistence — State Accumulation Test
[auto] Test that permission decisions from one turn carry forward to the next. The permission
state lives in `toolPermissionContext` passed through `ToolUseContext`. Test by running two
query turns with the same context, granting permission in turn 1, verifying turn 2 doesn't
re-prompt for the same tool.

### D-08: Existing Test Infrastructure — Extend, Don't Replace
[auto] Add Phase 4 tests to new co-located `__tests__/` directories:
- `src/query/__tests__/query.test.ts` — query loop tests
- `src/utils/permissions/__tests__/permissions.test.ts` — permission unit tests
- `src/utils/__tests__/sessionStorage.test.ts` — session resume tests
- `src/services/compact/__tests__/autoCompact.test.ts` — compaction boundary tests
All files must be listed in `tsconfig.strict.json` includes per D-09 from Phase 1.

### D-09: Bug Fix Scope for PERM-01 (permission prompt before execution)
[auto] If investigation reveals PERM-01 is a code bug (not just missing test), write a failing
test first that proves the bug, then apply the minimal fix. Do not refactor the permission system
— single targeted fix only. If it's already working correctly, write a passing test and mark
PERM-01 resolved.

### Quality Constraints (inherited from Phase 1)
- Code patterns follow explicit types, functional patterns, clear naming
- Tests use `createTestToolUseContext` factory — no copy-paste setup
- Debug-friendly: meaningful error messages in test failures
- Every new file added to tsconfig.strict.json

### Claude's Discretion
- Exact mock shape for `deps` object in query loop tests
- Whether to use `bun:test` mock.module or manual mock factories for callTool
- Internal test helper naming and file organization within `__tests__/`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Query Loop
- `src/query.ts` (1732 lines) — The turn loop. Key: `params.canUseTool`, `toolUseContext.abortController`, compaction calls
- `src/QueryEngine.ts` (1320 lines) — Session management, file history, compaction orchestration

### Permission System
- `src/hooks/useCanUseTool.tsx` — React hook (avoid direct testing — has _c() boilerplate)
- `src/utils/permissions/permissions.js` — `hasPermissionsToUseTool()` — primary test target
- `src/hooks/toolPermission/` — handlers (coordinator, interactive, swarmWorker)
- `src/types/permissions.ts` (441 lines) — `PermissionMode`, `PermissionBehavior` types

### Session Storage
- `src/utils/sessionStorage.js` — Session read/write (resume target)

### Compaction
- `src/services/compact/autoCompact.js` — `calculateTokenWarningState()`, `isAutoCompactEnabled()`
- `src/services/compact/compact.js` — `buildPostCompactMessages()`

### Test Infrastructure (existing patterns to follow)
- `src/tools/BashTool/__tests__/` — Phase 2 integration test pattern
- `src/services/api/__tests__/` — Phase 3 stream/abort test pattern
- `src/Tool.ts` — `createTestToolUseContext` factory (used in Phase 2)

### Config
- `tsconfig.strict.json` — Add all new test files here

</canonical_refs>

<code_context>
## Existing Code Insights

### Query Loop Architecture (from scout)
- `canUseTool` is a **parameter** to `query()` — enables clean mocking
- `toolUseContext.abortController.signal` checked at multiple points in loop — `reason: 'aborted_streaming'` and `reason: 'aborted_tools'` exit paths exist
- Compaction: `isAutoCompactEnabled()` + `calculateTokenWarningState()` → `buildPostCompactMessages()` → `deps.microcompact()`
- Multi-tool-use: tool blocks processed in sequence within a single turn iteration

### Permission System Architecture (from scout)
- `hasPermissionsToUseTool()` is the primary decision function (no React dependency)
- `useCanUseTool` hook wraps it with React state + Ink UI prompt queue
- Permission modes: `'plan'`, `'auto'`, `'bubble'` (internal) + external modes
- `PermissionBehavior`: `'allow' | 'deny' | 'ask'`

### Established Patterns
- `createTestToolUseContext(overrides?)` factory — use this for all query tests
- `mock.module()` for circular dependency breaking (established in Phase 2 GrepTool tests)
- Native `fs` imports for temp file paths (established in Phase 3)

### Integration Points
- `query()` connects to `QueryEngine` → connects to REPL
- Permission decisions flow: REPL state → `canUseTool` fn → `query()` turn loop
- Session files: written by `QueryEngine`, read on resume

</code_context>

<specifics>
## Specific Notes

- Phase 3 left `CLAUDE_DISABLE_STREAM_WATCHDOG` env var pattern — use same convention for any Phase 4 test toggles
- The `query()` function's `deps` parameter design is specifically for testability — no workarounds needed
- PERM-01 (permission prompt before execution) is flagged as upstream bug — investigate first before assuming it needs a fix

</specifics>

<deferred>
## Deferred Ideas

- Full `useCanUseTool` React hook testing with ink-testing-library → Phase 6 (UI cleanup)
- Compaction logic improvements (snip, microcompact, reactive) → separate phase if needed
- Multi-device session resume → out of scope for v1
- Permission audit trail / logging UI improvements → Phase 6

</deferred>

---

*Phase: 04-query-loop-permission-system*
*Context gathered: 2026-04-07 (--auto mode)*
*Gray areas auto-selected: all 5, recommended options chosen*
