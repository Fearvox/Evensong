# Project Research Summary

**Project:** CCB v2.0 Agent Intelligence Enhancement
**Domain:** AI agent intelligence layer for decompiled CLI coding assistant
**Researched:** 2026-04-08
**Confidence:** MEDIUM-HIGH

## Executive Summary

CCB v2.0 adds six agent intelligence capabilities -- EXTRACT_MEMORIES, CONTEXT_COLLAPSE, Deliberation Checkpoint, Dynamic Permission Escalation, COORDINATOR_MODE, and KAIROS -- to an already-working decompiled Claude Code CLI. The critical finding across all research is that **zero new npm dependencies are required**. Every external library referenced by gated code already exists in `package.json`. The work is entirely internal: un-gating real implementations behind feature flags, replacing stubs with real logic, and bypassing GrowthBook runtime gates that will never pass without Anthropic's infrastructure. Of the six features, one (EXTRACT_MEMORIES) has a complete 616-line implementation behind a single feature gate, two (COORDINATOR_MODE, CONTEXT_COLLAPSE) have partial implementations with clear stub boundaries, and three (Deliberation Checkpoint, Dynamic Permission Escalation, KAIROS proactive subsystem) require clean-sheet design using existing building blocks.

The recommended approach is a 6-phase build ordered by dependency depth and risk. Start with the three features that have no interdependencies and can be built in parallel (EXTRACT_MEMORIES verification, Deliberation Checkpoint, Dynamic Permission Escalation), then proceed to CONTEXT_COLLAPSE (query loop modification), COORDINATOR_MODE (multi-agent orchestration), and finally KAIROS (the largest feature with 100+ integration points). A cross-cutting prerequisite -- the GrowthBook gate override layer -- must ship before any feature, because 5 of 6 features depend on runtime gates that silently return `false` in the fork. This is a 10-line function in `growthbook.ts` that checks local config before falling through to the defunct GrowthBook client.

