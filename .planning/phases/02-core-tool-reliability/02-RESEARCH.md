# Phase 2: Core Tool Reliability - Research

**Researched:** 2026-04-07
**Domain:** Tool system error handling, integration testing (BashTool, FileEditTool, GrepTool, AgentTool)
**Confidence:** HIGH

## Summary

Phase 2 targets the four core tools that do the actual work in Claude Code: BashTool (shell execution), FileEditTool (file modification), GrepTool (search via ripgrep), and AgentTool (subagent delegation). Each tool needs its error paths verified and integration tests written.

The codebase is already well-structured for this work. The `buildTool()` pattern from `Tool.ts` provides a consistent interface. Error handling exists but varies by tool -- BashTool has sophisticated exit code interpretation via `commandSemantics.ts`, FileEditTool uses atomic temp-file-then-rename writes, GrepTool delegates to ripgrep with timeout/retry, and AgentTool passes `ToolUseContext` through `createSubagentContext()`. The main risk is test isolation: these tools depend on filesystem, child processes, and deep import graphs. Tests must mock at the right boundaries.

**Primary recommendation:** Write integration tests that exercise each tool's `call()` method with minimal mocking -- use real temp directories for file operations, real shell execution for BashTool, and mock only the ToolUseContext/AppState boundary. Focus on error propagation first (the success criteria care about failures being reported correctly).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOOL-01 | BashTool correctly propagates errors, handles timeouts, and reports exit codes | BashTool throws `ShellError` on non-zero exits (line 718), exit code is in `ShellError.code`. `commandSemantics.ts` interprets exit codes semantically (grep=1 is not error). Tests need to verify ShellError propagation and that `mapToolResultToToolResultBlockParam` includes exit code in output. |
| TOOL-02 | FileEditTool applies diffs without file corruption under partial writes | `writeFileSyncAndFlush_DEPRECATED` already does atomic write (temp file + rename, line 386-437 of file.ts). Tests need to verify: (1) successful atomic write, (2) original file preserved if write fails, (3) temp file cleaned up on error. |
| TOOL-03 | GrepTool handles large result sets and binary file detection | Ripgrep natively skips binary files (default behavior). GrepTool has `head_limit` (default 250) for large results. `RipgrepTimeoutError` with partial results exists. Tests need: binary skip, large result truncation, timeout handling. |
| TOOL-04 | AgentTool subagent recursion works with correct ToolUseContext propagation | `createSubagentContext()` in `forkedAgent.ts` clones parent context with child abort controller, scoped AppState, and fresh file state cache. `runAgent()` generator yields messages. Tests need to verify context fields are correctly propagated. |
| TOOL-05 | Each core tool has integration tests covering happy path and error cases | Co-located `__tests__/` directories per Phase 1 pattern. Use `bun test` with `describe/test/expect` from `bun:test`. |
| TEST-02 | Core tool modules have integration test suites | Same as TOOL-05 -- tests go in `src/tools/<ToolName>/__tests__/` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Runtime**: Bun only -- all tests use `bun test` with `import { describe, test, expect } from 'bun:test'`
- **No mass tsc fixes**: Only fix types in files being actively worked on
- **feature() always false**: Code behind feature flags is dead code; don't test it
- **Test location**: Co-located `__tests__/` directories next to source (Phase 1 pattern D-06)
- **Quality**: Debug-friendly code, meaningful error messages, no swallowed errors (Phase 1 D-12)
- **New files in strict**: Every new file must be added to `tsconfig.strict.json` (Phase 1 D-09)

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun test | built-in (Bun 1.3.x) | Test runner | Only compatible test runner for Bun-only constraint [VERIFIED: CLAUDE.md] |
| bun:test | built-in | Test API (describe, test, expect, mock, spyOn) | Bun's native test API [VERIFIED: existing test files] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs/promises | built-in | Temp dir/file creation in tests | Integration tests needing real filesystem |
| node:child_process | built-in | Verifying shell execution behavior | BashTool integration tests |
| node:os (tmpdir) | built-in | Isolated test directories | All tool tests needing file I/O |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Real filesystem | In-memory fs mock | Real fs catches actual bugs; mock is faster but misses edge cases |
| Calling tool.call() directly | Subprocess testing via `bun run` | Direct call tests the actual code path; subprocess adds indirection |

**Installation:** No new packages needed. All dependencies are built-in.

## Architecture Patterns

