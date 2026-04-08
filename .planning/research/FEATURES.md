# Feature Landscape: v2.0 Agent Intelligence Enhancement

**Domain:** AI agent intelligence layer for CLI coding assistant
**Project:** CCB v2.0 — agent intelligence capabilities on top of working CLI
**Researched:** 2026-04-08
**Research mode:** Ecosystem + Feasibility — what production agent systems do, what CCB should build

---

## Capability Overview

Six capabilities being added to an already-working CLI. Each analyzed for table stakes (users expect it), differentiator (creates competitive advantage), and anti-feature (explicitly not building) behaviors. Complexity is assessed relative to CCB's decompiled codebase where stub implementations already exist.

---

## 1. CONTEXT_COLLAPSE — Intelligent Context Folding

### What It Is

A granular alternative to full-conversation compaction. Instead of summarizing the entire conversation when approaching the context window limit, CONTEXT_COLLAPSE identifies spans of messages that are no longer actively relevant and replaces them with short summaries in-place. The rest of the conversation retains full fidelity.

Anthropic's own context engineering guide (2026) describes the general pattern: "one of the safest, lightest touch forms of compaction" is removing raw tool outputs from deep history, and the more aggressive version summarizes entire spans. CONTEXT_COLLAPSE is the aggressive version, implemented as a read-time projection over the message history rather than a destructive rewrite.

### Existing Codebase State

- **Stub exists**: `src/services/contextCollapse/index.ts` — all exports are no-ops returning default values
- **Integration points wired**: `query.ts:440` calls `contextCollapse.applyCollapsesIfNeeded()` when feature flag is true
- **Persistence scaffolding**: `ContextCollapseCommitEntry` and `ContextCollapseSnapshotEntry` types defined in `src/types/logs.ts` with full field specifications
- **Session restore**: `src/utils/conversationRecovery.ts` already reads collapse commits and snapshots from transcripts
- **UI integration**: `ContextVisualization.tsx` has a `CollapseStatus` component that shows span counts and health
- **Operations stub**: `src/services/contextCollapse/operations.ts` has a no-op `projectView` that passes messages through

### Table Stakes Behaviors

| Behavior | Why Expected | Complexity | Notes |
|----------|--------------|------------|-------|
| Automatic trigger when context fills | Every production agent handles context limits — crashing or silently truncating is unacceptable | Medium | Existing autocompact already handles this; collapse adds a finer-grained layer before compaction fires |
| Preserve recent messages at full fidelity | Users expect their last few exchanges to be verbatim — summarizing the message they just sent feels broken | Low | Built into the span-selection logic: recent messages are never collapse candidates |
| Summary accuracy | If a collapsed span is referenced later (e.g. "remember that bash error from earlier"), the summary must be enough to reason about it | High | This is the hardest problem: summary quality directly determines whether collapse helps or hurts |
| Graceful fallback to full compaction | If collapse can't free enough tokens, autocompact must still fire | Low | Already wired: `autoCompact.ts:220` checks `isContextCollapseEnabled()` and adjusts thresholds |

### Differentiator Behaviors

| Behavior | Value Proposition | Complexity | Notes |
|----------|-------------------|------------|-------|
| Staged collapse pipeline | Spans are "staged" (marked for collapse but not yet committed) — the model can review pending summaries before they become permanent | Medium | `ContextCollapseSnapshotEntry.staged` array already has `risk: number` field, suggesting a quality gate existed |
| Per-span risk scoring | Collapse candidates get a risk score: low-risk spans (routine tool outputs) collapse first, high-risk spans (architectural decisions) persist longer | High | The staged entry type has a `risk` field; scoring logic must be implemented |
| Recovery from overflow | If an API call returns "prompt too long", collapse can emergency-drain staged spans to free tokens without losing the conversation | Medium | `recoverFromOverflow` is already stubbed in the index; `query.ts:1094` calls it on overflow errors |
| Transparent collapse status | Users can see what was collapsed and why via `/context` command | Low | `CollapseStatus` component and `context-noninteractive.ts` integration already exist |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| User-visible collapsed content replacing real messages in the REPL | Confusing UX — users see a message they typed being replaced with "[summarized]" | Collapses are a read-time projection for the API; the REPL shows full history. Collapsed messages are `isMeta` and invisible in the conversation view |
| Collapsing messages from the current turn | Too aggressive — breaks coherence when the model references something it just said | Only collapse messages from completed turns, never the active one |
| LLM-generated collapse decisions (deciding what to collapse via an API call) | Adds latency and cost to every turn for a question that can be answered heuristically | Use token counting + recency heuristics to select spans; reserve LLM calls for generating summaries only |

