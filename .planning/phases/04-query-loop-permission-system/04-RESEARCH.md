# Phase 4: Query Loop & Permission System — Research

**Researched:** 2026-04-07
**Domain:** Turn loop orchestration, permission enforcement, session resume, compaction triggers
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Query Loop Test Strategy — Mock Dependency Injection**
Test via the exported `query()` function in `src/query.ts` with a mocked `deps` object.
The `deps` parameter (contains `callTool`, `microcompact`, etc.) enables clean unit testing
without a live API. Follow the Phase 2 `createTestToolUseContext(overrides?)` factory pattern.
Do NOT test via CLI subprocess — too slow, too brittle.

**D-02: Multi-Tool-Use Test (QUERY-01) — Direct Turn Loop**
For QUERY-01 (multiple tool_use blocks), create a test where the mocked API stream returns
a message with N tool_use blocks, assert `deps.callTool` is called N times, assert the follow-up
user message contains N tool_result blocks. Test the "all tools execute, results batch" invariant
directly in the turn loop.

**D-03: Permission Tests — Two-Layer Strategy**
- Layer 1 (unit): Test `hasPermissionsToUseTool()` from `src/utils/permissions/permissions.ts`
  directly. This function has no React dependencies. Test 'allow', 'deny', 'ask' behaviors
  with constructed tool+context inputs.
- Layer 2 (integration): In query loop tests, pass a mock `canUseTool` that returns 'deny' or
  'ask', assert that tool execution is skipped/blocked correctly.
Avoid testing `useCanUseTool` React hook directly — it requires Ink rendering and React Compiler
output makes the hook hard to isolate.

**D-04: Compaction — Test-Only, No Logic Changes**
Phase 4 scope is testing, not fixing. Test `calculateTokenWarningState()` and
`isAutoCompactEnabled()` from `src/services/compact/autoCompact.ts` with controlled token count
inputs. Verify the boundary triggers at the expected threshold. Do NOT modify compaction logic —
that would expand scope beyond Phase 4.

**D-05: Session Resume — sessionStorage Direct + Light Integration**
Test `src/utils/sessionStorage.ts` functions directly using temp files (same pattern as
Phase 3 atomic history writes used native `fs` with temp paths). Write a session → read it back →
assert correct shape. Light integration: verify QueryEngine initializes correctly from a
pre-written session file. Do NOT require live API for resume tests.

**D-06: Abort/Cancel — AbortController Mock Injection**
Create an AbortController, signal it mid-stream, pass it into `toolUseContext` in query
loop tests. Assert the loop exits with `reason: 'aborted_streaming'` or `reason: 'aborted_tools'`
and leaves messages in a recoverable state. Follows Phase 3 abort history test pattern.

**D-07: Permission Persistence — State Accumulation Test**
Test that permission decisions from one turn carry forward to the next. The permission
state lives in `toolPermissionContext` passed through `ToolUseContext`. Test by running two
query turns with the same context, granting permission in turn 1, verifying turn 2 doesn't
re-prompt for the same tool.

**D-08: Existing Test Infrastructure — Extend, Don't Replace**
Add Phase 4 tests to new co-located `__tests__/` directories:
- `src/query/__tests__/query.test.ts` — query loop tests
- `src/utils/permissions/__tests__/permissions.test.ts` — permission unit tests
- `src/utils/__tests__/sessionStorage.test.ts` — session resume tests
- `src/services/compact/__tests__/autoCompact.test.ts` — compaction boundary tests
All files must be listed in `tsconfig.strict.json` includes per D-09 from Phase 1.

**D-09: Bug Fix Scope for PERM-01 (permission prompt before execution)**
If investigation reveals PERM-01 is a code bug (not just missing test), write a failing
test first that proves the bug, then apply the minimal fix. Do not refactor the permission system
— single targeted fix only. If it's already working correctly, write a passing test and mark
PERM-01 resolved.

