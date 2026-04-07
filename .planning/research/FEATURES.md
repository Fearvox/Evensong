# Feature Landscape

**Domain:** AI CLI coding assistant (decompiled recovery project)
**Project:** CCB — Claude Code reimagined as hackable open-source CLI
**Researched:** 2026-04-06
**Research mode:** Ecosystem — what the market expects and what differentiates

---

## Table Stakes

Features users expect. Missing = product feels broken or incomplete. Based on analysis of Claude Code, Aider, OpenCode, Gemini CLI, Continue.dev, and Cline.

| Feature | Why Expected | Complexity | Recovery Status in CCB |
|---------|--------------|------------|------------------------|
| **Streaming responses** | Every major tool streams tokens as they arrive — buffered feels broken | Low | Exists in `query.ts` via Anthropic SDK event loop; reliability needs hardening |
| **Tool execution (Bash)** | Core loop of agentic coding: write, run, observe, iterate | Medium | `BashTool` exists; reliability and sandboxing need work |
| **File read/write tools** | Can't edit code without file access | Low | `FileEditTool`, `GrepTool` exist; tsc errors may mask edge cases |
| **Multi-file edit awareness** | Single-file edits are not enough for real refactors | High | `FileEditTool` + `AgentTool`; needs verification |
| **Conversation history / REPL loop** | Users expect an interactive session, not one-shot queries | Medium | `REPL.tsx` + `QueryEngine.ts` exist; compaction reliability unknown |
| **Context window management** | All tools handle context limits — letting it crash silently is unacceptable | Medium | Compaction exists in `QueryEngine.ts`; behavior under pressure unverified |
| **CLAUDE.md / project config** | Users configure behavior per-project; without it the tool ignores team conventions | Low | `src/utils/claudemd.ts` exists; correctness should be verified |
| **Pipe / non-interactive mode** | CI pipelines and scripting require `echo "..." | tool -p` operation | Low | Implemented via `cli.tsx` pipe mode; likely solid from Phase 1 |
| **Error display and recovery** | Streaming failures, API timeouts, tool errors must surface clearly, not silently | Medium | Unknown — needs explicit hardening |
| **Keyboard shortcuts / UX basics** | Ctrl-C to cancel, basic navigation — terminal UX conventions | Low | `keybindings` tested in Phase 1; core coverage exists |
| **Git awareness** | Users expect the tool to know what branch they're on, show git status in context | Low | `src/context.ts` builds git context; should verify accuracy |

---

## Differentiators

Features that set a hackable open-source CLI apart. Not expected by default, but create strong preference when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Feature flag runtime control** | Enables selective re-enabling of decompiled features without code edits; unique to CCB | Low | **Already implemented** (Phase 1) — env var + config file + `CLAUDE_FEATURE_ALL` |
| **MCP server integration** | Connects to 11,000+ ecosystem tools; Claude Code's killer extensibility feature | High | Partially implemented; OAuth removed (correct call); core transport needs verification |
| **Multi-provider support** | Anthropic direct, AWS Bedrock, Google Vertex, Azure — resilience and cost control | Medium | Provider selection in `src/utils/model/providers.ts`; needs streaming resilience per-provider |
| **Hooks system (PreToolUse / PermissionRequest)** | Deterministic code at exact moments in the turn loop; enables automation and safety gates | High | Architecture exists in decompiled code; reliability unverified |
| **Custom slash commands / skills** | Users build reusable workflows (e.g., `/review`, `/pr`) discoverable in the REPL | Medium | Likely partially present; needs clean discovery and documentation |
| **Permission system with per-tool granularity** | Modes: default / acceptEdits / plan / dontAsk / bypassPermissions — far beyond simple yes/no | Medium | Permission types in `src/types/permissions.ts`; UX reliability has known bugs upstream |
| **Subagent / AgentTool delegation** | Fan out complex tasks to specialized sub-agents; keeps main context clean | High | `AgentTool` exists; correctness and context isolation need testing |
| **Transparent codebase — readable source** | Developers can understand, fork, modify the tool; closed tools can't offer this | Low (ongoing) | Core differentiator of the whole project; achieved by reducing tsc errors and cleaning decompilation artifacts |
| **Bun-native runtime** | Faster startup, native TS execution, no transpile step for dev; not possible with Node-based tools | Low | Already the runtime; not a feature to build, but a platform advantage to preserve |
| **React Compiler artifact cleanup** | Readable component code enables contributions; decompiled `_c()` boilerplate blocks this | High | Active requirement — cleans up `_c(N)` memoization across all Ink components |