### Dependencies

- Depends on: autocompact system (already built, Phase 4), message normalization (`normalizeMessagesForAPI`), token estimation
- Depended on by: nothing directly, but COORDINATOR_MODE benefits because multi-agent conversations consume context faster

### Expected User-Facing Behavior

Users notice nothing during normal short conversations. In long sessions (50+ turns), the `/context` command shows "3 spans summarized (47 msgs)" in the context breakdown. If they ask about something from early in the conversation, the model answers from the summary rather than the full text — usually correctly, occasionally losing detail. Autocompact fires less often because collapse keeps the window under threshold.

---

## 2. EXTRACT_MEMORIES — Cross-Session Memory

### What It Is

A background agent that runs at the end of each query loop, scanning the conversation for durable facts worth persisting to disk. Extracted memories live in `~/.claude/projects/<path>/memory/` as markdown files and are loaded into future sessions' system prompts. The agent runs as a "forked agent" — a perfect fork of the main conversation that shares the parent's prompt cache.

### Existing Codebase State

- **Implementation partially exists**: `src/services/extractMemories/extractMemories.ts` has 200+ lines of real logic including `countModelVisibleMessagesSince`, `hasMemoryWritesSince`, and `createAutoMemCanUseTool`
- **Prompt templates exist**: `src/services/extractMemories/prompts.ts` has `buildExtractAutoOnlyPrompt` and `buildExtractCombinedPrompt` with full prompt engineering
- **Memory infrastructure**: `src/memdir/` has `memdir.ts`, `memoryScan.ts`, `paths.ts`, `memoryTypes.ts` — full directory management
- **Tool permissions scoped**: The `createAutoMemCanUseTool` function restricts the forked agent to Read/Grep/Glob (unrestricted) + read-only Bash + Edit/Write only within the memory directory
- **Forked agent pattern**: `src/utils/forkedAgent.ts` provides `runForkedAgent` with cache-safe parameter sharing

### Table Stakes Behaviors

| Behavior | Why Expected | Complexity | Notes |
|----------|--------------|------------|-------|
| Automatic extraction without user intervention | Users expect the tool to "just remember" — manual `/save-memory` is a power-user escape hatch, not the primary path | Medium | The hook-based trigger (end of query loop) already has the right architecture |
| Deduplication against existing memories | Writing "uses Bun runtime" to memory every session is noise, not intelligence | Medium | Prompt template already includes existing memory manifest and instructs "update rather than creating a duplicate" |
| Scoped permissions for the background agent | A memory extraction agent that can run arbitrary bash commands or edit source code is a security hole | Low | Already implemented in `createAutoMemCanUseTool` — read-only Bash, writes only to memory dir |
| Memory available in next session | The whole point is cross-session continuity; if memories aren't loaded at startup, nothing works | Low | `src/context.ts` already loads memory files into system prompt context |

### Differentiator Behaviors

| Behavior | Value Proposition | Complexity | Notes |
|----------|-------------------|------------|-------|
| Forked agent sharing parent's prompt cache | Extraction doesn't double API costs — the forked agent reuses the parent's cached prompt tokens | Low | Already implemented via `CacheSafeParams` in `forkedAgent.ts` |
| Four-type memory taxonomy | Semantic memory (facts), user preferences, project conventions, and debugging insights — structured types prevent a blob of notes | Low | Defined in `src/memdir/memoryTypes.ts` (`TYPES_SECTION_COMBINED`, `TYPES_SECTION_INDIVIDUAL`) |
| Dream consolidation (autoDream) | Periodic background consolidation that reviews multiple sessions' memories and merges/prunes them — like sleep consolidation in biological memory | High | `src/services/autoDream/autoDream.ts` has real logic: time-gate (24h), session-gate (5 sessions), lock-based dedup. `consolidationPrompt.ts` has full 4-phase dream prompt |
| Mutual exclusion with main agent's memory writes | If the main agent wrote memories during the conversation (user asked it to), the background extractor skips that turn to avoid conflicts | Low | `hasMemoryWritesSince` already implements this check |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Vector database for memory storage | Adds infrastructure dependency (embedding model, vector DB) to a CLI tool that should be self-contained | Markdown files on disk + grep-based retrieval. The memory index file (`MEMORY.md`) acts as a lightweight retrieval layer |
| Extracting from every turn | Most turns are routine tool outputs — extracting from them wastes tokens and creates noise | Use `countModelVisibleMessagesSince` to skip runs with fewer than N new messages (existing logic) |
| User-visible extraction process | Showing "extracting memories..." in the REPL breaks flow for a background operation | Run asynchronously via forked agent; log to debug output only |
| Storing raw conversation snippets | Verbatim transcript chunks bloat memory and often contain stale context | Extract facts and patterns, not quotes. The prompt instructs this explicitly |

