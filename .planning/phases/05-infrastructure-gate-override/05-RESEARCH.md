# Phase 5: Infrastructure & Gate Override - Research

**Researched:** 2026-04-08
**Domain:** Feature flag override system, GrowthBook gate bypass, MCP transport connectivity
**Confidence:** HIGH

## Summary

Phase 5 targets three foundational requirements: (1) making `feature()` flags configurable at runtime via `~/.claude/feature-flags.json`, (2) documenting the full feature flag dependency graph, and (3) ensuring MCP stdio/SSE transports connect correctly. These three capabilities are hard prerequisites for all subsequent v2.0 phases -- every gated feature (memory extraction, deliberation, coordinator mode, KAIROS) depends on being activatable.

The current codebase has **two completely independent gate systems**: the `feature()` function from `bun:bundle` (compile-time/DCE) used in ~88 distinct flags across ~73 files, and the `tengu_*` GrowthBook runtime gates used in ~132 files. The INFRA-01 requirement specifically targets the `feature()` system. A critical discovery is that the existing `~/.claude/feature-flags.json` polyfill in `cli.tsx` **only works within cli.tsx itself** -- all other modules import from `bun:bundle` which always returns `false` at dev-time. This is the core problem to solve.

MCP transport code (`@modelcontextprotocol/sdk` v1.29.0) is substantial and well-structured, supporting stdio, SSE, HTTP, and WebSocket transports. The configuration system loads from multiple scopes (local, user, project, enterprise). The primary risk is Bun compatibility with the Node.js `child_process.spawn` used by `StdioClientTransport`.

**Primary recommendation:** Replace `import { feature } from 'bun:bundle'` across all source files with an import from a custom `src/utils/featureFlag.ts` module that reads `~/.claude/feature-flags.json` + env vars. Do NOT attempt to intercept `bun:bundle` resolution -- it is a Bun built-in that cannot be reliably overridden.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | GrowthBook gate override layer routes `tengu_*` runtime checks through local config file (`~/.claude/feature-flags.json`) | Two gate systems identified: `feature()` (bun:bundle, 88 flags) and `tengu_*` (GrowthBook, 132 files). Current polyfill only works in cli.tsx. Solution: replace bun:bundle imports with custom module. GrowthBook gates already have override mechanism via `getConfigOverrides()` but gated on USER_TYPE=ant. |
| INFRA-02 | Feature flag dependency graph is documented and CI-gatable | 88 distinct feature flags catalogued. Many have co-dependencies (KAIROS requires KAIROS_BRIEF, COORDINATOR_MODE enables SendMessageTool). Module-level const pattern means flags evaluated at import time. |
| INFRA-03 | MCP stdio and SSE transports connect correctly | MCP SDK v1.29.0 installed. Transport code exists in `src/services/mcp/client.ts`. StdioClientTransport spawns subprocess via Node.js child_process. Bun compatibility with child_process.spawn is the main risk. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Runtime**: Bun only (not Node.js) -- all imports, builds, execution use Bun APIs
- **Build**: Single-file bundle via `bun build` -- must remain single entry point
- **Module system**: ESM with `"type": "module"`, TSX with `react-jsx` transform
- **Decompilation debt**: Cannot mass-fix tsc errors without breaking runtime behavior -- incremental approach required
- **`feature()` is always `false`**: any code behind a feature flag is dead code in this build
- **`bun:bundle` import**: In `src/main.tsx` and other files, `import { feature } from 'bun:bundle'` works at build time. At dev-time, the polyfill in `cli.tsx` provides it (NOTE: research found this claim partially incorrect -- see Architecture Patterns)
- **No test runner configured** (CLAUDE.md says this but `bun test` works with 218 tests passing)
- **Don't try to fix all tsc errors** -- they're from decompilation and don't affect runtime

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP client SDK for stdio/SSE/HTTP/WS transports | [VERIFIED: node_modules] Already in package.json |
| `@growthbook/growthbook` | 1.6.5 | Runtime feature gating (tengu_* gates) | [VERIFIED: node_modules] Already in package.json |
| Bun runtime | 1.3.11 | Runtime, test runner, bundler | [VERIFIED: bun --version] Locked per CLAUDE.md |

### Supporting (No New Dependencies Required)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bun test` | built-in | Test framework (218 tests, 19 files) | [VERIFIED: bun test] All tests pass |
| `zod` | already installed | Schema validation for feature-flags.json | [VERIFIED: import in src/services/mcp/types.ts] Already in dependencies |

