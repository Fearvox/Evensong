# Technology Stack

**Project:** CCB v2.0 Agent Intelligence Enhancement
**Domain:** 6 agent intelligence capabilities added to existing Claude Code CLI fork
**Researched:** 2026-04-08
**Scope:** What stack additions/changes are needed for CONTEXT_COLLAPSE, EXTRACT_MEMORIES, Deliberation Checkpoint, COORDINATOR_MODE, KAIROS, and Dynamic Permission Escalation. Focused on: new dependencies, Bun APIs, internal modules to un-gate vs rewrite.

---

## Critical Finding: Zero New Dependencies Required

After thorough analysis of all six gated modules, their imports, and the existing dependency tree, **no new npm packages are needed**. Every external library these features reference is already in `package.json`. The work is entirely about un-gating, implementing stubs, and wiring internal modules.

This is the single most important takeaway for roadmap planning.

---

## Already in Place (Do Not Re-introduce)

From v1.0 research -- still applies. Adding items newly relevant to v2.0:

| Tool | Version | Relevance to v2.0 |
|------|---------|-------------------|
| Bun runtime | ^1.3.x | Runtime for all features; `Bun.spawn()` for agent processes |
| @anthropic-ai/sdk | ^0.80.0 | Streaming API for forked agents (EXTRACT_MEMORIES, coordinator workers) |
| zod | ^4.3.6 | Input validation for coordinator tools (TeamCreate, SendMessage, TaskStop) |
| axios | ^1.14.0 | Used by KAIROS sessionHistory.ts for session event API calls |
| lru-cache | ^11.2.7 | Available for context collapse span caching |
| lodash-es | ^4.17.23 | `memoize` used by memdir/paths.ts, growthbook.ts |
| @growthbook/growthbook | ^1.6.5 | Runtime gates (`tengu_*`) used by all 6 features |
| ws | ^8.20.0 | WebSocket for agent communication (already a dependency) |
| chokidar | ^5.0.0 | File watching (available if KAIROS needs it) |
| yaml | ^2.8.3 | Config parsing for feature flags |
| fuse.js | ^7.1.0 | Fuzzy search (available for memory search) |
| p-retry | (from v1.0 plan) | Stream resilience -- still recommended if not yet installed |

---

## Feature-by-Feature Stack Analysis

### 1. CONTEXT_COLLAPSE -- Intelligent Context Folding

**Current state:** 3 files, all auto-generated stubs. Zero real logic.
- `src/services/contextCollapse/index.ts` -- stub exports (all no-ops)
- `src/services/contextCollapse/operations.ts` -- stub (identity function)
- `src/services/contextCollapse/persist.ts` -- stub (no-op)

**Also gated:** `src/tools/CtxInspectTool/` -- directory does NOT exist yet. Must be created.

**Integration surface:** Enormous. 22+ call sites across query.ts, autoCompact.ts, postCompactCleanup.ts, analyzeContext.ts, setup.ts, TokenWarning.tsx, sessionRestore.ts, REPL.tsx, ResumeConversation.tsx, context commands, ContextVisualization.tsx, tools.ts.

**External dependencies needed:** None. All imports in the 22+ call sites resolve to internal modules.

**Internal dependencies (all exist):**
- `src/types/message.ts` -- Message types for collapse operations
- `src/Tool.ts` -- ToolUseContext for the applyCollapsesIfNeeded API
- `src/constants/querySource.ts` -- QuerySource enum
- `src/services/compact/autoCompact.ts` -- Integration point for auto-compaction
- `src/utils/sessionStorage.ts` -- Persistence layer for collapsed state

**What to build:**
- Real implementations of `applyCollapsesIfNeeded`, `isContextCollapseEnabled`, `recoverFromOverflow`, `isWithheldPromptTooLong` in index.ts
- `projectView` in operations.ts (message filtering/folding logic)
- `restoreFromEntries` in persist.ts (session restore for collapsed spans)
- New `src/tools/CtxInspectTool/CtxInspectTool.ts` (gated in tools.ts line 110)

**Bun APIs used:** Standard fs for persistence. No special Bun APIs required.

**Confidence:** HIGH -- all call sites, types, and interfaces are already defined by the stub signatures.

---

### 2. EXTRACT_MEMORIES -- Cross-Session Memory Extraction

**Current state:** Real implementation exists, NOT a stub. `extractMemories.ts` is 200+ lines of working code. `prompts.ts` has complete prompt templates. The `EXTRACT_MEMORIES` feature gate is the ONLY barrier.

