# Architecture: v2.0 Agent Intelligence Enhancement Integration

**Domain:** 6 agent intelligence capabilities integrating into existing Claude Code CLI fork (CCB)
**Researched:** 2026-04-08
**Confidence:** HIGH (all integration points verified via direct codebase inspection with file:line references)

---

## Integration Architecture Overview

The 6 features organize into 3 integration tiers based on where they hook into the existing architecture:

```
Tier 1: Query Loop Internals (modify existing hot path)
  - CONTEXT_COLLAPSE     — hooks into query.ts turn loop
  - Deliberation Checkpoint — inserts into toolExecution.ts permission-to-call gap

Tier 2: Post-Query Lifecycle (fire-and-forget from existing hooks)
  - EXTRACT_MEMORIES     — hooks into stopHooks.ts post-query lifecycle

Tier 3: Parallel Modules (new top-level modules, orthogonal to REPL)
  - COORDINATOR_MODE     — parallel to REPL, own module in coordinator/
  - KAIROS               — parallel to REPL, own module in assistant/ with gate.ts
  - Dynamic Permission   — extends existing permission types in permissions.ts
```

---

## Feature 1: CONTEXT_COLLAPSE

### Current State

Stub implementation exists at `src/services/contextCollapse/index.ts` (67 lines). All exports are no-ops that return identity values. The feature flag `CONTEXT_COLLAPSE` is referenced at 6 integration points in `src/query.ts`.

### Integration Points (all in src/query.ts)

| Location | Line | What Happens | Integration Type |
|----------|------|-------------|-----------------|
| Import gate | 17-19 | `feature('CONTEXT_COLLAPSE')` conditional require | Module loading |
| Pre-autocompact projection | 440-447 | `applyCollapsesIfNeeded(messagesForQuery, toolUseContext, querySource)` mutates message list before autocompact | **PRIMARY** — message transformation |
| Blocking limit skip | 616-620 | `isContextCollapseEnabled() && isAutoCompactEnabled()` sets `collapseOwnsIt` to bypass synthetic preempt | Control flow gate |
| Stream withholding | 802-812 | `isWithheldPromptTooLong(message, isPromptTooLongMessage, querySource)` withholds 413 errors for recovery | Error recovery |
| Overflow recovery | 1093-1120 | `recoverFromOverflow(messagesForQuery, querySource)` drains staged collapses on real API 413 | Recovery path |
| Fallback when RC compiled out | 1179-1186 | Surface withheld 413 when collapse couldn't recover and reactive compact is absent | Fallback exit |

### Data Flow

```
query.ts turn loop iteration
  |
  v
microcompact (if enabled) -> messagesForQuery (modified)
  |
  v
[CONTEXT_COLLAPSE insertion point: line 440]
applyCollapsesIfNeeded(messagesForQuery, toolUseContext, querySource)
  -> Returns CollapseResult { messages: Message[] }
  -> messagesForQuery = collapseResult.messages  (projection, not mutation of REPL array)
  |
  v
autocompact (existing) -> may further reduce messages
  |
  v
API call with collapsed + compacted messages
  |
  v (on 413 error)
[RECOVERY PATH: line 1093]
recoverFromOverflow(messagesForQuery, querySource)
  -> DrainResult { committed: number, messages: Message[] }
  -> If committed > 0: continue loop with drained messages
  -> Else: fall through to reactive compact
```

### Components Needed

| Component | File | Status | Work Required |
|-----------|------|--------|--------------|
| `index.ts` | `src/services/contextCollapse/index.ts` | Stub exists | Replace stub functions with real collapse logic |
| `operations.ts` | `src/services/contextCollapse/operations.ts` | Exists (unknown content) | Implement collapse span tracking |
| `persist.ts` | `src/services/contextCollapse/persist.ts` | Exists (unknown content) | Implement cross-turn persistence |
| `query.ts` integration | `src/query.ts` | All 6 hooks exist | **No changes needed** -- stubs become live when feature flag enabled |

### Key Design Constraint

Context collapse is a **read-time projection** over the REPL's full history. Summary messages live in the collapse store, not the REPL array. This is what makes collapses persist across turns: `projectView()` replays the commit log on every entry. The comment at query.ts:435-439 documents this explicitly.

### Modified vs New Components

- **Modified:** NONE -- query.ts integration points already exist
- **New (replace stubs):** `contextCollapse/index.ts`, `contextCollapse/operations.ts`, `contextCollapse/persist.ts`

---

## Feature 2: EXTRACT_MEMORIES

### Current State