### Claude's Discretion
- Exact mock shape for `deps` object in query loop tests
- Whether to use `bun:test` mock.module or manual mock factories for callTool
- Internal test helper naming and file organization within `__tests__/`

### Deferred Ideas (OUT OF SCOPE)
- Full `useCanUseTool` React hook testing with ink-testing-library → Phase 6 (UI cleanup)
- Compaction logic improvements (snip, microcompact, reactive) → separate phase if needed
- Multi-device session resume → out of scope for v1
- Permission audit trail / logging UI improvements → Phase 6

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUERY-01 | query.ts turn loop handles multi-tool-use responses correctly | Verified: toolUseBlocks[] collected in streaming loop; runTools() processes them batch via toolOrchestration.ts; results batched into single follow-up user message |
| QUERY-02 | Context compaction triggers at safe boundary and preserves recent context | Verified: calculateTokenWarningState() + isAutoCompactEnabled() + getAutoCompactThreshold() with env override CLAUDE_AUTOCOMPACT_PCT_OVERRIDE for test control |
| QUERY-03 | QueryEngine session resume loads correct conversation state | Verified: loadTranscriptFile() + buildConversationChain() in sessionStorage.ts; transcript is JSONL format; isTranscriptMessage() type guard |
| QUERY-04 | Abort/cancel mid-turn leaves conversation in recoverable state | Verified: two abort exit paths — 'aborted_streaming' (after stream) and 'aborted_tools' (after tool execution); yieldMissingToolResultBlocks() used for orphan cleanup |
| PERM-01 | Tool permission prompt displays before execution | Verified NOT a bug: resolveHookPermissionDecision() called in toolExecution.ts BEFORE tool.call(); permission check is at line ~921, tool.call() is after; PERM-01 is a test gap, not a code bug |
| PERM-02 | Permission modes (ask, auto-approve, deny) enforce correctly per tool | Verified: hasPermissionsToUseToolInner() decision tree: deny rules → ask rules → tool.checkPermissions() → bypassPermissions mode → always-allow rules → passthrough→ask |
| PERM-03 | Permission state persists correctly across session turns | Verified: toolPermissionContext lives in AppState; alwaysAllowRules/alwaysDenyRules/alwaysAskRules carry forward; for tests: setAppState() on the shared context object accumulates state |
| TEST-04 | Query loop has tests covering multi-turn, compaction, and abort scenarios | Gap: 0 existing query loop tests; 4 new test files needed |

</phase_requirements>

---

## Summary

Phase 4 is a test-and-verify phase against an existing, largely correct implementation. The primary work is writing tests that expose and prove correctness of the query loop, permission system, compaction, session resume, and abort handling — plus investigating PERM-01 (suspected upstream bug).

**PERM-01 investigation result:** After reading `toolExecution.ts` lines 880-1000, permission checking via `resolveHookPermissionDecision()` occurs at line ~921 BEFORE `tool.call()` at line ~1010+. The `permissionDecision.behavior !== 'allow'` guard returns early before execution. PERM-01 is a **test gap, not a code bug** — the existing code correctly gates execution behind permission. Write a passing test and mark resolved.

The `query()` function's `deps` parameter is a first-class testability hook already designed for injection. The `createTestToolUseContext()` factory (Phase 2) covers the ToolUseContext boundary. Test infrastructure is 182 tests passing, stable, and ready to extend.

**Primary recommendation:** Write 4 test files in order: permissions.test.ts (pure functions, no deps) → autoCompact.test.ts (pure math) → sessionStorage.test.ts (fs-based) → query.test.ts (async generator, deps injection). Each builds on the previous in complexity.

---

## Standard Stack

### Core (Already Present)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:test | built-in | Test runner | Project-locked runtime; 182 existing tests use this |
| bun:test mock | built-in | Mock functions and modules | Used in GrepTool tests for circular dep breaking |
| fs (Node compat) | built-in | Temp file I/O | Used in Phase 3 sessionStorageAtomic.test.ts |