**Integration surface:** 4 call sites (stopHooks.ts, print.ts, backgroundHousekeeping.ts).

**External dependencies needed:** None.

**Internal dependencies (all exist and functional):**
- `src/utils/forkedAgent.ts` -- `runForkedAgent`, `createCacheSafeParams` (complete implementation, 180+ lines)
- `src/memdir/paths.ts` -- `isAutoMemoryEnabled`, `isExtractModeActive`, `getAutoMemPath` (complete)
- `src/memdir/memoryScan.ts` -- `scanMemoryFiles`, `formatMemoryManifest` (complete)
- `src/memdir/memoryTypes.ts` -- Memory frontmatter types and templates (complete)
- `src/services/analytics/growthbook.ts` -- `getFeatureValue_CACHED_MAY_BE_STALE` (complete)

**Runtime gates that must be bypassed:**
- `feature('EXTRACT_MEMORIES')` -- build-time gate (controlled via `CLAUDE_FEATURE_EXTRACT_MEMORIES=true`)
- `isExtractModeActive()` -- checks `getFeatureValue_CACHED_MAY_BE_STALE('tengu_passport_quail', false)` -- this GrowthBook gate will NEVER pass in the fork (no Anthropic GrowthBook). Must be hard-wired to return `true` when the feature flag is enabled.
- Optional: `feature('TEAMMEM')` in prompts.ts -- team memory is separate and can remain disabled.

**What to build:**
- Bypass or replace GrowthBook runtime gate in `isExtractModeActive()` to respect the local feature flag instead
- Enable `feature('EXTRACT_MEMORIES')` via config
- Smoke test: verify `runForkedAgent` works (spawns a parallel API call, returns messages)

**Critical nuance:** The forked agent pattern calls `query()` internally -- it makes a REAL API call to Claude with a subset of tools (read-only bash, file read/write/edit/glob/grep for memory paths only). This costs API tokens. Must document this for users.

**Confidence:** HIGH -- this is the most complete feature. Working code behind a single feature gate.

---

### 3. Deliberation Checkpoint -- Risk Scoring Before Tool Calls

**Current state:** No existing code. No feature gate. This is a NEW feature to design and build.

**Concept:** Before executing high-risk tool calls (file writes, bash commands, destructive operations), force the model into extended thinking mode with elevated thinking budget to assess risk.

**Stack approach -- use existing infrastructure:**
- `ThinkingConfig` type (`src/utils/thinking.ts`) -- already supports `{ type: 'enabled', budgetTokens: number }` and `{ type: 'adaptive' }`
- `src/services/api/claude.ts` -- already handles thinking budget configuration (lines 1616-1632)
- `src/hooks/useCanUseTool.tsx` -- permission check hook where risk assessment would be injected
- `src/utils/permissions/` -- permission system with `PermissionBehavior` (allow/deny/ask)
- `src/tools/BashTool/bashPermissions.ts` -- existing risk classification for bash commands
- `src/tools/BashTool/readOnlyValidation.ts` -- 1000+ lines of read-only detection (reusable for risk scoring)

**External dependencies needed:** None.

**What to build:**
- Risk scoring function: classify tool calls by danger level (read-only=0, file write=1, bash mutation=2, destructive=3)
- Thinking budget escalation: when risk > threshold, modify `thinkingConfig` for that turn to force deeper reasoning
- UI: show "deliberating..." indicator during risk assessment
- Integration point: between tool permission check and tool execution in `src/query.ts`

**Pattern:** This is NOT a separate API call. It modifies the thinking parameters of the NEXT API call when the model's previous response contained a high-risk tool use. The model then sees its own tool call and is asked to reason about it with elevated thinking budget before confirming.

**Alternative approach considered and rejected:** Using a separate "guardian" forked agent (like EXTRACT_MEMORIES does). Rejected because: (a) doubles API cost, (b) the main agent's context is what matters for risk assessment, (c) the thinking budget approach achieves the same effect within a single conversation turn.

**Confidence:** MEDIUM -- no existing code to un-gate, requires clean-sheet design. But all building blocks (thinking config, permission system, risk detection) exist.

---

### 4. COORDINATOR_MODE -- Multi-Agent Coordination

**Current state:** Mixed. `coordinatorMode.ts` is REAL code (370 lines with full system prompt, tool list configuration, session mode matching). `workerAgent.ts` is a stub (empty array return).