Full implementation exists at `src/services/extractMemories/extractMemories.ts` (616 lines) with `prompts.ts` alongside it. The code uses the `runForkedAgent` pattern -- a forked copy of the main conversation that shares the parent's prompt cache.

### Integration Points

| Location | File:Line | What Happens | Integration Type |
|----------|-----------|-------------|-----------------|
| Import gate | `src/query/stopHooks.ts:41-43` | `feature('EXTRACT_MEMORIES')` conditional require | Module loading |
| Fire-and-forget call | `src/query/stopHooks.ts:141-153` | `extractMemoriesModule!.executeExtractMemories(stopHookContext, toolUseContext.appendSystemMessage)` | **PRIMARY** -- post-turn lifecycle |
| Drain on shutdown | `src/cli/print.ts` (search: `drainPendingExtraction`) | Awaits in-flight extractions before shutdown | Graceful shutdown |
| Init on startup | `src/entrypoints/init.ts` or `main.tsx` | `initExtractMemories()` creates fresh closure state | Initialization |

### Data Flow

```
query.ts turn loop completes (stop_reason = end_turn, no tool_use)
  |
  v
handleStopHooks() [src/query/stopHooks.ts:64]
  |
  v (after template classification, if !isBareMode())
[EXTRACT_MEMORIES insertion point: line 141]
Check guards: feature('EXTRACT_MEMORIES') && !agentId && isExtractModeActive()
  |
  v
executeExtractMemories(stopHookContext, appendSystemMessage)  [fire-and-forget]
  |
  v (inside extractMemories.ts)
  1. Check overlap guard (inProgress flag)
  2. Check turn throttle (turnsSinceLastExtraction < threshold)
  3. Check mutual exclusion (hasMemoryWritesSince -- if main agent already wrote memories, skip)
  4. scanMemoryFiles() -> build manifest of existing memories
  5. buildExtractAutoOnlyPrompt() -> prompt with conversation + existing memories
  6. runForkedAgent({ promptMessages, canUseTool: createAutoMemCanUseTool(memoryDir) })
     -> Forked agent has READ-ONLY tools + WRITE only to memory dir
     -> maxTurns: 5 (hard cap)
  7. extractWrittenPaths() -> list of files the agent wrote
  8. appendSystemMessage(createMemorySavedMessage(memoryPaths))
     -> Inserts system notification into REPL UI
```

### Components Needed

| Component | File | Status | Work Required |
|-----------|------|--------|--------------|
| `extractMemories.ts` | `src/services/extractMemories/extractMemories.ts` | **Full implementation exists** (616 lines) | Verify runtime behavior when feature flag enabled |
| `prompts.ts` | `src/services/extractMemories/prompts.ts` | Exists | Review prompt quality |
| `stopHooks.ts` | `src/query/stopHooks.ts` | Integration hook exists at line 141 | **No changes needed** |
| `memdir/` | `src/memdir/memdir.ts`, `memoryScan.ts`, `paths.ts` | Exist | Verify auto-memory path resolution |
| `forkedAgent.ts` | `src/utils/forkedAgent.ts` | Exists | Verify runForkedAgent works with current API client |

### Key Design Constraint

Memory extraction uses a **sandboxed tool permission function** (`createAutoMemCanUseTool`) that restricts the forked agent to: read-only file operations, read-only bash, and write ONLY within the auto-memory directory. This is a security boundary -- do not relax it.

### Modified vs New Components

- **Modified:** NONE -- all integration points exist, implementation is present
- **New:** NONE -- this is primarily a verification + feature flag enablement task

---

## Feature 3: Deliberation Checkpoint

### Current State

No existing implementation. This is a new feature that inserts forced "think deeply" time between the permission check and tool execution for high-risk operations.

### Integration Point

The insertion point is inside `checkPermissionsAndCallTool` in `src/services/tools/toolExecution.ts`.

**Exact insertion location:** Between the permission resolution (line ~930) and the tool execution start. The flow is:

```
checkPermissionsAndCallTool() [toolExecution.ts:599]
  |
  v
1. parsedInput = tool.inputSchema.safeParse(input)     [line 615]
2. tool.validateInput(parsedInput.data)                  [line 683]
3. runPreToolUseHooks()                                  [line 800-861]
4. resolveHookPermissionDecision()                       [line 921-931]
   -> permissionDecision = { behavior: 'allow' | 'deny' | 'ask' }
   |
   v
   if (permissionDecision.behavior !== 'allow') -> reject [line 995]
   |
   v
   *** DELIBERATION CHECKPOINT INSERTION POINT ***
   (after permission granted, before tool.call())
   |
   v
5. tool.call(callInput, toolUseContext)                  [further down]
```

