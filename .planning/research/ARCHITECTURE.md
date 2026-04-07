# Architecture Patterns

**Domain:** Terminal-based AI CLI tool (decompiled TypeScript, Bun runtime)
**Researched:** 2026-04-06
**Confidence:** HIGH (sourced from direct codebase inspection across 12 files)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     cli.tsx (Entrypoint)                     │
│  Injects: feature() polyfill, MACRO globals, BUILD_TARGET    │
└────────────────────────┬────────────────────────────────────┘
                         │ import
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                       main.tsx (CLI Layer)                    │
│  Commander.js arg parsing, auth, MCP prefetch, launchRepl()  │
└──────┬──────────────────────────────┬───────────────────────┘
       │ interactive                  │ pipe / SDK mode
       ▼                              ▼
┌──────────────┐              ┌───────────────────┐
│  REPL.tsx    │              │  QueryEngine.ts    │
│  (Ink/React  │              │  (headless loop)   │
│  UI layer)   │              └────────┬──────────┘
└──────┬───────┘                       │
       │ invokes                       │ invokes
       ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        query.ts (Turn Loop)                  │
│  Normalizes messages → calls API → dispatches tool_use       │
│  blocks → collects tool_results → loops until stop_reason    │
└──────┬──────────────────────────┬──────────────────────────┘
       │                          │
       ▼                          ▼
┌──────────────────┐    ┌──────────────────────────────────┐
│ services/api/    │    │  Tool System                      │
│ claude.ts        │    │  tools.ts (registry)              │
│ (Anthropic SDK   │    │  Tool.ts  (interface + buildTool) │
│  streaming)      │    │  tools/<Name>/  (implementations) │
└──────────────────┘    └────────────┬─────────────────────┘
                                     │ each tool calls
                                     ▼
                        ┌──────────────────────────────────┐
                        │  Permission System               │
                        │  useCanUseTool.tsx               │
                        │  types/permissions.ts            │
                        │  utils/permissions/              │
                        └──────────────────────────────────┘

STATE (shared across all layers)
┌─────────────────────────────────────────────────────────────┐
│  bootstrap/state.ts   — module-level singletons (sessionId,  │
│                          CWD, token counts, hook state)       │
│  state/store.ts       — minimal pub-sub store (no Zustand)   │
│  state/AppStateStore.ts — AppState shape definition          │
│  state/AppState.tsx   — React context provider for UI layer  │
└─────────────────────────────────────────────────────────────┘

CONTEXT ASSEMBLY (feeds system prompt)
┌─────────────────────────────────────────────────────────────┐
│  context.ts  — git status, date, CLAUDE.md contents          │
│  utils/claudemd.ts — discovers CLAUDE.md hierarchy           │
│  utils/queryContext.ts — fetchSystemPromptParts              │
└─────────────────────────────────────────────────────────────┘