**No new packages needed for this phase.** [VERIFIED: codebase analysis]

## Architecture Patterns

### Critical Discovery: Two Independent Gate Systems

The codebase has TWO completely separate feature gating mechanisms: [VERIFIED: codebase grep]

**1. `feature()` from `bun:bundle` (Compile-Time DCE)**
- 88 distinct flag names across 73+ files
- Used at module top-level for dead code elimination: `const X = feature('FLAG') ? require(...) : null`
- At build time: Bun replaces `feature()` calls with literal `true`/`false`
- At dev time (`bun run dev`): Bun's built-in `bun:bundle` module returns `false` for all flags
- Can only be used in `if` statements or ternary conditions (Bun enforces this)
- **The polyfill in cli.tsx does NOT affect these imports** -- each file imports independently from `bun:bundle`

**2. `tengu_*` GrowthBook Runtime Gates**
- ~90+ gate names used across 132 files
- Accessed via `checkGate_CACHED_OR_BLOCKING()`, `getFeatureValue_CACHED_MAY_BE_STALE()`, `checkStatsigFeatureGate_CACHED_MAY_BE_STALE()`, `getDynamicConfig_CACHED_MAY_BE_STALE()`
- Override mechanism already exists but gated on `USER_TYPE === 'ant'`
- Values come from: (1) env var `CLAUDE_INTERNAL_FC_OVERRIDES`, (2) config `growthBookOverrides`, (3) remote eval cache, (4) disk cache
- `isGrowthBookEnabled()` returns `false` when analytics is disabled (test, Bedrock, Vertex, Foundry, telemetry opt-out)

### Recommended Solution for INFRA-01: Custom Feature Flag Module

**Replace `bun:bundle` imports with a custom module:**

```
src/
├── utils/
│   └── featureFlag.ts     # NEW: configurable feature() function
├── entrypoints/
│   └── cli.tsx            # UPDATE: import from utils/featureFlag.ts
```

The custom module pattern:

```typescript
// src/utils/featureFlag.ts
// Reads ~/.claude/feature-flags.json at import time (once)
// Supports: env var per-flag, env var all-on, config file, default false

const _flagCache: Record<string, boolean> = (() => {
  try {
    const fs = require('fs')
    const path = require('path')
    const flagFile = path.join(process.env.HOME || '', '.claude', 'feature-flags.json')
    if (fs.existsSync(flagFile)) {
      return JSON.parse(fs.readFileSync(flagFile, 'utf-8'))
    }
  } catch {}
  return {}
})()

export function feature(name: string): boolean {
  if (process.env.CLAUDE_FEATURE_ALL === 'true') return true
  const envVal = process.env[`CLAUDE_FEATURE_${name}`]
  if (envVal !== undefined) return envVal === 'true' || envVal === '1'
  return _flagCache[name] ?? false
}
```

**Then replace all `import { feature } from 'bun:bundle'` with `import { feature } from 'src/utils/featureFlag.js'`**

This is a mechanical find-and-replace across ~45 files. The `declare module "bun:bundle"` type declaration in `internal-modules.d.ts` should also be updated.

### Recommended Solution for INFRA-01 (tengu_* gates): Remove USER_TYPE Guard

The GrowthBook override system already supports local overrides via `getConfigOverrides()` and `setGrowthBookConfigOverride()`. However, both are gated on `USER_TYPE === 'ant'`. [VERIFIED: growthbook.ts lines 173, 212, 249, 274]

The fix is to remove or relax the `USER_TYPE` check so external users can also use local overrides. The override can be stored in `~/.claude/feature-flags.json` alongside feature() flags, using a `tengu_` prefix to differentiate.

Alternatively, since `isGrowthBookEnabled()` returns `false` when analytics is disabled (which it is for this decompiled build), all `tengu_*` gate functions return their default values (typically `false`). The override layer should intercept BEFORE the `isGrowthBookEnabled()` check.

### MCP Transport Architecture (INFRA-03)

MCP connections are managed through: [VERIFIED: codebase analysis]