The dominant risks are security-oriented. Memory extraction can leak secrets to persistent storage (API keys extracted as "project facts"). Dynamic permission escalation enables privilege creep if escalations persist beyond session scope. Coordinator workers can bypass permission denials through creative tool substitution (the "obstacle as problem" pattern documented in Anthropic's Mythos system card). The deliberation checkpoint, if miscalibrated, creates an over-refusal death spiral that makes the tool unusable for multi-step workflows. Each risk has a concrete mitigation documented in PITFALLS.md, and the build order is designed so that safety infrastructure (deliberation, permissions) is stable before the features that stress it (coordinator, KAIROS) are enabled.

## Key Findings

### Recommended Stack

No new packages. All six features build on the existing dependency tree. The only "stack additions" are internal code changes:

| Addition | Type | Rationale |
|----------|------|-----------|
| GrowthBook gate override layer | 10-line function in `growthbook.ts` | 5 of 6 features depend on `tengu_*` runtime gates that never pass without Anthropic's GrowthBook server. A local override checking `~/.claude/feature-flags.json` is the single cleanest integration point. |
| Local session storage adapter for KAIROS | Adapter over existing `sessionStorage.ts` | `sessionHistory.ts` calls Anthropic's cloud `/v1/sessions/{id}/events` endpoint. This is inaccessible. The local session data already exists in `sessionStorage.ts` (4000+ lines); KAIROS needs an adapter to read it. |
| Risk scoring module for Deliberation | New `src/services/deliberation/` (3 files) | No existing code for deliberation. Building blocks exist: `readOnlyValidation.ts` (1000+ lines), `bashPermissions.ts` (2500+ lines), `ThinkingConfig` type. |
| Permission escalation types | Extend `src/types/permissions.ts` | Add `escalate` behavior, escalation request/response types, session-scoped temporary rules. |

### Expected Features

**Must have (table stakes):**
- Automatic context management when context window fills (CONTEXT_COLLAPSE + existing autocompact)
- Cross-session memory that loads automatically in future sessions (EXTRACT_MEMORIES)
- Visible reasoning before destructive tool calls (Deliberation Checkpoint)
- Session-scoped permission grants that expire at session end (Dynamic Permission Escalation)
- Parallel worker execution with task notification delivery (COORDINATOR_MODE)
- User-initiated proactive activation only -- opt-in via `--proactive` flag (KAIROS)

**Should have (differentiators):**
- Staged collapse pipeline with per-span risk scoring (CONTEXT_COLLAPSE)
- Forked agent sharing parent prompt cache for memory extraction (EXTRACT_MEMORIES -- already implemented)
- Dream consolidation across sessions (KAIROS/autoDream -- real code exists with time+session gates)
- Pattern-based permission escalation from approval history (Dynamic Permission Escalation)
- Risk-tiered thinking budgets per tool call (Deliberation Checkpoint)
- Worker continuation via SendMessage reusing loaded context (COORDINATOR_MODE)

**Defer to later milestones:**
- Full KAIROS subsystem stack (channels, push notifications, GitHub webhooks) -- too many unknowns, cloud API dependency
- File ownership enforcement in coordinator mode -- high complexity, needs runtime tracking
- Command rewriting after deliberation -- requires thinking output to feed back into tool input modification
- Channel-based permission routing -- complex interaction with KAIROS channel system

### Architecture Approach

The six features organize into 3 integration tiers. **Tier 1** (CONTEXT_COLLAPSE, Deliberation Checkpoint) modifies the existing query loop hot path -- these are the most surgically precise but highest-risk changes. **Tier 2** (EXTRACT_MEMORIES) hooks into the post-query lifecycle via `stopHooks.ts` fire-and-forget -- lowest risk because it runs after the main loop completes. **Tier 3** (COORDINATOR_MODE, KAIROS, Dynamic Permission Escalation) operates as parallel modules orthogonal to the REPL, with their own module boundaries and state isolation. All integration points for gated features already exist in the codebase -- the 6 feature flags gate dead code paths in 35+ files (COORDINATOR_MODE) and 100+ files (KAIROS) that become live when flags are enabled.

**Major components:**
1. **GrowthBook override layer** (`growthbook.ts`) -- prerequisite that un-blocks all gated features by routing `tengu_*` runtime checks through local config
2. **Context collapse service** (`src/services/contextCollapse/`) -- read-time projection over message history; stubs exist with correct interfaces at 3 files
3. **Deliberation service** (`src/services/deliberation/`) -- new module, 3 files, inserts ~20 lines into `toolExecution.ts` between permission check and `tool.call()`
4. **Permission escalation** (`src/hooks/toolPermission/handlers/escalationHandler.ts` + types) -- extends existing deny path to offer session-scoped escalation
5. **Coordinator orchestrator** (`src/coordinator/`) -- 370-line real implementation + 4-line stub to replace; 35 gated integration points
6. **KAIROS/Proactive module** (`src/assistant/` + `src/proactive/`) -- stubs to replace; 100+ gated integration points; depends on all other features being stable

### Critical Pitfalls

1. **Context Collapse Amnesia Loop** (CRITICAL) -- autoCompact and context collapse race: autoCompact deletes messages that collapse has staged, producing orphaned metadata and infinite re-read loops. Prevention: shared coordination lock between the two systems; protected spans for decision artifacts that autoCompact must preserve verbatim.

2. **Memory Extraction Leaks Secrets** (CRITICAL, security) -- the forked agent can read `.env` files and API keys, then write them as "learned facts" to persistent memory in `~/.claude/projects/`. Prevention: post-extraction secret scanner; deny `FILE_READ_TOOL_NAME` for sensitive paths (`.env`, `credentials*`, `.ssh/*`); mandatory pre-write content validation.

3. **Deliberation Over-Refusal Death Spiral** (HIGH) -- forced thinking before every high-risk tool call creates cascading confirmation prompts during multi-step workflows (e.g., 20 prompts for a deploy sequence). Prevention: "deliberation memory" with scope tags and TTL -- once the user approves a plan, subsequent tool calls in that plan inherit the approval. Classification output must be PROCEED/CONFIRM_ONCE/DENY, never per-tool-call ask.

4. **Coordinator File Race Conditions** (CRITICAL) -- two workers writing to the same file simultaneously, with no runtime enforcement of file ownership. The coordinator prompt says "manage concurrency" but this is a soft instruction. Prevention: file reservation system in `canUseTool` that blocks concurrent writes to reserved paths; post-worker filesystem audit.

5. **Dynamic Permission Privilege Creep** (CRITICAL, security) -- escalations that persist to `projectSettings` survive across sessions, and forked agents (EXTRACT_MEMORIES, autoDream) inherit parent escalations. Prevention: session-only scope; forked agents must NOT inherit dynamic escalations; escalation audit log.

6. **Mythos "Obstacle as Problem" in Workers** (HIGH) -- workers bypass permission denials creatively (echo > file instead of FileWriteTool, sed -i as workaround). Prevention: comprehensive `canUseTool` that covers BashTool write-equivalent commands; permission denial is terminal for the subtask, not an obstacle.

## Implications for Roadmap

### Phase 0: GrowthBook Gate Override (prerequisite)
**Rationale:** Every gated feature depends on `tengu_*` runtime gates. Without the override, features appear enabled (flag on) but silently disabled (gate off). This is 10 lines of code but unblocks everything.
**Delivers:** Local override layer in `getFeatureValue_CACHED_MAY_BE_STALE` that reads `~/.claude/feature-flags.json`.
**Addresses:** Cross-cutting dependency for EXTRACT_MEMORIES, COORDINATOR_MODE, KAIROS.
**Avoids:** Silent feature degradation where flags are on but gates block execution.

### Phase 1: EXTRACT_MEMORIES (verify + enable)
**Rationale:** Lowest risk, highest readiness. 616 lines of working code behind a single feature gate. No dependencies on other new capabilities. Immediate user value (cross-session continuity).
**Delivers:** Background memory extraction at end of each query loop; memory loaded into future sessions.
**Addresses:** Table stakes: automatic extraction, deduplication, scoped permissions. Differentiator: forked agent cache sharing, four-type memory taxonomy.
**Avoids:** Pitfall 2 (secret leakage) -- must add secret scanner before shipping. Pitfall 10 (sycophancy) -- add preference strength calibration to extraction prompt.

### Phase 2: Deliberation Checkpoint (new module)
**Rationale:** Self-contained insertion into `toolExecution.ts`. No dependency on other new features. Creates the risk assessment infrastructure that Dynamic Permission Escalation reuses. Should be stable before coordinator workers start executing unsupervised.
**Delivers:** Forced extended thinking before high-risk tool calls; visible reasoning in REPL; audit trail in transcripts.
**Addresses:** Table stakes: block destructive commands, visible reasoning. Differentiator: risk-tiered thinking budgets.
**Avoids:** Pitfall 3 (over-refusal) -- must implement scoped deliberation with TTL from day one. Pitfall 9 (obstacle workaround) -- deliberation fires specifically when a worker retries after denial.

### Phase 3: Dynamic Permission Escalation (extend permission system)
**Rationale:** Extends the permission types that every feature depends on. Low risk because it adds to existing types without changing existing behavior. Improves UX for all subsequent features (coordinator workers generate many permission prompts).
**Delivers:** Pattern-based escalation proposals; session-scoped temporary rules; distinct escalation UI.
**Addresses:** Table stakes: never escalate beyond user ceiling, session-scoped only. Differentiator: risk-aware escalation tiers.
**Avoids:** Pitfall 6 (privilege creep) -- session-only scope, forked agent isolation from day one. Pitfall 14 (UI confusion) -- visually distinct escalation prompt.

### Phase 4: CONTEXT_COLLAPSE (query loop modification)
**Rationale:** Modifies the message pipeline in `query.ts` -- the hot path. Needs the permission and deliberation systems stable first. Benefits coordinator mode (multi-agent conversations consume context faster).
**Delivers:** Intelligent span-based context folding as alternative to full compaction; overflow recovery; persistent collapse state across turns.
**Addresses:** Table stakes: automatic trigger, recent message preservation, fallback to compaction. Differentiator: staged collapse pipeline, per-span risk scoring.
**Avoids:** Pitfall 1 (amnesia loop) -- coordination lock with autoCompact. Pitfall 8 (cache invalidation) -- collapse operates at API serialization layer, not by mutating canonical message array. Pitfall 11 (type uncertainty) -- metadata passthrough tests for each custom field.

### Phase 5: COORDINATOR_MODE (multi-agent orchestration)
**Rationale:** Highest complexity among the "partial implementation" features. 370-line coordinator prompt exists; worker lifecycle needs implementation. Needs all tool/permission infrastructure stable. Workers use tools that go through deliberation and permissions.
**Delivers:** Coordinator persona with parallel worker execution; task notification delivery; scratchpad for cross-worker knowledge.
**Addresses:** Table stakes: parallel execution, worker isolation, task notifications. Differentiator: worker continuation via SendMessage.
**Avoids:** Pitfall 4 (file race conditions) -- file reservation system. Pitfall 9 (obstacle bypass) -- hardened canUseTool. Pitfall 12 (thinking inheritance) -- workers use adaptive thinking by default.

### Phase 6: KAIROS (proactive assistant)
**Rationale:** Largest integration surface (100+ files). Depends on memories (dream consolidation), context collapse (proactive sessions generate long contexts), coordinator (proactive multi-agent), and the full permission stack. Cloud API dependency blocks session features -- requires local session storage adapter.
**Delivers:** Proactive mode with channel notifications, dream consolidation, brief mode.
**Addresses:** Table stakes: opt-in activation, sleep when idle, pause on user input. Differentiator: dream consolidation, brief with attachments.
**Avoids:** Pitfall 5 (unwanted proactive actions) -- read-only default, notification-before-action. Pitfall 13 (lock starvation) -- advisory lock with PID check.

### Phase 7: Integration Testing + Hardening
**Rationale:** Feature flag interaction matrix creates 63 non-empty subsets. The three most dangerous pairs must be tested explicitly.
**Delivers:** 8-configuration test matrix (all-off, all-on, 6 solo); dangerous pair tests for CONTEXT_COLLAPSE+EXTRACT_MEMORIES, COORDINATOR_MODE+Dynamic Permission, KAIROS+COORDINATOR_MODE.
**Avoids:** Pitfall 7 (flag interaction explosion).

### Phase Ordering Rationale

- **Dependency depth drives order.** EXTRACT_MEMORIES has zero dependencies on other new features. KAIROS depends on everything. The order follows the dependency graph from ARCHITECTURE.md.
- **Safety infrastructure before stress features.** Deliberation and permission escalation must be stable before coordinator workers start executing unsupervised. Building blocks first, then the features that stress them.
- **Risk isolation.** Each phase modifies a distinct system boundary: Phase 1 touches post-query hooks, Phase 2 touches tool execution, Phase 3 touches permission types, Phase 4 touches the query loop, Phase 5 activates parallel modules, Phase 6 wires everything together. No two phases modify the same file.
- **The GrowthBook gate override (Phase 0) is a hard prerequisite.** Without it, EXTRACT_MEMORIES verification will fail silently because `isExtractModeActive()` calls `getFeatureValue_CACHED_MAY_BE_STALE('tengu_passport_quail', false)` which returns `false` even when the feature flag is `true`.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (CONTEXT_COLLAPSE):** The collapse span selection algorithm (what to collapse, when, how aggressively) has no existing implementation and must be designed from scratch. The interaction with autoCompact's token threshold is the most complex coordination problem in the entire milestone.
- **Phase 5 (COORDINATOR_MODE):** The worker lifecycle (spawn, execute, notify, continue, stop) needs end-to-end verification. The InProcessBackend is the simplest swarm backend but has not been tested in the fork.
- **Phase 6 (KAIROS):** The local session storage adapter must replace Anthropic's cloud API. The 100+ integration points need systematic verification. The sub-feature flags (KAIROS_BRIEF, KAIROS_CHANNELS, KAIROS_DREAM) suggest a phased enablement within this phase.

Phases with standard patterns (skip research-phase):
- **Phase 0 (GrowthBook Override):** 10-line function with a single integration point. Well-understood pattern.
- **Phase 1 (EXTRACT_MEMORIES):** Complete implementation exists. Work is verification and secret scanner addition, not design.
- **Phase 3 (Dynamic Permission Escalation):** The permission system is well-documented (442-line type file). Pattern detection and session-scoped rules are standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified all imports in all gated modules resolve to existing deps. Zero new packages confirmed. |
| Features | HIGH | Table stakes/differentiator analysis grounded in Anthropic engineering docs, Addy Osmani production patterns, and direct codebase inspection. |
| Architecture | HIGH | All integration points verified with file:line references. 3-tier model confirmed by grep counts (35 files for COORDINATOR, 100+ for KAIROS). |
| Pitfalls | MEDIUM-HIGH | Decompilation risks HIGH (direct code inspection). Behavioral risks MEDIUM (Mythos system card findings via secondary analysis, not direct Anthropic publication). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **KAIROS cloud API replacement:** `sessionHistory.ts` calls Anthropic's `/v1/sessions/{id}/events`. The local adapter design needs validation -- will the existing `sessionStorage.ts` data model support KAIROS's session discovery and history features, or does it need schema changes?
- **Forked agent Bun compatibility:** `runForkedAgent` spawns a parallel API call. Whether this works correctly under Bun's event loop (vs Node.js) has not been verified at runtime. Phase 1 must include a smoke test.
- **Deliberation prompt engineering:** The risk classifier output feeds into a thinking prompt that must reliably produce PROCEED/CONFIRM_ONCE/DENY classifications. No existing prompt template exists. This needs iterative testing during Phase 2.
- **Coordinator worker notification delivery:** The `<task-notification>` message format is defined in the coordinator prompt, but the delivery mechanism (how worker results arrive in the coordinator's message stream) needs implementation verification against the existing `InProcessBackend`.
- **React Compiler artifact interference:** New UI components (EscalationPrompt, deliberation indicator) must compose with decompiled components that have `_c()` memoization artifacts. Memoization conflicts are a known risk per PITFALLS.md.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all gated modules, integration points, and stub implementations (file:line references throughout ARCHITECTURE.md)
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic Claude Code Auto Mode Engineering Blog](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [Anthropic Mythos System Card](https://red.anthropic.com/2026/mythos-preview/) (via secondary analysis)
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

### Secondary (MEDIUM confidence)
- [Addy Osmani: The Code Agent Orchestra](https://addyosmani.com/blog/code-agent-orchestra/) -- multi-agent coordination patterns, 3-5 worker sweet spot
- [Anthropic Emotion Concepts Research](https://www.anthropic.com/research/emotion-concepts-function) -- sycophancy/emotion correlation
- [Palo Alto Unit42 - Indirect Prompt Injection Poisons AI Long-Term Memory](https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory/)
- [Claude Code Compaction Work Destruction](https://dev.to/gonewx/claude-code-compaction-keeps-destroying-my-work-heres-my-fix-9he) -- amnesia loop patterns

### Tertiary (LOW confidence)
- KAIROS full implementation feasibility -- cloud API dependency makes session features speculative without local adapter validation
- React Compiler artifact interference -- theoretical risk based on codebase structure, not observed failures

---

## Post-Expansion Addendum (2026-04-08, CTO Directive)

**This SUMMARY was written when v2.0 was 6 features / 8 phases / 29 requirements.**
**The scope has since expanded to 10 phases / 38 requirements / 11 categories.**

### What Changed After This Summary Was Written

1. **Multi-Model Provider Architecture (Phase 12):** 6 new requirements (PROV-01 through PROV-06) for OpenAI, Gemini, MiniMax, xAI, Xiaomi, and local model support via OpenAI-compatible adapter.
2. **Evolution Pipeline (Phase 14):** 3 new requirements (EVOL-01 through EVOL-03) for adversarial evaluation, release notes, and metrics dashboard.
3. **UI/Integration renumbered to Phase 13:** Was Phase 12, now Phase 13 to accommodate provider phase.
4. **3 Security Requirements Promoted from Pitfalls:**
   - SEC-01: Memory extraction MUST NOT persist credential patterns
   - SEC-02: Permission escalations scoped to process PID
   - SEC-03: Coordinator workers blocked from BashTool writes to reserved paths

### Adversarial Review Findings Incorporated

- **Codex (GPT-5.4):** Document inconsistencies fixed. Provider story acknowledged as needing Phase 12 design. Safety promoted from guidance to invariants (SEC-01/02/03).
- **MiniMax Hermes:** Mythos findings reclassified as testable hypotheses, not ground truth. "Session" formally defined as process lifetime.
- **Gemini 3.1 Pro:** Review pending at time of addendum.

### Validity

The original 6-feature analysis (EXTRACT_MEMORIES through KAIROS) remains accurate. The expansion adds scope but does not invalidate the dependency chain, pitfall analysis, or architectural integration mapping.

---
*Research completed: 2026-04-08*
*Addendum: 2026-04-08 (CTO Directive)*
*Ready for roadmap: yes*