INTEGRATIONS
┌─────────────────────────────────────────────────────────────┐
│  services/mcp/  — MCP server connections (stdio/sse/http)    │
│  services/compact/ — auto-compaction, reactive compact       │
│  services/analytics/ — stubbed (GrowthBook, Sentry empty)   │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | File(s) | Responsibility | Communicates With |
|-----------|---------|---------------|-------------------|
| Entrypoint | `src/entrypoints/cli.tsx` | Injects `feature()` polyfill and build-time macros before any imports load | main.tsx (via import) |
| CLI Layer | `src/main.tsx` | Commander.js arg parsing, auth check, MCP prefetch, selects REPL vs headless mode | REPL.tsx, QueryEngine.ts, context.ts |
| REPL Screen | `src/screens/REPL.tsx` | Interactive terminal UI (Ink/React), handles user input, keyboard shortcuts, permission prompts, message rendering | QueryEngine.ts (via hooks), AppState, useCanUseTool |
| QueryEngine | `src/QueryEngine.ts` | Headless conversation orchestrator: wraps query(), manages compaction, file history snapshots, attribution, turn bookkeeping | query.ts, AppState, MCP clients |
| Turn Loop | `src/query.ts` | Core agentic loop: normalize messages → stream API call → dispatch tool_use blocks → collect results → decide to continue or stop | claude.ts (API), Tool system, compact service |
| API Client | `src/services/api/claude.ts` | Builds BetaMessageStreamParams, calls Anthropic SDK streaming endpoint, handles multi-provider routing (Anthropic/Bedrock/Vertex/Azure) | query.ts (caller), SDK |
| Tool Interface | `src/Tool.ts` | `Tool<Input,Output,P>` type definition, `buildTool()` factory with safe defaults, `findToolByName()`, `ToolUseContext` shape | All tools, query.ts |
| Tool Registry | `src/tools.ts` | Assembles `Tools` array; conditional loading via `feature()` flags and `USER_TYPE` env var | All tool implementations |
| Tool Implementations | `src/tools/<Name>/` | Each tool: Zod inputSchema, `call()`, `checkPermissions()`, `renderToolResultMessage()`, etc. | Tool.ts interface, ToolUseContext |
| Permission System | `src/hooks/useCanUseTool.tsx`, `src/types/permissions.ts`, `src/utils/permissions/` | Checks rules (allow/deny/ask), dispatches to interactive handler / coordinator / swarm-worker handler | Tool system (called per tool_use), REPL (for UI queue) |
| App State | `src/state/AppStateStore.ts`, `src/state/store.ts`, `src/state/AppState.tsx` | AppState shape (messages, tools, permission context, MCP connections, tasks, speculation), pub-sub store, React context provider | REPL (reads/writes), QueryEngine (reads/writes), tools (reads) |
| Bootstrap Singletons | `src/bootstrap/state.ts` | Module-level global singletons: sessionId, CWD, token counts, turn hook duration, hook registrations. Intentionally minimal. | All layers (imported directly) |
| Context Assembly | `src/context.ts`, `src/utils/claudemd.ts` | Builds system/user context: git status, date, CLAUDE.md file hierarchy, memory files | query.ts / QueryEngine.ts (via fetchSystemPromptParts) |
| MCP Integration | `src/services/mcp/types.ts`, `src/services/mcp/` | MCP server config schemas (stdio/sse/http/ws/sdk), connection lifecycle, tool + resource injection | tools.ts (MCP tools added to registry), query.ts |
| Compaction | `src/services/compact/` | Auto-compaction when context window fills, post-compact message rebuild, reactive compact (feature-flagged) | query.ts (called when token warning triggers) |
| Feature Flags | `src/entrypoints/cli.tsx` (polyfill) | Runtime evaluation of `feature('FLAG')` via env vars (`CLAUDE_FEATURE_X`) or `~/.claude/feature-flags.json`; build-time it's `bun:bundle` | All modules (used via direct import) |

---

## Architectural Patterns

### Pattern 1: Layered Boot with Side-Effect Ordering

`main.tsx` deliberately fires three side effects at the top before any other imports:
1. `profileCheckpoint('main_tsx_entry')` — startup timing
2. `startMdmRawRead()` — MDM policy reads (parallel subprocess)
3. `startKeychainPrefetch()` — macOS keychain reads (parallel)

**Why it matters for recovery:** Any module reorder or import shuffle in `main.tsx` can break startup timing or cause keychain reads to serialize (65ms regression). This ordering must be preserved during type recovery work.

### Pattern 2: ToolUseContext as Dependency Injection Container

`ToolUseContext` (defined in `Tool.ts`) is the single object passed to every `tool.call()` invocation. It carries:
- `options` — all session configuration (commands, model, tools, MCP clients)
- `abortController` — cancellation signal
- `readFileState` — LRU file state cache
- `getAppState()` / `setAppState()` — state access
- `setToolJSX` — UI injection callback (REPL only, undefined in headless)
- `messages` — current conversation history
- `updateFileHistoryState` / `updateAttributionState` — specialized updaters