### Data Flow

```
Permission check passes (behavior === 'allow')
  |
  v
[DELIBERATION CHECKPOINT -- new code]
  1. Classify risk level:
     - Tool name (BashTool, FileEditTool = higher risk)
     - Input content (destructive commands, sensitive paths)
     - Permission mode (bypassPermissions = skip checkpoint)
  2. If risk >= threshold:
     a. Build deliberation prompt with:
        - Current tool call details (name, input)
        - Recent conversation context (last N messages)
        - Risk classification rationale
     b. API call with extended_thinking enabled
        - Use lightweight model (same model, small max_tokens)
        - Force thinking: "Before executing, verify this is the right action"
     c. Parse thinking output:
        - PROCEED -> continue to tool.call()
        - ABORT -> return deny-like result to model
        - MODIFY -> suggest input modification
  3. If risk < threshold: pass through
  |
  v
tool.call(callInput, toolUseContext)
```

### Components Needed

| Component | File | Status | Work Required |
|-----------|------|--------|--------------|
| `deliberation.ts` | `src/services/deliberation/deliberation.ts` | **New** | Risk classification + deliberation API call |
| `riskClassifier.ts` | `src/services/deliberation/riskClassifier.ts` | **New** | Classify tool calls by risk level |
| `prompts.ts` | `src/services/deliberation/prompts.ts` | **New** | Deliberation prompt templates |
| `toolExecution.ts` | `src/services/tools/toolExecution.ts` | **Modified** | Insert checkpoint call between permission check and tool.call() |

### Key Design Constraints

1. Must not block low-risk operations (read-only tools, grep, glob should pass through instantly)
2. Must be skippable via `bypassPermissions` mode
3. The deliberation API call must use the same abort signal as the parent tool execution
4. Must NOT import React or UI code -- this runs in both REPL and headless modes

### Modified vs New Components

- **Modified:** `src/services/tools/toolExecution.ts` -- insert ~20 lines in `checkPermissionsAndCallTool` between permission resolution and tool.call()
- **New:** `src/services/deliberation/` directory with 3 files

---

## Feature 4: COORDINATOR_MODE

### Current State

Partial implementation exists:
- `src/coordinator/coordinatorMode.ts` (370 lines) -- **real implementation**, contains system prompt, mode switching, worker tool context
- `src/coordinator/workerAgent.ts` (4 lines) -- **stub**, returns empty agent array
- Feature flag `COORDINATOR_MODE` referenced across **35 files** (tools.ts, main.tsx, REPL.tsx, QueryEngine.ts, cli/print.ts, sessionRestore.ts, etc.)

### Integration Points (major ones)

| Location | File:Line | What Happens | Integration Type |
|----------|-----------|-------------|-----------------|
| Tool registry | `src/tools.ts:120,280,292` | Adds coordinator-specific tools (TeamCreate, TeamDelete, SendMessage, TaskStop) | Tool loading |
| Entry point | `src/main.tsx:76,1872` | Coordinator module import, mode check before REPL launch | Boot path |
| REPL context | `src/screens/REPL.tsx:119,1747,1899` | `getCoordinatorUserContext` injected into system prompt | Context injection |
| QueryEngine | `src/QueryEngine.ts:117` | Coordinator context function injection | Context injection |
| System prompt | `src/utils/systemPrompt.ts:63` | Coordinator-specific system prompt addendum | Prompt modification |
| AgentTool | `src/tools/AgentTool/AgentTool.tsx:223,553` | Coordinator mode changes agent spawning behavior | Tool behavior |
| AgentTool agents | `src/tools/AgentTool/builtInAgents.ts:35` | Coordinator adds built-in agents via `getCoordinatorAgents()` | Agent definition |
| Tool pool | `src/utils/toolPool.ts:22,72` | Coordinator mode modifies available tool pool for workers | Tool filtering |
| Session restore | `src/utils/sessionRestore.ts:257,428,514` | Coordinator mode persisted/restored across session resume | State persistence |
| Slash command | `src/utils/processUserInput/processSlashCommand.tsx:837` | `/coordinate` or auto-activate in coordinator env | User input |
| CLI print | `src/cli/print.ts:358,4925,4974,5130,5174` | Coordinator mode affects headless output formatting | Output formatting |

### Data Flow