### Supporting (Already Present)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/tools/__tests__/createTestToolUseContext.ts` | project | ToolUseContext factory | All tests needing a ToolUseContext |
| `src/Tool.ts` `getEmptyToolPermissionContext()` | project | Empty permission context | Baseline for permission tests |
| `os` / `path` | built-in | Temp dir creation | Session file tests |

**Installation:** None required. All dependencies are already present.

---

## Architecture Patterns

### Turn Loop Structure (query.ts)

The main loop is an iterative `while(true)` — NOT recursive. State is accumulated in a `State` object and `continue` is used for iteration.

```
queryLoop():
  while (true):
    1. microcompact messages
    2. autocompact check (deps.autocompact)
    3. Stream from deps.callModel — collect assistantMessages[], toolUseBlocks[]
    4. If abort signal: yieldMissingToolResultBlocks() → return 'aborted_streaming'
    5. If !needsFollowUp: handle stop hooks → return 'completed'
    6. runTools(toolUseBlocks, ...) or streamingToolExecutor.getRemainingResults()
    7. If abort signal after tools: return 'aborted_tools'
    8. Batch all toolResults into next iteration's messages
    9. state = { messages: [...old, ...assistantMessages, ...toolResults], ... }
    // continue while(true)
```

[VERIFIED: read src/query.ts lines 241-1732]

### Multi-Tool-Use Batching (QUERY-01)

```typescript
// Source: src/query.ts lines 832-837 (streaming loop)
const msgToolUseBlocks = assistantMessage.message.content
  .filter(c => c.type === 'tool_use') as ToolUseBlock[]
if (msgToolUseBlocks.length > 0) {
  toolUseBlocks.push(...msgToolUseBlocks)  // ALL blocks collected
  needsFollowUp = true
}

// Source: src/query.ts lines 1383-1411 (tool execution)
const toolUpdates = streamingToolExecutor
  ? streamingToolExecutor.getRemainingResults()
  : runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)
// toolResults array receives ALL tool_result blocks
// These are batched into ONE follow-up user message via the next state
```

[VERIFIED: read src/query.ts, src/services/tools/toolOrchestration.ts]

**Key insight for QUERY-01 tests:** The `streamingToolExecutor` path (when `config.gates.streamingToolExecution` is true) may differ from `runTools()` path. For test isolation, disable streaming tool execution by controlling the config gate, OR mock `runTools` directly. The `deps` object currently covers `callModel`, `microcompact`, `autocompact`, `uuid` — `runTools` is NOT in deps (imported directly).

### Permission Decision Flow (PERM-01, PERM-02, PERM-03)

```
Tool execution path (toolExecution.ts):
  1. validateInput()   — type/schema check
  2. PreToolUse hooks  — can modify input
  3. resolveHookPermissionDecision() — calls canUseTool() → hasPermissionsToUseTool()
     └── hasPermissionsToUseToolInner():
         1a. denyRule check → 'deny'
         1b. askRule check → 'ask'
         1c. tool.checkPermissions() → tool-specific logic
         1d. bypassPermissions mode → 'allow'
         2b. alwaysAllowedRule → 'allow'
         3. passthrough → 'ask'
  4. if behavior !== 'allow': early return (tool NEVER executes)
  5. tool.call()       — actual execution
```

[VERIFIED: read src/services/tools/toolExecution.ts lines 880-1000, src/utils/permissions/permissions.ts lines 1158-1319]

**PERM-01 verdict:** Code is correct. Permission check at step 3 gates step 5. Test gap only.

### Permission Persistence Pattern (PERM-03)

Permission state accumulates in `AppState.toolPermissionContext`:
- `alwaysAllowRules`: `{ [source: PermissionRuleSource]: string[] }` — rules that auto-allow
- `alwaysDenyRules`: same shape for deny
- `alwaysAskRules`: same shape for ask

For test: use `createTestToolUseContext()` with a custom `getAppState` that returns updated `toolPermissionContext` after a grant:

