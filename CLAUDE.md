# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **reverse-engineered / decompiled** version of Anthropic's official Claude Code CLI tool. The goal is to restore core functionality while trimming secondary capabilities. Many modules are stubbed or feature-flagged off. The codebase has ~1341 tsc errors from decompilation (mostly `unknown`/`never`/`{}` types) — these do **not** block Bun runtime execution.

## Commands

```bash
# Install dependencies
bun install

# Dev mode (direct execution via Bun)
bun run dev
# equivalent to: bun run src/entrypoints/cli.tsx

# Pipe mode
echo "say hello" | bun run src/entrypoints/cli.tsx -p

# Build (outputs dist/cli.js, ~25MB)
bun run build
```

No test runner is configured. No linter is configured.

## Architecture

### Runtime & Build

- **Runtime**: Bun (not Node.js). All imports, builds, and execution use Bun APIs.
- **Build**: `bun build src/entrypoints/cli.tsx --outdir dist --target bun` — single-file bundle.
- **Module system**: ESM (`"type": "module"`), TSX with `react-jsx` transform.
- **Monorepo**: Bun workspaces — internal packages live in `packages/` resolved via `workspace:*`.

### Entry & Bootstrap

1. **`src/entrypoints/cli.tsx`** — True entrypoint. Injects runtime polyfills at the top:
   - `feature()` always returns `false` (all feature flags disabled, skipping unimplemented branches).
   - `globalThis.MACRO` — simulates build-time macro injection (VERSION, BUILD_TIME, etc.).
   - `BUILD_TARGET`, `BUILD_ENV`, `INTERFACE_TYPE` globals.
2. **`src/main.tsx`** — Commander.js CLI definition. Parses args, initializes services (auth, analytics, policy), then launches the REPL or runs in pipe mode.
3. **`src/entrypoints/init.ts`** — One-time initialization (telemetry, config, trust dialog).

### Core Loop

- **`src/query.ts`** — The main API query function. Sends messages to Claude API, handles streaming responses, processes tool calls, and manages the conversation turn loop.
- **`src/QueryEngine.ts`** — Higher-level orchestrator wrapping `query()`. Manages conversation state, compaction, file history snapshots, attribution, and turn-level bookkeeping. Used by the REPL screen.
- **`src/screens/REPL.tsx`** — The interactive REPL screen (React/Ink component). Handles user input, message display, tool permission prompts, and keyboard shortcuts.

### API Layer

- **`src/services/api/claude.ts`** — Core API client. Builds request params (system prompt, messages, tools, betas), calls the Anthropic SDK streaming endpoint, and processes `BetaRawMessageStreamEvent` events.
- Supports multiple providers: Anthropic direct, AWS Bedrock, Google Vertex, Azure.
- Provider selection in `src/utils/model/providers.ts`.

### Tool System

- **`src/Tool.ts`** — Tool interface definition (`Tool` type) and utilities (`findToolByName`, `toolMatchesName`).
- **`src/tools.ts`** — Tool registry. Assembles the tool list; some tools are conditionally loaded via `feature()` flags or `process.env.USER_TYPE`.
- **`src/tools/<ToolName>/`** — Each tool in its own directory (e.g., `BashTool`, `FileEditTool`, `GrepTool`, `AgentTool`).
- Tools define: `name`, `description`, `inputSchema` (JSON Schema), `call()` (execution), and optionally a React component for rendering results.

### UI Layer (Ink)

- **`src/ink.ts`** — Ink render wrapper with ThemeProvider injection.
- **`src/ink/`** — Custom Ink framework (forked/internal): custom reconciler, hooks (`useInput`, `useTerminalSize`, `useSearchHighlight`), virtual list rendering.
- **`src/components/`** — React components rendered in terminal via Ink. Key ones:
  - `App.tsx` — Root provider (AppState, Stats, FpsMetrics).
  - `Messages.tsx` / `MessageRow.tsx` — Conversation message rendering.
  - `PromptInput/` — User input handling.
  - `permissions/` — Tool permission approval UI.
- Components use React Compiler runtime (`react/compiler-runtime`) — decompiled output has `_c()` memoization calls throughout.

### State Management

- **`src/state/AppState.tsx`** — Central app state type and context provider. Contains messages, tools, permissions, MCP connections, etc.
- **`src/state/store.ts`** — Zustand-style store for AppState.
- **`src/bootstrap/state.ts`** — Module-level singletons for session-global state (session ID, CWD, project root, token counts).

### Context & System Prompt

- **`src/context.ts`** — Builds system/user context for the API call (git status, date, CLAUDE.md contents, memory files).
- **`src/utils/claudemd.ts`** — Discovers and loads CLAUDE.md files from project hierarchy.

### Feature Flag System

All `feature('FLAG_NAME')` calls come from `bun:bundle` (a build-time API). In this decompiled version, `feature()` is polyfilled to always return `false` in `cli.tsx`. This means all Anthropic-internal features (COORDINATOR_MODE, KAIROS, PROACTIVE, etc.) are disabled.

### Stubbed/Deleted Modules