```
src/services/mcp/
├── config.ts                  # Config loading: local, user, project, enterprise, claudeai scopes
├── types.ts                   # Zod schemas: stdio, sse, http, ws transport configs
├── client.ts                  # Core: connectToServer(), fetchToolsForClient(), ensureConnectedClient()
├── MCPConnectionManager.tsx   # React context provider wrapping useManageMCPConnections
├── useManageMCPConnections.ts # Hook: initializes connections on mount, handles reconnects
├── InProcessTransport.ts      # In-memory transport (e.g., Chrome MCP)
├── SdkControlTransport.ts     # IDE SDK transport
└── auth.ts                    # OAuth provider for MCP servers
```

**Connection flow:**
1. `getAllMcpConfigs()` merges configs from all scopes
2. `useManageMCPConnections` iterates servers, calls `connectToServer()` for each
3. `connectToServer()` creates transport based on type (stdio/sse/http/ws)
4. For stdio: `new StdioClientTransport({ command, args, env })` -- spawns subprocess
5. `new Client(...)` connects via transport with timeout
6. `fetchToolsForClient()` sends `tools/list` request, wraps results as `MCPTool` objects
7. Tools are merged via `assembleToolPool()` in `src/tools.ts`

**Config file locations (checked in order):**
- `.claude/settings.local.json` (project local, scope: local)
- `.claude/settings.json` (project, scope: project)
- `~/.claude/settings.json` (user global, scope: user)
- Enterprise managed MCP file (scope: enterprise)
- claude.ai fetched configs (scope: claudeai)

### Anti-Patterns to Avoid

