# Domain Pitfalls: Decompiled CLI Codebase Recovery

**Domain:** Reverse-engineered CLI tool hardening (CCB / Claude Code Best)
**Researched:** 2026-04-06
**Confidence:** HIGH (directly verified against codebase + official docs)

---

## Critical Pitfalls

Mistakes that cause silent regressions, broken runtime behavior, or forced rewrites.

---

### Pitfall 1: Type Annotation Diverges From Runtime Shape

**What goes wrong:** A developer annotates an `unknown` or `{}` parameter with a type that looks correct based on surrounding code — but the decompiled code's actual runtime value has a subtly different shape. TypeScript stops complaining, tests pass on the typed path, but production edge cases hit the untyped path and throw at runtime.

**Why it happens:** In `src/query.ts` and `src/services/api/claude.ts`, there are 23+ `as unknown as ...` and `as any` double-casts inherited from decompilation. These exist precisely because the original bundle's types were erased. When you annotate one side of such a cast, the compiler accepts it — but you have not actually verified the shape at runtime.

**Consequences:** Silent runtime exceptions in the query loop. Tool calls receive malformed inputs. The API client passes incorrectly shaped `content` arrays that the Anthropic SDK validates only at the network boundary. These bugs only appear under specific model responses (e.g., multi-block tool calls, thinking blocks).

**Prevention:**
1. Before removing any `as unknown as` cast, add a runtime assertion or Zod schema parse at the boundary. Parse, do not trust.
2. Prioritize annotations that start at the outermost SDK boundary (`BetaRawMessageStreamEvent`) and flow inward, rather than guessing internal shapes.
3. Never annotate internal decompiled variables to satisfy the compiler without a corresponding runtime validation test.

**Warning signs:**
- A `as unknown as X` cast is replaced with `as X` without a test covering that path
- Types are added to parameters inside tool `call()` methods without integration tests
- `tsc --strict` errors decrease but no new tests were added

**Phase mapping:** Type recovery work (any phase targeting the ~1341 tsc errors)

---

### Pitfall 2: Refactoring `_c()` Memoization Breaks React Component Invariants

**What goes wrong:** The `_c()` calls in `REPL.tsx` and other Ink components are `react/compiler-runtime`'s internal cache hook — not `useMemo`. Developers unfamiliar with React Compiler output attempt to "clean up" the boilerplate by replacing `_c` cache arrays with standard `useMemo`/`useCallback` calls. This changes memoization semantics, causes re-renders, or — worse — introduces stale closure bugs in the REPL input handler.

**Why it happens:** The decompiled output looks noisy and the `$` array with index-based reads (`$[0]`, `$[1]`) is unfamiliar. It is tempting to refactor it. But `_c()` slots are compiler-managed and their invalidation logic was generated to match the component's exact dependency graph — which is no longer readable in decompiled form.

**Consequences:** The interactive REPL loses input responsiveness. Keyboard shortcut handlers fire with stale state. Message rendering de-syncs. These bugs are hard to reproduce in unit tests because they require real terminal I/O timing.

**Prevention:**
1. Do not touch `_c()` blocks without first understanding the full component's data flow.
2. If cleanup is needed, delete the entire component and rewrite from scratch using readable React — do not surgically patch decompiled memoization.
3. Add Ink `render()` integration tests that assert output after simulated user input before touching any component.
4. React Compiler 1.0 (released 2025-12) treats `_c` as an internal API not meant for manual use — treat all `_c` blocks as read-only until a component rewrite is planned.

**Warning signs:**
- Incremental replacement of `$[N]` reads with inline expressions
- Introduction of `useMemo` or `useCallback` adjacent to existing `_c()` blocks
- Component has both `_c()` and manual memoization simultaneously

**Phase mapping:** React Compiler cleanup milestone

---

### Pitfall 3: Enabling a Feature Flag Without Understanding Its Full Dependency Graph

**What goes wrong:** The feature flag system (`feature('FLAG_NAME')`) gates ~20+ tools and code branches. A developer enables a flag (e.g., `COORDINATOR_MODE`, `KAIROS`) to test a feature, not realizing the gated module imports an unimplemented stub package from `packages/@ant/` or a removed module. The import fails at runtime, crashing the entire CLI on startup — not just the gated feature.

**Why it happens:** In `src/tools.ts`, feature flags control conditional `require()` calls at module scope. If the required module path resolves to a stub or removed file, the error is thrown during import resolution, before any error boundary can catch it. The stub packages in `packages/@ant/` are placeholders that may export `{}` or throw.

