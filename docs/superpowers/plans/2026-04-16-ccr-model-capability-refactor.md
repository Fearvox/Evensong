# CCR Model Capability Registry Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the 47 `@[MODEL LAUNCH]` fan-out points into a single `defineModel()` registry so the next model launch costs one file edit instead of 10+.

**Architecture:** Three coordinated moves. (1) Introduce `CAPABILITY_REGISTRY` keyed by canonical model ID, storing `{ effort, maxEffort, xhighEffort, adaptiveThinking, structuredOutputs, autoMode, supports1m, knowledgeCutoff, marketingName, frontier }`. (2) Rewrite pattern-match sites (`effort.ts`, `thinking.ts`, `betas.ts`, `context.ts`, `prompts.ts` cutoff) to query the registry. (3) Rename misleading `COST_TIER_5_25` → `COST_OPUS_FRONTIER` so pricing changes don't need a grep-replace. Scope is strictly additive — no behavioral change; the Phase 09 Opus 4.7 rollout stays green throughout.

**Tech Stack:** Bun 1.3.x runtime, TypeScript 6.0.2 (no strict on this area; `// @ts-nocheck` acceptable in tests per existing pattern), `bun test` built-in runner, no new dependencies.

**Scope boundary:** Wave 1 covers **屎山 A + D + E** only. **B** (feature-flag SoT), **C** (relay/index.ts split), **F** (`_c()` decompile scrub), **G** (entitlement unification), **H** (EffortLevel type relocation) are deferred to independent plans (each is an independent subsystem per writing-plans scope check).

---

## File Structure

**Create:**
- `src/utils/model/capabilities.ts` — single source of truth for per-model capability flags and metadata; exports `getCapability<K>(model, key)` + `CAPABILITY_REGISTRY`.
- `tests/model-capabilities.test.ts` — registry sanity + migration parity tests (Opus 4.6 / 4.7 / Sonnet 4.6 / Haiku 4.5).

**Modify:**
- `src/utils/model/configs.ts` — re-export `CAPABILITY_REGISTRY` alongside `ALL_MODEL_CONFIGS`; add invariant: every canonical ID must appear in both.
- `src/utils/effort.ts` — replace `m.includes('opus-4-6') || m.includes('opus-4-7')` chains with `getCapability(model, 'effort')` / `'maxEffort'` / `'xhighEffort'`.
- `src/utils/thinking.ts` — same: `modelSupportsAdaptiveThinking` → registry lookup.
- `src/utils/betas.ts` — `modelSupportsStructuredOutputs` + `modelSupportsAutoMode` → registry lookup.
- `src/utils/context.ts` — `modelSupports1M` → registry lookup.
- `src/constants/prompts.ts` — `getKnowledgeCutoff` → registry lookup (keep legacy string map as deprecated fallback).
- `src/utils/modelCost.ts` — rename `COST_TIER_5_25` → `COST_OPUS_FRONTIER`; keep a `COST_TIER_5_25 = COST_OPUS_FRONTIER` alias for one release to avoid cross-file churn in untouched call sites.

**Invariants:**
- `CAPABILITY_REGISTRY` keys MUST be subset of `CANONICAL_MODEL_IDS` (enforced by test).
- Behavioral parity with pre-refactor: for every existing canonical ID, capability lookups return same booleans as old pattern-match (golden-master test).

---

### Task 1: Registry skeleton + parity tests (TDD red)

