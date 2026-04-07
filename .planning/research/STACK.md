# Technology Stack

**Project:** CCB (Claude Code Best) — Engineering Maturity Milestone
**Domain:** Decompiled TypeScript CLI tool (Bun + Ink + React terminal AI assistant)
**Researched:** 2026-04-06
**Scope:** What to ADD for type safety, test coverage, and maintainability. Core stack (Bun, Ink, React, Commander.js, Zustand) is already established and not revisited here.

---

## Already in Place (Do Not Re-introduce)

| Tool | Version in package.json | Status |
|------|--------------------------|--------|
| Bun runtime | ^1.3.x (latest ~1.3.10) | Locked — sole runtime |
| TypeScript | ^6.0.2 | In devDependencies |
| @biomejs/biome | ^2.4.10 | In devDependencies, lint-only config |
| @anthropic-ai/sdk | ^0.80.0 (latest 0.82.0) | Core dependency |
| bun test | built-in | 58 tests across 3 modules |

---

## Recommended Stack Additions

### 1. Type Checking Strategy — Incremental Suppression with ts-ignore Budgets

**Problem:** ~1341 tsc errors from decompilation. Cannot mass-fix without breaking runtime behavior. `tsc --noEmit` currently either times out or produces overwhelming output.

**Recommendation:** Do NOT chase all 1341 errors at once. Use module-level suppression + targeted re-enabling.

**Approach A — Module-level tsconfig islands (HIGH confidence)**

