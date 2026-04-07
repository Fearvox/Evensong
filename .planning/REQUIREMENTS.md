# Requirements: CCB (Claude Code Best)

**Defined:** 2026-04-06
**Core Value:** A working, modifiable Claude Code CLI that developers can study, extend, and customize

## v1 Requirements

Requirements for engineering maturity milestone. Each maps to roadmap phases.

### Type Safety

- [ ] **TYPE-01**: Core type definitions (message.ts, permissions.ts) have correct, non-decompiled types
- [ ] **TYPE-02**: tsconfig.strict.json overlay enforces strict mode on all new/recovered files
- [ ] **TYPE-03**: State layer types (AppStateStore, bootstrap singletons) are correctly annotated
- [ ] **TYPE-04**: Tool interface type (Tool.ts) uses precise generics instead of unknown/never/{}
- [ ] **TYPE-05**: API client boundary types match Anthropic SDK BetaRawMessageStreamEvent shape (verified with Zod)

### Tool Reliability

- [ ] **TOOL-01**: BashTool correctly propagates errors, handles timeouts, and reports exit codes
- [ ] **TOOL-02**: FileEditTool applies diffs without file corruption under partial writes
- [ ] **TOOL-03**: GrepTool handles large result sets and binary file detection
- [ ] **TOOL-04**: AgentTool subagent recursion works with correct ToolUseContext propagation
- [ ] **TOOL-05**: Each core tool has integration tests covering happy path and error cases

### API & Streaming

- [ ] **API-01**: Streaming handles ECONNRESET/EPIPE/ETIMEDOUT with automatic retry (p-retry)
- [ ] **API-02**: Idle timeout wrapper detects and recovers from frozen streams (thinking block hang)
- [ ] **API-03**: Provider switching (Anthropic/Bedrock/Vertex) works without code changes
- [ ] **API-04**: Stream abort path writes history atomically (temp file + rename, no partial state)
- [ ] **API-05**: claude.ts type annotations match SDK event types without unsafe casts

### Query Loop

- [ ] **QUERY-01**: query.ts turn loop handles multi-tool-use responses correctly
- [ ] **QUERY-02**: Context compaction triggers at safe boundary and preserves recent context
- [ ] **QUERY-03**: QueryEngine session resume loads correct conversation state
- [ ] **QUERY-04**: Abort/cancel mid-turn leaves conversation in recoverable state

### Permission System

- [ ] **PERM-01**: Tool permission prompt displays before execution (fix inherited upstream bug)
- [ ] **PERM-02**: Permission modes (ask, auto-approve, deny) enforce correctly per tool
- [ ] **PERM-03**: Permission state persists correctly across session turns

### Testing

- [ ] **TEST-01**: ink-testing-library installed and verified working with Bun runtime
- [ ] **TEST-02**: Core tool modules have integration test suites (BashTool, FileEditTool, GrepTool)
- [ ] **TEST-03**: API streaming has tests covering retry, timeout, abort, and provider switching
- [ ] **TEST-04**: Query loop has tests covering multi-turn, compaction, and abort scenarios
- [ ] **TEST-05**: Test coverage tracking established for recovered modules

### Feature Flags

- [ ] **FLAG-01**: Feature flag dependency graph documented (which flags depend on what modules)
- [ ] **FLAG-02**: CI gate verifies CLI starts with all flags off (default-safe)
- [ ] **FLAG-03**: Flag enablement has runtime validation that checks required module availability

### MCP

- [ ] **MCP-01**: MCP stdio transport connects and exchanges messages correctly
- [ ] **MCP-02**: MCP SSE transport works for remote server connections
- [ ] **MCP-03**: OAuth dead code removed (replaced with simplified auth or no auth)
- [ ] **MCP-04**: Tool list correctly includes MCP-provided tools alongside built-in tools

### UI Cleanup

- [ ] **UI-01**: React Compiler _c() boilerplate removed via ts-morph codemod from core components
- [ ] **UI-02**: REPL.tsx refactored into smaller components with clear responsibilities
- [ ] **UI-03**: Ink snapshot tests established for message rendering and prompt input
- [ ] **UI-04**: Component imports reduced from 80+ to manageable module boundaries

## v2 Requirements

### Advanced Features

- **ADV-01**: Multi-model routing (use different models for different task types)
- **ADV-02**: Custom tool registration API for user-defined tools
- **ADV-03**: Session persistence and resume across CLI restarts
- **ADV-04**: Configurable system prompt injection points

### Developer Experience

- **DX-01**: Architecture documentation for contributors
- **DX-02**: Plugin system for third-party tool extensions
- **DX-03**: Debug mode with verbose logging of API calls and tool execution

## Out of Scope

| Feature | Reason |
|---------|--------|
| Computer Use (@ant/* packages) | Requires proprietary Anthropic infrastructure |
| NAPI native bindings (audio, image, url) | Native binding source not available |
| Analytics / GrowthBook / Sentry | Telemetry not needed for open source |
| Magic Docs / Voice Mode / LSP Server | Secondary features, high complexity |
| Plugins / Marketplace | Too coupled to Anthropic platform |
| Full MCP OAuth | Anthropic-platform-specific complexity |
| Node.js compatibility | Bun is the sole runtime; not worth maintaining dual support |
| Auto-commit on edit | High risk, low value |
| Real-time collaboration | Out of scope for CLI tool |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TYPE-01 | — | Pending |
| TYPE-02 | — | Pending |
| TYPE-03 | — | Pending |
| TYPE-04 | — | Pending |
| TYPE-05 | — | Pending |
| TOOL-01 | — | Pending |
| TOOL-02 | — | Pending |
| TOOL-03 | — | Pending |
| TOOL-04 | — | Pending |
| TOOL-05 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| API-05 | — | Pending |
| QUERY-01 | — | Pending |
| QUERY-02 | — | Pending |
| QUERY-03 | — | Pending |
| QUERY-04 | — | Pending |
| PERM-01 | — | Pending |
| PERM-02 | — | Pending |
| PERM-03 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |
| FLAG-01 | — | Pending |
| FLAG-02 | — | Pending |
| FLAG-03 | — | Pending |
| MCP-01 | — | Pending |
| MCP-02 | — | Pending |
| MCP-03 | — | Pending |
| MCP-04 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 0
- Unmapped: 38 (pending roadmap creation)

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after initial definition*