**Integration surface:** 34+ call sites across main.tsx, REPL.tsx, tools.ts, AgentTool.tsx, systemPrompt.ts, sessionRestore.ts, cli/print.ts, commands, and UI components.

**External dependencies needed:** None. All coordinator tools are already implemented:
- `src/tools/SendMessageTool/SendMessageTool.ts` -- full implementation (uses zod/v4, internal task system)
- `src/tools/TeamCreateTool/TeamCreateTool.ts` -- full implementation
- `src/tools/TeamDeleteTool/TeamDeleteTool.ts` -- full implementation (assumed, matching pattern)
- `src/tools/TaskStopTool/TaskStopTool.ts` -- full implementation

**Internal dependencies (all exist):**
- `src/tasks/` -- Complete task infrastructure (LocalAgentTask, InProcessTeammateTask, etc.)
- `src/utils/swarm/` -- 21 files implementing agent swarm infrastructure (InProcessBackend, TmuxBackend, ITermBackend, permission sync, reconnection, etc.)
- `src/utils/agentSwarmsEnabled.ts` -- Gate function (bypasses GrowthBook for `ant` users)
- `src/utils/teammate.ts`, `src/utils/teammateMailbox.ts` -- Agent identity and communication
- `src/tools/AgentTool/AgentTool.tsx` -- Full agent spawning with background task support

**Runtime gates that must be bypassed:**
- `feature('COORDINATOR_MODE')` -- build-time gate
- `isCoordinatorMode()` -- reads `CLAUDE_CODE_COORDINATOR_MODE` env var (already wired correctly)
- `isAgentSwarmsEnabled()` -- external users need `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=true` AND GrowthBook gate `tengu_amber_flint` (must hard-wire this gate to `true`)
- `checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_scratch')` -- scratchpad gate (must bypass)

**What to build:**
- Real `getCoordinatorAgents()` in `workerAgent.ts` (currently returns empty array)
- Bypass GrowthBook runtime gates for agent swarms
- Verify InProcessBackend works (the in-process agent runner is the simplest backend -- no tmux/iterm needed)
- Test the full flow: coordinator spawns worker via AgentTool, worker executes, result arrives as task-notification

**Risk:** This is the LARGEST integration surface. The coordinator system prompt (370 lines in coordinatorMode.ts) references tools and behaviors that must all work end-to-end.

**Confidence:** MEDIUM -- real code exists for coordinator mode and all its tools, but the swarm infrastructure is complex and the GrowthBook gate bypass needs careful testing.

---

### 5. KAIROS -- Proactive Assistant Mode

**Current state:** Almost entirely stubs.
- `src/assistant/index.ts` -- stub (all no-ops)
- `src/assistant/gate.ts` -- stub (returns false)
- `src/assistant/sessionDiscovery.ts` -- stub (returns empty array)
- `src/assistant/AssistantSessionChooser.ts` -- stub (returns null)
- `src/assistant/sessionHistory.ts` -- REAL code (88 lines, uses axios for session event API)
- `src/proactive/index.ts` -- stub (all no-ops)

**Integration surface:** MASSIVE. 130+ call sites across nearly every major module. KAIROS is deeply woven into:
- main.tsx (30+ references) -- session management, CLI flags, team context
- REPL.tsx (15+ references) -- message rendering, proactive behavior
- tools.ts (5+ references) -- tool filtering, coordinator interaction
- cli/print.ts (10+ references) -- output formatting
- 40+ other files in components, commands, hooks, services, utils

**External dependencies needed:** None. `axios` (already in deps) is the only external import in the real code (sessionHistory.ts).

**KAIROS sub-features detected (from code analysis):**
- `KAIROS` -- core assistant mode
- `KAIROS_CHANNELS` -- MCP channel notifications
- `KAIROS_BRIEF` -- brief/summary mode
- `KAIROS_DREAM` -- auto-dream skill
- `KAIROS_PUSH_NOTIFICATION` -- push notifications

**Tools gated behind KAIROS (already implemented elsewhere):**
- `BriefTool` (`src/tools/BriefTool/`) -- 4 files, likely real code
- `SendUserFileTool` (`src/tools/SendUserFileTool/prompt.ts`) -- at least prompt exists
- Various tool schema modifications (AgentTool adds `cwd` field when KAIROS is on)