| Module | Status |
|--------|--------|
| Computer Use (`@ant/*`) | Stub packages in `packages/@ant/` |
| `*-napi` packages (audio, image, url, modifiers) | Stubs in `packages/` (except `color-diff-napi` which is fully implemented) |
| Analytics / GrowthBook / Sentry | Empty implementations |
| Magic Docs / Voice Mode / LSP Server | Removed |
| Plugins / Marketplace | Removed |
| MCP OAuth | Simplified |

### Key Type Files

- **`src/types/global.d.ts`** — Declares `MACRO`, `BUILD_TARGET`, `BUILD_ENV` and internal Anthropic-only identifiers.
- **`src/types/internal-modules.d.ts`** — Type declarations for `bun:bundle`, `bun:ffi`, `@anthropic-ai/mcpb`.
- **`src/types/message.ts`** — Message type hierarchy (UserMessage, AssistantMessage, SystemMessage, etc.).
- **`src/types/permissions.ts`** — Permission mode and result types.

## Working with This Codebase

- **Don't try to fix all tsc errors** — they're from decompilation and don't affect runtime.
- **`feature()` is always `false`** — any code behind a feature flag is dead code in this build.
- **React Compiler output** — Components have decompiled memoization boilerplate (`const $ = _c(N)`). This is normal.
- **`bun:bundle` import** — In `src/main.tsx` and other files, `import { feature } from 'bun:bundle'` works at build time. At dev-time, the polyfill in `cli.tsx` provides it.
- **`src/` path alias** — tsconfig maps `src/*` to `./src/*`. Imports like `import { ... } from 'src/utils/...'` are valid.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**CCB (Claude Code Best)**

A reverse-engineered/decompiled version of Anthropic's official Claude Code CLI tool. The goal is to restore core functionality into a fully hackable, understandable codebase while trimming secondary capabilities. Built on Bun runtime with ESM, TSX, and Ink for terminal UI.

**Core Value:** A working, modifiable Claude Code CLI that developers can study, extend, and customize — bridging the gap between "decompiled and runs" to "engineered and maintainable."

### Constraints