### Recommended Test Structure
```
src/tools/
  BashTool/
    __tests__/
      BashTool.test.ts          # Integration tests for call() + error paths
  FileEditTool/
    __tests__/
      FileEditTool.test.ts      # Atomic write + corruption prevention tests
  GrepTool/
    __tests__/
      GrepTool.test.ts          # Binary skip, large results, timeout tests
  AgentTool/
    __tests__/
      AgentTool.test.ts         # ToolUseContext propagation tests
```

### Pattern 1: ToolUseContext Test Factory
**What:** A shared helper that creates a minimal valid `ToolUseContext` for testing
**When to use:** Every tool test needs a ToolUseContext -- centralizing it avoids duplication
**Example:**
```typescript
// Source: derived from src/Tool.ts ToolUseContext type (verified in codebase)
import { describe, test, expect } from 'bun:test'
import type { ToolUseContext } from 'src/Tool.js'
import type { AppState } from 'src/state/AppState.js'
import { getEmptyToolPermissionContext } from 'src/Tool.js'
import { createFileStateCacheWithSizeLimit } from 'src/utils/fileStateCache.js'

function createTestToolUseContext(overrides?: Partial<ToolUseContext>): ToolUseContext {
  const abortController = new AbortController()
  const messages: any[] = []
  const appState = {
    toolPermissionContext: getEmptyToolPermissionContext(),
    // ... minimal required fields
  } as AppState

  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'claude-sonnet-4-5-20250514',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: [], allowedAgentTypes: undefined },
    },
    abortController,
    readFileState: createFileStateCacheWithSizeLimit(100),
    getAppState: () => appState,
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages,
    ...overrides,
  } as ToolUseContext
}
```

### Pattern 2: Temp Directory Isolation
**What:** Each test creates an isolated temp directory, writes fixtures, runs the tool, cleans up
**When to use:** FileEditTool and GrepTool tests that need real files
**Example:**
```typescript
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

let testDir: string
beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'ccb-test-'))
})
afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})
```

### Pattern 3: ShellError Assertion
**What:** Verify that BashTool throws ShellError with correct exit code on command failure
**When to use:** BashTool error path tests
**Example:**
```typescript
import { ShellError } from 'src/utils/errors.js'

test('non-zero exit code throws ShellError with code', async () => {
  try {
    await BashTool.call(
      { command: 'exit 42' },
      createTestToolUseContext(),
      mockCanUseTool,
      mockParentMessage,
    )
    expect.unreachable('should have thrown')
  } catch (e) {
    expect(e).toBeInstanceOf(ShellError)
    expect((e as ShellError).code).toBe(42)
  }
})
```

### Anti-Patterns to Avoid
- **Mocking child_process for BashTool**: The whole point is testing that real shell execution reports errors correctly. Mock the ToolUseContext, not the execution.
- **Testing decompiled UI rendering code**: Focus on `call()` method behavior, not `renderToolUseMessage` or other UI methods.
- **Testing feature-flagged code paths**: `feature()` is always `false`. Don't test branches behind feature gates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Temp file management | Custom temp dir logic | `mkdtemp` from `fs/promises` | OS-provided, race-free, auto-unique |
| Atomic file writes | Custom write-then-rename | Already implemented in `writeFileSyncAndFlush_DEPRECATED` | The function under test already does this correctly |
| Shell execution | Custom exec wrapper | `exec` from `src/utils/Shell.js` (already used by BashTool) | Testing the actual code path matters |
| ToolUseContext creation | Inline object literal per test | Shared test factory (Pattern 1 above) | ToolUseContext has ~30 fields; duplication leads to drift |

**Key insight:** The tools themselves contain most of the complexity. Tests should exercise them directly, not reimplement their logic.

## Common Pitfalls

### Pitfall 1: Import Graph Depth
**What goes wrong:** Importing BashTool.tsx pulls in 50+ transitive dependencies (analytics, LSP, MCP, etc.), some of which fail at import time in test context.
**Why it happens:** Decompiled code has tight coupling; module-level side effects (e.g., `isBackgroundTasksDisabled` reads `process.env` at import time).
**How to avoid:** Set required env vars before import. If a transitive import fails, create a minimal mock module. Use `bun test --preload` for setup if needed.
**Warning signs:** `Cannot find module` or `ReferenceError` at test startup, before any test runs.

### Pitfall 2: CWD Sensitivity
**What goes wrong:** Tests that call `getCwd()` get the repo root, not the test temp directory. Tool validation may reject paths outside CWD.
**Why it happens:** `getCwd()` returns the process CWD or a cached value from bootstrap state.
**How to avoid:** Use `runWithCwdOverride()` from `src/utils/cwd.js` to scope tool calls to the test directory, or ensure test file paths are under the actual CWD.
**Warning signs:** "File has not been read yet" or "Path does not exist" errors when the file clearly exists.