- **DO NOT try to monkey-patch `bun:bundle`** -- it is a Bun built-in module that cannot be intercepted via `bunfig.toml`, plugins, or module resolution hacks. [VERIFIED: bun -e testing]
- **DO NOT change feature flags at runtime after import** -- many flags are captured in module-level constants (`const X = feature('FLAG') ? require(...) : null`). The flag value at import time is permanent for that process. [VERIFIED: src/tools.ts, src/query.ts patterns]
- **DO NOT remove the `bun:bundle` type declaration** until all imports are migrated -- it would cause TypeScript errors in every file that imports from it. [VERIFIED: internal-modules.d.ts]
- **DO NOT enable ALL feature flags at once** without understanding dependencies -- some flags load modules that may have broken imports or missing dependencies. [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP client/transport | Custom JSON-RPC over stdin | `@modelcontextprotocol/sdk` Client + StdioClientTransport | Already installed (v1.29.0), handles protocol negotiation, session management, timeouts |
| Feature flag config parsing | Custom parser | `JSON.parse()` + optional Zod validation | Config is simple key-value JSON; Zod is already in the project |
| MCP server process management | Custom spawn+pipe | `StdioClientTransport` from MCP SDK | Handles stdin/stdout framing, stderr capture, process lifecycle |
| GrowthBook override | Forked GrowthBook client | Modify existing `getConfigOverrides()` to remove `USER_TYPE` guard | Override mechanism already fully built, just gatekept |

## Common Pitfalls

### Pitfall 1: Module-Level Feature Flag Evaluation
**What goes wrong:** Changing `~/.claude/feature-flags.json` doesn't take effect because flags were already evaluated when modules were imported.
**Why it happens:** Pattern `const X = feature('FLAG') ? require('./module') : null` at top of file -- value is captured once at import time, before any runtime config could be read.
**How to avoid:** The custom `featureFlag.ts` module reads the config file synchronously at import time (IIFE), which happens before other modules evaluate their top-level constants. Since `cli.tsx` is the entry point and imports happen in order, the config file is read first.
**Warning signs:** Feature flag change requires process restart to take effect.

### Pitfall 2: bun:bundle Feature Only Works in Conditionals
**What goes wrong:** `const val = feature('X')` fails with "feature() from 'bun:bundle' can only be used directly in an if statement or ternary condition".
**Why it happens:** Bun enforces this restriction for dead code elimination. The compile-time `feature()` is not a regular function.
**How to avoid:** The custom `featureFlag.ts` module exports a regular function that has no such restriction. After migration, `feature()` can be used in any expression context.
**Warning signs:** Runtime error mentioning "can only be used directly in an if statement".

### Pitfall 3: GrowthBook isEnabled Returns False
**What goes wrong:** `getFeatureValue_CACHED_MAY_BE_STALE()` returns defaultValue for everything because `isGrowthBookEnabled()` returns false.
**Why it happens:** `isGrowthBookEnabled()` calls `is1PEventLoggingEnabled()` which calls `!isAnalyticsDisabled()`. Analytics is disabled when telemetry opt-out, or when using Bedrock/Vertex/Foundry. For this decompiled build, analytics is likely disabled.
**How to avoid:** Override layer must check `~/.claude/feature-flags.json` BEFORE the `isGrowthBookEnabled()` early-return. The existing env-var override (`getEnvOverrides()`) already does this but is gated on `USER_TYPE === 'ant'`.
**Warning signs:** All `tengu_*` gates return their default values regardless of config file settings.

### Pitfall 4: MCP Stdio Transport and Bun child_process
**What goes wrong:** `StdioClientTransport` uses Node.js `child_process.spawn()`. Bun's compatibility layer for `child_process` is good but not 100% identical.
**Why it happens:** The MCP SDK was built for Node.js. Bun emulates `child_process` but may have edge cases with stdin/stdout pipe buffering.
**How to avoid:** Test with a real MCP server (e.g., `@modelcontextprotocol/server-filesystem`) early. Check Bun's child_process compatibility notes.
**Warning signs:** MCP connection timeout, empty tool list, "connection timed out after Xms" errors.

### Pitfall 5: Feature Flag Co-Dependencies
**What goes wrong:** Enabling `KAIROS` without `KAIROS_BRIEF` or `KAIROS_CHANNELS` causes partial feature activation with undefined behavior.
**Why it happens:** Some flags load modules that expect other gated modules to also be present (e.g., KAIROS prompt additions reference KAIROS_BRIEF prompt sections).
**How to avoid:** The dependency graph document (INFRA-02) must capture these relationships. The `feature-flags.json` schema should validate co-dependencies.
**Warning signs:** Runtime errors about undefined modules or null function calls.

## Code Examples

### Feature Flag Override Module (INFRA-01)
```typescript
// src/utils/featureFlag.ts
// Source: Based on existing cli.tsx polyfill pattern [VERIFIED: cli.tsx lines 1-22]

const _flagCache: Record<string, boolean> = (() => {
  try {
    const fs = require('fs')
    const path = require('path')
    const flagFile = path.join(
      process.env.HOME || '',
      '.claude',
      'feature-flags.json',
    )
    if (fs.existsSync(flagFile)) {
      const data = JSON.parse(fs.readFileSync(flagFile, 'utf-8'))
      // Validate: all values should be boolean
      for (const [key, val] of Object.entries(data)) {
        if (typeof val !== 'boolean') {
          console.warn(`feature-flags.json: "${key}" is not boolean, ignoring`)
          delete data[key]
        }
      }
      return data
    }
  } catch (e) {
    // Silent fail -- fall back to all-false
  }
  return {}
})()

export function feature(name: string): boolean {
  // CLAUDE_FEATURE_ALL=true enables everything (debug/test only)
  if (process.env.CLAUDE_FEATURE_ALL === 'true') return true
  // Per-flag env var: CLAUDE_FEATURE_KAIROS=true
  const envVal = process.env[`CLAUDE_FEATURE_${name}`]
  if (envVal !== undefined) return envVal === 'true' || envVal === '1'
  // Config file fallback
  return _flagCache[name] ?? false
}

// For introspection/debugging
export function getAllFlags(): Record<string, boolean> {
  return { ..._flagCache }
}
```

### MCP Stdio Connection Test (INFRA-03)
```typescript
// Source: Based on src/services/mcp/client.ts connectToServer() [VERIFIED: client.ts lines 952-990]
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'

// Minimal MCP stdio connection test
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  env: { ...process.env } as Record<string, string>,
  stderr: 'pipe',
})

const client = new Client(
  { name: 'test-client', version: '1.0.0' },
  { capabilities: { roots: {} } },
)

await client.connect(transport)
const result = await client.request(
  { method: 'tools/list' },
  ListToolsResultSchema,
)
console.log('Tools:', result.tools.map(t => t.name))
await transport.close()
```

### GrowthBook Override Without USER_TYPE Gate
```typescript
// Source: Based on src/services/analytics/growthbook.ts [VERIFIED: lines 211-270]
// Current code: getConfigOverrides() checks USER_TYPE === 'ant'
// Fix: Remove the guard and read from feature-flags.json directly

function getLocalOverrides(): Record<string, unknown> | undefined {
  try {
    const fs = require('fs')
    const path = require('path')
    const flagFile = path.join(
      process.env.HOME || '',
      '.claude',
      'feature-flags.json',
    )
    if (fs.existsSync(flagFile)) {
      const data = JSON.parse(fs.readFileSync(flagFile, 'utf-8'))
      // Extract tengu_* entries for GrowthBook override
      const tenguOverrides: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(data)) {
        if (key.startsWith('tengu_')) {
          tenguOverrides[key] = val
        }
      }
      return Object.keys(tenguOverrides).length > 0 ? tenguOverrides : undefined
    }
  } catch {}
  return undefined
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `feature()` always returns false | Configurable via file/env | This phase | Unlocks all gated features for v2.0 |
| GrowthBook gates require `USER_TYPE=ant` | Local override for all users | This phase | External builds can control tengu_* gates |
| MCP untested in decompiled build | Verified stdio/SSE connectivity | This phase | Foundation for MCP-dependent features |

**Deprecated/outdated:**
- `checkStatsigFeatureGate_CACHED_MAY_BE_STALE()`: Migration-only function, falling back to Statsig cache. Should be treated as equivalent to `getFeatureValue_CACHED_MAY_BE_STALE()` for override purposes. [VERIFIED: growthbook.ts line 801]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Enabling ALL feature flags at once without dependency analysis may cause broken imports or missing module errors | Anti-Patterns | LOW -- worst case is runtime crash, not data corruption |
| A2 | Bun's child_process.spawn compatibility with MCP SDK StdioClientTransport works for basic stdio communication | Pitfall 4 | MEDIUM -- if broken, INFRA-03 needs a custom transport adapter |
| A3 | The `feature()` replacement across ~45 files is a safe mechanical find-and-replace | Architecture | LOW -- the function signature is identical; only the import source changes |

## Open Questions (RESOLVED)

1. **Should feature-flags.json support non-boolean values for tengu_* gates?** (RESOLVED)
   - What we know: `feature()` flags are boolean-only. `tengu_*` gates can have object/string/number values (dynamic configs).
   - What's unclear: Whether to use a single file for both or separate files.
   - Recommendation: Single file, differentiate by key prefix. Boolean keys for `feature()` flags, any-typed keys with `tengu_` prefix for GrowthBook gates.
   - **Resolution:** Single file approach adopted. Plan 01 validates boolean-only for `feature()` keys. Plan 03 reads `tengu_*` keys with any-typed values for GrowthBook gates. Both share `~/.claude/feature-flags.json`.

2. **Should the feature flag module support hot-reload?** (RESOLVED)
   - What we know: Module-level constants capture flag values at import time. Changing the file requires process restart.
   - What's unclear: Whether hot-reload within a session is desired.
   - Recommendation: No hot-reload for v2.0 -- process restart is acceptable. Document this limitation.
   - **Resolution:** No hot-reload. The IIFE pattern in `featureFlag.ts` reads the config file once at import time. This matches the existing module-level const pattern (`const X = feature('FLAG') ? require(...) : null`) which captures values permanently. Process restart required for config changes.

3. **Which MCP server to use as integration test target?** (RESOLVED)
   - What we know: `@modelcontextprotocol/server-filesystem` is the canonical example server.
   - What's unclear: Whether it works reliably on macOS under Bun's child_process.
   - Recommendation: Test with filesystem server first. Fall back to a minimal custom server if needed.
   - **Resolution:** Minimal custom MCP server script used as test fixture (written to temp file, speaks JSON-RPC over stdio). Avoids external dependency on `@modelcontextprotocol/server-filesystem`. For SSE transport, in-process `Bun.serve()` HTTP server implements the MCP SSE protocol. Both approaches are self-contained and reproducible.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | All | Yes | 1.3.11 | -- |
| bun test | INFRA-01, INFRA-03 tests | Yes | built-in | -- |
| @modelcontextprotocol/sdk | INFRA-03 | Yes | 1.29.0 | -- |
| @growthbook/growthbook | INFRA-01 (tengu) | Yes | 1.6.5 | -- |
| npx (for MCP server test) | INFRA-03 integration test | Yes | via Bun | bun x |

**Missing dependencies with no fallback:** None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun test (built-in) v1.3.11 |
| Config file | None (default bun test config) |
| Quick run command | `bun test --filter "phase5"` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01a | feature() reads ~/.claude/feature-flags.json | unit | `bun test src/utils/__tests__/featureFlag.test.ts -x` | Wave 0 |
| INFRA-01b | feature() respects per-flag env vars | unit | `bun test src/utils/__tests__/featureFlag.test.ts -x` | Wave 0 |
| INFRA-01c | CLAUDE_FEATURE_ALL=true enables everything | unit | `bun test src/utils/__tests__/featureFlag.test.ts -x` | Wave 0 |
| INFRA-01d | tengu_* overrides bypass isGrowthBookEnabled | unit | `bun test src/services/analytics/__tests__/growthbookOverride.test.ts -x` | Wave 0 |
| INFRA-02 | Flag dependency graph document exists and is parseable | smoke | `bun test src/utils/__tests__/featureFlagDeps.test.ts -x` | Wave 0 |
| INFRA-03a | MCP stdio transport connects to test server | integration | `bun test src/services/mcp/__tests__/stdioTransport.test.ts -x` | Wave 0 |
| INFRA-03b | MCP tools appear in assembled tool list | unit | `bun test src/services/mcp/__tests__/mcpToolAssembly.test.ts -x` | Wave 0 |
| INFRA-03c | MCP SSE transport connects to test server | integration | `bun test src/services/mcp/__tests__/sseTransport.test.ts -x` | Wave 0 |
| INFRA-03d | MCP tools/call round-trip works over stdio | integration | `bun test src/services/mcp/__tests__/stdioTransport.test.ts -x` | Wave 0 |
| INFRA-03e | MCP tools/call round-trip works over SSE | integration | `bun test src/services/mcp/__tests__/sseTransport.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test --filter "phase5"` (new tests only, <10s)
- **Per wave merge:** `bun test` (full suite, ~3.3s currently)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/utils/__tests__/featureFlag.test.ts` -- covers INFRA-01a/b/c
- [ ] `src/services/analytics/__tests__/growthbookOverride.test.ts` -- covers INFRA-01d
- [ ] `src/utils/__tests__/featureFlagDeps.test.ts` -- covers INFRA-02
- [ ] `src/services/mcp/__tests__/stdioTransport.test.ts` -- covers INFRA-03a/d
- [ ] `src/services/mcp/__tests__/mcpToolAssembly.test.ts` -- covers INFRA-03b
- [ ] `src/services/mcp/__tests__/sseTransport.test.ts` -- covers INFRA-03c/e

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | -- |
| V3 Session Management | No | -- |
| V4 Access Control | Yes (minor) | Feature flags control code path access; validate flag file is user-owned |
| V5 Input Validation | Yes | Validate feature-flags.json schema (boolean values only for feature() flags) |
| V6 Cryptography | No | -- |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious feature-flags.json injection | Tampering | File must be in ~/.claude/ (user-owned dir); validate JSON schema; reject non-boolean values for feature flags |
| Feature flag enables dangerous code path | Elevation of Privilege | Document which flags enable what; require explicit user action to create config file |
| MCP server command injection via config | Tampering | MCP config validation already exists in types.ts via Zod schemas; trust boundary is the settings file |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/entrypoints/cli.tsx` lines 1-22 (feature polyfill) [VERIFIED]
- Codebase analysis: `src/services/analytics/growthbook.ts` full file (GrowthBook gate system) [VERIFIED]
- Codebase analysis: `src/services/mcp/client.ts` (MCP transport code) [VERIFIED]
- Codebase analysis: `src/tools.ts` (tool assembly including MCP tools) [VERIFIED]
- Bun runtime test: `bun -e "import { feature } from 'bun:bundle'"` confirms feature() returns false at dev time [VERIFIED]
- Bun runtime test: `bun -e "require('bun:bundle')"` confirms bun:bundle is compile-time only [VERIFIED]
- Package versions: @modelcontextprotocol/sdk 1.29.0, @growthbook/growthbook 1.6.5 [VERIFIED: node_modules]
- Test suite: 218 tests across 19 files, all passing [VERIFIED: bun test]

### Secondary (MEDIUM confidence)
- 88 distinct feature flag names extracted via grep [VERIFIED: codebase grep]
- ~45 files need bun:bundle import replacement [VERIFIED: codebase grep, counted import statements]

### Tertiary (LOW confidence)
- Bun child_process.spawn compatibility with MCP StdioClientTransport [ASSUMED: not tested in this research]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all libraries already installed and verified
- Architecture: HIGH -- two gate systems fully understood, migration path clear
- Pitfalls: HIGH -- critical bun:bundle scoping issue discovered and verified via runtime testing

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable -- internal codebase, no external API drift)