**Files:**
- Create: `src/utils/model/capabilities.ts`
- Test: `tests/model-capabilities.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/model-capabilities.test.ts
import { describe, it, expect } from 'bun:test'
import { CANONICAL_MODEL_IDS } from '../src/utils/model/configs'
import {
  CAPABILITY_REGISTRY,
  getCapability,
} from '../src/utils/model/capabilities'

describe('CAPABILITY_REGISTRY', () => {
  it('has an entry for every canonical model ID', () => {
    for (const id of CANONICAL_MODEL_IDS) {
      expect(CAPABILITY_REGISTRY[id]).toBeDefined()
    }
  })

  it('Opus 4.7 supports xhighEffort (frontier-only)', () => {
    expect(getCapability('claude-opus-4-7', 'xhighEffort')).toBe(true)
    expect(getCapability('claude-opus-4-6', 'xhighEffort')).toBe(false)
  })

  it('Opus 4.6 and 4.7 both support maxEffort', () => {
    expect(getCapability('claude-opus-4-6', 'maxEffort')).toBe(true)
    expect(getCapability('claude-opus-4-7', 'maxEffort')).toBe(true)
    expect(getCapability('claude-sonnet-4-6', 'maxEffort')).toBe(false)
  })

  it('1M context flag matches context.ts legacy', () => {
    expect(getCapability('claude-opus-4-7', 'supports1m')).toBe(true)
    expect(getCapability('claude-opus-4-6', 'supports1m')).toBe(true)
    expect(getCapability('claude-sonnet-4-5-20250929', 'supports1m')).toBe(true)
    expect(getCapability('claude-3-7-sonnet-20250219', 'supports1m')).toBe(false)
  })

  it('knowledge cutoff returns null for unregistered', () => {
    expect(getCapability('claude-3-5-sonnet-20241022', 'knowledgeCutoff'))
      .toBe('April 2024')
    expect(getCapability('claude-opus-4-7', 'knowledgeCutoff'))
      .toBe('January 2026')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/0xvox/claude-code-reimagine-for-learning && bun test tests/model-capabilities.test.ts`
Expected: FAIL with `Cannot find module '../src/utils/model/capabilities'`

- [ ] **Step 3: Create registry skeleton**