Create `tsconfig.strict.json` overlapping only files you are actively fixing:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src/tools/BashTool/**", "src/query.ts"],
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

Run separately: `tsc -p tsconfig.strict.json --noEmit`

This gives clean type feedback on the modules being hardened without the 1341-error flood from the rest of the codebase.

**Approach B — ts-morph for bulk annotation of degraded types (MEDIUM confidence)**

Use `ts-morph` to programmatically find all parameters and return types inferred as `unknown` / `never` / `{}` and insert explicit `// @ts-expect-error` comments or narrow types. This is a one-time automated pass, not ongoing tooling.

| Library | Version | Why |
|---------|---------|-----|
| ts-morph | ^27.0.2 | TypeScript Compiler API wrapper for AST-level programmatic code transformation. Enables writing a script to bulk-annotate decompiled `_c()` memoization artifacts and `unknown` params rather than hand-editing. Latest version tracks TypeScript 5.x/6.x. |

**Install as devDependency only:**
```bash
bun add -d ts-morph
```

**What NOT to do:** Don't run `tsc --strict` globally and try to fix all errors before other work. Don't use `// @ts-ignore` (suppresses without tracking). Prefer `// @ts-expect-error` so errors become visible when the type actually gets fixed.

---

### 2. Ink Component Testing — ink-testing-library + bun test

**Problem:** No tests exist for the Ink REPL, message rendering, or input components. These are hard to test because they render to a virtual terminal.

**Recommendation:** `ink-testing-library` v4.0.0 — the only purpose-built solution for Ink component testing. No alternative exists. Provides `render()`, `lastFrame()`, `stdin.write()`, and `rerender()`.

| Library | Version | Why |
|---------|---------|-----|
| ink-testing-library | ^4.0.0 | Official Ink testing utilities. Last published May 2024, stable for Ink 5.x. Render to virtual terminal, access output frames, simulate stdin. |

**Bun compatibility caveat (LOW-MEDIUM confidence):** There have been reported issues with Testing Library + Bun (type-level errors around generic matchers). As of Bun 1.3.x, fake timers work with testing-library. Recommend verifying compatibility after install with a minimal smoke test before building test suites on top of it. If ink-testing-library fails under Bun's Jest-compat layer, the fallback is to test Ink components by spawning the CLI in a child process and asserting on stdout.

**Snapshot testing for terminal output:** Bun's built-in `.toMatchSnapshot()` works for capturing `lastFrame()` output from ink-testing-library. Store snapshots in `__snapshots__/`. Use `bun test --update-snapshots` to regenerate. This is the right approach for terminal UI regression testing — no additional library needed.

```bash
bun add -d ink-testing-library
```

**What NOT to do:** Don't install Jest or Vitest — they add a second test runner alongside `bun test`, creating two separate configs and incompatible APIs. Don't use `@testing-library/react` for Ink components — it targets DOM, not the terminal reconciler.

---

### 3. Streaming API Resilience — Wrapper Pattern over @anthropic-ai/sdk

**Problem:** The SDK's streaming has documented issues: streams freeze after thinking blocks, `TypeError: terminated` on large payloads, no idle timeout by default. These cause CLI hangs in `src/query.ts`.

**Recommendation:** Build a thin wrapper using `p-retry` for retryable errors plus manual AbortController-based idle timeout. Do NOT replace the SDK — wrap it.

| Library | Version | Why |
|---------|---------|-----|
| p-retry | ^6.x | Exponential backoff with jitter for transient errors (connection reset, 429, 500s). The SDK already retries some errors via `maxRetries`, but p-retry gives precise per-call control for the stream reconnect case. ESM-native (sindresorhus), tree-shakeable. |

**Pattern for idle timeout (implement in `src/services/api/claude.ts`):**

```typescript
// Wrap stream with idle timeout detection
async function* withIdleTimeout<T>(
  stream: AsyncIterable<T>,
  idleMs = 30_000
): AsyncIterable<T> {
  const abort = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout>;

  const resetTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abort.abort(), idleMs);
  };

  resetTimer();
  try {
    for await (const chunk of stream) {
      resetTimer();
      yield chunk;
    }
  } finally {
    clearTimeout(idleTimer);
  }
}
```

The SDK's `maxRetries` (default: 2) handles 408, 429, 500+ automatically. Supplement with p-retry only at the stream-session level (reconnect on ECONNRESET, EPIPE, ETIMEDOUT — these are NOT retried by the SDK per issue #37077).

```bash
bun add p-retry
```

**What NOT to do:** Don't use `axios-retry` or `got` — they wrap HTTP, not the SSE stream layer. Don't add a generic timeout to the entire Anthropic client via `timeout` option — this will cut off legitimate long-running Claude responses. The idle timeout (no activity for N seconds) is the correct signal, not total wall-clock duration.

---

### 4. Code Coverage — bun test --coverage (built-in, no additions)

**Recommendation:** Use Bun's built-in `--coverage` flag. No new library needed.

```bash
bun test --coverage
bun test --coverage --coverage-reporter=lcov  # for CI badge
```

**Limitation:** Bun's coverage only tracks files that are loaded by the test runner. Files never imported during tests show 0% rather than being excluded. This is a known gap (oven-sh/bun issue #7254). Workaround: add explicit `import` or re-export stubs for core modules in test setup files.

**What NOT to do:** Don't add c8 or nyc — they require Node.js's V8 coverage APIs, which don't apply to Bun. Don't add Istanbul — same Node.js dependency issue.

---

### 5. React Compiler Artifact Cleanup — ts-morph (same tool, different use)

**Problem:** Components contain `const $ = _c(N)` memoization boilerplate from React Compiler decompilation. This bloats files, confuses readers, and makes diffs unreadable.

**Recommendation:** Write a one-time ts-morph script to detect and remove `_c()` call patterns + their `$[N]` cache reads where the surrounding component can be safely simplified. This is not ongoing tooling — it's a migration script run once per file group.

This reuses the ts-morph installation from item 1 above. No additional libraries needed.

---

## Development Tools — What's Already Sufficient

| Tool | Already Present | Gap |
|------|----------------|-----|
| Biome 2.4.10 | Yes — lint-only | Already configured correctly: `recommended: false`, formatter disabled |
| TypeScript 6.0.2 | Yes | Add `tsconfig.strict.json` overlay (no new install) |
| bun test | Yes | Add ink-testing-library for component tests |
| bun build | Yes | No changes needed |

**Biome 2.0+ (already installed) note:** Biome 2.x gained type inference — it can now catch type-related issues without the TypeScript compiler, covering ~85% of what `typescript-eslint` would catch. Because the project already has Biome 2.4.10, there is NO reason to add `typescript-eslint`. The decompiled code would produce floods of false positives under `typescript-eslint`'s type-aware rules anyway.

---

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

---

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

---

## Installation Summary

```bash
# Type analysis and AST transformation (one-time migration tooling)
bun add -d ts-morph

# Ink component testing
bun add -d ink-testing-library

# Streaming resilience (runtime dependency)
bun add p-retry
```

**tsconfig.strict.json** (new file, no install):
```json
{
  "extends": "./tsconfig.json",
  "include": [],
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true
  }
}
```

Add to `package.json` scripts:
```json
{
  "typecheck:strict": "tsc -p tsconfig.strict.json"
}
```

---

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

---

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
