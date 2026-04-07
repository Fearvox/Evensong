# Phase 1: Foundation Hardening - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver correct, non-decompiled type annotations for core type definitions (message.ts, permissions.ts), state layer (AppStateStore, bootstrap singletons), and Tool interface (Tool.ts). Establish tsconfig strict overlay so new/recovered files enforce strict mode. Verify Anthropic SDK event types compile with Zod validation. Test infrastructure runs and reports coverage for recovered modules.

</domain>

<decisions>
## Implementation Decisions

### Type Recovery Strategy
- **D-01:** Use tsconfig.strict.json overlay pattern — a secondary tsconfig that `extends` the base and only `include`s files actively being hardened. Do NOT mass-enable strict on the whole codebase.
- **D-02:** Fix types bottom-up following the import graph: pure type defs first (message.ts, permissions.ts), then state layer, then Tool.ts interface. Never start from UI/REPL layer.
- **D-03:** For each file entering strict mode: fix real type errors, remove `unknown`/`never`/`{}` on public interfaces. Use `as` casts ONLY at decompilation boundaries where runtime shape is verified but tsc cannot infer.

### Zod Boundary Validation
- **D-04:** Place Zod runtime validation at the API boundary only — specifically where Anthropic SDK `BetaRawMessageStreamEvent` enters our code in `src/services/api/claude.ts`. This is Phase 1 scope. Tool input validation with Zod is Phase 2 scope.
- **D-05:** The Zod schema should validate the event shape we actually consume, not the full SDK type. Parse what we use, passthrough what we don't.

### Test Structure
- **D-06:** Tests go in co-located `__tests__/` directories next to the source files they test (e.g., `src/types/__tests__/message.test.ts`). This follows Bun convention and keeps test proximity.
- **D-07:** Use `bun test` with snapshot testing for type shape verification. Existing 58 tests in `src/utils/` stay where they are.

### Strict Mode Boundary
- **D-08:** Files entering strict in Phase 1: `src/types/message.ts`, `src/types/permissions.ts`, `src/state/AppState.tsx`, `src/state/AppStateStore.ts`, `src/state/store.ts`, `src/bootstrap/state.ts`, `src/Tool.ts`. All other files remain under base tsconfig (strict: false).
- **D-09:** Every NEW file created during this project must be added to tsconfig.strict.json from creation. No exceptions.

### Claude's Discretion
- Internal type naming conventions and utility type patterns
- Whether to use branded types or plain type aliases for message IDs
- Exact Zod schema structure (strict vs passthrough on sub-objects)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Type Definitions (primary targets)
- `src/types/message.ts` — Message type hierarchy (17 unknown/never/{} occurrences to fix)
- `src/types/permissions.ts` — Permission mode and result types (8 occurrences)
- `src/types/global.d.ts` — MACRO, BUILD_TARGET, BUILD_ENV declarations

### State Layer (secondary targets)
- `src/state/AppState.tsx` — Central app state type and context provider
- `src/state/AppStateStore.ts` — State store implementation
- `src/state/store.ts` — Zustand-style store
- `src/bootstrap/state.ts` — Session-global singletons (session ID, CWD, project root, tokens)

### Tool Interface
- `src/Tool.ts` — Tool type definition and utilities (30 unknown/never/{} occurrences)

### API Boundary
- `src/services/api/claude.ts` — 7 BetaRawMessageStreamEvent references; Zod validation target

### Config
- `tsconfig.json` — Current config: strict: false, skipLibCheck: true, ESNext target

### Existing Tests
- `src/utils/__tests__/` — 58 existing tests (sanitization, uuid, keybindings)

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bun test` already configured and running 58 tests
- Biome lint already configured with hand-picked rules
- Feature flag system already runtime-configurable

### Established Patterns
- ESM imports with `src/*` path alias
- React Compiler output with `_c()` memoization (do NOT touch in Phase 1)
- `feature()` polyfill in cli.tsx

### Integration Points
- `Tool.ts` is imported by every tool in `src/tools/` — type changes cascade
- `message.ts` types used throughout query.ts, QueryEngine.ts, REPL.tsx
- `AppState` consumed by all Ink components via context

</code_context>

<specifics>
## Specific Ideas

- Research recommended ts-morph for bulk AST transformations — evaluate in Phase 1 whether a one-time script for `unknown` → correct type annotation is viable
- The state layer has NO `as unknown as` or `as any` casts currently — types may be mostly correct but unannotated (implicit `any` from strict:false)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-hardening*
*Context gathered: 2026-04-06*