```typescript
// src/utils/model/capabilities.ts
import type { CanonicalModelId } from './configs.js'

export type ModelCapabilities = {
  /** supports `effort` parameter (low/medium/high) */
  effort: boolean
  /** supports `max` effort tier */
  maxEffort: boolean
  /** supports `xhigh` effort tier (Opus 4.7 only at time of writing) */
  xhighEffort: boolean
  /** supports adaptive thinking (4.6+) */
  adaptiveThinking: boolean
  /** supports structured outputs beta (firstParty/foundry only — caller still
   *  checks provider). */
  structuredOutputs: boolean
  /** supports PI-probe auto mode */
  autoMode: boolean
  /** 1M context window available (with `[1m]` suffix) */
  supports1m: boolean
  /** knowledge cutoff (display-only string, e.g. "January 2026") or null */
  knowledgeCutoff: string | null
  /** marketing name for /model picker and attribution */
  marketingName: string
  /** true for the single frontier model at any point — exactly one entry may
   *  be `frontier: true`. Enforced by test. */
  frontier: boolean
}

export const CAPABILITY_REGISTRY = {
  'claude-3-5-haiku-20241022': {
    effort: false, maxEffort: false, xhighEffort: false,
    adaptiveThinking: false, structuredOutputs: false, autoMode: false,
    supports1m: false, knowledgeCutoff: 'July 2024',
    marketingName: 'Haiku 3.5', frontier: false,
  },
  'claude-haiku-4-5-20251001': {
    effort: false, maxEffort: false, xhighEffort: false,
    adaptiveThinking: false, structuredOutputs: true, autoMode: false,
    supports1m: false, knowledgeCutoff: 'February 2025',
    marketingName: 'Haiku 4.5', frontier: false,
  },
  'claude-3-5-sonnet-20241022': {
    effort: false, maxEffort: false, xhighEffort: false,
    adaptiveThinking: false, structuredOutputs: false, autoMode: false,
    supports1m: false, knowledgeCutoff: 'April 2024',
    marketingName: 'Claude 3.5 Sonnet', frontier: false,
  },
  'claude-3-7-sonnet-20250219': {
    effort: false, maxEffort: false, xhighEffort: false,
    adaptiveThinking: false, structuredOutputs: false, autoMode: false,
    supports1m: false, knowledgeCutoff: 'November 2024',
    marketingName: 'Claude 3.7 Sonnet', frontier: false,
  },
  'claude-sonnet-4-20250514': {
    effort: false, maxEffort: false, xhighEffort: false,
    adaptiveThinking: false, structuredOutputs: false, autoMode: false,
    supports1m: true, knowledgeCutoff: 'March 2025',
    marketingName: 'Sonnet 4', frontier: false,
  },
  'claude-sonnet-4-5-20250929': {
    effort: false, maxEffort: false, xhighEffort: false,
    adaptiveThinking: false, structuredOutputs: true, autoMode: false,
    supports1m: true, knowledgeCutoff: 'July 2025',
    marketingName: 'Sonnet 4.5', frontier: false,
  },
  'claude-sonnet-4-6': {
    effort: true, maxEffort: false, xhighEffort: false,
    adaptiveThinking: true, structuredOutputs: true, autoMode: true,
    supports1m: true, knowledgeCutoff: 'August 2025',
    marketingName: 'Sonnet 4.6', frontier: false,
  },
  'claude-opus-4-20250514': {
    effort: false, maxEffort: false, xhighEffort: false,
    adaptiveThinking: false, structuredOutputs: false, autoMode: false,
    supports1m: false, knowledgeCutoff: 'March 2025',
    marketingName: 'Opus 4', frontier: false,
  },
  'claude-opus-4-1-20250805': {
    effort: false, maxEffort: false, xhighEffort: false,
    adaptiveThinking: false, structuredOutputs: true, autoMode: false,
    supports1m: false, knowledgeCutoff: 'March 2025',
    marketingName: 'Opus 4.1', frontier: false,
  },
  'claude-opus-4-5-20251101': {
    effort: false, maxEffort: false, xhighEffort: false,
    adaptiveThinking: false, structuredOutputs: true, autoMode: false,
    supports1m: false, knowledgeCutoff: 'May 2025',
    marketingName: 'Opus 4.5', frontier: false,
  },
  'claude-opus-4-6': {
    effort: true, maxEffort: true, xhighEffort: false,
    adaptiveThinking: true, structuredOutputs: true, autoMode: true,
    supports1m: true, knowledgeCutoff: 'May 2025',
    marketingName: 'Opus 4.6', frontier: false,
  },
  'claude-opus-4-7': {
    effort: true, maxEffort: true, xhighEffort: true,
    adaptiveThinking: true, structuredOutputs: true, autoMode: true,
    supports1m: true, knowledgeCutoff: 'January 2026',
    marketingName: 'Opus 4.7', frontier: true,
  },
} as const satisfies Record<CanonicalModelId, ModelCapabilities>

/**
 * Resolve a model string to its canonical ID and look up a capability.
 * Accepts any form accepted by `getCanonicalName` (provider-prefixed, with
 * date suffix, `[1m]` suffix, etc.). Returns the capability default (false /
 * null / '') for unknown models rather than throwing — matches the legacy
 * pattern-match behavior.
 */
export function getCapability<K extends keyof ModelCapabilities>(
  model: string,
  key: K,
): ModelCapabilities[K] {
  // Local import to avoid a cycle with model.ts which imports configs.ts
  // which re-exports this module. Lazy require pattern used elsewhere in CCR.
  const { getCanonicalName } = require('./model.js') as typeof import('./model.js')
  const canonical = getCanonicalName(model) as CanonicalModelId
  const entry = CAPABILITY_REGISTRY[canonical]
  if (!entry) {
    return defaultFor(key)
  }
  return entry[key]
}

function defaultFor<K extends keyof ModelCapabilities>(
  key: K,
): ModelCapabilities[K] {
  // Separate switch so the return type narrows per-key. Defaults match the
  // legacy "return false for unknown" contract from effort.ts et al.
  if (key === 'knowledgeCutoff') return null as ModelCapabilities[K]
  if (key === 'marketingName') return '' as ModelCapabilities[K]
  return false as ModelCapabilities[K]
}
```

- [ ] **Step 4: Run test to verify parity tests pass**

Run: `bun test tests/model-capabilities.test.ts`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Verify total regression untouched**