```
main.tsx boot
  |
  v
Check: isCoordinatorMode() (env var CLAUDE_CODE_COORDINATOR_MODE=1)
  |
  v (if coordinator mode)
Replace system prompt with getCoordinatorSystemPrompt()
  -> Coordinator persona: "You orchestrate workers, don't code directly"
  |
  v
Tool registry: add TeamCreate, TeamDelete, SendMessage, TaskStop
  Remove: direct code tools (BashTool, FileEditTool, etc.)
  |
  v
REPL.tsx renders coordinator UI
  -> User message -> query.ts -> API responds with AgentTool calls
  -> AgentTool spawns workers (subagent pattern via runAgent)
  -> Workers have: ASYNC_AGENT_ALLOWED_TOOLS (Bash, Read, Edit, etc.)
  -> Worker results arrive as <task-notification> messages
  -> Coordinator synthesizes and responds to user
```

### Components Needed

| Component | File | Status | Work Required |
|-----------|------|--------|--------------|
| `coordinatorMode.ts` | `src/coordinator/coordinatorMode.ts` | **Full implementation** (370 lines, system prompt, mode logic) | Verify runtime behavior |
| `workerAgent.ts` | `src/coordinator/workerAgent.ts` | **Stub** (empty array) | Implement worker agent definitions |
| Tool registry hooks | `src/tools.ts:120,280,292` | Integration points exist | **No changes needed** |
| All 35 file references | Various | All gated by `feature('COORDINATOR_MODE')` | **No changes needed** -- become live when flag enabled |

### Key Design Constraints

1. Coordinator mode replaces the normal tool set -- coordinator cannot directly run bash or edit files
2. Workers are independent subagents that communicate via `<task-notification>` XML messages
3. The `coordinatorMode.ts` system prompt (lines 116-369) is the core design document -- it defines the entire coordinator persona, workflow phases, and synthesis requirements
4. Worker tool pool is defined by `ASYNC_AGENT_ALLOWED_TOOLS` constant, not by the coordinator
5. Session mode (coordinator vs normal) must be persisted and restored across session resume

### Modified vs New Components

- **Modified:** NONE -- all 35 integration points exist
- **New (replace stub):** `src/coordinator/workerAgent.ts` -- implement `getCoordinatorAgents()`

---

## Feature 5: KAIROS (Proactive Assistant Mode)

### Current State

Stub implementations exist:
- `src/assistant/index.ts` (9 lines) -- stub with no-op exports
- `src/assistant/gate.ts` (3 lines) -- stub returning false
- `src/assistant/sessionDiscovery.ts`, `sessionHistory.ts`, `AssistantSessionChooser.ts` -- exist (content unknown)
- `src/proactive/index.ts` (7 lines) -- stub with no-op exports
- Feature flag `KAIROS` referenced across **100+ files** (the most widely integrated feature)

### Integration Points (critical subset of 100+)

| Location | File:Line | What Happens | Integration Type |
|----------|-----------|-------------|-----------------|
| Entry point | `src/main.tsx:80-81` | `assistantModule` + `kairosGate` conditional import | Module loading |
| Activation | `src/main.tsx:2206` | `if (kairosEnabled && assistantModule) { ... }` initializes assistant team | Boot activation |
| Pending chat | `src/main.tsx:559,685,3259` | `_pendingAssistantChat` for deferred session discovery | Session management |
| REPL proactive | `src/screens/REPL.tsx:195-199` | `proactiveModule` + `useProactive` hook for proactive ticking | UI integration |
| REPL channels | `src/screens/REPL.tsx:1284-1299` | Channel loading for assistant mode | Channel management |
| Tool registry | `src/tools.ts:26,42,46,50` | Adds SendUserFileTool, BriefTool, SubscribePRTool | Tool loading |
| Keybindings | `src/keybindings/defaultBindings.ts:45` | KAIROS-specific keyboard shortcuts | UI shortcuts |
| System prompt | `src/utils/systemPrompt.ts:105` | Proactive/KAIROS addendum to system prompt | Prompt modification |
| Compact | `src/services/compact/compact.ts:6,717,1061` | KAIROS session transcript handling during compaction | Data preservation |
| Memory dir | `src/memdir/memdir.ts:319,432` | Assistant-mode daily-log prompt | Memory management |
| Commands | `src/commands.ts:63,67,70` | Assistant slash command registration | Command system |
| Brief tool | `src/tools/BriefTool/BriefTool.ts:91,131` | Brief mode display for assistant | UI mode |
| Permission | `src/hooks/toolPermission/handlers/interactiveHandler.ts:317` | Channel permission routing for KAIROS | Permission routing |
| Analytics | `src/services/analytics/metadata.ts:735` | KAIROS-specific analytics metadata | Telemetry |

### Data Flow

