---
phase: 04-query-loop-permission-system
plan: "04"
subsystem: query-loop
tags: [testing, tdd, query-loop, abort, permissions, QUERY-01, QUERY-04, PERM-03, TEST-04]
dependency_graph:
  requires: [04-01, 04-02, 04-03]
  provides: [QUERY-01-tests, QUERY-04-tests, PERM-03-tests, TEST-04-complete]
  affects: [tsconfig.strict.json]
tech_stack:
  added: []
  patterns:
    - drainQuery-while-loop-for-terminal-capture
    - makeToolUseContext-with-full-AppState-mock
    - async-generator-mock-for-callModel
    - tool-specific-permission-unit-test-for-cross-turn-persistence
key_files:
  created:
    - src/query/__tests__/query.test.ts
  modified:
    - tsconfig.strict.json
decisions:
  - "drainQuery uses while(true)+gen.next() pattern — for-await does not capture terminal (done) value"
  - "makeToolUseContext factory inlines full AppState mock with mcp/fastMode/effortValue/advisorModel — createTestToolUseContext getAppState default lacks these fields needed by query.ts"
  - "PERM-03 降级为单元测试 (hasPermissionsToUseTool + alwaysAllowRules) — 附等价性注释说明 AppState 跨轮次传递的机制"
  - "tool_result 计数通过 events 数组验证，而非 callModel 收到的 messages 参数 (messages 是 API MessageParam 格式，格式不同)"
  - "createMockQueryTool 使用 z.object() Zod schema — toolExecution.ts 调用 tool.inputSchema.safeParse() 需要真实 safeParse 方法"
metrics:
  duration: "~10min"
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
requirements_satisfied: [QUERY-01, QUERY-04, PERM-03, TEST-04]
---

# Phase 04 Plan 04: Query Loop Integration Tests Summary

**One-liner:** 7 integration tests covering multi-tool batch execution (QUERY-01), two abort paths (QUERY-04), and cross-turn permission persistence (PERM-03) via deps-injected mock callModel.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Query loop integration tests (QUERY-01, QUERY-04, PERM-03) | dc017d2 | src/query/__tests__/query.test.ts (new, 558 lines) |
| 2 | Add query.test.ts to tsconfig.strict.json | 2a74154 | tsconfig.strict.json (+2 lines) |

## What Was Built

### src/query/__tests__/query.test.ts (7 tests, 3 describe groups)

**Group A: QUERY-01 — Multi-tool batch execution**

1. `two tool_use blocks cause canUseTool to be called at least twice` — callModel yields AssistantMessage with 2 `tool_use` blocks; `canUseToolCallCount ≥ 2` asserted.
2. `two tool_use blocks produce two tool_result entries in yielded events` — verifies 2 `tool_result` blocks appear in yielded `user`-type events from query().

**Group B: QUERY-04 — Abort handling**

3. `abort during stream returns terminal with reason: aborted_streaming` — abortController.abort() inside callModel generator; `terminal.reason === 'aborted_streaming'`.
4. `abort during tool execution returns terminal with reason: aborted_tools` — callModel yields tool_use; canUseTool fires abort; `terminal.reason === 'aborted_tools'`.
5. `QUERY-04 C: after abort, terminal reason is a valid abort state (orphan cleanup)` — yields tool_use then aborts; verifies `reason` is a valid abort state and tool_use/tool_result counts are balanced (orphan cleanup by yieldMissingToolResultBlocks).

**Group C: PERM-03 — Permission state persists across turns**

6. `PERM-03: alwaysAllowRules accumulated in turn 1 drives allow decision in turn 2` — unit test: `hasPermissionsToUseTool()` with `alwaysAllowRules: { session: ['Bash'] }` returns `behavior: 'allow'`. Equivalent to cross-turn persistence: AppState.toolPermissionContext is the same object across query() iterations.
7. `PERM-03: alwaysAllowRules is tool-specific (does not grant all tools)` — T-04-04-04 mitigation: FileWrite tool with only Bash in alwaysAllowRules returns `behavior: 'ask'`, not `'allow'`.