### Dependencies

- Depends on: forked agent infrastructure, memory directory (`memdir/`), tool permission system
- Related to: autoDream (uses same `createAutoMemCanUseTool`), KAIROS (dream is gated on KAIROS in some paths)
- Depended on by: future sessions (memories loaded into system prompt)

### Expected User-Facing Behavior

Users don't see extraction happening. In their next session on the same project, the agent says "I see from project memory that you use Bun as the runtime and prefer functional patterns." If the user asks the agent to update a memory, the agent writes directly; the background extractor skips that turn. After 5+ sessions, the dream consolidation merges overlapping memories and prunes stale ones overnight.

---

## 3. Deliberation Checkpoint — Risk-Aware Tool Gating

### What It Is

Forced extended thinking before executing high-risk tool calls. Instead of immediately running `rm -rf` or `git push --force`, the model first engages in visible deliberation — reasoning through consequences, checking against safety guidelines, and deciding whether to proceed, modify, or refuse. This is directly informed by the Mythos System Card findings that "reckless destructive actions" occur when models attempt overeager task completion without restraint.

### Existing Codebase State

- **Extended thinking infrastructure**: `src/utils/thinking.ts` has `ThinkingConfig` type with `adaptive`, `enabled` (with `budgetTokens`), and `disabled` modes
- **Effort levels**: `src/utils/effort.ts` supports `low/medium/high/max` effort with model-specific gating
- **Bash command classification**: `src/utils/permissions/bashClassifier.ts` (stub) defines `classifyBashCommand` with confidence levels — the AST-based parser in `src/utils/bash/ast.ts` already does `parseForSecurityFromAst` and `checkSemantics`
- **Permission hooks**: `src/hooks/useCanUseTool.tsx` routes through `hasPermissionsToUseTool` before every tool call
- **No explicit deliberation checkpoint**: Nothing in the codebase forces extended thinking budget specifically for dangerous operations. The thinking config is set globally per session, not per-tool-call

### Table Stakes Behaviors

| Behavior | Why Expected | Complexity | Notes |
|----------|--------------|------------|-------|
| Block destructive commands without confirmation | `rm -rf /`, `git push --force origin main`, `DROP TABLE` — these must never execute without explicit user approval | Low | Permission system already handles this via deny/ask rules; this is the baseline |
| Visible reasoning before high-risk actions | Users need to see WHY the model thinks an action is safe, not just that it decided to proceed | Medium | Requires routing high-risk tool calls through an extended thinking path even when adaptive thinking would normally skip it |
| Respect existing permission rules | Deliberation does not override deny rules — if the permission system says "deny", deliberation is irrelevant | Low | Deliberation sits between "permission says ask" and "prompt the user" — it enriches the ask with reasoning |

### Differentiator Behaviors