**Consequences:** The CLI crashes silently with a module-not-found or undefined-export error. Since `feature()` is resolved at import time for several flags, a bad flag enable can make the entire tool non-runnable.

**Prevention:**
1. Before enabling any flag, trace its `require()` call in `tools.ts` to its module path and verify the module exists and exports the expected shape.
2. Add a feature flag validation step to the test suite: for each flag, enabling it should not crash the CLI import chain.
3. Document which flags are "safe to enable" vs. "require module implementation" in a flag registry.

**Warning signs:**
- `CLAUDE_FEATURE_ALL=true` is used for testing without verifying all module paths
- A flag is enabled in `feature-flags.json` and the CLI startup error is dismissed as "a different issue"
- Stub packages in `packages/@ant/` are not audited before flag enablement

**Phase mapping:** Feature flag hardening, any tool-system milestone

---

### Pitfall 4: Streaming Error Recovery Creates Silent Data Loss

**What goes wrong:** The streaming path in `src/services/api/claude.ts` includes a stream watchdog (idle abort after N seconds), abort signal propagation, and a non-streaming fallback path. These interact with the compaction logic in `QueryEngine.ts` in non-obvious ways. A partial stream that triggers the watchdog may leave the conversation state in a partially-committed state — the assistant message exists in the message array but the compact boundary was not written.

**Why it happens:** The `QueryEngine` writes compact boundary messages to history conditionally (line ~704). If an abort fires mid-stream, the conversation history write and the in-memory state may diverge. The `file history snapshot` taken before the turn may be stale. The Anthropic SDK notes that tool use blocks cannot be partially recovered — if an abort fires during tool input streaming, the tool call is unrecoverable without a retry.

**Consequences:** On the next session resume, the conversation history is in an inconsistent state. The compaction metadata references a `tailUuid` that does not exist in the persisted file. Tool calls appear to have been invoked but their inputs are empty `{}` or truncated JSON.

**Prevention:**
1. Model the streaming state machine explicitly: `idle -> streaming -> tool_calling -> committing -> committed`. Each transition needs a test.
2. Wrap all history writes in an atomic operation — write to a temp file, then rename.
3. Test the watchdog abort path specifically: assert conversation state after a mid-stream abort and verify it is either fully rolled back or fully committed.
4. Do not assume the non-streaming fallback path is equivalent to streaming — it goes through a different code path in `claude.ts` and must be tested separately.

**Warning signs:**
- Streaming integration tests do not simulate connection drops or timeouts
- `streamWatchdogFiredAt` metric is logged but never asserted in tests
- No test exercises the `compact_boundary` write path after an aborted turn

**Phase mapping:** API layer resilience milestone, streaming hardening

---

### Pitfall 5: `strict: false` in tsconfig Masks Real Bugs Introduced During Cleanup

**What goes wrong:** The current `tsconfig.json` has `"strict": false` and `"skipLibCheck": true`. This was correct for the initial decompiled state. But as type recovery proceeds and new code is written, strict mode would catch real bugs — null pointer dereferences, implicit any leakage, missing property checks. Because strict is off, these new bugs are silently accepted by the compiler.

**Why it happens:** The temptation is to keep `strict: false` "until all 1341 errors are fixed." But that means all new code written during recovery also runs without strict checks, defeating the purpose of adding types.

**Consequences:** New code written during type recovery introduces bugs that strict mode would have caught. By the time strict mode is enabled, there are two categories of errors: legacy decompilation errors and new errors from the recovery work itself — indistinguishable without git history.

**Prevention:**
1. Enable strict mode incrementally per-file using `// @ts-check` or per-directory tsconfig overrides, not globally.
2. New files created during recovery should immediately be placed under a strict-enabled tsconfig path.
3. Use the strategy: enable one strict sub-flag at a time (`strictNullChecks`, `noImplicitAny`), fix the errors it exposes in new code only, skip decompiled files with `// @ts-nocheck` until their dedicated cleanup phase.
4. Track separately: "tsc errors in decompiled files" vs. "tsc errors in new/recovered files." The second number must be zero.

**Warning signs:**
- A new utility function is written without null checks because "the project doesn't use strict anyway"
- The tsc error count decreases but no `@ts-nocheck` was added to skip a file (meaning an unsafe cast was introduced instead)
- `skipLibCheck: true` is left in place when adding new SDK integrations

**Phase mapping:** Every milestone — this is a cross-cutting concern

---

## Moderate Pitfalls

---

### Pitfall 6: Tests Cover Pure Functions Only, Missing Integration Behavior