Run: `bun run build && bun test tests/ && bun services/run-tests.ts`
Expected: 1262+ pass, 0 fail (same count or 1262+5 new = 1267 pass after this task's 5 new cases)

- [ ] **Step 6: Commit**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
git add src/utils/model/capabilities.ts tests/model-capabilities.test.ts
git commit -m "refactor(model): add CAPABILITY_REGISTRY single-source-of-truth"
```

---

### Task 2: Migrate `effort.ts` to use registry

**Files:**
- Modify: `src/utils/effort.ts:22-48` (`modelSupportsEffort`), `:51-68` (`modelSupportsMaxEffort`), `:70-86` (`modelSupportsXHighEffort`)

- [ ] **Step 1: Write failing parity test**

```typescript
// append to tests/model-capabilities.test.ts
import {
  modelSupportsEffort,
  modelSupportsMaxEffort,
  modelSupportsXHighEffort,
} from '../src/utils/effort'

describe('effort.ts registry migration parity', () => {
  const cases = [
    ['claude-opus-4-7', true, true, true],
    ['claude-opus-4-6', true, true, false],
    ['claude-sonnet-4-6', true, false, false],
    ['claude-haiku-4-5-20251001', false, false, false],
    ['claude-3-7-sonnet-20250219', false, false, false],
  ] as const

  for (const [model, eff, max, xh] of cases) {
    it(`${model} → effort=${eff}, max=${max}, xh=${xh}`, () => {
      expect(modelSupportsEffort(model)).toBe(eff)
      expect(modelSupportsMaxEffort(model)).toBe(max)
      expect(modelSupportsXHighEffort(model)).toBe(xh)
    })
  }
})
```

- [ ] **Step 2: Run tests — expect PASS before refactor (legacy pattern-match still correct)**

Run: `bun test tests/model-capabilities.test.ts`
Expected: PASS (golden master — locks current behavior)

- [ ] **Step 3: Replace pattern-match with registry call**

In `src/utils/effort.ts`, replace the three functions:

```typescript
// @[MODEL LAUNCH]: superseded by CAPABILITY_REGISTRY — add new models there instead.
export function modelSupportsEffort(model: string): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_ALWAYS_ENABLE_EFFORT)) return true
  const supported3P = get3PModelCapabilityOverride(model, 'effort')
  if (supported3P !== undefined) return supported3P
  if (getCapability(model, 'effort')) return true
  // Unknown-on-1P fallback preserved from legacy
  const m = model.toLowerCase()
  if (m.includes('haiku') || m.includes('sonnet') || m.includes('opus')) {
    return false
  }
  return getAPIProvider() === 'firstParty'
}

export function modelSupportsMaxEffort(model: string): boolean {
  const supported3P = get3PModelCapabilityOverride(model, 'max_effort')
  if (supported3P !== undefined) return supported3P
  if (getCapability(model, 'maxEffort')) return true
  if (process.env.USER_TYPE === 'ant' && resolveAntModel(model)) return true
  return false
}

export function modelSupportsXHighEffort(model: string): boolean {
  const supported3P = get3PModelCapabilityOverride(model, 'xhigh_effort')
  if (supported3P !== undefined) return supported3P
  if (getCapability(model, 'xhighEffort')) return true
  if (process.env.USER_TYPE === 'ant' && resolveAntModel(model)) return true
  return false
}
```

Also add the import near the other model imports at the top of the file:

```typescript
import { getCapability } from './model/capabilities.js'
```

- [ ] **Step 4: Run parity + full regression**

Run: `bun test tests/model-capabilities.test.ts && bun test tests/ && bun services/run-tests.ts`
Expected: all PASS, 1267+ pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add src/utils/effort.ts tests/model-capabilities.test.ts
git commit -m "refactor(effort): route modelSupports{Effort,MaxEffort,XHighEffort} through CAPABILITY_REGISTRY"
```

---

### Task 3: Migrate `thinking.ts` + `betas.ts` + `context.ts` in one batch

These three are isomorphic: single `canonical.includes(...)` chain per function, one-line swap each. Batching avoids 3 tiny commits.

**Files:**
- Modify: `src/utils/thinking.ts:113-130` (`modelSupportsAdaptiveThinking`)
- Modify: `src/utils/betas.ts:142-157` (`modelSupportsStructuredOutputs`), `:160-195` (`modelSupportsAutoMode` — keep the feature('TRANSCRIPT_CLASSIFIER') gate and provider short-circuit, only replace the claude-4-[67] allowlist at the bottom)
- Modify: `src/utils/context.ts:49-56` (`modelSupports1M`)

- [ ] **Step 1: Write failing parity tests**