| Behavior | Value Proposition | Complexity | Notes |
|----------|-------------------|------------|-------|
| Risk-tiered thinking budgets | Low-risk operations (read a file) get zero deliberation overhead; medium-risk (write a file) get minimal; high-risk (destructive bash) get forced deep thinking | Medium | Map tool categories to minimum `budget_tokens` values. For adaptive thinking models, this means temporarily switching to `enabled` mode with a floor |
| Thinking content visible in REPL | Users can see the model's safety reasoning as a thinking block in the conversation — building trust through transparency | Low | Thinking blocks already render in the REPL; the change is ensuring they exist for high-risk calls |
| Command rewriting after deliberation | If deliberation reveals the command is dangerous, the model can propose a safer alternative (e.g., `rm` -> `trash`, `git push --force` -> `git push --force-with-lease`) | High | Requires the thinking output to feed back into tool input modification before execution |
| Audit trail in transcripts | Every deliberation checkpoint is logged with the risk assessment, so users can review what the model considered dangerous | Low | Thinking blocks are already persisted in JSONL transcripts |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Deliberation on every tool call | Adds latency to every operation — users will disable it immediately | Only trigger for tool calls that the bash AST parser or permission system flags as medium+ risk |
| Replacing the permission system | Deliberation is not a substitute for deny/ask/allow rules — it's an enrichment layer | Keep existing permission modes; deliberation adds reasoning when permission is "ask" |
| Model self-approval | The Mythos System Card shows models can strategize about grading — a model approving its own dangerous actions defeats the purpose | Deliberation produces reasoning that the USER sees; the user still approves. Never auto-approve based on deliberation output alone |
| Blocking low-risk operations for "safety" | Adding a 2-second thinking pause to `cat package.json` kills the tool | Risk classification must have a high false-negative tolerance for low-risk operations — only flag when genuinely uncertain |

### Dependencies

- Depends on: bash AST parser (`src/utils/bash/ast.ts`), permission system, extended thinking infrastructure
- Related to: Dynamic Permission Escalation (shares the risk assessment layer)
- Depended on by: nothing directly, but improves trust in COORDINATOR_MODE where workers execute commands unsupervised

### Expected User-Facing Behavior

User asks "clean up my docker system." Model runs `docker system prune -a` which is destructive. Before execution, a thinking block appears: "This command removes all unused images, containers, volumes, and networks. The `-a` flag removes ALL unused images, not just dangling ones. This is destructive but the user explicitly asked for cleanup. I should proceed but warn about the scope." The user sees this reasoning alongside the permission prompt and can make an informed decision. For routine operations like reading files, no thinking block appears.

---

## 4. COORDINATOR_MODE — Multi-Agent Orchestration

### What It Is

A mode where the main agent becomes a coordinator that plans, delegates, and synthesizes, while worker agents (spawned via AgentTool) do the actual file-reading, code-writing, and testing. The coordinator sees task notifications from workers and directs follow-up work. This is the dominant pattern in production multi-agent coding systems as of 2026.

### Existing Codebase State

- **Full system prompt exists**: `src/coordinator/coordinatorMode.ts` has a 370-line coordinator system prompt with examples, anti-patterns, and detailed instructions for managing workers
- **Mode switching**: `isCoordinatorMode()` checks feature flag + env var `CLAUDE_CODE_COORDINATOR_MODE`; `matchSessionMode()` restores mode from resumed sessions
- **Worker tool list**: `getCoordinatorUserContext()` builds the tool list workers receive, including MCP tools from connected servers
- **Scratchpad directory**: Support for a shared cross-worker directory for durable knowledge, gated on `tengu_scratch`
- **Dedicated tools**: `SendMessageTool`, `TeamCreateTool`, `TeamDeleteTool`, `TaskStopTool` — all referenced in the coordinator prompt
- **AgentTool integration**: `src/tools/AgentTool/` has `builtInAgents.ts`, `runAgent.ts`, `agentToolUtils.ts` — full subagent infrastructure
- **Built-in agent types**: `src/tools/AgentTool/builtInAgents.ts` references `subagent_type: "worker"` in the coordinator prompt

### Table Stakes Behaviors

| Behavior | Why Expected | Complexity | Notes |
|----------|--------------|------------|-------|
| Parallel worker execution | The entire value of coordinator mode is parallelism — serial delegation is slower than doing it yourself | Medium | AgentTool already supports spawning; the key is concurrent execution with task notification delivery |
| Worker isolation (separate context windows) | Workers must not see each other's context or the user's full conversation — only their brief | Low | Forked agents already get fresh context; coordinator prompt instructs self-contained briefs |
| Task notification delivery | Coordinator must receive structured `<task-notification>` messages when workers complete, fail, or are stopped | Medium | Message type and format defined in coordinator prompt; delivery mechanism needs implementation |
| Worker tool access | Workers need real tools (Bash, Edit, Read, etc.) — a coordinator that spawns toothless workers is useless | Low | `getCoordinatorUserContext` already builds the allowed tools list from `ASYNC_AGENT_ALLOWED_TOOLS` |