**What goes wrong:** The existing 58 tests cover `sanitization`, `uuid`, and `keybindings` — all pure functions with no side effects and no Bun API dependencies. This is the right starting point, but it creates false confidence. The core risk in this codebase is not in utility functions — it is in the query loop, tool execution, and streaming state. A test suite that only covers pure functions leaves the dangerous parts entirely untested.

**Prevention:**
1. Categorize test coverage explicitly: "pure function tests" vs. "integration tests" vs. "streaming behavior tests." Track each separately.
2. Before declaring a module "hardened," require at least one test that exercises its primary code path with a mocked Anthropic client.
3. Use Bun's built-in `mock()` to stub the Anthropic SDK streaming endpoint for deterministic testing.
4. Do not count test count as a proxy for coverage quality.

**Warning signs:**
- All new tests are in `utils/` or similarly peripheral locations
- Test count grows without any tests touching `src/query.ts`, `src/QueryEngine.ts`, or `src/tools/BashTool/`
- "58 tests passing" is reported as evidence of stability for core features

**Phase mapping:** Test coverage expansion milestone

---

### Pitfall 7: Bun-Specific APIs Used Without Fallback Guards

**What goes wrong:** The codebase already uses `Bun.stringWidth`, `Bun.wrapAnsi`, `Bun.hash`, `Bun.JSONL.parseChunk`, and `Bun.which` — with conditional checks (`typeof Bun !== 'undefined'`). But new code added during recovery may call `Bun.*` APIs directly, without the guard, especially in modules that are "obviously Bun-only." This breaks the non-bundled dev mode edge cases and makes the code untestable in environments where a Bun API is not yet stable.

**Prevention:**
1. Treat all `Bun.*` API calls as optional — always wrap in a capability check or an abstraction layer.
2. The pattern used in `src/ink/stringWidth.ts` (resolve once at module scope with a fallback) is correct — follow it.
3. When adding a new `Bun.*` API, check the Bun changelog for the version it was introduced. Bun has had edge-case bugs in early versions of streaming and fetch.

**Warning signs:**
- `Bun.serve()`, `Bun.file()`, or similar APIs called without typeof guard
- New utility function imports directly from `bun:*` without a polyfill path

**Phase mapping:** Any infrastructure or API layer milestone

---

### Pitfall 8: MCP Integration Assumes OAuth Is Fully Removed

**What goes wrong:** The PROJECT.md states MCP OAuth is "simplified version only." But the MCP code paths in `src/services/` likely still have conditional OAuth logic that was not fully removed — just gated. If MCP integration work begins without auditing these paths, partially-removed OAuth code may be re-triggered by a config value or environment variable, causing confusing auth failures or token leaks to logs.

**Prevention:**
1. Audit all MCP-related files for OAuth references before any MCP work begins.
2. Remove OAuth code paths entirely rather than gating them — dead code in auth flows is a security risk.
3. Test MCP connection with explicitly no auth configured, asserting no OAuth token fetch is attempted.

**Warning signs:**
- MCP auth error messages mention OAuth or token refresh during integration testing
- `src/services/` contains OAuth-related imports that are conditionally executed

**Phase mapping:** MCP server integration milestone

---

### Pitfall 9: `require()` at Module Scope for Feature-Gated Imports

**What goes wrong:** In `QueryEngine.ts` (line ~122), feature-gated imports use `require()` at module scope with conditional checks. This is correct for Bun's CommonJS interop but creates a subtle ordering problem: if these imports reference files that import other things that have side effects, those side effects run at module load time regardless of the feature flag.

**Prevention:**
1. Prefer dynamic `import()` inside a function body for truly optional modules, not `require()` at scope.
2. When a module-level `require()` is unavoidable, document why and add a test that verifies the module does not execute side effects when its flag is false.

**Warning signs:**
- Module-scope `require()` call added adjacent to a `feature()` check
- New feature-gated tool added using `require()` pattern without testing cold-start behavior

**Phase mapping:** Tool system hardening milestone

---

## Minor Pitfalls

---

### Pitfall 10: Snapshot Tests for Terminal UI Lock In Decompiled Rendering Artifacts

**What goes wrong:** Adding Ink snapshot tests against the current decompiled component output will snapshot `_c()` artifacts, decompilation-era variable names, and other transient details. When those components are rewritten, every snapshot breaks — not because behavior changed, but because the snapshot was testing implementation rather than output.

**Prevention:** Snapshot only the rendered terminal string output (what the user sees), never the component tree or internal React structure. Use `ink`'s `render()` and assert on `lastFrame()` string output only.