**What to build -- this is the HARDEST feature:**
- Real `isAssistantMode()`, `initializeAssistantTeam()`, `getAssistantSystemPromptAddendum()` in index.ts
- Real `isKairosEnabled()` in gate.ts (currently always returns false)
- Real `discoverAssistantSessions()` in sessionDiscovery.ts
- Real `AssistantSessionChooser` component
- Real proactive module (`isProactiveActive`, `activateProactive`, etc.)
- Session discovery needs Anthropic's session API -- which may not be available outside their infrastructure

**Critical blocker:** `sessionHistory.ts` calls Anthropic's internal session events API (`/v1/sessions/{id}/events`) with OAuth headers. This endpoint is likely NOT accessible to non-Anthropic users. KAIROS's session resume and history features are fundamentally tied to Anthropic's cloud infrastructure.

**Recommendation:** Implement a LOCAL session storage backend that replaces the cloud API. Use the existing `src/utils/sessionStorage.ts` (4000+ lines of session persistence code) as the foundation. The local session model already exists -- KAIROS just needs to be wired to read from it instead of the cloud API.

**Confidence:** LOW for full KAIROS. HIGH for basic proactive mode (local-only, no cloud API). The 130+ integration points make this the highest-risk feature.

---

### 6. Dynamic Permission Escalation -- Context-Aware Permission Upgrade

**Current state:** No existing code. No feature gate. No gated modules. This is a NEW feature to design.

**Concept:** Allow the model to request elevated permissions at runtime based on context (e.g., "I need write access to fix this bug -- may I?") rather than requiring users to pre-configure permissions.

**Stack approach -- use existing infrastructure:**
- `src/types/permissions.ts` -- Complete permission type system (PermissionBehavior: allow/deny/ask, PermissionMode, PermissionRuleSource)
- `src/hooks/useCanUseTool.tsx` -- Permission check hook (the decision point)
- `src/hooks/toolPermission/handlers/interactiveHandler.ts` -- Interactive permission prompt
- `src/components/permissions/` -- Permission UI components
- `src/utils/permissions/` -- Permission evaluation engine
- `src/state/AppState.tsx` -- `toolPermissionContext` in app state

**External dependencies needed:** None.

**What to build:**
- Permission escalation request type: model outputs a structured "escalation request" explaining WHY it needs elevated access
- Escalation evaluation: compare requested permission against current mode, risk level, and context
- User prompt: "The agent wants to [action] because [reason]. Allow? [yes/no/always for this session]"
- Session-scoped permission cache: granted escalations persist for the session but not across sessions
- Integration: modify the permission denial path in useCanUseTool to offer escalation instead of hard deny

**Pattern:** This is a UI + permission system change, NOT an API change. The model already produces tool calls that get denied -- the change is in what happens AFTER a denial: instead of just reporting "denied", the system checks if the denial is escalatable and prompts the user.

**Confidence:** MEDIUM -- clean-sheet design, but all building blocks exist in the permission system.

---

## GrowthBook Gate Bypass Strategy

Multiple features depend on GrowthBook runtime gates that will NEVER pass in the fork (no Anthropic GrowthBook server). This is the single most critical cross-cutting concern.

**Affected gates:**
| Gate Name | Used By | Default | Action |
|-----------|---------|---------|--------|
| `tengu_passport_quail` | EXTRACT_MEMORIES (isExtractModeActive) | false | Must return true when feature flag enabled |
| `tengu_amber_flint` | COORDINATOR_MODE (isAgentSwarmsEnabled) | true | Must remain true (killswitch) |
| `tengu_scratch` | COORDINATOR_MODE (scratchpad) | false | Must return true when coordinator enabled |
| `tengu_harbor` | KAIROS (channel notifications) | false | Must return true when KAIROS enabled |
| `tengu_auto_background_agents` | Agent auto-background | false | Optional, not critical |

**Recommended approach:** Add a local override layer in `getFeatureValue_CACHED_MAY_BE_STALE`:

```typescript
// In src/services/analytics/growthbook.ts
export function getFeatureValue_CACHED_MAY_BE_STALE<T>(
  feature: string,
  defaultValue: T,
): T {
  // LOCAL OVERRIDE: check feature-flags.json for runtime gate overrides
  const localOverride = getLocalGateOverride(feature)
  if (localOverride !== undefined) return localOverride as T

  // ... existing GrowthBook logic ...
}
```

This is the cleanest approach: a single integration point, respects the existing config file (`~/.claude/feature-flags.json`), and does not require modifying every call site.