### Differentiator Behaviors

| Behavior | Value Proposition | Complexity | Notes |
|----------|-------------------|------------|-------|
| Worker continuation via SendMessage | Continue an existing worker with follow-up instructions instead of spawning fresh — reuses loaded context and saves prompt cache tokens | Medium | `SendMessageTool` referenced in prompt; implementation needs wiring |
| Scratchpad for cross-worker knowledge | A shared directory where workers can write findings that other workers can read — solves the "workers can't see each other" isolation problem | Medium | Scratchpad path injection already in `getCoordinatorUserContext` |
| Coordinator synthesis requirement | The coordinator must understand research findings before delegating implementation — no lazy "based on your findings" hand-off | Low | Purely a prompt/behavioral concern — the system prompt already explicitly forbids lazy delegation |
| File ownership enforcement | Workers should not write to the same files concurrently — one worker per file set prevents merge conflicts | High | Not currently implemented; would require tracking which workers own which paths |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| More than 5 concurrent workers | Research (Addy Osmani 2026) shows 3-5 is the sweet spot; beyond that coordination overhead dominates | Cap at 5 with clear error message |
| Workers spawning workers | Recursive delegation creates uncontrollable execution trees and token burn | Workers have `ASYNC_AGENT_ALLOWED_TOOLS` which excludes AgentTool — already enforced |
| Auto-merging worker outputs without coordinator review | The coordinator's value is synthesis and quality gating — auto-merge bypasses both | Workers commit to branches; coordinator reviews and merges |
| Coordinator doing implementation work directly | If the coordinator reads files and writes code, it accumulates context that should live in workers | The prompt says "don't delegate work you can handle without tools" for questions, but implementation should always go to workers |

### Dependencies

- Depends on: AgentTool (subagent spawning), tool permission system, message queue for task notifications
- Related to: CONTEXT_COLLAPSE (coordinator conversations grow fast), EXTRACT_MEMORIES (coordinator session memories differ from worker sessions)
- Depended on by: nothing directly, but enables KAIROS-style autonomous workflows at scale

### Expected User-Facing Behavior

User runs `claude --coordinator` or sets `CLAUDE_CODE_COORDINATOR_MODE=1`. The prompt changes to show coordinator mode. User says "refactor the auth module to use JWT." Coordinator spawns two workers: one to research the current auth implementation, one to research JWT best practices. Results arrive as `<task-notification>` blocks. Coordinator synthesizes findings, then spawns an implementation worker with a specific brief including file paths and line numbers. A verification worker follows. The user sees the coordinator's synthesis messages interleaved with worker status updates.

---

## 5. KAIROS — Proactive Assistant

### What It Is

An autonomous mode where the agent takes initiative instead of waiting for user prompts. Built on three subsystems: **Channels** (inbound messages from external services via MCP), **Dream** (background memory consolidation across sessions), and **Brief** (a tool for sending proactive messages to the user, including with attachments). The agent receives periodic `<tick>` prompts and decides whether to act or sleep.

### Existing Codebase State

- **Proactive module stubbed**: `src/proactive/index.ts` exports `isProactiveActive` (always false), `activateProactive`, `deactivateProactive` — all no-ops
- **Channels implemented**: `src/services/mcp/channelNotification.ts` has real logic for receiving `notifications/claude/channel` from MCP servers, wrapping in `<channel>` tags, and queuing messages
- **BriefTool implemented**: `src/tools/BriefTool/BriefTool.ts` has full implementation with `normal`/`proactive` status types, attachment support, and validation
- **SleepTool defined**: `src/tools/SleepTool/prompt.ts` has the tool description for idle periods between ticks
- **Dream consolidation**: `src/services/autoDream/autoDream.ts` has real gate logic (time + session thresholds + lock) and `consolidationPrompt.ts` has the full 4-phase dream prompt
- **CLI flag**: `src/main.tsx:3832` adds `--proactive` option gated on `feature('PROACTIVE') || feature('KAIROS')`
- **System prompt injection**: `src/main.tsx:2203` builds a proactive system prompt that instructs the agent to take initiative