### Pitfall 3: FileEditTool Requires Prior Read
**What goes wrong:** `validateInput` returns `{ result: false, errorCode: 6 }` because the file was not read first.
**Why it happens:** FileEditTool checks `readFileState.get(fullFilePath)` and rejects if the file hasn't been read (staleness guard).
**How to avoid:** Pre-populate `readFileState` in the test context before calling `call()`:
```typescript
context.readFileState.set(filePath, {
  content: originalContent,
  timestamp: Date.now(),
  offset: undefined,
  limit: undefined,
})
```
**Warning signs:** validateInput failing with errorCode 6.

### Pitfall 4: Ripgrep Binary Availability
**What goes wrong:** GrepTool tests fail because ripgrep (`rg`) is not found.
**Why it happens:** `getRipgrepConfig()` tries system rg, then bundled, then embedded. In test context, bundled/embedded paths may not exist.
**How to avoid:** Ensure `rg` is on PATH (it is on this machine -- macOS with Homebrew). Set `USE_BUILTIN_RIPGREP=false` env var to force system ripgrep.
**Warning signs:** "ripgrep exited with code null" or "spawn rg ENOENT".

### Pitfall 5: AgentTool Test Complexity
**What goes wrong:** Attempting to test the full `AgentTool.call()` path pulls in the entire query loop, API client, streaming, etc.
**Why it happens:** AgentTool delegates to `runAgent()` which calls `query()` which calls the Claude API.
**How to avoid:** For TOOL-04, test `createSubagentContext()` directly from `src/utils/forkedAgent.ts` rather than calling `AgentTool.call()`. This verifies ToolUseContext propagation without needing a live API.
**Warning signs:** Tests trying to make real API calls, or requiring API keys.

## Code Examples

### BashTool Error Path (verified from source)
```typescript
// Source: src/tools/BashTool/BashTool.tsx lines 696-718
// When interpretCommandResult.isError is true and exit code != 0:
//   1. "Exit code N" is appended to stdout accumulator
//   2. ShellError is thrown with (stdout='', stderr=outputWithSbFailures, code, interrupted)
// The caller (query.ts tool dispatch) catches this and converts to error tool result
```

### FileEditTool Atomic Write (verified from source)
```typescript
// Source: src/utils/file.ts lines 386-437
// writeFileSyncAndFlush_DEPRECATED does:
//   1. Create temp file: `${targetPath}.tmp.${process.pid}.${Date.now()}`
//   2. Write content with flush: true
//   3. Apply original permissions via chmodSync
//   4. Atomic rename: renameSync(tempPath, targetPath)
//   5. On failure: clean up temp file, fall back to direct write
```

### GrepTool Binary Handling (verified from source)
```typescript
// Source: ripgrep default behavior [ASSUMED based on ripgrep docs]
// Ripgrep skips binary files by default (--binary flag would enable them)
// GrepTool passes --hidden but NOT --binary, so binaries are skipped
// The tool adds --max-columns 500 to prevent base64/minified content bloat
```