**Phase mapping:** Test expansion milestone (before React Compiler cleanup)

---

### Pitfall 11: `CLAUDE_FEATURE_ALL=true` Used in Development Becomes a Dependency

**What goes wrong:** A developer enables `CLAUDE_FEATURE_ALL=true` to test a specific flag, then forgets it. Other features that were previously "safely off" are now running and masking integration failures. When the project runs in the default `false` configuration, behavior differs.

**Prevention:** Never leave `CLAUDE_FEATURE_ALL=true` in a `.env` or shell config. Use per-flag `CLAUDE_FEATURE_X=true` targeting only the flag under test. Add a CI gate that runs all tests with the default flag state (all false).

**Phase mapping:** Feature flag milestone

---

## "Looks Done But Isn't" Checklist

These completion signals are false for this project:

| Signal | Why It Is Not Done |
|--------|-------------------|
| tsc error count drops by 200 | Could mean 200 `as unknown as X` casts were added, not fixed |
| All existing tests pass | Tests only cover pure utilities, not the query loop or tools |
| `bun run build` succeeds | The build bundles dead code behind `feature()` — runtime coverage is what matters |
| A tool's TypeScript compiles cleanly | Type safety at compile time does not guarantee the tool's `call()` output matches its return type annotation |
| Feature flag is enabled and doesn't crash | May crash only on specific tool call patterns, not on startup |
| React component renders in basic test | Does not verify correct memoization behavior under rapid input |

---

## Pitfall-to-Phase Mapping

| Milestone Topic | Likely Pitfall | Mitigation |
|-----------------|---------------|------------|
| Type error reduction (~1341 errors) | Pitfall 1 (annotation diverges from runtime), Pitfall 5 (strict: false masks new bugs) | Runtime assertions before removing casts; per-directory strict tsconfig |
| Tool system hardening (BashTool, FileEditTool, etc.) | Pitfall 6 (pure-only tests), Pitfall 9 (module-scope require) | Integration tests with mocked filesystem; audit require() calls |
| API layer resilience (streaming, error recovery) | Pitfall 4 (streaming creates silent data loss), Pitfall 7 (Bun API without fallback) | State machine tests; abort path assertions |
| MCP server integration | Pitfall 8 (OAuth not fully removed) | Full OAuth audit before starting |
| React Compiler cleanup | Pitfall 2 (_c() refactoring breaks invariants), Pitfall 10 (snapshot tests lock in artifacts) | Rewrite-not-patch strategy; output-only snapshots |
| Feature flag system | Pitfall 3 (enabling flag without checking deps), Pitfall 11 (FEATURE_ALL in dev) | Flag dependency graph audit; CI with default flag state |
| Test coverage expansion | Pitfall 6 (false confidence from peripheral tests) | Coverage by code path tier, not count |

---

## Sources

- [Anthropic Streaming Messages Docs](https://docs.anthropic.com/en/api/messages-streaming) — streaming event types, partial JSON handling, non-recoverability of tool blocks (HIGH confidence)
- [Fine-grained Tool Streaming — Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming) — partial JSON in tool inputs, beta header requirements (HIGH confidence)
- [React Compiler 1.0 InfoQ announcement](https://www.infoq.com/news/2025/12/react-compiler-meta/) — `_c()` as internal-only API (MEDIUM confidence)
- [React Compiler pitfalls — DEV Community](https://dev.to/usapopopooon/will-react-compiler-make-manual-memoization-obsolete-things-to-know-before-adopting-it-4ie9) — conflict with manual memoization (MEDIUM confidence)
- [Fork drift pitfalls — Preset Engineering](https://preset.io/blog/stop-forking-around-the-hidden-dangers-of-fork-drift-in-open-source-adoption/) — maintenance burden of diverged forks (MEDIUM confidence)
- [Incremental TypeScript strict mode migration — Bitovi](https://www.bitovi.com/blog/how-to-incrementally-migrate-an-angular-project-to-typescript-strict-mode) — per-flag strict adoption (MEDIUM confidence)
- [Bun runtime edge cases — JS Runtimes 2025](https://debugg.ai/resources/js-runtimes-have-forked-2025-cross-runtime-libraries-node-bun-deno-edge-workers) — Bun-specific streaming/fetch quirks (MEDIUM confidence)
- Direct codebase inspection: `src/query.ts`, `src/services/api/claude.ts`, `src/QueryEngine.ts`, `src/tools.ts`, `src/screens/REPL.tsx`, `tsconfig.json` (HIGH confidence)