### Table Stakes Behaviors

| Behavior | Why Expected | Complexity | Notes |
|----------|--------------|------------|-------|
| User-initiated activation only | Proactive mode must be opt-in — an agent that spontaneously acts without being asked is hostile UX | Low | Already gated on `--proactive` flag and env var |
| Sleep when nothing to do | An agent that burns tokens on every tick with "nothing to report" is wasteful | Low | SleepTool exists with description: "call this when you have nothing to do" |
| Pause on user input | When the user types something, proactive ticks must pause so the user has the conversation back | Low | `REPL.tsx:2117` already pauses proactive mode on user input |
| Channel message routing | When an MCP server sends a channel notification (Slack message, CI result, PR review), the agent must see it and decide how to respond | Medium | Channel notification handler exists and queues messages; SleepTool polls `hasCommandsInQueue()` |

### Differentiator Behaviors

| Behavior | Value Proposition | Complexity | Notes |
|----------|-------------------|------------|-------|
| Dream consolidation | Background memory consolidation that runs automatically after 24h and 5+ sessions — biological-sleep-inspired memory management | High | Implementation exists in `autoDream.ts` with time-gate, session-gate, and locking. Consolidation prompt is thorough (4 phases: orient, gather, consolidate, prune) |
| Brief with attachments | Proactive messages can include file attachments (screenshots, diffs, logs) — not just text | Medium | `BriefTool` already supports `attachments` array with path resolution and image detection |
| Channel permission system | External messages can carry permission approvals (e.g., a Slack user says "yes" to a permission request the agent forwarded) | High | `ChannelMessageNotificationSchema` includes structured permission replies with `request_id` and `behavior` |
| PR activity subscription | Subscribe to GitHub PR events (reviews, CI) and act on them proactively — fix failing CI, respond to review comments | Medium | Referenced in coordinator prompt as `subscribe_pr_activity / unsubscribe_pr_activity` tools |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Always-on proactive mode | Token burn for idle watching; users will accidentally leave it running and get a surprise bill | Explicit `--proactive` flag; clear status indicator in REPL; auto-deactivate after N idle ticks |
| Proactive file modifications | An agent that starts editing your code while you're reading email is terrifying | Proactive mode should surface findings and proposals via Brief, not execute changes without confirmation |
| Channel-based remote code execution | An MCP channel message saying "deploy to production" should not trigger autonomous deployment | Channel messages are informational; actions require explicit permission flow, not auto-execution |
| Unrestricted tick frequency | Tick every second = massive token burn; tick every hour = too slow to be useful | Configurable tick interval with sensible default (e.g., 30 seconds); prompt cache reuse to reduce cost |

### Dependencies

- Depends on: SleepTool, BriefTool, channel notification system, message queue, extended thinking (for deciding what to do on tick)
- Related to: EXTRACT_MEMORIES (dream consolidation is a KAIROS subsystem), COORDINATOR_MODE (proactive coordinator can manage background workers)
- Depended on by: nothing directly

### Expected User-Facing Behavior

User runs `claude --proactive`. Agent greets them and starts monitoring. User walks away. A Slack MCP server delivers a message: "CI is failing on the auth branch." Agent wakes from sleep, reads the CI output, investigates the failure, and sends a Brief: "CI is failing because the new JWT middleware doesn't handle expired tokens. I can fix this — want me to proceed?" User returns, sees the Brief, types "yes," and the agent fixes the issue. Meanwhile, dream consolidation runs in the background merging memories from the last week of sessions.

---

## 6. Dynamic Permission Escalation — Adaptive Permissions

### What It Is

Context-aware permission upgrade requests where the agent asks to temporarily escalate its permissions for a specific task. Instead of static permission modes (deny/ask/allow), the agent can observe a pattern of repeated approvals and suggest: "You've approved 5 similar bash commands. Want to allow all npm commands for this session?" This is distinct from the "auto" mode (transcript classifier) — it's about the agent proposing targeted rule additions based on observed behavior.

### Existing Codebase State