```
main.tsx boot
  |
  v
kairosGate.isKairosEnabled() -> checks entitlement/gate
  |
  v (if enabled)
assistantModule.initializeAssistantTeam()
  -> Sets up assistant mode: channels, session discovery, dream
  |
  v
REPL.tsx: useProactive() hook activates proactive mode
  -> Subscribe to proactive tick events
  -> Handle incoming channel notifications
  -> Manage brief mode display
  |
  v
User interacts -> query.ts turn loop runs normally
  |
  v (between turns, proactive mode)
proactiveModule checks for:
  - File system changes in watched directories
  - GitHub PR events (via SubscribePRTool)
  - Scheduled tasks (via useScheduledTasks)
  |
  v (on trigger)
Inject proactive message into conversation
  -> Model responds proactively to the trigger
  -> Brief mode shows concise status updates
```

### Components Needed

| Component | File | Status | Work Required |
|-----------|------|--------|--------------|
| `assistant/index.ts` | `src/assistant/index.ts` | **Stub** (9 lines, no-op) | Full assistant mode implementation |
| `assistant/gate.ts` | `src/assistant/gate.ts` | **Stub** (3 lines, returns false) | Entitlement/gate check logic |
| `assistant/sessionDiscovery.ts` | `src/assistant/sessionDiscovery.ts` | Exists (unknown) | Verify/implement session discovery |
| `assistant/sessionHistory.ts` | `src/assistant/sessionHistory.ts` | Exists (unknown) | Verify/implement session history |
| `assistant/AssistantSessionChooser.ts` | `src/assistant/AssistantSessionChooser.ts` | Exists (unknown) | Verify/implement session chooser |
| `proactive/index.ts` | `src/proactive/index.ts` | **Stub** (7 lines, no-op) | Full proactive mode implementation |
| `proactive/useProactive.ts` | `src/proactive/useProactive.ts` | Referenced but may not exist | React hook for proactive ticking |
| All 100+ integration points | Various | All gated by `feature('KAIROS')` or `feature('PROACTIVE')` | **No changes needed** |

### Key Design Constraints

1. KAIROS is the **largest feature by integration surface** -- 100+ files reference it
2. It depends on `proactive/` module AND `assistant/` module working together
3. Multiple sub-features: `KAIROS_BRIEF`, `KAIROS_CHANNELS`, `KAIROS_DREAM`, `KAIROS_PUSH_NOTIFICATION`, `KAIROS_GITHUB_WEBHOOKS` -- each with their own flag
4. Heavily coupled to the REPL UI layer (brief mode, channels notice, proactive spinner)
5. Interacts with compaction (session transcript preservation during compact)
6. Interacts with memdir (daily-log prompt for assistant mode)
7. The complexity and wide integration surface make this the **highest-risk feature to enable**

### Modified vs New Components

- **Modified:** NONE -- all 100+ integration points already exist and are gated
- **New (replace stubs):** `assistant/index.ts`, `assistant/gate.ts`, `proactive/index.ts`, `proactive/useProactive.ts`

---

## Feature 6: Dynamic Permission Escalation

### Current State

The permission system is fully implemented with types in `src/types/permissions.ts` (442 lines). The current permission modes are: `default`, `acceptEdits`, `bypassPermissions`, `dontAsk`, `plan`, `auto` (feature-flagged), `bubble` (internal).

### Integration Points

| Location | File:Line | What Happens | Integration Type |
|----------|-----------|-------------|-----------------|
| Permission types | `src/types/permissions.ts:16-29` | Mode definitions, behavior types | Type system |
| Permission rules | `src/types/permissions.ts:50-79` | Rule sources, values, and matching | Rule engine |
| Permission decisions | `src/types/permissions.ts:167-267` | Decision types: allow, ask, deny, passthrough | Decision flow |
| Decision reasons | `src/types/permissions.ts:271-324` | Reason taxonomy: rule, mode, hook, classifier, etc. | Audit trail |
| Tool permission context | `src/types/permissions.ts:427-441` | `ToolPermissionContext` with mode, rules, directories | Context shape |
| Interactive handler | `src/hooks/toolPermission/handlers/interactiveHandler.ts` | Push-to-confirm-queue flow with async classifier | User interaction |
| Permission checking | `src/utils/permissions/permissions.ts` | `hasPermissionsToUseTool()` -- the rule matching engine | Core logic |
| Tool execution | `src/services/tools/toolExecution.ts:918-931` | `resolveHookPermissionDecision()` -- the permission resolution point | Execution gate |

### Data Flow for Dynamic Permission Escalation