- **Runtime**: Bun only (not Node.js) — all imports, builds, execution use Bun APIs
- **Module system**: ESM with `"type": "module"`, TSX with `react-jsx` transform
- **Build**: Single-file bundle via `bun build` — must remain single entry point
- **Decompilation debt**: Cannot mass-fix tsc errors without breaking runtime behavior — incremental approach required
- **No upstream sync**: This is a fork, not tracking Anthropic's releases
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Already in Place (Do Not Re-introduce)
| Tool | Version in package.json | Status |
|------|--------------------------|--------|
| Bun runtime | ^1.3.x (latest ~1.3.10) | Locked — sole runtime |
| TypeScript | ^6.0.2 | In devDependencies |
| @biomejs/biome | ^2.4.10 | In devDependencies, lint-only config |
| @anthropic-ai/sdk | ^0.80.0 (latest 0.82.0) | Core dependency |
| bun test | built-in | 58 tests across 3 modules |
## Recommended Stack Additions
### 1. Type Checking Strategy — Incremental Suppression with ts-ignore Budgets
| Library | Version | Why |
|---------|---------|-----|
| ts-morph | ^27.0.2 | TypeScript Compiler API wrapper for AST-level programmatic code transformation. Enables writing a script to bulk-annotate decompiled `_c()` memoization artifacts and `unknown` params rather than hand-editing. Latest version tracks TypeScript 5.x/6.x. |
### 2. Ink Component Testing — ink-testing-library + bun test
| Library | Version | Why |
|---------|---------|-----|
| ink-testing-library | ^4.0.0 | Official Ink testing utilities. Last published May 2024, stable for Ink 5.x. Render to virtual terminal, access output frames, simulate stdin. |
### 3. Streaming API Resilience — Wrapper Pattern over @anthropic-ai/sdk
| Library | Version | Why |
|---------|---------|-----|
| p-retry | ^6.x | Exponential backoff with jitter for transient errors (connection reset, 429, 500s). The SDK already retries some errors via `maxRetries`, but p-retry gives precise per-call control for the stream reconnect case. ESM-native (sindresorhus), tree-shakeable. |
### 4. Code Coverage — bun test --coverage (built-in, no additions)
### 5. React Compiler Artifact Cleanup — ts-morph (same tool, different use)
## Development Tools — What's Already Sufficient
| Tool | Already Present | Gap |
|------|----------------|-----|
| Biome 2.4.10 | Yes — lint-only | Already configured correctly: `recommended: false`, formatter disabled |
| TypeScript 6.0.2 | Yes | Add `tsconfig.strict.json` overlay (no new install) |
| bun test | Yes | Add ink-testing-library for component tests |
| bun build | Yes | No changes needed |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Type fixing | tsconfig islands + ts-morph | Mass `@ts-ignore` insertion | `@ts-ignore` hides regressions; tsconfig islands give clean targeted feedback |
| Type fixing | tsconfig islands + ts-morph | `ts-migrate` (Airbnb) | Designed for JS-to-TS migration, not decompiled TS-to-clean-TS; limited control over output |
| Ink testing | ink-testing-library | Manual CLI subprocess testing | Subprocess tests are slow, flaky with stdin simulation, harder to assert specific component states |
| Ink testing | ink-testing-library | @testing-library/react | Targets DOM reconciler, not Ink's custom reconciler — fundamentally incompatible |
| Test runner | bun test (built-in) | Vitest | Would require Node.js compat shim or full Node.js runtime; conflicts with Bun-only constraint |
| Test runner | bun test (built-in) | Jest | Same Node.js dependency issue; significantly slower than Bun's native runner |
| Streaming resilience | p-retry + AbortController | Replace SDK with fetch+SSE | Loses SDK's built-in type safety, auth handling, multi-provider abstraction |
| Streaming resilience | p-retry + AbortController | `got` with retry | HTTP-level retry, not SSE stream reconnect — wrong abstraction layer |
| Linting | Biome 2.4.10 (already installed) | typescript-eslint | Requires TypeScript compiler integration; decompiled code produces unmanageable false positives |
| Linting | Biome 2.4.10 (already installed) | oxlint 1.0 | Syntactic only in v1.0, no type-aware rules; Biome 2.x already covers the same speed advantage |
| Coverage | bun test --coverage (built-in) | c8 / nyc / Istanbul | All require Node.js V8 coverage APIs; incompatible with Bun runtime |
## What NOT to Use
| Tool | Reason |
|------|--------|
| Jest | Node.js runtime dependency; breaks Bun-only constraint |
| Vitest | Same Node.js issue; also requires vite build tooling |
| typescript-eslint | Type-aware rules require tsc integration; 1341 baseline errors make it unusable without massive false-positive suppression |
| ts-migrate | Designed for JS→TS migration; wrong model for decompiled TS cleanup |
| c8 / nyc / Istanbul | Node.js V8 coverage APIs, incompatible with Bun |
| Prettier | Formatter already disabled in Biome config; adding Prettier creates conflict |
| got / axios | Wrong abstraction for SSE stream resilience; adds HTTP client redundancy on top of the SDK |
## Installation Summary
# Type analysis and AST transformation (one-time migration tooling)
# Ink component testing
# Streaming resilience (runtime dependency)
## Confidence Assessment
| Area | Confidence | Basis |
|------|------------|-------|
| ts-morph for AST migration | MEDIUM | Well-established tool (v27.0.2, actively maintained); specific use for decompiled code not directly documented but capabilities match the task |
| tsconfig islands approach | HIGH | Official TypeScript project references docs + widely used pattern for incremental strict mode adoption |
| ink-testing-library | MEDIUM | Official Ink testing library (v4.0.0), but Bun compatibility has had issues; needs smoke-test verification after install |
| bun test snapshots for terminal output | HIGH | Bun docs confirm `.toMatchSnapshot()` works in built-in test runner |
| p-retry for stream resilience | HIGH | Active package, ESM-native, widely used; SDK streaming hang issues are confirmed by multiple open GitHub issues |
| bun --coverage | HIGH | Bun docs confirm built-in coverage; known gap with unloaded files is documented |
| Biome 2.4.10 type inference | MEDIUM | Biome blog confirmed type inference in 2.x; ~85% coverage claim from community analysis, not official Biome docs |
| Skipping typescript-eslint | HIGH | Decompilation baseline errors make type-aware lint rules produce unmanageable false positives — confirmed by examining the error profile |
## Sources
- [Bun test code coverage docs](https://bun.com/docs/test/code-coverage)
- [Bun testing library guide](https://bun.com/docs/guides/test/testing-library)
- [ink-testing-library GitHub](https://github.com/vadimdemedes/ink-testing-library)
- [ts-morph GitHub](https://github.com/dsherret/ts-morph)
- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Biome v2 release blog](https://biomejs.dev/blog/biome-v2/)
- [Biome roadmap 2025](https://biomejs.dev/blog/roadmap-2025/)
- [p-retry GitHub](https://github.com/sindresorhus/p-retry)
- [Anthropic SDK streaming hang issue #867](https://github.com/anthropics/anthropic-sdk-typescript/issues/867)
- [Anthropic SDK connection error retry issue #37077](https://github.com/anthropics/claude-code/issues/37077)
- [Anthropic SDK streaming interrupted issue #842](https://github.com/anthropics/anthropic-sdk-typescript/issues/842)
- [TypeScript strictness monotonicity article](https://huonw.github.io/blog/2025/12/typescript-monotonic/)
- [TypeScript 6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| everything-claude-code-conventions | Development conventions and patterns for everything-claude-code. JavaScript project with conventional commits. | `.claude/skills/everything-claude-code/SKILL.md` |
| startup-hook-skill | Creating and developing startup hooks for Claude Code on the web. Use when the user wants to set up a repository for Claude Code on the web, create a SessionStart hook to ensure their project can run tests and linters during web sessions. | `.claude/skills/session-start-hook/SKILL.md` |
| benchmark-ingest | Post-benchmark workflow: ingest results to registry, update dashboard + research pages, sync i18n, deploy. Trigger on "benchmark done", "收尾", "录入". | `.claude/skills/benchmark-ingest/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