Tools are stateless; all session state travels through this context object. This is the correct pattern to preserve — **do not break tools into stateful classes**.

### Pattern 3: Dual-Mode Architecture (REPL vs Headless)

The system runs in two modes with identical query logic but different wiring:

**REPL mode:** `REPL.tsx` renders Ink UI → calls QueryEngine → calls query() → streams events back to UI via `setToolJSX`, `appendSystemMessage`, state updates.

**Headless/SDK mode:** `QueryEngine.ts` runs without React, wires `setAppState` to a no-op or stores to a plain object, streams `SDKMessage` events via structured output.

The query loop (`query.ts`) is mode-agnostic. It receives callbacks and fires them without knowing which mode it's in. **This separation must be maintained** — never add UI-aware code to query.ts.

### Pattern 4: Feature Flag Dead Code Elimination

All Anthropic-internal features are guarded by `feature('FLAG_NAME')`. In dev mode, the `cli.tsx` polyfill evaluates them at runtime against env vars and a config file. At build time, Bun's bundler eliminates dead branches.

Pattern in use:
```typescript
// Conditional module require (not import) to allow DCE
const reactiveCompact = feature('REACTIVE_COMPACT')
  ? require('./services/compact/reactiveCompact.js')
  : null
```

**Recovery implication:** When enabling a feature for testing, set `CLAUDE_FEATURE_X=true` or add to `~/.claude/feature-flags.json`. Never hard-code `true` — it breaks the DCE contract.

### Pattern 5: Tool Interface with buildTool() Factory

Every tool goes through `buildTool(def)` which spreads safe defaults:
- `isEnabled` → `true`
- `isConcurrencySafe` → `false` (fail-closed)
- `isReadOnly` → `false` (fail-closed)
- `checkPermissions` → `allow` (defers to general permission system)

Tools define a Zod `inputSchema`, a `call()` method, React render methods (`renderToolResultMessage`, `renderToolUseMessage`), and metadata methods (`description`, `userFacingName`, `isConcurrencySafe`, etc.).

**Recovery implication:** When adding types to tools, use `buildTool()` rather than raw object literals. The factory preserves fail-closed security defaults.

### Pattern 6: Permission Decision Pipeline

```
tool.call() invoked by query.ts
  └─> canUseTool(tool, input, ctx, ...) [useCanUseTool.tsx]
        ├─ hasPermissionsToUseTool()  [rule matching: allow/deny/ask]
        │   ├─ returns allow → proceed
        │   ├─ returns deny  → reject, return error to model
        │   └─ returns ask   → route to handler:
        │       ├─ interactiveHandler  (REPL: push to confirm queue, show UI)
        │       ├─ coordinatorHandler  (swarm leader: bridge permission)
        │       └─ swarmWorkerHandler  (worker: send via mailbox)
        └─> PermissionDecision returned to query.ts
```

Permission modes: `default`, `acceptEdits`, `bypassPermissions`, `dontAsk`, `plan`, `auto` (feature-flagged), `bubble` (internal).

---

## Data Flow

### User Input → API Request → Tool Execution → Response

```
User types message
  │
  ▼
REPL.tsx: processUserInput() → creates UserMessage
  │
  ▼
QueryEngine.runQuery():
  - fileHistoryMakeSnapshot()
  - fetchSystemPromptParts() → context.ts (git status, CLAUDE.md, memory)
  - buildEffectiveSystemPrompt()
  │
  ▼
query() turn loop:
  1. normalizeMessagesForAPI()     — strip UI-only messages
  2. claude.ts streamRequest()     — Anthropic SDK streaming call
  3. Stream events arrive:
     - text_delta → update AssistantMessage in AppState
     - tool_use   → collect ToolUseBlock
  4. stop_reason = "tool_use":
     - For each ToolUseBlock in parallel (if isConcurrencySafe) or serial:
       a. canUseTool()             — permission check
       b. tool.validateInput()     — schema validation
       c. tool.call()              — execution (can spawn subagents)
       d. tool.mapToolResultToToolResultBlockParam() — serialize result
  5. Append tool_result UserMessage to messages
  6. Loop back to step 1
  7. stop_reason = "end_turn" → return messages to QueryEngine
  │
  ▼
QueryEngine: recordTranscript(), flushSessionStorage(), update attribution
  │
  ▼
REPL.tsx: re-render updated messages via AppState
```