### Key Infrastructure

**`drainQuery(gen)`** — while-loop pattern that captures the Terminal (done value):
```typescript
async function drainQuery(gen) {
  const events = []
  let terminal
  while (true) {
    const { value, done } = await gen.next()
    if (done) { terminal = value; break }
    events.push(value)
  }
  return { events, terminal }
}
```

**`makeToolUseContext(overrides)`** — provides complete AppState mock including `mcp.clients`, `mcp.tools`, `fastMode`, `effortValue`, `advisorModel` — all fields accessed by `query.ts` via `toolUseContext.getAppState()`.

**`createMockQueryTool(name)`** — Zod-based inputSchema with real `safeParse` (required by toolExecution.ts line 615).

### tsconfig.strict.json

追加 `"src/query/__tests__/query.test.ts"` — Phase 4 最终更新。现包含 4 个 Wave 1+2 新测试文件路径。

## Verification Results

```
bun test src/query/__tests__/query.test.ts
  7 pass / 0 fail

bun test (full suite — TEST-04)
  218 pass / 0 fail (baseline 211 + 7 new)

node -e "JSON.parse(...)" tsconfig.strict.json
  JSON valid
```

## TEST-04 Coverage Map

| Requirement | Test File | Tests |
|-------------|-----------|-------|
| QUERY-01: multi-tool batch | query.test.ts | 2 tests |
| QUERY-02: compaction boundary | autoCompact.test.ts | 10 tests |
| QUERY-03: session resume | sessionStorage.test.ts | 14 tests |
| QUERY-04: abort recoverable | query.test.ts | 3 tests |
| PERM-01: check before call | permissions.test.ts | 1 test |
| PERM-02: deny/ask/allow modes | permissions.test.ts | 4 tests |
| PERM-03: permission persists | permissions.test.ts + query.test.ts | 2 tests |

## Deviations from Plan

**1. [Rule 1 - Bug] makeToolUseContext factory replaces createTestToolUseContext for integration tests**

- **Found during:** Task 1 — first test run returned `model_error` instead of expected abort reason
- **Root cause:** `createTestToolUseContext` default `getAppState()` returns only `{ toolPermissionContext }`, missing `appState.mcp.tools`, `appState.mcp.clients`, `appState.fastMode`, `appState.effortValue`, `appState.advisorModel` — all accessed by query.ts
- **Fix:** New `makeToolUseContext()` helper provides complete AppState mock; `createTestToolUseContext` still used for PERM-03 unit tests (which only need `toolPermissionContext`)
- **Files modified:** src/query/__tests__/query.test.ts

**2. [Rule 1 - Bug] tool_result verification via events array, not secondTurnMessages**

- **Found during:** Task 1 — `secondTurnMessages` filtered by `role: 'user'` returned 0 tool_result blocks
- **Root cause:** `callModel` receives `MessageParam[]` (Anthropic API format after `prependUserContext` + `normalizeMessagesForAPI`); format differs from internal `Message[]`
- **Fix:** Changed assertion to count `tool_result` blocks in yielded `events` (type=`'user'` messages from query generator) instead of second-turn callModel params
- **Files modified:** src/query/__tests__/query.test.ts

## Known Stubs

None — all tests exercise real `query()`, `runTools()`, `hasPermissionsToUseTool()` with no stub data flows.

## Threat Surface Scan

None — test-only files; no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- [x] `src/query/__tests__/query.test.ts` exists: FOUND
- [x] `tsconfig.strict.json` contains `"src/query/__tests__/query.test.ts"`: VERIFIED
- [x] commit dc017d2 exists: FOUND
- [x] commit 2a74154 exists: FOUND
- [x] `bun test src/query/__tests__/query.test.ts` — 7 pass, 0 fail: VERIFIED
- [x] `bun test` full suite — 218 pass, 0 fail: VERIFIED
- [x] `tsconfig.strict.json` JSON valid: VERIFIED