```typescript
// Source: src/tools/__tests__/createTestToolUseContext.ts
const appState = { toolPermissionContext: getEmptyToolPermissionContext() } as AppState
// Mutate appState.toolPermissionContext.alwaysAllowRules between turns to simulate persistence
```

[VERIFIED: read src/Tool.ts lines 140-148, src/tools/__tests__/createTestToolUseContext.ts]

### Compaction Boundary (QUERY-02)

```typescript
// Source: src/services/compact/autoCompact.ts lines 92-145
export function calculateTokenWarningState(tokenUsage: number, model: string): {
  percentLeft: number
  isAboveWarningThreshold: boolean   // threshold - 20k tokens
  isAboveErrorThreshold: boolean     // threshold - 20k tokens
  isAboveAutoCompactThreshold: boolean  // threshold - 13k tokens
  isAtBlockingLimit: boolean         // contextWindow - 3k tokens
}
```

**Test control:** `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` env var controls threshold as percentage. `DISABLE_AUTO_COMPACT=1` disables autocompact. `CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE` overrides blocking limit. These env vars are the correct test toggles — no mocking needed.

[VERIFIED: read src/services/compact/autoCompact.ts lines 71-158]

### Session Storage Format (QUERY-03)

Session transcript = JSONL file where each line is a `TranscriptMessage | FileHistorySnapshotMessage | ...`.

```typescript
// Source: src/utils/sessionStorage.ts lines 147-154
export function isTranscriptMessage(entry: Entry): entry is TranscriptMessage {
  return entry.type === 'user' || entry.type === 'assistant' ||
         entry.type === 'attachment' || entry.type === 'system'
}

// Key API for session resume tests:
export async function loadTranscriptFile(filePath: string): Promise<{
  messages: Map<UUID, TranscriptMessage>
  leafUuids: Set<UUID>
  // ... other maps
}>

export function buildConversationChain(
  messages: Map<UUID, TranscriptMessage>,
  leafMessage: TranscriptMessage,
): TranscriptMessage[]
```

For resume tests: write JSONL directly with `fs.writeFileSync` (same pattern as Phase 3 `finalizeHistoryOnAbort`). Read back with `loadTranscriptFile()`. Assert message shape.

[VERIFIED: read src/utils/sessionStorage.ts lines 147-154, 2075-2110, 3540-3600]

### Abort Exit Paths (QUERY-04)

Two distinct abort states:

| Exit Path | When | Return Value | Message Added |
|-----------|------|--------------|---------------|
| `aborted_streaming` | abort detected AFTER streaming loop, BEFORE tools | `{ reason: 'aborted_streaming' }` | `createUserInterruptionMessage({ toolUse: false })` |
| `aborted_tools` | abort detected AFTER tool execution | `{ reason: 'aborted_tools' }` | `createUserInterruptionMessage({ toolUse: true })` |

Both paths call `yieldMissingToolResultBlocks()` to create synthetic tool_result blocks for any orphaned tool_use blocks, leaving the conversation in a valid API-sendable state.

[VERIFIED: read src/query.ts lines 1014-1055, 1487-1518]

### Mock Shape for deps (Claude's Discretion)

```typescript
// Minimal deps mock for query() tests
const mockDeps: QueryDeps = {
  callModel: async function* (params) {
    // yield synthetic stream events
    yield createAssistantMessage({ content: [...toolUseBlocks] })
  },
  microcompact: async (messages) => ({ messages, compactionInfo: undefined }),
  autocompact: async () => ({ compactionResult: null, consecutiveFailures: undefined }),
  uuid: () => 'test-uuid-' + Math.random(),
}
```

The `deps` type is `QueryDeps` from `src/query/deps.ts` — import it for type safety.

[VERIFIED: read src/query/deps.ts lines 1-40]

### Anti-Patterns to Avoid