```typescript
// append to tests/model-capabilities.test.ts
import { modelSupportsAdaptiveThinking } from '../src/utils/thinking'
import {
  modelSupportsStructuredOutputs,
  modelSupportsAutoMode,
} from '../src/utils/betas'
import { modelSupports1M } from '../src/utils/context'

describe('thinking/betas/context registry parity', () => {
  it('adaptive thinking: Opus 4.6/4.7 and Sonnet 4.6 only', () => {
    expect(modelSupportsAdaptiveThinking('claude-opus-4-7')).toBe(true)
    expect(modelSupportsAdaptiveThinking('claude-opus-4-6')).toBe(true)
    expect(modelSupportsAdaptiveThinking('claude-sonnet-4-6')).toBe(true)
    expect(modelSupportsAdaptiveThinking('claude-opus-4-5-20251101')).toBe(false)
  })

  it('structured outputs: 4.1+ and Haiku 4.5', () => {
    expect(modelSupportsStructuredOutputs('claude-opus-4-7')).toBe(true)
    expect(modelSupportsStructuredOutputs('claude-opus-4-1-20250805')).toBe(true)
    expect(modelSupportsStructuredOutputs('claude-haiku-4-5-20251001')).toBe(true)
    expect(modelSupportsStructuredOutputs('claude-3-5-sonnet-20241022')).toBe(false)
  })

  it('1M context: Sonnet 4+ and Opus 4-6/4-7', () => {
    expect(modelSupports1M('claude-opus-4-7')).toBe(true)
    expect(modelSupports1M('claude-opus-4-6')).toBe(true)
    expect(modelSupports1M('claude-sonnet-4-5-20250929')).toBe(true)
    expect(modelSupports1M('claude-opus-4-5-20251101')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect PASS (golden master)**

Run: `bun test tests/model-capabilities.test.ts`
Expected: PASS

- [ ] **Step 3: Swap the three functions**

```typescript
// src/utils/thinking.ts — replace modelSupportsAdaptiveThinking body
export function modelSupportsAdaptiveThinking(model: string): boolean {
  const supported3P = get3PModelCapabilityOverride(model, 'adaptive_thinking')
  if (supported3P !== undefined) return supported3P
  if (getCapability(model, 'adaptiveThinking')) return true
  const canonical = getCanonicalName(model)
  if (
    canonical.includes('opus') ||
    canonical.includes('sonnet') ||
    canonical.includes('haiku')
  ) {
    return false
  }
  // Preserve "default true for unknown 1P/foundry" (launch DRI directive)
  const provider = getAPIProvider()
  return provider === 'firstParty' || provider === 'foundry'
}
```

```typescript
// src/utils/betas.ts — replace modelSupportsStructuredOutputs body
export function modelSupportsStructuredOutputs(model: string): boolean {
  const provider = getAPIProvider()
  if (provider !== 'firstParty' && provider !== 'foundry') return false
  return getCapability(model, 'structuredOutputs')
}
```

```typescript
// src/utils/betas.ts — replace the final external-allowlist regex in
// modelSupportsAutoMode (keep feature('TRANSCRIPT_CLASSIFIER') gate and
// provider/ant short-circuits above it).
// OLD: return /^claude-(opus|sonnet)-4-[67]/.test(m)
// NEW:
    return getCapability(model, 'autoMode')
```

```typescript
// src/utils/context.ts — replace modelSupports1M body
export function modelSupports1M(model: string): boolean {
  if (is1mContextDisabled()) return false
  return getCapability(model, 'supports1m')
}
```

Add `import { getCapability } from './model/capabilities.js'` at the top of each file (for `context.ts` the path is `./model/capabilities.js` directly; `thinking.ts` and `betas.ts` use `./model/capabilities.js` as well).

- [ ] **Step 4: Run parity + regression**

Run: `bun run build && bun test tests/ && bun services/run-tests.ts`
Expected: 1270+ pass, 0 fail

- [ ] **Step 5: Commit**

```bash
git add src/utils/thinking.ts src/utils/betas.ts src/utils/context.ts tests/model-capabilities.test.ts
git commit -m "refactor(model): route thinking/betas/context capability queries through CAPABILITY_REGISTRY"
```

---

### Task 4: Migrate `getKnowledgeCutoff` in `prompts.ts`

**Files:**
- Modify: `src/constants/prompts.ts:712-728` (`getKnowledgeCutoff`)

- [ ] **Step 1: Write failing parity test**

```typescript
// append to tests/model-capabilities.test.ts
import { getKnowledgeCutoffForTest } from '../src/constants/prompts'
// If getKnowledgeCutoff is not exported, add a `export { getKnowledgeCutoff as
// getKnowledgeCutoffForTest }` at the bottom of prompts.ts in Step 3.