### Type Flow Through the Tool System

```
User intent (string)
  → UserMessage (types/message.ts)
  → normalizeMessagesForAPI() → BetaMessageParam[] (SDK type)
  → API streams BetaRawMessageStreamEvent
  → normalizeContentFromAPI() → MessageContent (internal type)
  → AssistantMessage (types/message.ts)
  → tool_use block → findToolByName() → Tool.call(z.infer<Input>)
  → ToolResult<Output>
  → mapToolResultToToolResultBlockParam() → ToolResultBlockParam (SDK type)
  → next API call as part of messages
```

The boundary between internal types (`types/message.ts`) and SDK types (`@anthropic-ai/sdk`) is the primary site of decompilation type errors. `unknown`/`never`/`{}` errors concentrate here.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding State to query.ts
**What:** Storing conversation or tool state as module-level variables in query.ts.
**Why bad:** query.ts is called recursively by subagents (AgentTool). Module-level state leaks across concurrent agent runs.
**Instead:** All state travels through `ToolUseContext` or `AppState`. Use `bootstrap/state.ts` only for true session-level singletons.

### Anti-Pattern 2: Mass tsc Error Fixing
**What:** Running a bulk type fix pass across all 1341 errors.
**Why bad:** Decompiled code has structural `unknown`/`never` types at runtime-valid boundaries. Naive fixes introduce incorrect type assertions (`as SomeType`) that hide real bugs or change runtime narrowing behavior.
**Instead:** Fix types layer by layer, starting from pure leaf modules (no React, no SDK imports). Verify each layer compiles and tests pass before ascending.

### Anti-Pattern 3: Importing React in Tool Logic
**What:** Importing React hooks or JSX in `tool.call()` or `inputSchema` definitions.
**Why bad:** Tools are used in both REPL (React) and headless (no React) modes. React imports in tool logic break headless execution.
**Instead:** Render methods (`renderToolResultMessage`, `renderToolUseMessage`) are the correct React boundary. `call()` must be pure of React.

### Anti-Pattern 4: Circular Imports Through AppState
**What:** Tool files importing from `state/AppState.tsx` or `state/AppStateStore.ts`.
**Why bad:** AppState imports Tool types (for the `tools` field), creating a cycle. The codebase already has `types/permissions.ts` extracted specifically to break this cycle (see the comment at line 1).
**Instead:** Tools access state only through `ToolUseContext.getAppState()`. Type-only imports from `types/` leaf files are safe.

### Anti-Pattern 5: Hardcoding feature() to true
**What:** Replacing `feature('FLAG')` with `true` during debugging.
**Why bad:** Breaks the DCE contract. At build time Bun eliminates dead branches — hardcoded `true` includes all Anthropic-internal code paths that depend on unavailable infrastructure (Computer Use, Kairos, etc.) and will crash.
**Instead:** Use `CLAUDE_FEATURE_FLAG=true` env var or the config file. The polyfill handles it cleanly.

---

## Suggested Build/Recovery Order

This is the critical section for roadmap phase structure.

### Layer 0 (Foundation) — Pure utilities, no external deps
Files: `src/utils/uuid.ts`, `src/utils/sanitization.ts`, `src/keybindings/`
Why first: Already tested (58 tests). These have clean types. Establish the test pipeline here.
Type recovery: Zero decompilation errors here; focus on building test patterns.

