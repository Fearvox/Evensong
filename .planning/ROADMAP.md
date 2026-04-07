# Roadmap: CCB (Claude Code Best)

## Overview

CCB begins as a working decompiled CLI and ends this milestone as a maintainable, testable, engineering-quality codebase. Six phases move from the foundation outward: types and state first (nothing else can be correct without them), then tools, then the API layer, then the query loop and permission system, then feature flags and MCP transport, and finally the REPL/UI cleanup. Each phase delivers one complete, verifiable capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation Hardening** - Core types and state layer carry correct annotations; test infrastructure is operational
- [ ] **Phase 2: Core Tool Reliability** - BashTool, FileEditTool, GrepTool, and AgentTool each handle errors correctly and have integration tests
- [ ] **Phase 3: API & Streaming Resilience** - Streaming layer recovers from network failures; provider switching works; history writes atomically
- [ ] **Phase 4: Query Loop & Permission System** - Multi-turn query loop is correct; permission enforcement is reliable across session turns
- [ ] **Phase 5: Feature Flags & MCP Transport** - Feature flag dependency graph is documented and CI-gated; MCP stdio and SSE transports connect correctly
- [ ] **Phase 6: REPL/UI Cleanup** - React Compiler boilerplate removed; REPL decomposed into focused components; Ink snapshot tests established

## Phase Details

### Phase 1: Foundation Hardening
**Goal**: Core type definitions and state layer carry correct, non-decompiled annotations; test infrastructure can run and report coverage
**Depends on**: Nothing (first phase)
**Requirements**: TYPE-01, TYPE-02, TYPE-03, TYPE-04, TYPE-05, TEST-01, TEST-05
**Success Criteria** (what must be TRUE):
  1. `bun test` runs without setup errors and reports pass/fail for all test files
  2. `message.ts` and `permissions.ts` types resolve without `unknown`/`never`/`{}` on their public interfaces
  3. `AppStateStore` and bootstrap singletons are annotated so TypeScript can infer their shapes without casting
  4. `Tool.ts` input/output generics are precise — a new tool definition triggers a type error if required fields are missing
  5. Importing the Anthropic SDK `BetaRawMessageStreamEvent` type and a Zod schema that validates it both compile without suppression
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Strict-mode tsconfig overlay + core type hardening (message.ts, permissions.ts, state layer) + type shape test scaffolding
- [x] 01-02-PLAN.md — Zod stream event schema at API boundary + coverage tracking established

### Phase 2: Core Tool Reliability
**Goal**: The four core tools (Bash, FileEdit, Grep, Agent) handle their failure modes correctly and have integration tests proving it
**Depends on**: Phase 1
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TEST-02
**Success Criteria** (what must be TRUE):
  1. A bash command that exits non-zero returns that exit code and error output to the caller — it does not silently succeed
  2. A file edit that is interrupted mid-write does not produce a corrupted file
  3. GrepTool run against a directory containing binary files returns text matches and skips binaries without crashing
  4. AgentTool nested subagent invocation receives the correct `ToolUseContext` — the subagent can call tools
  5. `bun test` includes integration test suites for all four tools, covering happy path and at least one error case each
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Shared ToolUseContext test factory + BashTool integration tests (error propagation, exit codes)
- [ ] 02-02-PLAN.md — FileEditTool (atomic write, corruption prevention) + GrepTool (binary skip, large results) integration tests
- [ ] 02-03-PLAN.md — AgentTool context propagation tests + full tool test suite verification

### Phase 3: API & Streaming Resilience
**Goal**: The streaming layer recovers from network errors automatically; provider switching requires no code changes; aborted streams leave history intact
**Depends on**: Phase 1
**Requirements**: API-01, API-02, API-03, API-04, API-05, TEST-03
**Success Criteria** (what must be TRUE):
  1. A simulated ECONNRESET during a streaming response triggers automatic retry and the conversation continues without user action
  2. A stream that stops producing events for longer than the idle timeout is detected and recovered — the CLI does not hang indefinitely
  3. Setting the provider env var to Bedrock or Vertex results in successful API calls without editing source code
  4. Aborting a response mid-stream produces a complete, readable history file with no partial or corrupted entries
  5. `bun test` includes streaming tests covering retry, timeout, abort, and provider switching scenarios
**Plans**: TBD

### Phase 4: Query Loop & Permission System
**Goal**: The multi-turn query loop correctly handles tool-use responses; permission prompts appear before execution; permission state persists correctly across turns
**Depends on**: Phase 2, Phase 3
**Requirements**: QUERY-01, QUERY-02, QUERY-03, QUERY-04, PERM-01, PERM-02, PERM-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. A response containing multiple tool-use blocks executes all tools and sends their results back in a single follow-up message
  2. When the conversation context approaches the compaction boundary, recent messages are preserved and the CLI continues without error
  3. Resuming a saved session loads the prior conversation state and the assistant references earlier messages correctly
  4. Cancelling a response mid-turn leaves the CLI in a state where the next user message succeeds
  5. A tool configured for "ask" permission mode displays a prompt before executing — it does not execute silently
  6. Permission grants and denials from earlier in the session are honored in later turns without re-prompting for the same tool
**Plans**: TBD

### Phase 5: Feature Flags & MCP Transport
**Goal**: The feature flag system is documented, CI-verified, and validated at runtime; MCP stdio and SSE transports connect and exchange messages correctly
**Depends on**: Phase 4
**Requirements**: FLAG-01, FLAG-02, FLAG-03, MCP-01, MCP-02, MCP-03, MCP-04
**Success Criteria** (what must be TRUE):
  1. A written dependency graph exists showing which feature flags gate which modules, so a developer knows what to enable before using a flag
  2. CI fails if the CLI does not start cleanly with all feature flags in their default-off state
  3. Enabling a flag that requires an unavailable module produces a clear error at startup rather than a crash at call time
  4. An MCP server connected via stdio receives and responds to tool list and tool call requests from the CLI
  5. MCP-provided tools appear alongside built-in tools in the tool list the CLI sends to the API
**Plans**: TBD

### Phase 6: REPL/UI Cleanup
**Goal**: React Compiler decompilation boilerplate is removed from core components; REPL.tsx is decomposed into focused units; Ink snapshot tests establish a regression baseline
**Depends on**: Phase 4
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Core components (Messages.tsx, MessageRow.tsx, PromptInput) contain no `_c()` memoization boilerplate — the source reads as normal React
  2. REPL.tsx is split into at least 3 focused components, each with a single identifiable responsibility
  3. `bun test` includes Ink snapshot tests for message rendering and prompt input that fail if the output changes unexpectedly
  4. Component imports from any single file reference fewer than 20 modules (down from 80+)
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation Hardening | 2/2 | Complete | 2026-04-07 |
| 2. Core Tool Reliability | 0/3 | Planned | - |
| 3. API & Streaming Resilience | 0/TBD | Not started | - |
| 4. Query Loop & Permission System | 0/TBD | Not started | - |
| 5. Feature Flags & MCP Transport | 0/TBD | Not started | - |
| 6. REPL/UI Cleanup | 0/TBD | Not started | - |
