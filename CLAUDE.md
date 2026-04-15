# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

## Project Overview

**Reverse-engineered / decompiled** Anthropic Claude Code CLI. Goal: restore core functionality, trim secondary capabilities. Many modules stubbed or feature-flagged off. ~1341 tsc errors from decompilation (mostly `unknown`/`never`/`{}` types) — do **not** block Bun runtime.

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

## Architecture

### Runtime & Build

- **Runtime**: Bun (not Node.js). All imports, builds, execution use Bun APIs.
- **Build**: `bun build src/entrypoints/cli.tsx --outdir dist --target bun` — single-file bundle.
- **Module system**: ESM (`"type": "module"`), TSX w/ `react-jsx` transform.
- **Monorepo**: Bun workspaces — internal packages in `packages/` resolved via `workspace:*`.

### Entry & Bootstrap

1. **`src/entrypoints/cli.tsx`** — True entrypoint. Injects runtime polyfills:
   - `feature()` always returns `false` (all feature flags disabled, skip unimplemented branches).
   - `globalThis.MACRO` — simulates build-time macro injection (VERSION, BUILD_TIME, etc.).
   - `BUILD_TARGET`, `BUILD_ENV`, `INTERFACE_TYPE` globals.
2. **`src/main.tsx`** — Commander.js CLI definition. Parses args, inits services (auth, analytics, policy), launches REPL or pipe mode.
3. **`src/entrypoints/init.ts`** — One-time init (telemetry, config, trust dialog).

### Core Loop

- **`src/query.ts`** — Main API query fn. Sends msgs to Claude API, handles streaming, processes tool calls, manages conversation turn loop.
- **`src/QueryEngine.ts`** — Higher-level orchestrator wrapping `query()`. Manages conversation state, compaction, file history snapshots, attribution, turn bookkeeping. Used by REPL screen.
- **`src/screens/REPL.tsx`** — Interactive REPL (React/Ink). Handles input, message display, tool permission prompts, keyboard shortcuts.

### API Layer

- **`src/services/api/claude.ts`** — Core API client. Builds request params (system prompt, messages, tools, betas), calls Anthropic SDK streaming endpoint, processes `BetaRawMessageStreamEvent` events.
- Supports providers: Anthropic direct, AWS Bedrock, Google Vertex, Azure.
- Provider selection: `src/utils/model/providers.ts`.

### Tool System

- **`src/Tool.ts`** — Tool interface definition (`Tool` type) + utilities (`findToolByName`, `toolMatchesName`).
- **`src/tools.ts`** — Tool registry. Assembles tool list; some tools conditionally loaded via `feature()` flags or `process.env.USER_TYPE`.
- **`src/tools/<ToolName>/`** — Each tool in own dir (e.g., `BashTool`, `FileEditTool`, `GrepTool`, `AgentTool`).
- Tools define: `name`, `description`, `inputSchema` (JSON Schema), `call()` (execution), optional React component for result rendering.

### UI Layer (Ink)

- **`src/ink.ts`** — Ink render wrapper w/ ThemeProvider injection.
- **`src/ink/`** — Custom Ink framework (forked/internal): custom reconciler, hooks (`useInput`, `useTerminalSize`, `useSearchHighlight`), virtual list rendering.
- **`src/components/`** — React components rendered in terminal via Ink:
  - `App.tsx` — Root provider (AppState, Stats, FpsMetrics).
  - `Messages.tsx` / `MessageRow.tsx` — Conversation message rendering.
  - `PromptInput/` — User input handling.
  - `permissions/` — Tool permission approval UI.
- Components use React Compiler runtime (`react/compiler-runtime`) — decompiled output has `_c()` memoization calls throughout.

### State Management

- **`src/state/AppState.tsx`** — Central app state type + context provider. Contains messages, tools, permissions, MCP connections, etc.
- **`src/state/store.ts`** — Zustand-style store for AppState.
- **`src/bootstrap/state.ts`** — Module-level singletons for session-global state (session ID, CWD, project root, token counts).

### Context & System Prompt

- **`src/context.ts`** — Builds system/user context for API call (git status, date, CLAUDE.md contents, memory files).
- **`src/utils/claudemd.ts`** — Discovers + loads CLAUDE.md files from project hierarchy.

### Feature Flag System

All `feature('FLAG_NAME')` calls from `bun:bundle` (build-time API). In decompiled version, `feature()` polyfilled to always return `false` in `cli.tsx`. All Anthropic-internal features disabled.

### Stubbed/Deleted Modules

| Module | Status |
|--------|--------|
| Computer Use (`@ant/*`) | Stub packages in `packages/@ant/` |
| `*-napi` packages (audio, image, url, modifiers) | Stubs in `packages/` (except `color-diff-napi` fully implemented) |
| Analytics / GrowthBook / Sentry | Empty implementations |
| Magic Docs / Voice Mode / LSP Server | Removed |
| Plugins / Marketplace | Removed |
| MCP OAuth | Simplified |

### Key Type Files

- **`src/types/global.d.ts`** — Declares `MACRO`, `BUILD_TARGET`, `BUILD_ENV` + internal Anthropic-only identifiers.
- **`src/types/internal-modules.d.ts`** — Type declarations for `bun:bundle`, `bun:ffi`, `@anthropic-ai/mcpb`.
- **`src/types/message.ts`** — Message type hierarchy (UserMessage, AssistantMessage, SystemMessage, etc.).
- **`src/types/permissions.ts`** — Permission mode + result types.

## Working with This Codebase

- **Don't fix all tsc errors** — from decompilation, don't affect runtime.
- **`feature()` always `false`** — code behind feature flag = dead code in this build.
- **React Compiler output** — Components have decompiled memoization boilerplate (`const $ = _c(N)`). Normal.
- **`bun:bundle` import** — In `src/main.tsx` etc., `import { feature } from 'bun:bundle'` works at build time. At dev-time, polyfill in `cli.tsx` provides it.
- **`src/` path alias** — tsconfig maps `src/*` to `./src/*`. Imports like `import { ... } from 'src/utils/...'` valid.

## Technology Stack

| Tool | Version | Status |
|------|---------|--------|
| Bun runtime | ^1.3.x | Locked — sole runtime |
| TypeScript | ^6.0.2 | In devDependencies |
| @biomejs/biome | ^2.4.10 | Lint-only config |
| @anthropic-ai/sdk | ^0.80.0 | Core dependency |

## Requirements

- Bun >= 1.3.0
- Anthropic API key (set `ANTHROPIC_API_KEY` env var)

## License

See LICENSE file.
