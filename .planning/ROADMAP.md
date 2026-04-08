# Roadmap: CCB (Claude Code Best)

## Milestones

- v1.0 Foundation & Core Reliability (Phases 1-4, shipped 2026-04-08)
- v2.0 Agent Intelligence Enhancement (Phases 5-14, in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>v1.0 Foundation & Core Reliability (Phases 1-4) - SHIPPED 2026-04-08</summary>

- [x] **Phase 1: Foundation Hardening** - Core types and state layer carry correct annotations; test infrastructure is operational
- [x] **Phase 2: Core Tool Reliability** - BashTool, FileEditTool, GrepTool, and AgentTool each handle errors correctly and have integration tests
- [x] **Phase 3: API & Streaming Resilience** - Streaming layer recovers from network failures; provider switching works; history writes atomically
- [x] **Phase 4: Query Loop & Permission System** - Multi-turn query loop is correct; permission enforcement is reliable across session turns (completed 2026-04-08)

### Phase 1: Foundation Hardening
**Goal**: Core type definitions and state layer carry correct, non-decompiled annotations; test infrastructure can run and report coverage
**Depends on**: Nothing (first phase)
**Requirements**: TYPE-01, TYPE-02, TYPE-03, TYPE-04, TYPE-05, TEST-01, TEST-05
**Success Criteria** (what must be TRUE):
  1. `bun test` runs without setup errors and reports pass/fail for all test files
  2. `message.ts` and `permissions.ts` types resolve without `unknown`/`never`/`{}` on their public interfaces
  3. `AppStateStore` and bootstrap singletons are annotated so TypeScript can infer their shapes without casting
  4. `Tool.ts` input/output generics are precise -- a new tool definition triggers a type error if required fields are missing
  5. Importing the Anthropic SDK `BetaRawMessageStreamEvent` type and a Zod schema that validates it both compile without suppression
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- Strict-mode tsconfig overlay + core type hardening (message.ts, permissions.ts, state layer) + type shape test scaffolding
- [x] 01-02-PLAN.md -- Zod stream event schema at API boundary + coverage tracking established

### Phase 2: Core Tool Reliability
**Goal**: The four core tools (Bash, FileEdit, Grep, Agent) handle their failure modes correctly and have integration tests proving it
**Depends on**: Phase 1
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TEST-02
**Success Criteria** (what must be TRUE):
  1. A bash command that exits non-zero returns that exit code and error output to the caller -- it does not silently succeed
  2. A file edit that is interrupted mid-write does not produce a corrupted file
  3. GrepTool run against a directory containing binary files returns text matches and skips binaries without crashing
  4. AgentTool nested subagent invocation receives the correct `ToolUseContext` -- the subagent can call tools
  5. `bun test` includes integration test suites for all four tools, covering happy path and at least one error case each
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md -- Shared ToolUseContext test factory + BashTool integration tests (error propagation, exit codes)
- [x] 02-02-PLAN.md -- FileEditTool (atomic write, corruption prevention) + GrepTool (binary skip, large results) integration tests
- [x] 02-03-PLAN.md -- AgentTool context propagation tests + full tool test suite verification

### Phase 3: API & Streaming Resilience
**Goal**: The streaming layer recovers from network errors automatically; provider switching requires no code changes; aborted streams leave history intact
**Depends on**: Phase 1
**Requirements**: API-01, API-02, API-03, API-04, API-05, TEST-03
**Success Criteria** (what must be TRUE):
  1. A simulated ECONNRESET during a streaming response triggers automatic retry and the conversation continues without user action
  2. A stream that stops producing events for longer than the idle timeout is detected and recovered -- the CLI does not hang indefinitely
  3. Setting the provider env var to Bedrock or Vertex results in successful API calls without editing source code
  4. Aborting a response mid-stream produces a complete, readable history file with no partial or corrupted entries
  5. `bun test` includes streaming tests covering retry, timeout, abort, and provider switching scenarios
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md -- withRetry utility tests + provider switching tests (API-01, API-03)
- [x] 03-02-PLAN.md -- Atomic history writes + finalizeHistoryOnAbort (API-04)
- [x] 03-03-PLAN.md -- Unconditional watchdog + Zod schema wiring in claude.ts (API-02, API-05)

### Phase 4: Query Loop & Permission System
**Goal**: The multi-turn query loop correctly handles tool-use responses; permission prompts appear before execution; permission state persists correctly across turns
**Depends on**: Phase 2, Phase 3
**Requirements**: QUERY-01, QUERY-02, QUERY-03, QUERY-04, PERM-01, PERM-02, PERM-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. A response containing multiple tool-use blocks executes all tools and sends their results back in a single follow-up message
  2. When the conversation context approaches the compaction boundary, recent messages are preserved and the CLI continues without error
  3. Resuming a saved session loads the prior conversation state and the assistant references earlier messages correctly
  4. Cancelling a response mid-turn leaves the CLI in a state where the next user message succeeds
  5. A tool configured for "ask" permission mode displays a prompt before executing -- it does not execute silently
  6. Permission grants and denials from earlier in the session are honored in later turns without re-prompting for the same tool
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md -- Permission unit tests: hasPermissionsToUseTool() deny/ask/allow modes + PERM-01 resolution (PERM-01, PERM-02)
- [x] 04-02-PLAN.md -- Compaction boundary tests: calculateTokenWarningState() and isAutoCompactEnabled() with env overrides (QUERY-02)
- [x] 04-03-PLAN.md -- Session resume tests: loadTranscriptFile() + buildConversationChain() with temp JSONL files (QUERY-03)
- [x] 04-04-PLAN.md -- Query loop integration tests: multi-tool batching, abort exit paths, permission persistence (QUERY-01, QUERY-04, PERM-03, TEST-04)

</details>

### v2.0 Agent Intelligence Enhancement (In Progress)

**Milestone Goal:** Evolve CCB from a working CLI into an intelligent agent platform by unlocking 6 major capabilities hidden behind feature flags, adding safety infrastructure, and polishing the UI.

- [ ] **Phase 5: Infrastructure & Gate Override** - GrowthBook gate bypass, feature flag dependency graph, and MCP transport connectivity
- [ ] **Phase 6: Memory Extraction** - Cross-session memories extracted automatically, loaded in future sessions, with secret scanning
- [ ] **Phase 7: Deliberation Checkpoint** - High-risk tool calls trigger visible reasoning; risk scoring classifies actions into safety tiers
- [ ] **Phase 8: Dynamic Permission Escalation** - Session-scoped temporary permission grants with isolation from forked agents
- [ ] **Phase 9: Context Collapse** - Intelligent context folding replaces stale message spans with summaries while preserving recent fidelity
- [ ] **Phase 10: Coordinator Mode** - Multi-agent orchestration with parallel workers, file reservation, and task notification delivery
- [ ] **Phase 11: KAIROS Proactive** - Opt-in proactive assistant with local session storage, brief suggestions, and dream consolidation
- [ ] **Phase 12: Multi-Model Provider Architecture** - OpenAI-compatible adapter, provider router with difficulty-based routing, fallback chains, API key management
- [ ] **Phase 13: UI Cleanup & Integration Testing** - React Compiler artifact removal, REPL decomposition, and cross-feature integration test matrix
- [ ] **Phase 14: Evolution Pipeline** - Adversarial evaluation, release note generation, metrics dashboard, self-iteration cycle

## Phase Details

### Phase 5: Infrastructure & Gate Override
**Goal**: All feature-flagged code paths can be activated at runtime; MCP transports connect correctly; the feature flag dependency graph is documented
**Depends on**: Phase 4 (v1.0 complete)
**Requirements**: INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. Setting a flag in `~/.claude/feature-flags.json` causes the corresponding `tengu_*` gate to return the configured value instead of the GrowthBook default
  2. A developer can look up which modules a given feature flag gates, and which flags must be co-enabled, from a single reference document
  3. An MCP server connected via stdio receives tool-list and tool-call requests from the CLI, and MCP-provided tools appear in the tool list sent to the API
**Plans**: TBD

Plans:
- (plans TBD -- not yet planned)

### Phase 6: Memory Extraction
**Goal**: The CLI automatically extracts cross-session memories after conversations and loads them in future sessions, without leaking secrets
**Depends on**: Phase 5 (gate override enables EXTRACT_MEMORIES)
**Requirements**: MEM-01, MEM-02, MEM-03
**Success Criteria** (what must be TRUE):
  1. After a conversation ends, a background agent extracts learned facts and stores them in the project memory directory
  2. Starting a new session in the same project directory loads previously extracted memories into the system context
  3. A memory extraction that encounters an API key, credential, or secret pattern in candidate content discards that content before writing to disk
**Plans**: TBD

Plans:
- (plans TBD -- not yet planned)

### Phase 7: Deliberation Checkpoint
**Goal**: High-risk tool calls are intercepted for visible reasoning before execution; risk scoring prevents both unchecked destructive actions and over-refusal paralysis
**Depends on**: Phase 5 (infrastructure), Phase 6 (memory -- deliberation can reference learned context)
**Requirements**: DELIB-01, DELIB-02, DELIB-03
**Success Criteria** (what must be TRUE):
  1. A tool call containing a destructive command (`rm -rf`, `git push --force`, `DROP TABLE`) triggers extended thinking output visible in the REPL before the tool executes
  2. The risk scorer classifies tool calls into PROCEED / CONFIRM_ONCE / DENY tiers, and a PROCEED classification does not prompt the user
  3. After a user approves a multi-step plan, subsequent tool calls within that plan's scope execute without redundant deliberation prompts (no over-refusal death spiral)
**Plans**: TBD

Plans:
- (plans TBD -- not yet planned)

### Phase 8: Dynamic Permission Escalation
**Goal**: The agent can request temporary elevated permissions during a session, with strict session-only scope and isolation from forked child agents
**Depends on**: Phase 7 (deliberation provides risk infrastructure that escalation builds on)
**Requirements**: PERM-04, PERM-05, PERM-06
**Success Criteria** (what must be TRUE):
  1. When the agent encounters a permission denial for a tool it needs, it can present a structured escalation request that the user approves or rejects
  2. A permission escalation granted during a session is gone after the session ends -- it does not appear in project settings or persist to disk
  3. A forked agent (memory extraction, dream consolidation) spawned from a session with active escalations operates under the base permission set, not the escalated one
**Plans**: TBD

Plans:
- (plans TBD -- not yet planned)

### Phase 9: Context Collapse
**Goal**: Long conversations are intelligently folded by replacing stale message spans with summaries, while recent messages retain full fidelity and collapsed state survives session restore
**Depends on**: Phase 7, Phase 8 (safety infrastructure must be stable before modifying the query loop hot path)
**Requirements**: CTX-01, CTX-02, CTX-03, CTX-04
**Success Criteria** (what must be TRUE):
  1. When context usage approaches the compaction threshold, stale message spans are replaced with short summaries instead of being deleted entirely
  2. The most recent N turns of conversation are never collapse candidates -- they always retain full message content
  3. Context collapse and autocompact do not race -- enabling both simultaneously does not produce orphaned metadata, infinite loops, or lost messages
  4. Restoring a session that was saved with collapsed spans correctly rebuilds the collapsed state from transcript entries
**Plans**: TBD

Plans:
- (plans TBD -- not yet planned)

### Phase 10: Coordinator Mode
**Goal**: The CLI can operate as a coordinator that launches parallel worker agents, assigns tasks, prevents file conflicts, and delivers notifications between agents
**Depends on**: Phase 7, Phase 8, Phase 9 (workers use deliberation, permissions, and context collapse)
**Requirements**: COORD-01, COORD-02, COORD-03, COORD-04
**Success Criteria** (what must be TRUE):
  1. Activating coordinator mode spawns worker agents that execute assigned tasks in parallel and report results back to the coordinator
  2. Two workers assigned tasks that touch the same file path cannot both proceed -- the file reservation system blocks the second writer
  3. Worker agents receive a complete ToolUseContext and can call all standard tools (Bash, FileEdit, Grep) during task execution
  4. The coordinator can send a notification to a worker via SendMessage, and the worker receives it in its message stream
**Plans**: TBD

Plans:
- (plans TBD -- not yet planned)

### Phase 11: KAIROS Proactive
**Goal**: The CLI supports an opt-in proactive assistant mode that suggests actions without interrupting the user, stores sessions locally, and consolidates knowledge across sessions
**Depends on**: Phase 6, Phase 9, Phase 10 (KAIROS uses memories, context collapse, and multi-agent coordination)
**Requirements**: KAIROS-01, KAIROS-02, KAIROS-03, KAIROS-04
**Success Criteria** (what must be TRUE):
  1. Proactive mode activates only when the user explicitly opts in via `--proactive` flag or configuration setting -- it never activates by default
  2. Session events that KAIROS reads and writes use a local storage adapter instead of Anthropic's cloud `/v1/sessions/{id}/events` API
  3. Proactive suggestions appear as non-blocking notifications that do not interrupt the user's active input or tool execution
  4. Dream consolidation runs between sessions when both a minimum time gap and a minimum session count threshold have been met
**Plans**: TBD

Plans:
- (plans TBD -- not yet planned)

### Phase 12: Multi-Model Provider Architecture
**Goal**: CCB can route requests to 8+ model providers with difficulty-based routing, graceful fallback, and unified API key management
**Depends on**: Phase 5 (infrastructure must be stable; provider router in src/utils/model/providers.ts)
**Requirements**: PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PROV-06
**Success Criteria** (what must be TRUE):
  1. A user can configure an OpenAI-compatible endpoint (MiniMax, xAI, Xiaomi, Jan) in config and the CLI sends requests to it
  2. The provider router selects model based on task difficulty score (existing model-router hook pattern)
  3. When a provider returns an error or times out, the fallback chain tries the next provider automatically
  4. API keys for all providers are loaded from env vars or `~/.claude/provider-keys.json` without hardcoding
  5. A model capability matrix declares which providers support which features (tools, streaming, thinking)
**Plans**: TBD

Plans:
- (plans TBD -- not yet planned)

### Phase 13: UI Cleanup & Integration Testing
**Goal**: Core UI components are cleaned of decompilation artifacts, the REPL is decomposed into focused units, and a cross-feature integration test matrix validates dangerous flag combinations
**Depends on**: Phase 11, Phase 12 (all features and providers must be stable before integration testing)
**Requirements**: UI-01, UI-02, UI-03, INT-01, INT-02
**Success Criteria** (what must be TRUE):
  1. Core components (Messages.tsx, MessageRow.tsx, PromptInput) contain no `_c()` React Compiler memoization boilerplate -- the source reads as standard React
  2. REPL.tsx is decomposed into at least 3 focused sub-components, each with a single identifiable responsibility
  3. `bun test` includes Ink snapshot tests for message rendering, permission prompts, and status bar states
  4. An 8-configuration test matrix covers all-off, all-on, and 6 solo feature flag states, and all configurations pass
  5. Dangerous-pair tests (deliberation + coordinator, collapse + compact, coordinator + permission escalation) verify no deadlocks or race conditions
**Plans**: TBD
**UI hint**: yes

Plans:
- (plans TBD -- not yet planned)

### Phase 14: Evolution Pipeline
**Goal**: CCB has a self-iteration cycle: adversarial evaluation across models, automated release note generation, and a metrics dashboard tracking agent quality per release
**Depends on**: Phase 12 (multi-model needed for cross-model adversarial evaluation)
**Requirements**: EVOL-01, EVOL-02, EVOL-03
**Success Criteria** (what must be TRUE):
  1. Running a CLI command triggers adversarial evaluation against the current codebase using 2+ different model providers
  2. Conventional commits since last tag are parsed into a structured changelog with categories (feat/fix/test/docs)
  3. A metrics file tracks test count, pass rate, feature flag coverage, and destructive action rate per release
**Plans**: TBD

Plans:
- (plans TBD -- not yet planned)

## Progress

**Execution Order:**
Phases execute in numeric order: 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation Hardening | v1.0 | 2/2 | Complete | 2026-04-07 |
| 2. Core Tool Reliability | v1.0 | 3/3 | Complete | 2026-04-07 |
| 3. API & Streaming Resilience | v1.0 | 3/3 | Complete | 2026-04-07 |
| 4. Query Loop & Permission System | v1.0 | 4/4 | Complete | 2026-04-08 |
| 5. Infrastructure & Gate Override | v2.0 | 0/TBD | Not started | - |
| 6. Memory Extraction | v2.0 | 0/TBD | Not started | - |
| 7. Deliberation Checkpoint | v2.0 | 0/TBD | Not started | - |
| 8. Dynamic Permission Escalation | v2.0 | 0/TBD | Not started | - |
| 9. Context Collapse | v2.0 | 0/TBD | Not started | - |
| 10. Coordinator Mode | v2.0 | 0/TBD | Not started | - |
| 11. KAIROS Proactive | v2.0 | 0/TBD | Not started | - |
| 12. Multi-Model Provider Architecture | v2.0 | 0/TBD | Not started | - |
| 13. UI Cleanup & Integration Testing | v2.0 | 0/TBD | Not started | - |
| 14. Evolution Pipeline | v2.0 | 0/TBD | Not started | - |