- **Permission modes defined**: `src/types/permissions.ts` has `deny`, `ask`, `allow` behaviors with sources including `userSettings`, `projectSettings`, `localSettings`, `cliArg`, `permissionPrompt`
- **Auto mode exists**: `InternalPermissionMode` includes `auto` (gated on `TRANSCRIPT_CLASSIFIER` feature flag) — an LLM classifier that decides allow/deny without user prompts
- **Bash classifier stubbed**: `src/utils/permissions/bashClassifier.ts` has `classifyBashCommand` (always returns "disabled") and `isClassifierPermissionsEnabled` (always false)
- **Permission rule system**: Full rule matching with `ShellPermissionRule`, wildcard patterns, prefix extraction in `src/utils/permissions/shellRuleMatching.ts`
- **Session-scoped permissions**: Permission updates can be persisted per-session; the infrastructure for temporary permission grants exists
- **No explicit dynamic escalation**: Nothing in the codebase detects repeated approvals and proposes escalation. The closest is the `auto` mode's classifier, which is a different mechanism (proactive classification vs. reactive pattern detection)

### Table Stakes Behaviors

| Behavior | Why Expected | Complexity | Notes |
|----------|--------------|------------|-------|
| Never escalate beyond user's configured ceiling | If the user set `deny` for a tool, no amount of pattern-matching should override that | Low | Escalation proposals must respect the `deny` floor — only `ask` permissions can be escalated to `allow` |
| Session-scoped only | Escalation should never persist to `settings.json` without explicit user action | Low | Use the existing session-scoped permission mechanism |
| Clear escalation prompt | "Allow all npm commands for this session?" must be unambiguous — the user must know exactly what they're granting | Low | UX concern; clear wording in the permission prompt |

### Differentiator Behaviors

| Behavior | Value Proposition | Complexity | Notes |
|----------|-------------------|------------|-------|
| Pattern detection from approval history | After N consecutive approvals of the same command prefix (e.g., `npm run`), suggest a wildcard rule | Medium | Count approvals per tool+prefix combo during the session; threshold-based proposal (e.g., 3 approvals) |
| Risk-aware escalation tiers | Read-only operations escalate more eagerly (2 approvals); write operations need more evidence (5 approvals); destructive operations never auto-escalate | Medium | Use the bash AST parser's existing risk classification to gate escalation thresholds |
| Escalation undo | Users can type `/permissions reset` to revoke all session escalations and return to baseline | Low | Track escalated rules separately; clear on reset |
| Informed by deliberation | When deliberation checkpoint identifies a command as safe-but-flagged, it can proactively suggest an escalation for similar future commands | High | Integrates deliberation thinking output with permission pattern detection |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Auto-escalation without user approval | The Mythos System Card shows models can strategize about circumventing controls — auto-escalation is a gift to that failure mode | Always propose, never auto-apply. The user must explicitly accept every escalation |
| Persistent escalation to disk | Writing escalated permissions to `settings.json` means a one-session convenience becomes a permanent security hole | Session-scoped only; prompt to persist separately if the user wants it |
| Escalation of destructive operations | `rm`, `git push --force`, `DROP TABLE` — these should always require individual approval regardless of history | Hard-coded deny list for destructive operations that never escalates, even in `bypassPermissions` mode |
| Complex escalation UI | A modal dialog explaining permission graphs is overkill for a terminal tool | Single-line prompt: "Allow `npm run *` for this session? [y/n]" |

### Dependencies

- Depends on: permission system (deny/ask/allow), permission rule matching, session-scoped permission storage
- Related to: Deliberation Checkpoint (shares risk assessment), bash AST parser (command classification)
- Depended on by: nothing directly, but improves UX in COORDINATOR_MODE where workers generate many permission prompts

### Expected User-Facing Behavior

User is working in a session. Agent runs `npm run test` — user approves. Agent runs `npm run lint` — user approves. Agent runs `npm run build` — user approves. A suggestion appears: "You've approved 3 `npm run` commands. Allow all `npm run *` commands for this session? [y/n]." User presses `y`. For the rest of the session, `npm run` commands auto-approve. A `rm -rf node_modules` command still prompts because destructive operations never escalate. At session end, all escalations expire.

---

## Feature Dependencies (Cross-Capability)