- **Do NOT import `deps.callModel` (queryModelWithStreaming) and expect it to mock easily** — it has complex streaming state; mock the entire `deps` object instead [VERIFIED from deps.ts design intent comment]
- **Do NOT test `useCanUseTool` React hook directly** — it has React Compiler `_c()` boilerplate and requires Ink rendering context [VERIFIED: read hooks/useCanUseTool.tsx]
- **Do NOT use `runTools` as a test boundary** — it's not in `deps` (not injectable); use the `canUseTool` parameter mock instead
- **Do NOT assume `querySource` doesn't matter** — `autocompact` skips when `querySource === 'compact'` or `'session_memory'`; use `'repl_main_thread'` in tests

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ToolUseContext construction | manual object literal | `createTestToolUseContext(overrides?)` | Already battle-tested across 60+ tool tests |
| Empty permission context | manual object | `getEmptyToolPermissionContext()` | Canonical factory, survives field additions |
| Temp file cleanup | manual | `mkdtempSync` + `afterEach` rmSync | Pattern established in Phase 3 sessionStorageAtomic.test.ts |
| Async generator mock | complex wrapper | native `async function*` in test | Bun:test handles async generators natively |
| Compaction threshold math | reimplementing | `calculateTokenWarningState()` directly | Function is pure, no side effects, directly testable |

---

## Common Pitfalls

### Pitfall 1: streamingToolExecutor vs runTools path
**What goes wrong:** Tests pass when `streamingToolExecution` feature gate is off but fail in production where it's on.
**Why it happens:** `config.gates.streamingToolExecution` is set from a config at query start. Tests don't control this gate.
**How to avoid:** In query tests, verify `toolUseBlocks` is populated (gate-agnostic), OR set `CLAUDE_DISABLE_STREAMING_TOOL_EXECUTION=1` if that env var exists, OR mock at the `canUseTool` boundary which both paths share.
**Warning signs:** Tests pass but QUERY-01 success criteria isn't actually proven end-to-end.

### Pitfall 2: querySource must be non-compact for autocompact tests
**What goes wrong:** `autocompact` returns immediately (no-ops) when `querySource === 'compact'`.
**Why it happens:** Recursion guard in `shouldAutoCompact()`.
**How to avoid:** Always use `querySource: 'repl_main_thread'` for tests that need compaction to fire.

### Pitfall 3: ToolPermissionContext is readonly (DeepImmutable)
**What goes wrong:** Attempt to mutate `toolPermissionContext.alwaysAllowRules` directly in tests causes TypeScript error or silent failure.
**Why it happens:** `ToolPermissionContext` is typed as `DeepImmutable<{...}>` in Tool.ts.
**How to avoid:** Create a new context object with updated rules; pass it via `setAppState` or by constructing a new `createTestToolUseContext` with `getAppState` returning the updated state.

### Pitfall 4: `query()` is an AsyncGenerator — must be consumed
**What goes wrong:** Calling `query(params)` and not draining the generator causes nothing to happen.
**Why it happens:** Generators are lazy; `query()` returns a generator, not a promise.
**How to avoid:**
```typescript
const gen = query(params)
const messages: Message[] = []
for await (const msg of gen) { messages.push(msg as Message) }
const terminal = await gen.return(undefined) // get Terminal return value
// OR:
import { all } from 'src/utils/generators.js'
const [messages, terminal] = await ...
```

### Pitfall 5: hasPermissionsToUseTool requires a valid AssistantMessage
**What goes wrong:** Calling `hasPermissionsToUseTool(tool, input, context, assistantMessage, toolUseID)` with a minimal/undefined `assistantMessage` causes a crash in auto-mode analytics logging.
**Why it happens:** `assistantMessage.message.id` is accessed at permissions.ts line ~635 for analytics.
**How to avoid:** Reuse the `mockParentMessage` pattern from BashTool.test.ts which has the correct shape.

### Pitfall 6: isAutoCompactEnabled() reads from getGlobalConfig()
**What goes wrong:** `isAutoCompactEnabled()` returns unexpected values because it reads from user's actual `~/.claude/settings.json`.
**Why it happens:** `getGlobalConfig()` reads a file from disk.
**How to avoid:** Use env vars (`DISABLE_AUTO_COMPACT=1`, `DISABLE_COMPACT=1`) to control the function without touching settings files.

