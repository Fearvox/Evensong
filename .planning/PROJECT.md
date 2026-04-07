# CCB (Claude Code Best)

## What This Is

A reverse-engineered/decompiled version of Anthropic's official Claude Code CLI tool. The goal is to restore core functionality into a fully hackable, understandable codebase while trimming secondary capabilities. Built on Bun runtime with ESM, TSX, and Ink for terminal UI.

## Core Value

A working, modifiable Claude Code CLI that developers can study, extend, and customize — bridging the gap between "decompiled and runs" to "engineered and maintainable."

## Requirements

### Validated

- Build stability (bun build outputs dist/cli.js ~25MB) — Phase 1
- Test infrastructure (bun test, 58 tests across 3 modules: sanitization, uuid, keybindings) — Phase 1
- Linting (Biome with recommended:false, formatter disabled) — Phase 1
- Feature flag configurability (runtime env var + config file + CLAUDE_FEATURE_ALL) — Phase 1

### Active

- [ ] Reduce tsc type errors (~1341 from decompilation, prioritize core modules)
- [ ] Harden core tool system (BashTool, FileEditTool, GrepTool, AgentTool reliability)
- [ ] Improve API layer resilience (streaming, error recovery, provider switching)
- [ ] Restore MCP server integration (simplified, without OAuth complexity)
- [ ] Refine permission system (cleaner UX, correct enforcement)
- [ ] Expand test coverage to core modules (query, tools, context)
- [ ] Clean up React Compiler decompilation artifacts (_c() memoization boilerplate)
- [ ] Documentation for architecture and contribution guide

### Out of Scope

- Computer Use (@ant/* packages) — requires proprietary Anthropic infra
- NAPI packages (audio, image, url, modifiers) — native bindings not available
- Analytics / GrowthBook / Sentry — telemetry not needed for open source
- Magic Docs / Voice Mode / LSP Server — secondary features, high complexity
- Plugins / Marketplace — removed, too coupled to Anthropic platform
- MCP OAuth — simplified version only, full OAuth too complex

## Context

- **Codebase origin**: Decompiled from Anthropic's official Claude Code CLI bundle
- **~1341 tsc errors**: From decompilation (mostly `unknown`/`never`/`{}` types) — do NOT block Bun runtime
- **React Compiler output**: Components have `_c(N)` memoization boilerplate from decompilation
- **`feature()` polyfill**: Always returns `false` by default; now configurable via env var/config file
- **`bun:bundle` import**: Works at build time; polyfilled at dev-time in cli.tsx
- **Internal packages**: `packages/` dir contains stub packages and one real implementation (color-diff-napi)
- **Provider support**: Anthropic direct, AWS Bedrock, Google Vertex, Azure

## Constraints

- **Runtime**: Bun only (not Node.js) — all imports, builds, execution use Bun APIs
- **Module system**: ESM with `"type": "module"`, TSX with `react-jsx` transform
- **Build**: Single-file bundle via `bun build` — must remain single entry point
- **Decompilation debt**: Cannot mass-fix tsc errors without breaking runtime behavior — incremental approach required
- **No upstream sync**: This is a fork, not tracking Anthropic's releases

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| feature() runtime-configurable | Allows selective re-enabling of features without code changes | ✓ Good |
| Biome recommended:false | Decompiled code can't pass recommended rules; hand-pick what matters | ✓ Good |
| Tests start from pure functions | Lowest-risk entry point for decompiled code testing | ✓ Good |
| Vendored files marked linguist-vendored | Keeps git stats clean, signals "don't review" | ✓ Good |
| Bun as sole runtime | Already the original target; Node.js compat not worth maintaining | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-06 after initialization*