```
EXTRACT_MEMORIES ←── autoDream ──→ KAIROS (dream is a KAIROS subsystem)
                                      ↑
CONTEXT_COLLAPSE (independent) ←── benefits from ── COORDINATOR_MODE (fast context growth)
                                      ↑
Deliberation Checkpoint ←── shared risk layer ──→ Dynamic Permission Escalation
        ↑                                                ↑
        └── enriches "ask" decisions ──────────────────┘

COORDINATOR_MODE ←── depends on ── AgentTool (subagents)
KAIROS ←── depends on ── SleepTool, BriefTool, Channels (all partially exist)
```

### Dependency Order for Implementation

1. **EXTRACT_MEMORIES** (Phase 1) — no dependencies on other new capabilities; existing infrastructure is furthest along; provides immediate user value
2. **CONTEXT_COLLAPSE** (Phase 2) — independent of other new capabilities; reduces context pressure that accelerates as users adopt the tool for longer sessions
3. **Deliberation Checkpoint** (Phase 3) — depends only on existing infrastructure (thinking, permissions, bash AST); creates the risk assessment layer reused by Dynamic Permission Escalation
4. **Dynamic Permission Escalation** (Phase 4) — can reuse risk classification from Deliberation; improves UX for all subsequent capabilities
5. **COORDINATOR_MODE** (Phase 5) — highest complexity; benefits from CONTEXT_COLLAPSE (conversations grow fast) and Dynamic Permission Escalation (workers generate many permission prompts)
6. **KAIROS** (Phase 6) — highest complexity and broadest scope; depends on memories (dream), benefits from coordinator (proactive multi-agent), and needs the full permission stack stable

---

## Complexity Assessment Summary

| Capability | Stub Completeness | Implementation Complexity | Risk | Notes |
|------------|-------------------|---------------------------|------|-------|
| EXTRACT_MEMORIES | High (60% real code) | Medium | Low | Most infrastructure exists; main work is wiring the hook trigger and testing memory quality |
| CONTEXT_COLLAPSE | Medium (types + stubs) | High | Medium | Summary generation quality is the hard problem; collapse selection can start with heuristics |
| Deliberation Checkpoint | Low (no explicit code) | Medium | Low | Leverage existing thinking infrastructure; main work is risk classification mapping and thinking budget injection |
| Dynamic Permission Escalation | Low (no explicit code) | Medium | Low | Pattern detection is straightforward; risk tiers reuse bash AST parser |
| COORDINATOR_MODE | High (full prompt, types) | High | High | Coordinator prompt exists; worker lifecycle (spawn, notify, continue, stop) needs implementation. Concurrent execution is the hard part |
| KAIROS | Medium (mixed stubs + real) | Very High | High | Three subsystems (channels, dream, brief) each medium complexity; combined integration and testing is the challenge |

---

## Sources

- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — HIGH confidence (official Anthropic engineering)
- [Claude Mythos Preview System Card Analysis](https://kenhuangus.substack.com/p/what-is-inside-claude-mythos-preview) — MEDIUM confidence (analysis of official system card)
- [Anthropic Mythos Deployment](https://www.cnbc.com/2026/04/07/anthropic-claude-mythos-ai-hackers-cyberattacks.html) — HIGH confidence (major news outlet)
- [Addy Osmani: The Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/) — HIGH confidence (detailed production patterns)
- [AI Agent Context Compression Strategies](https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies) — MEDIUM confidence (research publication)
- [Context Window Management Strategies](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) — MEDIUM confidence
- [Claude Extended Thinking API Docs](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) — HIGH confidence (official)
- [Microsoft Agent Governance Toolkit](https://opensource.microsoft.com/blog/2026/04/02/introducing-the-agent-governance-toolkit-open-source-runtime-security-for-ai-agents/) — HIGH confidence (official)
- [Persistent Memory for AI Coding Agents](https://medium.com/@sourabh.node/persistent-memory-for-ai-coding-agents-an-engineering-blueprint-for-cross-session-continuity-999136960877) — MEDIUM confidence
- [Multi-Agent Orchestration Patterns](https://www.ai-agentsplus.com/blog/multi-agent-orchestration-patterns-2026) — MEDIUM confidence
- [Proactive AI Paradigm Shift](https://www.mindstudio.ai/blog/post-prompting-era-proactive-ai-agents) — MEDIUM confidence
- [AI Agent Security Landscape 2025-2026](https://www.bvp.com/atlas/securing-ai-agents-the-defining-cybersecurity-challenge-of-2026) — MEDIUM confidence