---

## Code Examples

### Pattern: Mock callModel as async generator

```typescript
// Source: pattern derived from src/query/deps.ts and bun:test docs
import type { QueryDeps } from 'src/query/deps.js'
import type { AssistantMessage } from 'src/types/message.js'

function makeMockDeps(events: Array<AssistantMessage | object>): QueryDeps {
  return {
    callModel: async function* () {
      for (const event of events) {
        yield event as any
      }
    },
    microcompact: async (messages) => ({ messages, compactionInfo: undefined }),
    autocompact: async () => ({ compactionResult: null, consecutiveFailures: undefined }),
    uuid: () => crypto.randomUUID(),
  }
}
```

### Pattern: Permission unit test shape

```typescript
// Source: pattern from src/utils/permissions/permissions.ts hasPermissionsToUseToolInner()
import { hasPermissionsToUseTool } from 'src/utils/permissions/permissions.js'
import { createTestToolUseContext } from 'src/tools/__tests__/createTestToolUseContext.js'
import { buildTool } from 'src/Tool.js'

const mockTool = buildTool({
  name: 'TestTool',
  description: async () => 'test',
  inputSchema: z.object({}),
  prompt: async () => '',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  call: async () => ({ data: 'ok' }),
  mapToolResultToToolResultBlockParam: () => ({ type: 'tool_result', tool_use_id: '', content: '' }),
  renderToolUseMessage: () => null,
  maxResultSizeChars: 1000,
  userFacingName: () => 'TestTool',
})

test('deny rule blocks tool', async () => {
  const ctx = createTestToolUseContext({
    getAppState: () => ({
      toolPermissionContext: {
        ...getEmptyToolPermissionContext(),
        alwaysDenyRules: { session: ['TestTool'] },
      }
    } as AppState),
  })
  const decision = await hasPermissionsToUseTool(mockTool, {}, ctx, mockParentMessage, 'tu-1')
  expect(decision.behavior).toBe('deny')
})
```

### Pattern: Compaction boundary assertion

```typescript
// Source: src/services/compact/autoCompact.ts lines 92-145
import { calculateTokenWarningState, AUTOCOMPACT_BUFFER_TOKENS } from 'src/services/compact/autoCompact.js'

test('isAboveAutoCompactThreshold triggers at correct boundary', () => {
  const model = 'claude-sonnet-4-5-20250514'
  // Just below threshold — should NOT trigger
  const threshold = getAutoCompactThreshold(model)
  const justBelow = calculateTokenWarningState(threshold - 1, model)
  expect(justBelow.isAboveAutoCompactThreshold).toBe(false)
  // At threshold — should trigger
  const atThreshold = calculateTokenWarningState(threshold, model)
  expect(atThreshold.isAboveAutoCompactThreshold).toBe(true)
})
```

### Pattern: Abort signal injection