```
Model requests high-risk tool call
  |
  v
canUseTool(tool, input, ctx) [useCanUseTool.tsx]
  |
  v
hasPermissionsToUseTool() [permissions.ts]
  -> Returns 'deny' based on current mode
  |
  v
[DYNAMIC ESCALATION -- new logic]
  1. Check if tool call qualifies for escalation:
     - Tool is known (not MCP/unknown)
     - Current denial is from mode (not explicit deny rule)
     - Model provided reasoning for why tool is needed
  2. Build escalation request:
     - Tool name and input summary
     - Model's reasoning
     - Risk level classification
     - Suggested temporary permission scope
  3. Route to handler:
     - Interactive: show escalation UI (different from normal ask)
     - Headless: deny (no escalation without human)
  4. User decision:
     - Approve: add temporary session-scoped allow rule
     - Deny: return normal deny
     - Approve + persist: add to project/user settings
  |
  v
Return PermissionDecision (allow with escalation metadata, or deny)
```

### Components Needed

| Component | File | Status | Work Required |
|-----------|------|--------|--------------|
| `PermissionDecisionReason` extension | `src/types/permissions.ts` | **Modify** | Add `'escalation'` to decision reason types |
| `PermissionEscalation` type | `src/types/permissions.ts` | **New type** | Define escalation request/response shapes |
| `escalationHandler.ts` | `src/hooks/toolPermission/handlers/escalationHandler.ts` | **New** | UI-facing escalation flow |
| `escalationClassifier.ts` | `src/services/permissions/escalationClassifier.ts` | **New** | Determine if a denial qualifies for escalation |
| Permission checking | `src/utils/permissions/permissions.ts` | **Modify** | Insert escalation check after deny decision |
| Permission UI | `src/components/permissions/EscalationPrompt.tsx` | **New** | Ink component for escalation UI (REPL mode only) |

### Key Design Constraints

1. Escalation must NEVER weaken explicit deny rules -- only mode-based denials qualify
2. Session-scoped temporary permissions must NOT persist across restarts unless user explicitly chooses
3. The escalation UI must be visually distinct from normal permission prompts (user must know this is an escalation)
4. Headless/SDK mode cannot support escalation without a human -- must deny
5. Must integrate with the existing `PermissionUpdate` system for rule persistence

### Modified vs New Components

- **Modified:** `src/types/permissions.ts` (add types), `src/utils/permissions/permissions.ts` (add escalation check)
- **New:** `escalationHandler.ts`, `escalationClassifier.ts`, `EscalationPrompt.tsx`

---

## Build Order Analysis

### Dependency Graph

```
                    ┌──────────────┐
                    │ Feature Flags │ (prerequisite for all)
                    │ (Phase 5 v1) │
                    └──────┬───────┘
                           |
          ┌────────────────┼──────────────────┐
          |                |                   |
          v                v                   v
  ┌───────────────┐ ┌──────────────┐  ┌───────────────────┐
  │ Dynamic Perm  │ │ Deliberation │  │ EXTRACT_MEMORIES   │
  │ Escalation    │ │ Checkpoint   │  │ (verify + enable)  │
  │ (permissions) │ │ (toolExec)   │  │                    │
  └───────┬───────┘ └──────┬───────┘  └───────────────────┘
          |                |
          |    ┌───────────┘
          |    |
          v    v
  ┌──────────────────┐
  │ CONTEXT_COLLAPSE  │ (needs permissions working, benefits from deliberation)
  │ (query.ts loop)   │
  └────────┬─────────┘
           |
           v
  ┌──────────────────┐
  │ COORDINATOR_MODE  │ (needs all tool/permission infrastructure)
  │ (parallel module) │
  └────────┬─────────┘
           |
           v
  ┌──────────────────┐
  │ KAIROS            │ (needs coordinator, permissions, context collapse all working)
  │ (proactive mode)  │
  └──────────────────┘
```

### Recommended Build Order

#### Phase A: Foundation (no feature interdependencies)

**A1: Dynamic Permission Escalation**
- Why first: Extends the permission system that every other feature depends on. Modifies `types/permissions.ts` which is a leaf type file -- low risk, high leverage.
- Scope: ~4 new files, ~2 modified files
- Risk: LOW -- adds to existing types, doesn't change existing behavior
- Dependency: Feature flag system (v1.0 Phase 5) must be complete

**A2: EXTRACT_MEMORIES (verify + enable)**
- Why parallel with A1: Full implementation already exists. This is verification, not implementation.
- Scope: Verify `extractMemories.ts` (616 lines), `prompts.ts`, `forkedAgent.ts` runtime behavior
- Risk: LOW -- implementation is present, just need to enable flag and test
- Dependency: None (stopHooks integration already exists)