**What NOT to do:** Do not patch each call site individually. Do not remove the GrowthBook dependency (it may still be useful for future features). Do not hard-code gate values in source code.

---

## Internal Modules: Un-gate vs Rewrite

| Module | Action | Rationale |
|--------|--------|-----------|
| `src/services/contextCollapse/index.ts` | **REWRITE** | Stub with correct interfaces. Must implement from scratch. |
| `src/services/contextCollapse/operations.ts` | **REWRITE** | Stub. |
| `src/services/contextCollapse/persist.ts` | **REWRITE** | Stub. |
| `src/tools/CtxInspectTool/` | **CREATE** | Does not exist. |
| `src/services/extractMemories/extractMemories.ts` | **UN-GATE** | Real code behind feature flag. |
| `src/services/extractMemories/prompts.ts` | **UN-GATE** | Real code behind feature flag. |
| `src/coordinator/coordinatorMode.ts` | **UN-GATE** | Real code (370 lines). |
| `src/coordinator/workerAgent.ts` | **REWRITE** | Stub (returns empty array). |
| `src/assistant/index.ts` | **REWRITE** | Stub. |
| `src/assistant/gate.ts` | **REWRITE** | Stub. |
| `src/assistant/sessionDiscovery.ts` | **REWRITE** | Stub. Needs local backend. |
| `src/assistant/sessionHistory.ts` | **ADAPT** | Real code but calls Anthropic cloud API. |
| `src/assistant/AssistantSessionChooser.ts` | **REWRITE** | Stub. |
| `src/proactive/index.ts` | **REWRITE** | Stub. |
| `src/services/compact/reactiveCompact.ts` | **REWRITE** | Stub. Related to CONTEXT_COLLAPSE. |
| `src/utils/forkedAgent.ts` | **UN-GATE** | Real code, fully functional. |
| `src/memdir/` (all files) | **UN-GATE** | All real code, already functional. |
| `src/tasks/` (all files) | **UN-GATE** | Real task infrastructure. |
| `src/utils/swarm/` (all 21 files) | **UN-GATE** | Real swarm infrastructure. |
| `src/tools/SendMessageTool/` | **UN-GATE** | Real implementation. |
| `src/tools/TeamCreateTool/` | **UN-GATE** | Real implementation. |
| `src/tools/TaskStopTool/` | **UN-GATE** | Real implementation. |

---

## Recommended Stack Additions

### 0. No New npm Dependencies

All six features build on the existing dependency tree. The package.json already includes every external library referenced by gated code.

### 1. GrowthBook Gate Override Layer (Internal Change)

**What:** A 10-line function in `src/services/analytics/growthbook.ts` that checks `~/.claude/feature-flags.json` for runtime gate overrides before falling through to the (non-functional) GrowthBook client.

**Why:** 5 of 6 features depend on GrowthBook gates that will never pass without Anthropic's infrastructure. Without this override, features will appear enabled (feature flag on) but silently disabled (runtime gate off).

**Complexity:** Low. Single function, single file, single integration point.

### 2. Feature Flags Configuration (Already Exists)

The feature flag system from Phase 1 (`cli.tsx` lines 1-22) already supports:
- `~/.claude/feature-flags.json` file
- `CLAUDE_FEATURE_ALL=true` env var
- Per-flag env vars: `CLAUDE_FEATURE_CONTEXT_COLLAPSE=true`

No changes needed to the flag system itself. Users enable features by adding to their config:

```json
{
  "CONTEXT_COLLAPSE": true,
  "EXTRACT_MEMORIES": true,
  "COORDINATOR_MODE": true,
  "KAIROS": true
}
```

### 3. Local Session Storage for KAIROS (Internal Change)

**What:** A local file-based session discovery/history module to replace Anthropic's cloud session API.

**Why:** `sessionHistory.ts` calls `/v1/sessions/{id}/events` with OAuth -- an endpoint only accessible to Anthropic employees. KAIROS session features are dead without a local alternative.

**Basis:** `src/utils/sessionStorage.ts` (4000+ lines) already persists sessions locally. The local data is there -- KAIROS just needs an adapter to read it.

**Complexity:** Medium. Adapter pattern over existing sessionStorage.

### 4. Risk Scoring Module for Deliberation Checkpoint (New Code)

**What:** A new `src/services/deliberation/` module with risk classification functions.

**Why:** No existing code for deliberation checkpoints. Must be designed from scratch.

