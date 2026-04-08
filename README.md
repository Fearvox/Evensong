<p align="right"><a href="./README-zh.md">中文</a></p>

# Claude Code Reimagined

**The AI agent you can actually read.**

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-520K%2B_lines-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 520K+ lines" />
  <img src="https://img.shields.io/badge/Bun-Runtime-f472b6?style=flat-square&logo=bun&logoColor=white" alt="Bun Runtime" />
  <img src="https://img.shields.io/badge/Tests-261_passing-22c55e?style=flat-square" alt="261 Tests Passing" />
  <img src="https://img.shields.io/badge/Roadmap-Phase_5%2F14-f97316?style=flat-square" alt="Phase 5/14" />
</p>

<p align="center">
  <b>Providers:</b> Anthropic | AWS Bedrock | Google Vertex | Azure
</p>

---

## Contents

- [Why This Exists](#why-this-exists)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [What Works](#what-works-right-now)
- [Feature Flags](#feature-flag-system)
- [Roadmap](#evolution-roadmap-v20----agent-intelligence-enhancement)
- [Contributing](#contributing)

---

## Why This Exists

Anthropic ships Claude Code as a compiled binary. You can use it, but you can't study it. You can't modify the tool system, swap out the streaming handler, rewire the permission model, or understand how a 50-tool AI agent actually works under the hood.

This project changes that. Every function, every tool, every feature flag, every streaming event handler -- decompiled, restored, and made readable. This is not a wrapper around an API. This is not a "Claude Code clone" built from scratch. This is the actual Claude Code internals: the real query loop, the real tool dispatch, the real Ink-based terminal UI, the real MCP integration -- pulled apart and put back together in a form you can read, run, and hack on.

The honest truth: this started as ~520K lines of decompiled TypeScript with ~1,341 tsc errors and React Compiler artifacts everywhere. It runs perfectly fine on Bun (type errors from decompilation don't block runtime). The goal is to incrementally transform it from "decompiled and runs" into "engineered, tested, and extensible" -- a real platform for building next-gen AI agents. We're deep into that process, and it's working.

---

## Quick Start

```bash
# Prerequisites: Bun >= 1.3.11, valid Anthropic API key (or Bedrock/Vertex/Azure credentials)
bun install

# Dev mode -- if you see version 888, you're running the right thing
bun run dev

# Pipe mode
echo "explain this codebase" | bun run src/entrypoints/cli.tsx -p

# Build (single-file bundle -> dist/cli.js, ~25 MB)
bun run build

# Tests (261 passing across 28 test files)
bun test
```

That's it. No Node.js required. No Docker. No complex setup. Bun handles everything.

---

## Architecture

```
                          CLI ENTRY
                             |
                    cli.tsx (polyfills + MACRO injection)
                             |
                          main.tsx
                      (Commander.js CLI)
                             |
               +-------------+-------------+
               |                           |
          REPL Mode                   Pipe Mode
          (interactive)               (stdin -> stdout)
               |                           |
               +-------------+-------------+
                             |
                         query.ts
                   (API streaming + tool loop)
                             |
              +--------------+--------------+
              |              |              |
         claude.ts      QueryEngine.ts   context.ts
      (multi-provider    (conversation   (CLAUDE.md +
       API client)        state mgmt)    git context)
              |              |
    +---------+-------+      |
    |    |    |    |   |     |
  Anthr Bedr Vert Azur |     |
  opic  ock  ex   e    |     |
                       |     |
                   tools.ts -+-- Tool Registry
                       |
         +------+------+------+------+------+
         |      |      |      |      |      |
       Bash   Edit   Grep   Agent  Fetch   MCP
       Tool   Tool   Tool   Tool   Tool   Tools
         |      |      |      |      |      |
         +------+------+------+------+------+
                       |
                   permissions/
              (plan / auto / manual mode)
                       |
                   Ink UI Layer
              (React terminal rendering)
```

### Key Modules

| Module | Path | What It Does |
|--------|------|-------------|
| Entry | `src/entrypoints/cli.tsx` | Injects `feature()` polyfill, `globalThis.MACRO`, bootstraps runtime |
| CLI | `src/main.tsx` | Commander.js definition, arg parsing, service init |
| Query Loop | `src/query.ts` | Sends messages to Claude API, streams responses, dispatches tool calls, manages turn loop (~1,700 lines) |
| Engine | `src/QueryEngine.ts` | Higher-level orchestrator: conversation state, compaction, attribution, file history (~1,300 lines) |
| API Client | `src/services/api/claude.ts` | Builds requests, calls Anthropic SDK streaming endpoint, handles multi-provider auth (~3,400 lines) |
| REPL | `src/screens/REPL.tsx` | Interactive terminal UI: input, messages, tool permissions, keyboard shortcuts |
| Tools | `src/tools/<Name>/` | 50+ self-contained tool modules, each with schema, execution, and optional React renderer |
| Permissions | `src/services/permissions/` | 6,300+ lines: YOLO classifier, path validation, rule matching, plan/auto/manual modes |
| MCP | `src/services/mcp/` | Full Model Context Protocol: stdio + SSE transports, resource listing, tool proxying (~12,000 lines) |
| Context | `src/context.ts` | Builds system prompt from git status, CLAUDE.md hierarchy, memory files |
| Feature Flags | `src/utils/featureFlag.ts` | 90+ flags cataloged; configurable via `~/.claude/feature-flags.json` |

<p align="right"><a href="#contents">↑ top</a></p>

---

## What Works Right Now

### Core Systems

| Capability | Status | Details |
|-----------|--------|---------|
| Interactive REPL | Working | Full Ink terminal UI, 5,000+ line main screen |
| Streaming Conversation | Working | Complete query loop with auto-compaction and token tracking |
| Multi-Provider API | Working | Anthropic Direct, AWS Bedrock, Google Vertex, Azure Foundry |
| Permission System | Working | Plan / auto / manual modes with YOLO classifier |
| Hook System | Working | Pre/post tool-use hooks via `settings.json` |
| Session Resume | Working | Full conversation restore via `/resume` |
| MCP Integration | Working | stdio + SSE transports, resource listing, tool proxying |
| Context Building | Working | Git status, CLAUDE.md discovery, memory files |

<details>
<summary><strong>50+ Built-in Tools</strong> (click to expand)</summary>

| Tool | What It Does |
|------|-------------|
| `BashTool` | Shell execution with sandboxing and permission checks |
| `FileReadTool` | Read files, PDFs, images, Jupyter notebooks |
| `FileEditTool` | String-replacement editing with diff tracking |
| `FileWriteTool` | Create/overwrite files with diff generation |
| `GlobTool` | Fast file pattern matching |
| `GrepTool` | Regex search powered by ripgrep |
| `AgentTool` | Spawn sub-agents (fork / async / background / remote) |
| `WebFetchTool` | URL fetch, Markdown conversion, AI summarization |
| `WebSearchTool` | Web search with domain filtering |
| `NotebookEditTool` | Jupyter notebook cell editing |
| `SkillTool` | Slash command / skill invocation |
| `SendMessageTool` | Inter-agent messaging (peers / teammates / mailbox) |
| `AskUserQuestionTool` | Multi-question interactive prompts |
| `MCPTool` | Model Context Protocol tool proxying |
| `TodoWriteTool` | Task list management |
| `SyntheticOutputTool` | Structured output for non-interactive sessions |
| ...and 30+ more | Conditional, flag-gated, or platform-specific tools |

</details>

<details>
<summary><strong>70+ Slash Commands</strong> (click to expand)</summary>

Everything from `/compact` (compress conversation) to `/model` (switch models) to `/doctor` (health check) to `/vim` (vim mode). The full list is in the source at `src/commands/`.

</details>

<p align="right"><a href="#contents">↑ top</a></p>

---

## Feature Flag System

The original Claude Code uses GrowthBook-powered feature flags injected at build time via `bun:bundle`. We've cataloged 90+ of them and built a local override system.

**How it works in this fork:**
- Default: `feature()` polyfilled to return `false` (all Anthropic-internal features disabled)
- Override: Set flags in `~/.claude/feature-flags.json` to selectively enable features
- Catalog: Every flag is documented with its purpose and dependent code paths

<details>
<summary><strong>Flag Categories</strong> (click to expand)</summary>

| Category | Flags | What They Control |
|----------|-------|------------------|
| Autonomous Agent | `KAIROS`, `PROACTIVE`, `COORDINATOR_MODE`, `BUDDY` | Long-running agents, proactive execution, multi-agent orchestration |
| Remote/Distributed | `BRIDGE_MODE`, `DAEMON`, `SSH_REMOTE`, `DIRECT_CONNECT` | Remote control, background daemon, SSH tunneling |
| Enhanced Tools | `WEB_BROWSER_TOOL`, `VOICE_MODE`, `CHICAGO_MCP`, `WORKFLOW_SCRIPTS` | Browser, voice input, computer use, workflow automation |
| Conversation | `HISTORY_SNIP`, `ULTRAPLAN`, `AGENT_MEMORY_SNAPSHOT` | History pruning, large-scale planning, memory snapshots |
| Infrastructure | `ABLATION_BASELINE`, `HARD_FAIL`, `TORCH`, `LODESTONE` | Experiments, error modes, deep linking |

This is your map to everything Anthropic is building but hasn't shipped publicly yet.

</details>

<p align="right"><a href="#contents">↑ top</a></p>

---

## Evolution Roadmap (v2.0 -- Agent Intelligence Enhancement)

14 phases. The goal: transform this from a working decompilation into an intelligent, self-evolving agent platform.

### Completed (Phases 1-5)

<details>
<summary>5 phases complete -- foundation, tools, streaming, permissions, infrastructure</summary>

| Phase | Name | Key Achievement |
|-------|------|----------------|
| 1 | Foundation Hardening | Type system, test infrastructure, Zod schemas |
| 2 | Core Tool Reliability | Error handling + integration tests for 4 core tools |
| 3 | API Streaming Resilience | Auto-retry, provider switching, atomic history |
| 4 | Query Loop & Permissions | Multi-tool batching, permission persistence, session resume |
| 5 | Infrastructure & Gate Override | GrowthBook bypass, 90+ flags cataloged, MCP transport |

</details>

### Next: Phase 6 -- Memory Extraction

Cross-session memories extracted automatically after conversations, loaded in future sessions, with secret scanning to prevent credential leakage. The extraction pipeline already exists in the codebase -- this phase enables it, wires in secret scanning, and tests the full flow.

### Planned (Phases 7-14)

| Phase | Name | Focus |
|-------|------|-------|
| 7 | Deliberation Checkpoint | Visible reasoning before high-risk tool calls |
| 8 | Dynamic Permission Escalation | Session-scoped temporary permission grants |
| 9 | Context Collapse | Intelligent context folding with recent-message fidelity |
| 10 | Coordinator Mode | Multi-agent orchestration with file reservation |
| 11 | KAIROS Proactive | Opt-in proactive suggestions, dream consolidation |
| 12 | Multi-Model Providers | OpenAI-compatible adapter, difficulty routing, fallback chains |
| 13 | UI Cleanup & Integration | React Compiler cleanup, REPL decomposition, test matrix |
| 14 | Evolution Pipeline | Adversarial evaluation, metrics dashboard, self-iteration |

<p align="right"><a href="#contents">↑ top</a></p>

---

<details>
<summary><strong>Technical Notes</strong> (tsc errors, build system, React Compiler, monorepo structure)</summary>

**On the tsc errors:** There are ~1,341 TypeScript errors from decompilation -- mostly `unknown`/`never`/`{}` types and React Compiler artifacts (`_c()` memoization calls). These do not affect Bun runtime execution. We're fixing them incrementally via tsconfig islands, not mass `@ts-ignore`.

**On `feature()` polyfill:** In `cli.tsx`, `feature()` is injected to always return `false`. This means all Anthropic-internal features are dead code in this build unless you override them in `~/.claude/feature-flags.json`.

**On React Compiler output:** Components throughout the codebase have decompiled memoization boilerplate (`const $ = _c(N)`). This is expected output from the React Compiler and works correctly at runtime.

**On the build:** `bun build src/entrypoints/cli.tsx --outdir dist --target bun` produces a single ~25 MB file. No webpack, no esbuild, no rollup. Just Bun.

### Monorepo Structure

```
claude-code-reimagined/
|-- src/
|   |-- entrypoints/        # CLI entry point + SDK stubs
|   |   `-- cli.tsx          # True entry (polyfills, MACRO injection)
|   |-- main.tsx             # Commander.js CLI definition
|   |-- query.ts             # Core API query loop
|   |-- QueryEngine.ts       # Conversation state orchestrator
|   |-- screens/             # Ink UI screens (REPL, Resume, etc.)
|   |-- tools/               # 50+ self-contained tool modules
|   |-- services/
|   |   |-- api/             # Multi-provider API client
|   |   |-- mcp/             # Model Context Protocol (24 files)
|   |   |-- permissions/     # Permission engine
|   |   |-- compact/         # Conversation compaction
|   |   `-- ...
|   |-- components/          # React/Ink terminal UI components
|   |-- commands/            # 70+ slash commands
|   |-- state/               # Zustand-style app state
|   |-- utils/               # Feature flags, model routing, config
|   `-- types/               # Global types, message types, permissions
|-- packages/
|   |-- color-diff-napi/     # Full implementation (syntax-highlighted diffs)
|   |-- audio-capture-napi/  # Stub
|   |-- image-processor-napi/# Stub
|   |-- @ant/                # Anthropic internal package stubs
|   `-- ...
|-- tests/                   # 28 test files, 261 passing
`-- dist/                    # Build output (single-file bundle)
```

</details>

---

## Contributing

This project moves fast -- Opus runs continuous optimization in the background. That said:

- **Issues:** Welcome. Bug reports, feature ideas, questions about the internals -- all good.
- **Pull Requests:** Currently not accepting PRs as the codebase is under heavy automated transformation. This may change as things stabilize.
- **Forking:** Encouraged. Clone or download the zip (forks may not track correctly due to the pace of changes). Build something wild.

For private consulting: `claude-code-best@proton.me`

---

> [!NOTE]
> This project is for **educational and research purposes only**. All rights to the original Claude Code belong to [Anthropic](https://www.anthropic.com/). This is a reverse-engineered study of their work, not an official product. Use responsibly.

<p align="center">
  <a href="https://github.com/Fearvox/claude-code-reimagine-for-learning"><b>github.com/Fearvox/claude-code-reimagine-for-learning</b></a>
</p>
<p align="center">
  <i>From decompiled to engineered. From black box to open platform.</i>
</p>