---

## Anti-Features

Features to explicitly NOT build. Either out of scope by decision, harmful to the project, or high complexity for low value.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Computer Use (@ant/* integration)** | Requires proprietary Anthropic infrastructure not available outside their platform | Stub packages remain as-is; document clearly |
| **NAPI native bindings (audio, image, url, modifiers)** | Native binary compilation breaks portability; these were Anthropic-internal capabilities | Keep stubs; `color-diff-napi` is the only one worth keeping (already implemented) |
| **Full MCP OAuth flow** | High complexity, Anthropic-platform-coupled; simplified transport is sufficient for 95% of MCP servers | Simplified MCP only — local stdio and SSE transports |
| **Voice mode** | WebSocket audio, complex error recovery, removed in decompilation; low value for CLI-first tool | Removed; document that it was intentionally stripped |
| **Plugin marketplace / registry** | Coupled to Anthropic platform auth and billing; reimplementing requires org-level infra | Skills + MCP servers cover all extensibility needs |
| **Analytics / telemetry (GrowthBook, Sentry)** | Privacy concern for open source; users of a hackable tool explicitly don't want phone-home behavior | Empty implementations stay empty |
| **LSP server** | Language server protocol integration was removed; duplicates IDE tooling, adds complexity without clear CLI benefit | Not in scope; MCP covers structured tool integration |
| **Magic Docs** | Anthropic-internal feature; undocumented, no open standard | Removed; not worth reverse-engineering |
| **COORDINATOR_MODE / KAIROS / PROACTIVE feature flags** | These are dead code behind `feature()` returning false; all are Anthropic-internal behavioral experiments | Leave behind `feature()` flags; document that they are disabled |
| **Node.js compatibility layer** | Bun is the intentional runtime; building Node.js fallbacks adds maintenance burden for no user benefit | Bun-only remains a hard constraint |
| **Auto-commit on every edit (Aider style)** | Aider's aggressive auto-commit frustrates users who want to review before committing; Claude Code's manual git approach is preferred | Preserve current behavior: git integration for awareness, not auto-commit |

---

## Feature Dependencies

```
Streaming (query.ts) → Tool execution (all tools)
Tool execution → Permission system (gates every tool call)
Permission system → Permission UX (REPL.tsx dialogs)
REPL loop → Context management (compaction in QueryEngine.ts)
Context management → CLAUDE.md loading (system prompt construction)
MCP integration → Hook system (hooks fire on MCP tool calls too)
AgentTool (subagents) → Tool execution (subagents use the same tool registry)
Custom slash commands → REPL loop (commands are dispatched in the REPL)
Feature flags → All feature-gated code (master switch for recovering disabled branches)
```

Dependency order for recovery work:

1. Streaming + error recovery (foundation — everything else depends on it)
2. Tool execution reliability (BashTool, FileEditTool, GrepTool)
3. Permission system correctness (gates tool execution)
4. Permission UX (relies on permission system being correct)
5. Context management / compaction (relies on streaming + REPL loop)
6. MCP transport (independent of tools but needs streaming working)
7. Hooks system (depends on tool execution and permission system)
8. Subagents / AgentTool (depends on full tool system)
9. Slash commands / skills (can be built on top of stable REPL)
10. React Compiler cleanup (cosmetic, but enables contributions to components)

---

## MVP Recovery Definition

The milestone this research informs is **engineering hardening** — the tool already runs. MVP for this milestone is: core loop reliable enough that a developer would choose it over just installing Claude Code directly.

**Prioritize (must have for milestone):**

1. Streaming resilience — handle API errors, timeouts, provider-level failures without silent hang
2. BashTool reliability — correct sandboxing, error propagation, timeout handling
3. FileEditTool correctness — diff application that doesn't corrupt files under edge cases
4. Permission system enforcement — the UX bug (operations rejected without prompt) must be fixed
5. Type error reduction in core modules — `query.ts`, `tools.ts`, `Tool.ts`, `QueryEngine.ts` (not mass-fix, targeted)

**Defer to later milestones:**

- Hooks system: works but unverified — acceptable to leave for next milestone
- MCP integration: partial; functional enough to defer full hardening
- AgentTool / subagents: high complexity; functional but not the core loop
- React Compiler cleanup: improves DX but not runtime behavior
- Custom slash commands / skills: ecosystem feature, not core reliability
- Multi-provider fallback routing: provider switching exists; automatic fallback is a later optimization

---

## Prioritization Matrix

| Feature | Impact | Recovery Effort | Priority |
|---------|--------|-----------------|----------|
| Streaming error recovery | High | Medium | P0 |
| BashTool reliability | High | Medium | P0 |
| FileEditTool correctness | High | Medium | P0 |
| Permission system enforcement | High | Medium | P0 |
| tsc errors in core modules | Medium | High | P1 |
| Context compaction reliability | Medium | Medium | P1 |
| MCP transport hardening | Medium | High | P1 |
| Permission UX polish | Low | Medium | P2 |
| Hooks system verification | Medium | Low | P1 |
| AgentTool testing | Medium | High | P2 |
| React Compiler cleanup | Low | Very High | P3 |
| Slash commands / skills | Low | Medium | P2 |
| Multi-provider auto-fallback | Low | Medium | P3 |

---

## Sources

- Sanj.dev CLI comparison: [Gemini CLI vs OpenCode vs Claude Code vs Aider](https://sanj.dev/post/comparing-ai-cli-coding-assistants) — MEDIUM confidence (gated)
- Context compaction analysis: [Context Compaction Research gist](https://gist.github.com/badlogic/cd2ef65b0697c4dbe2d13fbecb0a0a5f) — HIGH confidence (primary source verified)
- Claude Code feature overview: [How I Use Every Claude Code Feature](https://blog.sshh.io/p/how-i-use-every-claude-code-feature) — MEDIUM confidence
- Claude Code extensibility: [Claude Code Full Stack guide](https://alexop.dev/posts/understanding-claude-code-full-stack/) — MEDIUM confidence
- Claude Code permissions docs: [Configure permissions — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/permissions) — HIGH confidence (official)
- Aider features: [Aider official docs](https://aider.chat/docs/) — HIGH confidence (official)
- MCP ecosystem: [Model Context Protocol official site](https://modelcontextprotocol.io/) — HIGH confidence (official)
- Multi-provider support: [Claude Code with Bedrock/Vertex](https://portkey.ai/blog/how-to-use-claude-code-with-bedrock-vertex-ai-and-anthropic/) — MEDIUM confidence
- Open source CLI landscape: [Top 7 Open-Source AI Coding Assistants 2026](https://www.secondtalent.com/resources/open-source-ai-coding-assistants/) — LOW confidence (aggregator)
- Hooks system: [Claude Code Power User Guide](https://dev.to/numbpill3d/the-complete-claude-code-power-user-guide-slash-commands-hooks-skills-more-6ep) — MEDIUM confidence
- Skills architecture: [Extend Claude with skills — official docs](https://code.claude.com/docs/en/skills) — HIGH confidence (official)