**Basis:** Reuses `BashTool/readOnlyValidation.ts` (1000+ lines of command classification) and `BashTool/bashPermissions.ts` (2500+ lines of permission rules) for risk signal extraction. Reuses `ThinkingConfig` type for thinking budget escalation.

**Complexity:** Medium. Risk scoring is the novel part; thinking budget manipulation is straightforward.

### 5. Permission Escalation Types (Internal Change)

**What:** Extend `src/types/permissions.ts` with escalation request/response types.

**Why:** Dynamic permission escalation needs a way to represent "the model requests elevated access for reason X."

**Basis:** Existing `PermissionBehavior` (allow/deny/ask) gets a fourth option: `escalate`. The interactive handler already shows prompts -- escalation adds a new prompt variant.

**Complexity:** Low-Medium. Type additions + UI component + handler modification.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| GrowthBook bypass | Override layer in getFeatureValue | Patch each call site | 50+ call sites; maintenance nightmare, high regression risk |
| GrowthBook bypass | Override layer in getFeatureValue | Remove GrowthBook entirely | Breaks analytics, may have side effects in 700+ line growthbook.ts |
| KAIROS sessions | Local adapter over sessionStorage | Cloud API proxy | No access to Anthropic's session API; adds external dependency |
| KAIROS sessions | Local adapter over sessionStorage | Skip session features entirely | Loses key KAIROS value (resume, discover, history) |
| Deliberation | Thinking budget escalation | Separate "guardian" agent | Doubles API cost per high-risk action; forkedAgent pattern is expensive |
| Deliberation | Thinking budget escalation | System prompt modification | Cannot dynamically adjust per-tool; thinking budget gives per-turn control |
| Context collapse | Custom implementation | Use SDK's built-in context management | SDK has no context folding; its compaction is separate (already used) |
| Permission escalation | Extend existing permission system | New parallel permission system | Existing system is comprehensive; extension is less code, fewer bugs |

---

## What NOT to Add

| Tool/Library | Reason |
|-------------|--------|
| Any new npm package | All external deps already present in package.json |
| LangChain / LlamaIndex | Orchestration frameworks add complexity; the existing forkedAgent + task system is sufficient |
| Redis / SQLite for sessions | overkill; existing file-based sessionStorage is adequate |
| OpenAI / alternative LLM SDK | Coordinator workers use the same Anthropic SDK as the main agent |
| Socket.io | ws is already in deps; agent communication uses file-based mailboxes + in-process callbacks |
| Custom agent framework | The swarm infrastructure (21 files in src/utils/swarm/) IS the agent framework |

---

## Installation Summary

```bash
# No new packages to install.
# All work is internal code changes.

# To enable features for testing:
echo '{"CONTEXT_COLLAPSE": true, "EXTRACT_MEMORIES": true, "COORDINATOR_MODE": true, "KAIROS": true}' > ~/.claude/feature-flags.json

# Or per-session:
CLAUDE_FEATURE_EXTRACT_MEMORIES=true bun run dev
```

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| No new dependencies needed | HIGH | Verified all imports in all gated modules resolve to existing deps |
| EXTRACT_MEMORIES un-gate | HIGH | Real code behind single feature flag; all internal deps functional |
| COORDINATOR_MODE un-gate | MEDIUM | Real coordinatorMode.ts + tools; swarm infra is complex and untested |
| CONTEXT_COLLAPSE rewrite | MEDIUM | Stubs define clear interfaces; 22+ integration points are well-documented |
| Deliberation Checkpoint | MEDIUM | No existing code; building blocks exist but design is novel |
| KAIROS partial implementation | LOW | 130+ integration points; cloud API dependency blocks session features |
| Dynamic Permission Escalation | MEDIUM | Clean design space; existing permission system is extensible |
| GrowthBook override approach | HIGH | Single integration point; low risk, low complexity |

---

## Sources

- Direct analysis of codebase: `src/services/contextCollapse/`, `src/coordinator/`, `src/assistant/`, `src/proactive/`, `src/services/extractMemories/`, `src/utils/forkedAgent.ts`, `src/memdir/`, `src/tasks/`, `src/utils/swarm/`
- Feature flag system: `src/entrypoints/cli.tsx` (lines 1-22)
- GrowthBook integration: `src/services/analytics/growthbook.ts`
- Permission system: `src/types/permissions.ts`, `src/hooks/useCanUseTool.tsx`
- Thinking config: `src/utils/thinking.ts`
- Existing v1.0 STACK.md research (2026-04-06)