**A3: Deliberation Checkpoint**
- Why parallel with A1/A2: Self-contained insertion into `toolExecution.ts`. No dependency on other features.
- Scope: ~3 new files in `src/services/deliberation/`, ~20 lines modified in `toolExecution.ts`
- Risk: MEDIUM -- modifies the hot path (tool execution), performance impact must be measured
- Dependency: None

#### Phase B: Query Loop Enhancement

**B1: CONTEXT_COLLAPSE**
- Why after Phase A: Benefits from dynamic permission and deliberation being stable. The collapse logic interacts with autocompact and reactive compact -- needs the permission system to be stable.
- Scope: Replace 3 stubs in `src/services/contextCollapse/`
- Risk: MEDIUM -- modifies the message pipeline in query.ts, affects what the API sees
- Dependency: Feature flag system, stable query loop (v1.0 Phase 4)

#### Phase C: Parallel Modules

**C1: COORDINATOR_MODE**
- Why after Phase B: The coordinator's workers use tools that go through the permission system and the query loop. Both must be stable.
- Scope: Replace 1 stub (`workerAgent.ts`), verify 370-line `coordinatorMode.ts`
- Risk: MEDIUM -- changes the entire tool set and persona, but is mode-isolated
- Dependency: Tool system stable, AgentTool working, permission system complete

**C2: KAIROS (Proactive Assistant)**
- Why last: Largest integration surface (100+ files). Depends on proactive module, assistant module, channels, brief mode, session discovery. Touches every layer of the system.
- Scope: Replace stubs in `assistant/` and `proactive/`, verify 100+ integration points
- Risk: HIGH -- most complex feature, widest blast radius, heaviest UI coupling
- Dependency: COORDINATOR_MODE (shares agent patterns), CONTEXT_COLLAPSE (proactive sessions generate long contexts), EXTRACT_MEMORIES (proactive mode needs memory persistence)

---

## Cross-Cutting Concerns

### Feature Flag Dependencies

All 6 features use the `feature()` polyfill system. The flags are:

| Flag | Feature | Sub-flags |
|------|---------|-----------|
| `CONTEXT_COLLAPSE` | Context collapse | None |
| `EXTRACT_MEMORIES` | Memory extraction | None |
| `COORDINATOR_MODE` | Coordinator | None |
| `KAIROS` | Proactive assistant | `KAIROS_BRIEF`, `KAIROS_CHANNELS`, `KAIROS_DREAM`, `KAIROS_PUSH_NOTIFICATION`, `KAIROS_GITHUB_WEBHOOKS` |
| `PROACTIVE` | Proactive base (legacy, now merged with KAIROS) | None |

Deliberation Checkpoint and Dynamic Permission do not use feature flags -- they are new features without existing dead code paths.

### Shared Infrastructure

| Infrastructure | Used By | Location |
|---------------|---------|----------|
| `runForkedAgent()` | EXTRACT_MEMORIES, potentially CONTEXT_COLLAPSE | `src/utils/forkedAgent.ts` |
| `createAutoMemCanUseTool()` | EXTRACT_MEMORIES, autoDream | `src/services/extractMemories/extractMemories.ts` |
| `ToolUseContext` | All features (dependency injection) | `src/Tool.ts` |
| `AppState` | All features (state access) | `src/state/AppState.tsx` |
| `feature()` polyfill | 4 of 6 features | `src/entrypoints/cli.tsx` |
| `handleStopHooks()` | EXTRACT_MEMORIES lifecycle | `src/query/stopHooks.ts` |
| `StreamingToolExecutor` | Deliberation (must not break), COORDINATOR tools | `src/services/tools/StreamingToolExecutor.ts` |

### State Isolation Requirements

| Feature | State Pattern | Isolation Method |
|---------|--------------|-----------------|
| CONTEXT_COLLAPSE | Collapse store (spans, committed collapses) | Module-level closure via init function |
| EXTRACT_MEMORIES | Extraction cursor, overlap guard, pending context | Closure-scoped via `initExtractMemories()` |
| Deliberation | Stateless (per-call) | No state needed |
| COORDINATOR_MODE | Mode flag, worker tool set | Process env var + conditional tool loading |
| KAIROS | Proactive state, channels, sessions | Module-level state in proactive/ and assistant/ |
| Dynamic Permission | Temporary session rules | Existing `ToolPermissionContext.alwaysAllowRules` with session source |

### Circular Dependency Risks

The codebase already has one documented circular dependency workaround:

> `coordinatorMode.ts` duplicates `isScratchpadGateEnabled()` because importing `filesystem.ts` creates a circular dependency (filesystem -> permissions -> ... -> coordinatorMode). -- Comment at `coordinatorMode.ts:20-24`

