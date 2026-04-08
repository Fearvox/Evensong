# Requirements: CCB v2.0 Agent Intelligence Enhancement

**Defined:** 2026-04-08
**Core Value:** A working, modifiable Claude Code CLI that developers can study, extend, and customize -- now evolving into an intelligent agent platform

## Overview

8 categories, 29 requirements. Covers 6 new agent intelligence capabilities + v1.0 Phase 5-6 carryover + integration testing.

## Requirements

### Infrastructure (INFRA)
- [ ] **INFRA-01**: GrowthBook gate override layer routes `tengu_*` runtime checks through local config file (`~/.claude/feature-flags.json`)
- [ ] **INFRA-02**: Feature flag dependency graph is documented and CI-gatable (carried from v1.0 Phase 5)
- [ ] **INFRA-03**: MCP stdio and SSE transports connect correctly (carried from v1.0 Phase 5)

### Memory (MEM)
- [ ] **MEM-01**: Cross-session memories are extracted automatically after conversation ends via forked agent
- [ ] **MEM-02**: Extracted memories load automatically in future sessions via context.ts
- [ ] **MEM-03**: Secret scanner prevents API keys/credentials from leaking to persistent memory storage

### Deliberation (DELIB)
- [ ] **DELIB-01**: High-risk tool calls (rm, git push --force, --no-verify, DB mutations) trigger visible reasoning before execution
- [ ] **DELIB-02**: Risk scoring classifies tool calls into PROCEED/CONFIRM_ONCE/DENY tiers based on command content
- [ ] **DELIB-03**: Deliberation memory with scope tags and TTL prevents over-refusal death spiral in multi-step workflows

### Permissions (PERM)
- [ ] **PERM-04**: User can grant session-scoped temporary permission escalations when agent requests elevated access
- [ ] **PERM-05**: Dynamic escalations expire at session end and never persist to project settings
- [ ] **PERM-06**: Forked agents (memory extraction, dream) do NOT inherit dynamic escalations from parent session

### Context (CTX)
- [ ] **CTX-01**: Context collapse identifies stale message spans and replaces them with short summaries in-place
- [ ] **CTX-02**: Recent messages (last N turns) always retain full fidelity and are never collapse candidates
- [ ] **CTX-03**: Collapse and autocompact coordinate via shared lock -- no race condition, no orphaned metadata
- [ ] **CTX-04**: Session restore correctly rebuilds collapsed spans from transcript commit/snapshot entries

### Coordinator (COORD)
- [ ] **COORD-01**: Coordinator mode launches and manages parallel worker agents with task assignment
- [ ] **COORD-02**: File reservation system in canUseTool prevents concurrent writes to same file path
- [ ] **COORD-03**: Workers receive correct ToolUseContext and can call all standard tools
- [ ] **COORD-04**: SendMessage tool delivers notifications between coordinator and workers reliably

### Proactive (KAIROS)
- [ ] **KAIROS-01**: Proactive mode activates only via explicit user opt-in (`--proactive` flag or config)
- [ ] **KAIROS-02**: Local session storage adapter replaces inaccessible cloud `/v1/sessions/{id}/events` API
- [ ] **KAIROS-03**: Brief system shows proactive suggestions without interrupting active user workflow
- [ ] **KAIROS-04**: Dream consolidation runs across sessions with time-based and session-count gates

### UI (UI)
- [ ] **UI-01**: React Compiler `_c()` memoization boilerplate removed from core components (carried from v1.0 Phase 6)
- [ ] **UI-02**: REPL.tsx decomposed into focused sub-components with clear boundaries
- [ ] **UI-03**: Ink snapshot tests established for key UI states (message rendering, permission prompts, status bar)

### Integration (INT)
- [ ] **INT-01**: 8-config test matrix covers critical feature flag combinations (collapse+compact, delib+coordinator, etc.)
- [ ] **INT-02**: Dangerous-pair tests verify deliberation + coordinator + permission interactions don't create deadlocks

## Future Requirements (Deferred)

- Full KAIROS channel stack (push notifications, GitHub webhooks) -- too many cloud API unknowns
- File ownership enforcement in coordinator mode -- needs runtime path tracking
- Command rewriting after deliberation -- requires thinking output feedback loop
- Channel-based permission routing -- depends on KAIROS channel system

## Out of Scope

- Computer Use (@ant/* packages) -- requires proprietary Anthropic infra
- NAPI packages (audio, image, url, modifiers) -- native bindings not available
- Analytics / GrowthBook / Sentry -- telemetry not needed (we bypass GrowthBook gates, not run the service)
- Full KAIROS cloud integration -- Anthropic's session API is inaccessible

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 5 | Pending |
| INFRA-02 | Phase 5 | Pending |
| INFRA-03 | Phase 5 | Pending |
| MEM-01 | Phase 6 | Pending |
| MEM-02 | Phase 6 | Pending |
| MEM-03 | Phase 6 | Pending |
| DELIB-01 | Phase 7 | Pending |
| DELIB-02 | Phase 7 | Pending |
| DELIB-03 | Phase 7 | Pending |
| PERM-04 | Phase 8 | Pending |
| PERM-05 | Phase 8 | Pending |
| PERM-06 | Phase 8 | Pending |
| CTX-01 | Phase 9 | Pending |
| CTX-02 | Phase 9 | Pending |
| CTX-03 | Phase 9 | Pending |
| CTX-04 | Phase 9 | Pending |
| COORD-01 | Phase 10 | Pending |
| COORD-02 | Phase 10 | Pending |
| COORD-03 | Phase 10 | Pending |
| COORD-04 | Phase 10 | Pending |
| KAIROS-01 | Phase 11 | Pending |
| KAIROS-02 | Phase 11 | Pending |
| KAIROS-03 | Phase 11 | Pending |
| KAIROS-04 | Phase 11 | Pending |
| UI-01 | Phase 12 | Pending |
| UI-02 | Phase 12 | Pending |
| UI-03 | Phase 12 | Pending |
| INT-01 | Phase 12 | Pending |
| INT-02 | Phase 12 | Pending |