```typescript
// Source: Phase 3 convention + src/query.ts abort exit paths
test('abort mid-stream returns aborted_streaming', async () => {
  const abortController = new AbortController()
  let streamStarted = false

  const deps: QueryDeps = {
    callModel: async function* () {
      streamStarted = true
      abortController.abort()    // abort during stream
      // yield nothing more — simulates stream cut off
    },
    microcompact: async (m) => ({ messages: m, compactionInfo: undefined }),
    autocompact: async () => ({ compactionResult: null, consecutiveFailures: undefined }),
    uuid: () => crypto.randomUUID(),
  }

  const ctx = createTestToolUseContext({ abortController })
  const gen = query({ messages: [], systemPrompt: ..., canUseTool: mockAllow, toolUseContext: ctx, querySource: 'repl_main_thread', deps })

  let terminal: Terminal | undefined
  for await (const _ of gen) { /* drain */ }
  terminal = (await gen.return(undefined as any)).value
  expect(terminal?.reason).toBe('aborted_streaming')
})
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Recursive `query()` function | Iterative `while(true)` with `state = next; continue` | Tests can observe all loop iterations without stack depth concerns |
| `deps` as separate test-only abstraction | `deps` is first-class parameter in QueryParams | Clean injection without spyOn or module mocking |
| Permission check after tool runs | Permission check gates `tool.call()` in toolExecution.ts | PERM-01 is not a bug — code is correct |

---

## Runtime State Inventory

> Step 2.5: SKIPPED — Phase 4 is greenfield test addition, not a rename/refactor/migration phase. No stored data, live service config, OS-registered state, secrets, or build artifacts are being renamed or migrated.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | All tests | YES | 1.3.11 | — |
| bun:test | Test runner | YES | built-in | — |
| TypeScript | tsconfig.strict.json | YES | ^6.0.2 | — |
| `src/tools/__tests__/createTestToolUseContext.ts` | All Phase 4 tests | YES | project | — |

**Current test status:** 182 tests passing across 15 files. [VERIFIED: ran `bun test`]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — bun auto-discovers `*.test.ts` |
| Quick run command | `bun test --testPathPattern=query` |
| Full suite command | `bun test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUERY-01 | N tool_use blocks → N callTool invocations → N tool_results in follow-up | integration | `bun test --testPathPattern=query.test` | Wave 0 |
| QUERY-02 | calculateTokenWarningState triggers at correct token threshold | unit | `bun test --testPathPattern=autoCompact.test` | Wave 0 |
| QUERY-03 | loadTranscriptFile → buildConversationChain produces correct message chain | integration | `bun test --testPathPattern=sessionStorage.test` | Wave 0 |
| QUERY-04 | abort signal → 'aborted_streaming' or 'aborted_tools' + orphan cleanup | integration | `bun test --testPathPattern=query.test` | Wave 0 |
| PERM-01 | permission checked BEFORE tool.call() in toolExecution path | unit | `bun test --testPathPattern=permissions.test` | Wave 0 |
| PERM-02 | allow/deny/ask modes enforce correctly per tool | unit | `bun test --testPathPattern=permissions.test` | Wave 0 |
| PERM-03 | permission grants persist in toolPermissionContext across turns | integration | `bun test --testPathPattern=query.test` | Wave 0 |
| TEST-04 | all query loop scenarios have tests | meta | `bun test` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test --testPathPattern=<new-test-file>`
- **Per wave merge:** `bun test` (full 182+ suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/query/__tests__/query.test.ts` — covers QUERY-01, QUERY-04, PERM-03
- [ ] `src/utils/permissions/__tests__/permissions.test.ts` — covers PERM-01, PERM-02
- [ ] `src/utils/__tests__/sessionStorage.test.ts` — covers QUERY-03 (extends existing sessionStorageAtomic.test.ts pattern)
- [ ] `src/services/compact/__tests__/autoCompact.test.ts` — covers QUERY-02
- [ ] All 4 files must be added to `tsconfig.strict.json` includes array

---

## Security Domain

> `security_enforcement` not set in config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a — no auth in test layer |
| V3 Session Management | no | n/a — session files are local-only JSONL |
| V4 Access Control | YES | `hasPermissionsToUseTool()` — this IS the access control system under test |
| V5 Input Validation | YES | `tool.inputSchema.parse()` in `hasPermissionsToUseToolInner()` |
| V6 Cryptography | no | n/a |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Permission bypass via mode switching | Elevation of Privilege | bypassPermissions gate at step 2a; ask rules immune per 1f; safetyCheck immune per 1g |
| Tool execution without permission check | Elevation of Privilege | toolExecution.ts: permission check at line ~921 BEFORE tool.call() — verified correct |
| Permission state not persisting across turns | Elevation of Privilege | alwaysAllowRules accumulate in AppState; tests must verify accumulation |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `config.gates.streamingToolExecution` is env-controllable or defaults to false in test | Architecture Patterns / Pitfall 1 | Tests may not cover the production code path for QUERY-01 |
| A2 | The `mockParentMessage` shape from BashTool.test.ts is sufficient for `hasPermissionsToUseTool` calls | Code Examples | Crash in auto-mode analytics branch if shape is wrong |
| A3 | `loadTranscriptFile()` can be called without initializing bootstrap state (getSessionId, etc.) | QUERY-03 | Function may throw accessing bootstrap singletons |