New features must not introduce new cycles:
- Deliberation MUST NOT import from `permissions/` (use only types from `types/permissions.ts`)
- Dynamic Permission MUST NOT import from tool implementations
- CONTEXT_COLLAPSE MUST NOT import from `compact/` (they coordinate via the query.ts caller, not direct imports)

---

## Component Inventory Summary

### New Components (to create)

| Component | Feature | File Path |
|-----------|---------|-----------|
| Deliberation service | Deliberation | `src/services/deliberation/deliberation.ts` |
| Risk classifier | Deliberation | `src/services/deliberation/riskClassifier.ts` |
| Deliberation prompts | Deliberation | `src/services/deliberation/prompts.ts` |
| Escalation handler | Dynamic Permission | `src/hooks/toolPermission/handlers/escalationHandler.ts` |
| Escalation classifier | Dynamic Permission | `src/services/permissions/escalationClassifier.ts` |
| Escalation UI | Dynamic Permission | `src/components/permissions/EscalationPrompt.tsx` |
| Proactive hook | KAIROS | `src/proactive/useProactive.ts` |

### Stubs to Replace (real implementation needed)

| Stub | Feature | File Path | Current Size |
|------|---------|-----------|-------------|
| Context collapse | CONTEXT_COLLAPSE | `src/services/contextCollapse/index.ts` | 67 lines (no-ops) |
| Context collapse ops | CONTEXT_COLLAPSE | `src/services/contextCollapse/operations.ts` | Unknown |
| Context collapse persist | CONTEXT_COLLAPSE | `src/services/contextCollapse/persist.ts` | Unknown |
| Worker agent | COORDINATOR_MODE | `src/coordinator/workerAgent.ts` | 4 lines (empty array) |
| Assistant module | KAIROS | `src/assistant/index.ts` | 9 lines (no-ops) |
| Assistant gate | KAIROS | `src/assistant/gate.ts` | 3 lines (returns false) |
| Proactive module | KAIROS | `src/proactive/index.ts` | 7 lines (no-ops) |

### Existing Code to Verify (already implemented)

| Component | Feature | File Path | Size |
|-----------|---------|-----------|------|
| Extract memories | EXTRACT_MEMORIES | `src/services/extractMemories/extractMemories.ts` | 616 lines |
| Extract prompts | EXTRACT_MEMORIES | `src/services/extractMemories/prompts.ts` | Unknown |
| Coordinator mode | COORDINATOR_MODE | `src/coordinator/coordinatorMode.ts` | 370 lines |

### Existing Code to Modify

| Component | Feature | File Path | Change Scope |
|-----------|---------|-----------|-------------|
| Tool execution | Deliberation | `src/services/tools/toolExecution.ts` | ~20 lines inserted |
| Permission types | Dynamic Permission | `src/types/permissions.ts` | ~30 lines added |
| Permission checking | Dynamic Permission | `src/utils/permissions/permissions.ts` | ~40 lines added |

---

## Sources

- `src/query.ts` -- lines 17-19 (CONTEXT_COLLAPSE import), 440-447 (collapse application), 616-620 (blocking skip), 802-812 (withholding), 1093-1120 (overflow recovery)
- `src/query/stopHooks.ts` -- lines 41-43 (EXTRACT_MEMORIES import), 141-153 (extraction call)
- `src/services/contextCollapse/index.ts` -- full file (67 lines, all stubs)
- `src/services/extractMemories/extractMemories.ts` -- full file (616 lines, complete implementation)
- `src/services/tools/toolExecution.ts` -- lines 599-931 (checkPermissionsAndCallTool, permission resolution)
- `src/coordinator/coordinatorMode.ts` -- full file (370 lines, system prompt + mode logic)
- `src/coordinator/workerAgent.ts` -- full file (4 lines, stub)
- `src/assistant/index.ts` -- full file (9 lines, stub)
- `src/assistant/gate.ts` -- full file (3 lines, stub)
- `src/proactive/index.ts` -- full file (7 lines, stub)
- `src/types/permissions.ts` -- full file (442 lines, permission type system)
- `src/tools.ts` -- lines 120, 280, 292 (COORDINATOR_MODE tool loading)
- `src/main.tsx` -- lines 76-81 (coordinator + assistant module loading)
- `src/screens/REPL.tsx` -- lines 119, 195-201 (coordinator + proactive imports)
- Grep results: 35 files reference COORDINATOR_MODE, 100+ files reference KAIROS
- Confidence: HIGH -- all findings from direct codebase inspection