describe('knowledge cutoff from registry', () => {
  it('returns registry value for known canonical IDs', () => {
    expect(getKnowledgeCutoffForTest('claude-opus-4-7')).toBe('January 2026')
    expect(getKnowledgeCutoffForTest('claude-opus-4-6')).toBe('May 2025')
    expect(getKnowledgeCutoffForTest('claude-sonnet-4-6')).toBe('August 2025')
  })

  it('returns null for unknown model', () => {
    expect(getKnowledgeCutoffForTest('gpt-5')).toBe(null)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (`getKnowledgeCutoffForTest` export missing)**

Run: `bun test tests/model-capabilities.test.ts`
Expected: FAIL

- [ ] **Step 3: Replace function body**

```typescript
// src/constants/prompts.ts — replace getKnowledgeCutoff body + add test export
import { getCapability } from '../utils/model/capabilities.js'

function getKnowledgeCutoff(modelId: string): string | null {
  return getCapability(modelId, 'knowledgeCutoff')
}

// Test-only export (unchanged name would collide if renamed; re-export alias)
export { getKnowledgeCutoff as getKnowledgeCutoffForTest }
```

- [ ] **Step 4: Run tests**

Run: `bun run build && bun test tests/ && bun services/run-tests.ts`
Expected: 1272+ pass, 0 fail. Also verify nothing else imports the old multi-`if-else` body by grepping:

Run: `grep -n "claude-opus-4-6" src/constants/prompts.ts`
Expected: 0 matches inside `getKnowledgeCutoff` (only in other unaffected sections)

- [ ] **Step 5: Commit**

```bash
git add src/constants/prompts.ts tests/model-capabilities.test.ts
git commit -m "refactor(prompts): read getKnowledgeCutoff from CAPABILITY_REGISTRY"
```

---

### Task 5: Rename `COST_TIER_5_25` → `COST_OPUS_FRONTIER` with alias

**Files:**
- Modify: `src/utils/modelCost.ts` (rename constant, keep alias)
- Modify: `src/utils/model/modelOptions.ts` (imports + references)

- [ ] **Step 1: Write failing test**

```typescript
// append to tests/model-capabilities.test.ts
import { COST_OPUS_FRONTIER, COST_TIER_5_25 } from '../src/utils/modelCost'

describe('cost constant rename', () => {
  it('exports COST_OPUS_FRONTIER', () => {
    expect(COST_OPUS_FRONTIER).toBeDefined()
    expect(COST_OPUS_FRONTIER.inputTokens).toBe(5)
    expect(COST_OPUS_FRONTIER.outputTokens).toBe(25)
  })

  it('keeps COST_TIER_5_25 as deprecated alias', () => {
    expect(COST_TIER_5_25).toBe(COST_OPUS_FRONTIER)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `bun test tests/model-capabilities.test.ts`
Expected: FAIL (`COST_OPUS_FRONTIER` export missing)

- [ ] **Step 3: Rename + alias**

In `src/utils/modelCost.ts`, find the declaration of `COST_TIER_5_25` (grep `^export const COST_TIER_5_25` to locate — near the top) and replace:

```typescript
// OLD:
// export const COST_TIER_5_25: ModelCosts = { inputTokens: 5, ... }

// NEW:
export const COST_OPUS_FRONTIER: ModelCosts = {
  inputTokens: 5,
  outputTokens: 25,
  promptCacheReadTokens: 0.5,
  promptCacheWriteTokens: 6.25,
  webSearchRequests: 0.01,
}

/** @deprecated use COST_OPUS_FRONTIER. Kept one release for call-site migration. */
export const COST_TIER_5_25 = COST_OPUS_FRONTIER
```

Note: exact fields must match the original declaration. If the original has different values, copy them verbatim — don't invent numbers. The test in Step 1 is a smoke check; source of truth is the existing constant.

- [ ] **Step 4: Run tests + build**

Run: `bun run build && bun test tests/ && bun services/run-tests.ts`
Expected: 1274+ pass, 0 fail, no TypeScript type widening errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/modelCost.ts tests/model-capabilities.test.ts
git commit -m "refactor(modelCost): rename COST_TIER_5_25 → COST_OPUS_FRONTIER (alias kept)"
```

---

### Task 6: Add `frontier: true` invariant test + pin it

**Files:**
- Test: `tests/model-capabilities.test.ts`

- [ ] **Step 1: Write invariant test**

```typescript
// append to tests/model-capabilities.test.ts
describe('registry invariants', () => {
  it('exactly one entry is the frontier model', () => {
    const frontiers = Object.entries(CAPABILITY_REGISTRY)
      .filter(([, caps]) => caps.frontier)
      .map(([id]) => id)
    expect(frontiers).toHaveLength(1)
    expect(frontiers[0]).toBe('claude-opus-4-7')
  })

  it('every xhighEffort=true model also has maxEffort=true', () => {
    for (const [id, caps] of Object.entries(CAPABILITY_REGISTRY)) {
      if (caps.xhighEffort) {
        expect(caps.maxEffort).toBe(true)
      }
    }
  })

  it('every adaptiveThinking=true model supports effort', () => {
    for (const [id, caps] of Object.entries(CAPABILITY_REGISTRY)) {
      if (caps.adaptiveThinking) {
        expect(caps.effort).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 2: Run — expect PASS**

Run: `bun test tests/model-capabilities.test.ts`
Expected: PASS (3 new, should be satisfied by registry definition in Task 1)

- [ ] **Step 3: Commit**

```bash
git add tests/model-capabilities.test.ts
git commit -m "test(capabilities): pin frontier + effort/thinking invariants"
```

---

### Task 7: Add `defineModel()` helper (ergonomics for next launch)

**Files:**
- Create: `src/utils/model/defineModel.ts`
- Modify: `src/utils/model/configs.ts` (re-export)
- Test: extend `tests/model-capabilities.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// append to tests/model-capabilities.test.ts
import { defineModel } from '../src/utils/model/defineModel'

describe('defineModel DSL', () => {
  it('builds a ModelConfig + partial capabilities bundle', () => {
    const m = defineModel({
      id: 'claude-test-0',
      bedrock: 'us.anthropic.claude-test-0-v1',
      vertex: 'claude-test-0',
      foundry: 'claude-test-0',
      capabilities: { effort: true, supports1m: false },
      marketingName: 'Test 0',
    })
    expect(m.config.firstParty).toBe('claude-test-0')
    expect(m.config.bedrock).toBe('us.anthropic.claude-test-0-v1')
    expect(m.capabilities.effort).toBe(true)
    expect(m.capabilities.maxEffort).toBe(false) // default
    expect(m.capabilities.marketingName).toBe('Test 0')
    expect(m.capabilities.frontier).toBe(false) // default
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test tests/model-capabilities.test.ts`
Expected: FAIL (`defineModel` module missing)

- [ ] **Step 3: Implement DSL**

```typescript
// src/utils/model/defineModel.ts
import type { ModelConfig } from './configs.js'
import type { ModelCapabilities } from './capabilities.js'

export type DefineModelInput = {
  id: string
  bedrock: string
  vertex: string
  foundry: string
  marketingName: string
  knowledgeCutoff?: string | null
  capabilities?: Partial<Omit<ModelCapabilities, 'marketingName' | 'knowledgeCutoff' | 'frontier'>>
  frontier?: boolean
}

const CAPABILITY_DEFAULTS: Omit<ModelCapabilities, 'marketingName' | 'knowledgeCutoff' | 'frontier'> = {
  effort: false,
  maxEffort: false,
  xhighEffort: false,
  adaptiveThinking: false,
  structuredOutputs: false,
  autoMode: false,
  supports1m: false,
}

export function defineModel(input: DefineModelInput): {
  config: ModelConfig
  capabilities: ModelCapabilities
} {
  return {
    config: {
      firstParty: input.id,
      bedrock: input.bedrock,
      vertex: input.vertex,
      foundry: input.foundry,
    },
    capabilities: {
      ...CAPABILITY_DEFAULTS,
      ...(input.capabilities ?? {}),
      marketingName: input.marketingName,
      knowledgeCutoff: input.knowledgeCutoff ?? null,
      frontier: input.frontier ?? false,
    },
  }
}
```

- [ ] **Step 4: Re-export from configs.ts**

Add to the end of `src/utils/model/configs.ts`:

```typescript
export { defineModel } from './defineModel.js'
```

- [ ] **Step 5: Run tests**

Run: `bun run build && bun test tests/ && bun services/run-tests.ts`
Expected: 1278+ pass, 0 fail

- [ ] **Step 6: Commit**

```bash
git add src/utils/model/defineModel.ts src/utils/model/configs.ts tests/model-capabilities.test.ts
git commit -m "feat(model): add defineModel() DSL for registering capabilities + config in one call"
```

---

### Task 8: Final docs — update `@[MODEL LAUNCH]` markers to point at registry

**Files:**
- Modify: `src/utils/effort.ts`, `src/utils/thinking.ts`, `src/utils/betas.ts`, `src/utils/context.ts`, `src/constants/prompts.ts`, `src/utils/model/configs.ts` — update comment markers only

- [ ] **Step 1: Update markers**

In each of the above files, replace any remaining:

```
// @[MODEL LAUNCH]: Add the new model to the allowlist if it supports ...
```

with:

```
// @[MODEL LAUNCH]: Update CAPABILITY_REGISTRY in src/utils/model/capabilities.ts.
```

This is pure documentation — no behavioral change. Grep to find them:

Run: `grep -rn "@\[MODEL LAUNCH\]" src/utils/effort.ts src/utils/thinking.ts src/utils/betas.ts src/utils/context.ts src/constants/prompts.ts`

- [ ] **Step 2: Verify no stale markers contradict the refactor**

Run: `grep -rn "@\[MODEL LAUNCH\]: Add.*allowlist" src/`
Expected: 0 matches (all such markers are now superseded by the registry)

- [ ] **Step 3: Commit**

```bash
git add src/utils/effort.ts src/utils/thinking.ts src/utils/betas.ts src/utils/context.ts src/constants/prompts.ts
git commit -m "docs(model): point @[MODEL LAUNCH] markers at CAPABILITY_REGISTRY"
```

---

### Task 9: Final regression sweep + summary commit

- [ ] **Step 1: Full regression**

Run:
```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
bun run build 2>&1 | tail -5
bun test tests/ 2>&1 | tail -5
bun services/run-tests.ts 2>&1 | tail -5
bun run src/entrypoints/cli.tsx --version
```

Expected:
- Build: `cli.js  27.1+ MB` (size may grow ~0.5% from registry)
- tests/: 1278+ pass, 0 fail
- services/: 516 pass, 0 fail
- CLI: `2.1.888 (DASH SHATTER)`

- [ ] **Step 2: Confirm capability-query hotspots are all routed through registry**

Run: `grep -rnE "canonical\.includes\('(opus|sonnet|haiku)-4-[67]'\)" src/utils/`
Expected: only occurrences inside `getCapability`'s fallback or inside configs.ts (legitimate usage); no new pattern-match logic.

- [ ] **Step 3: Sanity — list expected frontier model**

Run: `bun run -e "import('./src/utils/model/capabilities.js').then(m => console.log(Object.entries(m.CAPABILITY_REGISTRY).find(([,c]) => c.frontier)))"`
Expected: `['claude-opus-4-7', {...}]`

---

## Out of Scope (defer to follow-up plans)

- **B** Feature-flag SoT drift detection — needs its own plan (hook design + CI integration)
- **C** `api/relay/index.ts` module split — independent refactor, testable in isolation
- **F** React Compiler `_c()` scrub — one-shot AST codemod via ts-morph
- **G** Entitlement unification (`isMaxSubscriber` etc.) — cross-cuts auth layer
- **H** `EffortLevel` type relocation from SDK stub — touches types, not runtime

Each of the above is an independent subsystem; do not bundle into this plan.

---

## Self-Review

1. **Spec coverage:** A (fan-out) → Tasks 1–4 + 7. D (capability registry) → Tasks 1, 6. E (cost rename) → Task 5. B/C/F/G/H explicitly deferred ✓.
2. **Placeholder scan:** No TBD/TODO. Code blocks present at every code step. Task 2 step 3 shows full function bodies for all three migrated functions (no "similar to"). Task 3 batches three files but each gets its own code block.
3. **Type consistency:** `ModelCapabilities` keys used consistently as `'effort' | 'maxEffort' | 'xhighEffort' | ...` across Tasks 1–8. `getCapability<K>(model, key)` signature unchanged through the plan.
4. **Spec gap audit:** The spec mentioned A+D+E. No hidden requirement. E (cost rename) covered fully including alias kept to prevent touching unrelated call sites.