### createSubagentContext Propagation (verified from source)
```typescript
// Source: src/utils/forkedAgent.ts lines 345-374
// createSubagentContext(parentContext, overrides?):
//   - Creates child AbortController linked to parent (unless shareAbortController)
//   - Wraps getAppState to set shouldAvoidPermissionPrompts for async agents
//   - Creates fresh fileStateCache (or clones parent's for fork agents)
//   - setAppState is no-op for async agents (rootSetAppState reaches root store)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct writeFileSync | Atomic temp+rename via writeFileSyncAndFlush_DEPRECATED | Already in codebase | File corruption prevention already implemented |
| Simple exit code check | commandSemantics.ts semantic interpretation | Already in codebase | grep exit=1 is not treated as error |
| Unbounded grep results | head_limit=250 default + pagination | Already in codebase | Prevents context bloat |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ripgrep skips binary files by default without --binary flag | Code Examples / TOOL-03 | Tests may need to add explicit binary detection assertions; low risk since rg docs confirm this |
| A2 | bun test supports beforeEach/afterEach for test isolation | Architecture Patterns | If not supported, use setup/teardown inside each test; very likely supported based on existing test patterns |
| A3 | createSubagentContext can be imported and tested independently without pulling entire query loop | Pitfall 5 | If import fails, may need to extract into a testable module; medium risk |

## Open Questions

1. **Mock depth for AgentTool**
   - What we know: `createSubagentContext()` is the key function for TOOL-04. It's in `forkedAgent.ts` which imports from many modules.
   - What's unclear: Whether importing `forkedAgent.ts` in a test triggers side effects that break.
   - Recommendation: Try direct import first. If it fails, create a focused test that manually constructs ToolUseContext objects and verifies the transformation logic.

2. **BashTool sandbox interaction**
   - What we know: BashTool uses `SandboxManager` which may affect test execution.
   - What's unclear: Whether sandbox is active in test mode.
   - Recommendation: Set `CLAUDE_CODE_DISABLE_SANDBOX=1` in test environment if sandbox interferes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun test (built-in, Bun 1.3.x) |
| Config file | none -- bun test works without config |
| Quick run command | `bun test src/tools/` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-01 | Non-zero exit -> ShellError with code | integration | `bun test src/tools/BashTool/__tests__/BashTool.test.ts -x` | Wave 0 |
| TOOL-02 | Atomic write prevents corruption | integration | `bun test src/tools/FileEditTool/__tests__/FileEditTool.test.ts -x` | Wave 0 |
| TOOL-03 | Binary skip + large result handling | integration | `bun test src/tools/GrepTool/__tests__/GrepTool.test.ts -x` | Wave 0 |
| TOOL-04 | Subagent context propagation | unit | `bun test src/tools/AgentTool/__tests__/AgentTool.test.ts -x` | Wave 0 |
| TOOL-05 | All four tools have tests | smoke | `bun test src/tools/` | Wave 0 |
| TEST-02 | Integration test suites exist | smoke | `bun test src/tools/ --reporter=summary` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test src/tools/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/tools/BashTool/__tests__/BashTool.test.ts` -- covers TOOL-01
- [ ] `src/tools/FileEditTool/__tests__/FileEditTool.test.ts` -- covers TOOL-02
- [ ] `src/tools/GrepTool/__tests__/GrepTool.test.ts` -- covers TOOL-03
- [ ] `src/tools/AgentTool/__tests__/AgentTool.test.ts` -- covers TOOL-04
- [ ] Shared test helper for ToolUseContext factory (location TBD by planner)
- [ ] All new test files added to `tsconfig.strict.json`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | yes (tool permissions) | Existing `checkPermissions()` on each tool; tests should NOT bypass |
| V5 Input Validation | yes | Each tool has `validateInput()` method; test error cases |
| V6 Cryptography | no | -- |

### Known Threat Patterns for Tool System

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via BashTool | Tampering | `parseForSecurity()` + sandbox; tests should verify non-zero exit propagation, not security parsing |
| Path traversal via FileEditTool | Tampering | `expandPath()` + permission checks; already handled |
| UNC path credential leak | Information Disclosure | Explicit UNC path check in validateInput (lines 179-181); already handled |

## Sources

### Primary (HIGH confidence)
- `src/tools/BashTool/BashTool.tsx` -- Full call() method, error handling, ShellError throw path
- `src/tools/FileEditTool/FileEditTool.ts` -- validateInput, call(), atomic write delegation
- `src/tools/GrepTool/GrepTool.ts` -- ripGrep() call, head_limit, output modes
- `src/tools/AgentTool/AgentTool.tsx` -- call() method, subagent routing
- `src/tools/AgentTool/runAgent.ts` -- runAgent generator, context setup
- `src/utils/forkedAgent.ts` -- createSubagentContext() implementation
- `src/utils/file.ts` -- writeFileSyncAndFlush_DEPRECATED atomic write
- `src/utils/ripgrep.ts` -- ripGrepRaw(), timeout, EAGAIN retry
- `src/utils/errors.ts` -- ShellError class definition
- `src/Tool.ts` -- ToolUseContext type, buildTool(), Tool interface
- `src/tools/BashTool/commandSemantics.ts` -- Exit code semantic interpretation

### Secondary (MEDIUM confidence)
- Existing test patterns from `src/types/__tests__/` and `src/services/api/__tests__/`

### Tertiary (LOW confidence)
- Ripgrep binary file skipping behavior [ASSUMED from general ripgrep knowledge]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all built-in
- Architecture: HIGH -- following established Phase 1 test patterns
- Pitfalls: HIGH -- identified from direct source code reading
- Tool behavior: HIGH -- verified from actual source code

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, no external dependencies changing)