### Layer 1 (Type Definitions) — Message and permission types
Files: `src/types/message.ts`, `src/types/permissions.ts`, `src/types/tools.ts`, `src/types/ids.ts`
Why second: Everything imports these. Correct types here eliminate cascading errors above.
Type recovery: High-value — fixing `Message` union types eliminates ~30% of downstream errors.
Risk: `types/message.ts` is the most imported file; changes propagate widely.

### Layer 2 (State Layer) — Store and bootstrap
Files: `src/state/store.ts` (clean — 34 lines, simple pub-sub), `src/state/AppStateStore.ts`, `src/bootstrap/state.ts`
Why third: REPL, QueryEngine, and tools all depend on AppState shape. Stable state types unblock all higher layers.
Type recovery: `AppStateStore.ts` has moderate complexity but mostly concrete types.

### Layer 3 (Tool Interface) — Tool.ts and core tools
Files: `src/Tool.ts`, then `src/tools/BashTool/`, `src/tools/FileEditTool/`, `src/tools/GrepTool/`, `src/tools/FileReadTool/`
Why fourth: Core tools are the primary value. `Tool.ts` is already well-typed (inspected — clean interface). Core tool `call()` methods need type hardening for the Input/Output generic parameters.
Type recovery: Zod schemas are typically intact post-decompilation. Focus on `call()` return types.

### Layer 4 (API Client) — claude.ts and provider routing
Files: `src/services/api/claude.ts`, `src/utils/model/providers.ts`
Why fifth: The SDK boundary is the densest source of `unknown` errors. After Layer 1 types are correct, `normalizeContentFromAPI()` and event handler types become fixable.
Type recovery: HIGH effort, HIGH payoff. SDK types are authoritative — use them as the ground truth.

### Layer 5 (Query Loop) — query.ts
Files: `src/query.ts`
Why sixth: Depends on correct types from all lower layers. The turn loop logic itself is structurally sound; the errors are in message/event type handling.
Type recovery: Fix after Layer 4. Many errors cascade from API event types.

### Layer 6 (QueryEngine) — QueryEngine.ts
Files: `src/QueryEngine.ts`
Why seventh: Orchestrator layer. Depends on query.ts, AppState, and MCP types.

### Layer 7 (Permission System)
Files: `src/hooks/useCanUseTool.tsx`, `src/utils/permissions/`
Why seventh: Permission logic is functionally correct (the decompiled output runs). Type recovery here is about safety, not correctness.

### Layer 8 (REPL/UI)
Files: `src/screens/REPL.tsx`, `src/components/`
Why last: REPL.tsx imports 80+ modules. React Compiler decompilation artifacts (`_c()` calls) make this the hardest to clean. Do not start here.
Strategy: Clean `_c()` boilerplate via automated transform after lower layers are stable.

---

## Scalability Considerations (Relevant to Recovery Scope)

| Concern | Current State | Recovery Target |
|---------|--------------|-----------------|
| tsc errors | ~1341, from decompilation | ~200 or fewer (residual in UI layer) |
| Test coverage | 58 tests, layers 0 only | Cover layers 1-5 (types, state, tool execution, query) |
| React Compiler boilerplate | `_c(N)` in all .tsx files | Automated codemod to remove after stable |
| MCP integration | Types present, OAuth simplified | Restore stdio/sse transports, validate connection lifecycle |
| Subagent concurrency | AgentTool calls query() recursively | ToolUseContext isolation must hold; test with nested tool calls |

---

## Sources

- Direct inspection of: `src/entrypoints/cli.tsx`, `src/main.tsx`, `src/query.ts`, `src/QueryEngine.ts`, `src/Tool.ts`, `src/tools.ts`, `src/screens/REPL.tsx` (imports), `src/state/AppStateStore.ts`, `src/state/store.ts`, `src/state/AppState.tsx`, `src/bootstrap/state.ts`, `src/context.ts`, `src/services/api/claude.ts`, `src/services/mcp/types.ts`, `src/types/permissions.ts`, `src/hooks/useCanUseTool.tsx`
- Confidence: HIGH — all findings from live codebase, not training data