**A3 mitigation:** If `loadTranscriptFile()` requires bootstrap init, use `buildConversationChain()` directly after manually constructing the `Map<UUID, TranscriptMessage>` — this function takes a pre-built map and is purely in-memory.

---

## Open Questions (RESOLVED)

1. **streamingToolExecutor gate in tests** — RESOLVED: No env var found. Strategy: test through `canUseTool` boundary (shared by both `runTools` and `streamingToolExecutor` paths). Both paths call `canUseTool` before executing tools, making it the correct mock injection point regardless of which executor path is active.

2. **loadTranscriptFile bootstrap dependency** — RESOLVED: Fallback strategy adopted. Plan 04-03 tests `buildConversationChain()` with manually constructed Maps (purely in-memory, no bootstrap dependency) as primary approach. `loadTranscriptFile()` tested with temp file path as secondary — if bootstrap throws, the Map-based tests prove the same resume behavior.

3. **Query function Terminal return value access** — RESOLVED: Use `while(true)` loop with `await gen.next()`, capture `value` when `done === true`. Plan 04-04 provides `drainQuery()` helper implementing this pattern. The `for-await` approach discards the return value; the explicit `gen.next()` loop preserves it.

---

## Sources

### Primary (HIGH confidence)
- `src/query.ts` (lines 241-1732) — complete turn loop read, all exit paths verified
- `src/query/deps.ts` — QueryDeps type and productionDeps() factory verified
- `src/services/tools/toolExecution.ts` (lines 880-1000) — permission check before execution verified
- `src/utils/permissions/permissions.ts` (lines 473-1319) — hasPermissionsToUseTool and inner function verified
- `src/services/compact/autoCompact.ts` (lines 1-220) — calculateTokenWarningState and isAutoCompactEnabled verified
- `src/utils/sessionStorage.ts` (lines 147-165, 2075-2110, 3540-3600) — JSONL format, loadTranscriptFile, buildConversationChain verified
- `src/tools/__tests__/createTestToolUseContext.ts` — factory shape verified
- `src/services/api/__tests__/streamWatchdog.test.ts` — Phase 3 abort env var pattern verified
- `src/utils/__tests__/sessionStorageAtomic.test.ts` — Phase 3 temp file pattern verified
- `tsconfig.strict.json` — includes array verified (must add 4 new test files)
- `bun test` run — 182 tests passing confirmed

### Secondary (MEDIUM confidence)
- `src/services/tools/toolOrchestration.ts` (lines 1-80) — runTools batch execution pattern
- `src/hooks/useCanUseTool.tsx` — confirmed React Compiler boilerplate makes it untestable without Ink

### Tertiary (LOW confidence — not verified this session)
- A1: streamingToolExecutor env gate existence
- A3: loadTranscriptFile bootstrap independence

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already present, verified in use
- Architecture (turn loop): HIGH — read entire query.ts, verified all exit paths
- Architecture (permissions): HIGH — read full hasPermissionsToUseToolInner decision tree
- PERM-01 verdict: HIGH — read toolExecution.ts permission check placement vs tool.call()
- Session storage format: HIGH — read loadTranscriptFile and buildConversationChain signatures
- Compaction thresholds: HIGH — read calculateTokenWarningState with all env overrides
- Test file paths: HIGH — read tsconfig.strict.json includes, verified existing patterns
- Open questions (streamingToolExecutor gate, bootstrap independence): LOW — not verified

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days — stable APIs, no fast-moving dependencies)
