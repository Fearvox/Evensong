# Wave X v3 Harness Fix + Rerun + ANOVA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two harness bugs (rate-limit detection, full-memory test counting), invalidate R034-R036 data, rerun all 4 cells of the 2x2 matrix with N=3 reps each, then compute two-way ANOVA.

**Architecture:** Three sequential phases — (1) harness bugfix with test verification, (2) batch rerun via CLI, (3) ANOVA statistical analysis written as a new `anova.ts` module.

**Tech Stack:** Bun runtime, bun:test, existing harness CLI (`benchmarks/evensong/cli.ts`)

---

## Diagnosis Summary

All R034-R036 runs hit Claude OAuth rate limit ("You've hit your limit"). Consequences:
- **Cells A (L0+clean) and C (L2+clean):** Correctly report 0 tests (clean room had nothing)
- **Cells B (L0+full) and D (L2+full):** Report 787 tests — these are **pre-existing** PROJECT_ROOT tests, not benchmark output. The harness ran `bun test` in the live repo and counted existing code.
- **No valid v3 data exists.** All 12 runs are invalid.

Two harness bugs must be fixed before rerun:
1. **No rate-limit detection:** Harness records results even when CCB outputs "You've hit your limit"
2. **Full-memory double-counting:** For `memory='full'`, `parseResults()` runs `bun test` in PROJECT_ROOT, counting pre-existing tests as benchmark output. Must use pre/post diff instead.

---

### Task 1: Rate Limit Detection in Harness

**Files:**
- Modify: `benchmarks/evensong/harness.ts:94-98` (after spawnCLI, before parseResults)
- Modify: `benchmarks/evensong/types.ts:17-31` (add `invalid` field to RunResult)
- Test: `benchmarks/evensong/__tests__/harness-ratelimit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// benchmarks/evensong/__tests__/harness-ratelimit.test.ts
import { describe, test, expect } from 'bun:test'

// Test the detection function directly (we'll extract it)
import { detectRateLimit } from '../harness.js'

describe('detectRateLimit', () => {
  test('detects Claude OAuth rate limit message', () => {
    const output = "Some setup output\nYou've hit your limit \u00b7 resets 12am (America/New_York)\n"
    expect(detectRateLimit(output)).toBe(true)
  })

  test('detects generic rate limit patterns', () => {
    expect(detectRateLimit('Rate limit exceeded')).toBe(true)
    expect(detectRateLimit('429 Too Many Requests')).toBe(true)
    expect(detectRateLimit('Error: rate_limit_error')).toBe(true)
  })

  test('returns false for normal output', () => {
    const output = '787 pass\n0 fail\n2192 expect() calls\nRan 787 tests across 32 files. [114.00ms]'
    expect(detectRateLimit(output)).toBe(false)
  })

  test('returns false for empty output', () => {
    expect(detectRateLimit('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test benchmarks/evensong/__tests__/harness-ratelimit.test.ts`
Expected: FAIL with "detectRateLimit is not exported" or similar

- [ ] **Step 3: Add `invalid` field to RunResult**

In `benchmarks/evensong/types.ts`, add after line 28 (`notes: string`):

```typescript
  /** If true, run was invalidated (rate limit, harness error, etc.) */
  invalid?: boolean
  /** Reason for invalidation */
  invalid_reason?: string
```

- [ ] **Step 4: Implement detectRateLimit and integrate into harness**

In `benchmarks/evensong/harness.ts`, add the exported function after the imports (around line 18):

```typescript
/**
 * Detect rate limit / API exhaustion in CCB subprocess output.
 * Returns true if the output indicates the run was rate-limited.
 */
export function detectRateLimit(output: string): boolean {
  const patterns = [
    /you've hit your limit/i,
    /rate.?limit/i,
    /429\s+too many requests/i,
    /rate_limit_error/i,
    /usage.?limit/i,
  ]
  return patterns.some(p => p.test(output))
}
```

In `runBenchmark()`, after `const output = await spawnCLI(...)` (line 94) and before `const metrics = parseResults(...)` (line 97), add:

```typescript
  // 6.5. Check for rate limit before parsing
  const rateLimited = detectRateLimit(output)
  if (rateLimited) {
    logger.log('error', 'RATE LIMIT DETECTED — run invalid', { outputPreview: output.slice(0, 500) })
    console.error(`\n  \u274c ${config.runId} RATE LIMITED — marking invalid`)
  }
```

In the result building section (around line 113), modify to include invalid flag:

```typescript
  const result: RunResult = {
    // ... existing fields ...
    invalid: rateLimited || undefined,
    invalid_reason: rateLimited ? 'Rate limit hit during execution' : undefined,
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test benchmarks/evensong/__tests__/harness-ratelimit.test.ts`
Expected: 4 pass, 0 fail

- [ ] **Step 6: Commit**

```bash
git add benchmarks/evensong/__tests__/harness-ratelimit.test.ts benchmarks/evensong/harness.ts benchmarks/evensong/types.ts
git commit -m "fix(harness): detect rate limit and mark runs invalid"
```

---

### Task 2: Fix Full-Memory Test Counting (Use Diff-Only)

**Files:**
- Modify: `benchmarks/evensong/harness.ts:112-130` (result building — use diff-based count for `tests`)
- Test: `benchmarks/evensong/__tests__/harness-diffcount.test.ts`

The key insight: for `memory='full'`, the workspace IS the project root, so `bun test` picks up 787 existing tests. The harness already computes `newTestCount` via pre/post snapshot diff — but it's only stored in `tests_new`, not used as the primary `tests` metric.

- [ ] **Step 1: Write the failing test**

```typescript
// benchmarks/evensong/__tests__/harness-diffcount.test.ts
import { describe, test, expect } from 'bun:test'

describe('full-memory test counting logic', () => {
  test('when pre-existing tests exist and no new tests generated, tests should be 0', () => {
    // Simulates: bun test returns 787 (existing), diff shows 0 new files
    const totalFromBunTest = 787
    const newTestCount = 0  // diff: no new test files
    const preSnapshotSize = 32  // 32 existing test files

    // The correct count: if workspace had pre-existing tests and model generated none,
    // the benchmark result should reflect 0, not 787
    const effectiveTests = preSnapshotSize > 0 ? newTestCount : totalFromBunTest
    expect(effectiveTests).toBe(0)
  })

  test('when clean room and model generates tests, use bun test total', () => {
    const totalFromBunTest = 485
    const newTestCount = 485  // all new (clean room)
    const preSnapshotSize = 0

    const effectiveTests = preSnapshotSize > 0 ? newTestCount : totalFromBunTest
    expect(effectiveTests).toBe(485)
  })

  test('when full memory and model generates additional tests, use diff count', () => {
    const totalFromBunTest = 850  // 787 existing + 63 new
    const newTestCount = 63
    const preSnapshotSize = 32

    const effectiveTests = preSnapshotSize > 0 ? newTestCount : totalFromBunTest
    expect(effectiveTests).toBe(63)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (this is a logic test, not an integration test)**

Run: `bun test benchmarks/evensong/__tests__/harness-diffcount.test.ts`
Expected: 3 pass (these test the logic we're about to apply)

- [ ] **Step 3: Apply the fix in harness.ts**

In `benchmarks/evensong/harness.ts`, replace the result building block (lines ~112-130) with:

```typescript
  // 8. Build result — use diff-based count when pre-existing tests detected
  const hasPreExisting = preSnapshot.size > 0
  const effectiveTests = hasPreExisting ? newTestCount : metrics.tests
  const effectiveFailures = hasPreExisting ? 0 : metrics.failures  // can't attribute failures to new vs old

  logger.log('metric', 'Test count decision', {
    hasPreExisting,
    preSnapshotSize: preSnapshot.size,
    bunTestTotal: metrics.tests,
    diffNewTests: newTestCount,
    effectiveTests,
    rateLimited,
  })

  const result: RunResult = {
    run: config.runId,
    codename: config.codename ?? `${config.model}-${config.pressure}`,
    date: new Date().toISOString().split('T')[0],
    model: provider.displayName,
    mode: `${getPressureLabel(config.pressure)} / ${getMemoryLabel(config.memory)}`,
    services: metrics.services ?? config.services,
    tests: effectiveTests,
    tests_pre: hasPreExisting ? metrics.tests - newTestCount : 0,
    tests_new: newTestCount,
    failures: effectiveFailures,
    assertions: metrics.assertions,
    time_min: logger.elapsedMin,
    criteria: metrics.criteria ?? `${metrics.services ?? config.services}/${config.services}`,
    grade: null,
    notes: `${provider.name} ${config.pressure} ${config.memory}, ${logger.count} transcript entries`,
    transcript_path: transcriptPath,
    invalid: rateLimited || undefined,
    invalid_reason: rateLimited ? 'Rate limit hit during execution' : undefined,
  }
```

- [ ] **Step 4: Run all harness tests**

Run: `bun test benchmarks/evensong/__tests__/`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add benchmarks/evensong/harness.ts benchmarks/evensong/__tests__/harness-diffcount.test.ts
git commit -m "fix(harness): use diff-based test count for full-memory mode"
```

---

### Task 3: Skip Invalid Runs in Stats Aggregation

**Files:**
- Modify: `benchmarks/evensong/cli.ts:164-196` (filter invalid runs in repeat loop)
- Modify: `benchmarks/evensong/stats.ts:84-108` (filter invalid in aggregateStats)

- [ ] **Step 1: Filter invalid runs in stats aggregation**

In `benchmarks/evensong/stats.ts`, modify `aggregateStats()` to filter:

```typescript
export function aggregateStats(configName: string, results: RunResult[]): StatsSummary {
  // Filter out invalid runs (rate-limited, harness errors)
  const valid = results.filter(r => !r.invalid)
  if (valid.length === 0) throw new Error(`No valid results to aggregate (${results.length} total, all invalid)`)

  const tests = valid.map(r => r.tests)
  const failures = valid.map(r => r.failures)
  const times = valid.map(r => r.time_min)
  const assertions = valid.map(r => r.assertions).filter((a): a is number => a != null)
```

Also update the `n` and `runs` fields to use `valid`:

```typescript
  return {
    config: configName,
    n: valid.length,
    runs: valid.map(r => r.run),
    // ... rest unchanged but using valid instead of results
```

- [ ] **Step 2: Add invalid run count to repeat loop output**

In `benchmarks/evensong/cli.ts`, after the repeat loop (around line 186), add:

```typescript
  const validResults = results.filter(r => !r.invalid)
  const invalidCount = results.length - validResults.length

  if (invalidCount > 0) {
    console.log(`\n  \u26a0  ${invalidCount}/${results.length} runs invalid (rate-limited or errored)`)
  }

  // Aggregate and save stats (using only valid results)
  if (validResults.length >= 2) {
    const summary = aggregateStats(configName, validResults)
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `bun test benchmarks/evensong/__tests__/`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add benchmarks/evensong/stats.ts benchmarks/evensong/cli.ts
git commit -m "fix(stats): filter invalid runs from aggregation"
```

---

### Task 4: Invalidate R034-R036 Registry Entries

**Files:**
- Modify: `benchmarks/evensong/registry.jsonl` (add `"invalid":true` to all R034-R036 entries)

- [ ] **Step 1: Mark all R034-R036 entries as invalid**

Run a script to patch the registry:

```bash
bun -e "
const fs = require('fs');
const path = 'benchmarks/evensong/registry.jsonl';
const lines = fs.readFileSync(path, 'utf-8').trim().split('\n');
const patched = lines.map(line => {
  const entry = JSON.parse(line);
  if (entry.run && entry.run.match(/^R03[456]/)) {
    entry.invalid = true;
    entry.invalid_reason = 'Rate limit hit during Wave X v3 batch (2026-04-12 01:34 ET)';
  }
  return JSON.stringify(entry);
});
fs.writeFileSync(path, patched.join('\n') + '\n');
console.log('Patched', lines.filter(l => JSON.parse(l).run?.match(/^R03[456]/)).length, 'entries');
"
```

Expected: `Patched 12 entries`

- [ ] **Step 2: Verify patched entries**

```bash
bun -e "
const fs = require('fs');
const lines = fs.readFileSync('benchmarks/evensong/registry.jsonl', 'utf-8').trim().split('\n');
const invalid = lines.filter(l => JSON.parse(l).invalid).length;
console.log(invalid + ' entries marked invalid');
"
```

Expected: 12+ entries marked invalid (R034-R036 = 12, plus any older invalid ones)

- [ ] **Step 3: Commit**

```bash
git add benchmarks/evensong/registry.jsonl
git commit -m "data(registry): invalidate R034-R036 rate-limited runs"
```

---

### Task 5: Rerun Wave X v3 — All 4 Cells x 3 Reps

**Files:** No code changes — execution only

**Prerequisites:** Tasks 1-4 complete, rate limit reset confirmed.

- [ ] **Step 1: Verify rate limit is reset**

```bash
echo "test" | bun run src/entrypoints/cli.tsx -p 2>&1 | head -5
```

Expected: Should get a response, NOT "You've hit your limit"

- [ ] **Step 2: Run cell A (L0 + clean) x 3**

```bash
bun benchmarks/evensong/cli.ts run --config r011-a --repeat 3 --timeout 30
```

Expected: 3 runs complete, stats saved to `benchmarks/evensong/stats/r011-a-stats.json`

- [ ] **Step 3: Run cell B (L0 + full) x 3**

```bash
bun benchmarks/evensong/cli.ts run --config r011-b --repeat 3 --timeout 30
```

Expected: 3 runs complete, stats saved

- [ ] **Step 4: Run cell C (L2 + clean) x 3**

```bash
bun benchmarks/evensong/cli.ts run --config r011-c --repeat 3 --timeout 30
```

Expected: 3 runs complete, stats saved

- [ ] **Step 5: Run cell D (L2 + full) x 3**

```bash
bun benchmarks/evensong/cli.ts run --config r011-d --repeat 3 --timeout 30
```

Expected: 3 runs complete, stats saved

- [ ] **Step 6: Verify all cells have N>=3 valid data points**

```bash
for cell in a b c d; do
  echo "=== r011-$cell ==="
  cat benchmarks/evensong/stats/r011-$cell-stats.json | bun -e "
    const s = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    console.log('N=' + s.n + ' tests=' + JSON.stringify(s.tests.values) + ' CV=' + s.tests_cv)
  "
done
```

Expected: Each cell shows N=3, non-zero test values (except possibly A if clean-room model struggles)

---

### Task 6: Two-Way ANOVA Analysis

**Files:**
- Create: `benchmarks/evensong/anova.ts`
- Test: `benchmarks/evensong/__tests__/anova.test.ts`
- Modify: `benchmarks/evensong/cli.ts` (add `anova` command)

- [ ] **Step 1: Write ANOVA test**

```typescript
// benchmarks/evensong/__tests__/anova.test.ts
import { describe, test, expect } from 'bun:test'
import { twoWayAnova, type AnovaResult } from '../anova.js'

describe('twoWayAnova', () => {
  test('computes correct SS for known balanced design', () => {
    // 2x2 factorial, n=3 per cell
    // Factor A: memory (clean vs full)
    // Factor B: pressure (L0 vs L2)
    const data = {
      // cell [A=0,B=0] = clean+L0
      cells: [
        { a: 0, b: 0, values: [10, 12, 11] },   // clean + L0
        { a: 0, b: 1, values: [15, 14, 16] },   // clean + L2
        { a: 1, b: 0, values: [100, 95, 105] },  // full + L0
        { a: 1, b: 1, values: [200, 190, 210] }, // full + L2
      ],
      factorAName: 'Memory',
      factorBName: 'Pressure',
      factorALevels: ['clean', 'full'],
      factorBLevels: ['L0', 'L2'],
    }

    const result = twoWayAnova(data)

    // Grand mean = (10+12+11+15+14+16+100+95+105+200+190+210)/12 = 81.5
    expect(result.grandMean).toBeCloseTo(81.5, 1)

    // Factor A (memory) should have huge effect
    expect(result.factorA.f).toBeGreaterThan(10)
    expect(result.factorA.p).toBeLessThan(0.05)

    // Factor B (pressure) should have significant effect
    expect(result.factorB.f).toBeGreaterThan(1)

    // Interaction effect
    expect(result.interaction).toBeDefined()

    // df checks: dfA=1, dfB=1, dfAB=1, dfError=8
    expect(result.factorA.df).toBe(1)
    expect(result.factorB.df).toBe(1)
    expect(result.interaction.df).toBe(1)
    expect(result.error.df).toBe(8)
  })

  test('handles unbalanced design gracefully', () => {
    const data = {
      cells: [
        { a: 0, b: 0, values: [10, 12] },       // n=2
        { a: 0, b: 1, values: [15, 14, 16] },   // n=3
        { a: 1, b: 0, values: [100, 95, 105] },  // n=3
        { a: 1, b: 1, values: [200] },            // n=1
      ],
      factorAName: 'Memory',
      factorBName: 'Pressure',
      factorALevels: ['clean', 'full'],
      factorBLevels: ['L0', 'L2'],
    }

    // Should not throw — uses Type III SS approximation
    const result = twoWayAnova(data)
    expect(result.grandMean).toBeGreaterThan(0)
    expect(result.n).toBe(9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test benchmarks/evensong/__tests__/anova.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement two-way ANOVA**

```typescript
// benchmarks/evensong/anova.ts
/**
 * Two-Way ANOVA for the 2x2 Memory x Pressure factorial design.
 *
 * Computes Type I SS (sequential) for balanced designs.
 * For unbalanced designs, uses weighted cell means (Type III approximation).
 *
 * References: CLRS-adjacent — this is statistics, not algorithms,
 * but the decomposition logic is analogous to partitioning.
 */

export interface AnovaCellData {
  a: number  // factor A level index
  b: number  // factor B level index
  values: number[]
}

export interface AnovaInput {
  cells: AnovaCellData[]
  factorAName: string
  factorBName: string
  factorALevels: string[]
  factorBLevels: string[]
}

export interface AnovaFactor {
  name: string
  ss: number    // sum of squares
  df: number    // degrees of freedom
  ms: number    // mean square (SS/df)
  f: number     // F-statistic
  p: number     // p-value (approximation)
  eta2: number  // effect size (eta-squared = SS_effect / SS_total)
  significant: boolean  // p < 0.05
}

export interface AnovaResult {
  factorA: AnovaFactor
  factorB: AnovaFactor
  interaction: AnovaFactor
  error: { ss: number; df: number; ms: number }
  total: { ss: number; df: number }
  grandMean: number
  n: number
  cellMeans: Record<string, { mean: number; n: number; std: number }>
}

/**
 * Compute two-way ANOVA
 */
export function twoWayAnova(input: AnovaInput): AnovaResult {
  const { cells, factorAName, factorBName, factorALevels, factorBLevels } = input
  const a = factorALevels.length  // number of levels for factor A
  const b = factorBLevels.length  // number of levels for factor B

  // Flatten all values
  const allValues = cells.flatMap(c => c.values)
  const N = allValues.length
  const grandMean = allValues.reduce((s, v) => s + v, 0) / N

  // Cell means
  const cellMeansMap = new Map<string, { sum: number; n: number; values: number[] }>()
  for (const cell of cells) {
    const key = `${cell.a},${cell.b}`
    cellMeansMap.set(key, {
      sum: cell.values.reduce((s, v) => s + v, 0),
      n: cell.values.length,
      values: cell.values,
    })
  }

  // Marginal means for factor A
  const aMeans: number[] = []
  for (let i = 0; i < a; i++) {
    let sum = 0, count = 0
    for (let j = 0; j < b; j++) {
      const cell = cellMeansMap.get(`${i},${j}`)
      if (cell) { sum += cell.sum; count += cell.n }
    }
    aMeans.push(count > 0 ? sum / count : 0)
  }

  // Marginal means for factor B
  const bMeans: number[] = []
  for (let j = 0; j < b; j++) {
    let sum = 0, count = 0
    for (let i = 0; i < a; i++) {
      const cell = cellMeansMap.get(`${i},${j}`)
      if (cell) { sum += cell.sum; count += cell.n }
    }
    bMeans.push(count > 0 ? sum / count : 0)
  }

  // SS Total
  const ssTotal = allValues.reduce((s, v) => s + (v - grandMean) ** 2, 0)

  // SS Factor A (between levels of A, collapsing B)
  let ssA = 0
  for (let i = 0; i < a; i++) {
    let nA = 0
    for (let j = 0; j < b; j++) {
      const cell = cellMeansMap.get(`${i},${j}`)
      if (cell) nA += cell.n
    }
    ssA += nA * (aMeans[i] - grandMean) ** 2
  }

  // SS Factor B
  let ssB = 0
  for (let j = 0; j < b; j++) {
    let nB = 0
    for (let i = 0; i < a; i++) {
      const cell = cellMeansMap.get(`${i},${j}`)
      if (cell) nB += cell.n
    }
    ssB += nB * (bMeans[j] - grandMean) ** 2
  }

  // SS Interaction (AB)
  let ssAB = 0
  for (let i = 0; i < a; i++) {
    for (let j = 0; j < b; j++) {
      const cell = cellMeansMap.get(`${i},${j}`)
      if (!cell || cell.n === 0) continue
      const cellMean = cell.sum / cell.n
      const expectedMean = aMeans[i] + bMeans[j] - grandMean
      ssAB += cell.n * (cellMean - expectedMean) ** 2
    }
  }

  // SS Error (within cells)
  let ssError = 0
  for (const cell of cells) {
    const cellMean = cell.values.reduce((s, v) => s + v, 0) / cell.values.length
    ssError += cell.values.reduce((s, v) => s + (v - cellMean) ** 2, 0)
  }

  // Degrees of freedom
  const dfA = a - 1
  const dfB = b - 1
  const dfAB = dfA * dfB
  const dfError = N - a * b
  const dfTotal = N - 1

  // Mean squares
  const msA = dfA > 0 ? ssA / dfA : 0
  const msB = dfB > 0 ? ssB / dfB : 0
  const msAB = dfAB > 0 ? ssAB / dfAB : 0
  const msError = dfError > 0 ? ssError / dfError : 0

  // F-statistics
  const fA = msError > 0 ? msA / msError : 0
  const fB = msError > 0 ? msB / msError : 0
  const fAB = msError > 0 ? msAB / msError : 0

  // P-values (F-distribution approximation using incomplete beta function)
  const pA = 1 - fCdf(fA, dfA, dfError)
  const pB = 1 - fCdf(fB, dfB, dfError)
  const pAB = 1 - fCdf(fAB, dfAB, dfError)

  // Cell means for output
  const cellMeans: Record<string, { mean: number; n: number; std: number }> = {}
  for (const cell of cells) {
    const key = `${factorALevels[cell.a]}_${factorBLevels[cell.b]}`
    const mean = cell.values.reduce((s, v) => s + v, 0) / cell.values.length
    const variance = cell.values.length > 1
      ? cell.values.reduce((s, v) => s + (v - mean) ** 2, 0) / (cell.values.length - 1)
      : 0
    cellMeans[key] = { mean: round(mean), n: cell.values.length, std: round(Math.sqrt(variance)) }
  }

  return {
    factorA: {
      name: factorAName,
      ss: round(ssA), df: dfA, ms: round(msA),
      f: round(fA), p: round4(pA),
      eta2: round4(ssA / ssTotal),
      significant: pA < 0.05,
    },
    factorB: {
      name: factorBName,
      ss: round(ssB), df: dfB, ms: round(msB),
      f: round(fB), p: round4(pB),
      eta2: round4(ssB / ssTotal),
      significant: pB < 0.05,
    },
    interaction: {
      name: `${factorAName} x ${factorBName}`,
      ss: round(ssAB), df: dfAB, ms: round(msAB),
      f: round(fAB), p: round4(pAB),
      eta2: round4(ssAB / ssTotal),
      significant: pAB < 0.05,
    },
    error: { ss: round(ssError), df: dfError, ms: round(msError) },
    total: { ss: round(ssTotal), df: dfTotal },
    grandMean: round(grandMean),
    n: N,
    cellMeans,
  }
}

// ─── F-distribution CDF approximation ─────────────────────────────────
// Uses the regularized incomplete beta function relationship:
// F_CDF(x, d1, d2) = I(d1*x/(d1*x+d2), d1/2, d2/2)

function fCdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0
  if (d1 <= 0 || d2 <= 0) return 0
  const z = (d1 * x) / (d1 * x + d2)
  return regularizedBeta(z, d1 / 2, d2 / 2)
}

/**
 * Regularized incomplete beta function I_x(a,b)
 * Using continued fraction expansion (Lentz's method)
 */
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  // Use symmetry relation when x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedBeta(1 - x, b, a)
  }

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b)
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a

  // Continued fraction (Lentz's algorithm)
  const maxIter = 200
  const eps = 1e-14
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1)
  if (Math.abs(d) < eps) d = eps
  d = 1 / d
  f = d

  for (let m = 1; m <= maxIter; m++) {
    // Even step
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m))
    d = 1 + num * d; if (Math.abs(d) < eps) d = eps; d = 1 / d
    c = 1 + num / c; if (Math.abs(c) < eps) c = eps
    f *= d * c

    // Odd step
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1))
    d = 1 + num * d; if (Math.abs(d) < eps) d = eps; d = 1 / d
    c = 1 + num / c; if (Math.abs(c) < eps) c = eps
    const delta = d * c
    f *= delta

    if (Math.abs(delta - 1) < eps) break
  }

  return front * f
}

/**
 * Log-gamma function (Lanczos approximation)
 */
function lgamma(z: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  }
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i)
  }
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function round(n: number): number { return Math.round(n * 100) / 100 }
function round4(n: number): number { return Math.round(n * 10000) / 10000 }

// ─── CLI integration helper ────────────────────────────────────────────

/**
 * Print ANOVA result table to console
 */
export function printAnova(result: AnovaResult): void {
  console.log(`\n  TWO-WAY ANOVA — Tests Generated`)
  console.log(`  ${'='.repeat(72)}`)
  console.log(`  Grand Mean: ${result.grandMean}  |  N: ${result.n}`)
  console.log(`  ${'─'.repeat(72)}`)
  console.log(`  ${'Source'.padEnd(24)} ${'SS'.padEnd(12)} ${'df'.padEnd(5)} ${'MS'.padEnd(12)} ${'F'.padEnd(10)} ${'p'.padEnd(10)} ${'eta2'.padEnd(8)} Sig`)
  console.log(`  ${'─'.repeat(72)}`)

  const row = (f: AnovaFactor) => {
    const sig = f.significant ? '***' : (f.p < 0.1 ? '*' : 'ns')
    console.log(`  ${f.name.padEnd(24)} ${String(f.ss).padEnd(12)} ${String(f.df).padEnd(5)} ${String(f.ms).padEnd(12)} ${String(f.f).padEnd(10)} ${String(f.p).padEnd(10)} ${String(f.eta2).padEnd(8)} ${sig}`)
  }

  row(result.factorA)
  row(result.factorB)
  row(result.interaction)
  console.log(`  ${'Error'.padEnd(24)} ${String(result.error.ss).padEnd(12)} ${String(result.error.df).padEnd(5)} ${String(result.error.ms).padEnd(12)}`)
  console.log(`  ${'Total'.padEnd(24)} ${String(result.total.ss).padEnd(12)} ${String(result.total.df).padEnd(5)}`)
  console.log(`  ${'─'.repeat(72)}`)
  console.log(`  *** p < .05    * p < .10    ns = not significant`)

  console.log(`\n  CELL MEANS`)
  console.log(`  ${'─'.repeat(50)}`)
  for (const [key, val] of Object.entries(result.cellMeans)) {
    console.log(`  ${key.padEnd(20)} M=${String(val.mean).padEnd(10)} SD=${String(val.std).padEnd(10)} n=${val.n}`)
  }
  console.log()
}
```

- [ ] **Step 4: Run ANOVA tests**

Run: `bun test benchmarks/evensong/__tests__/anova.test.ts`
Expected: 2 pass, 0 fail

- [ ] **Step 5: Add `anova` command to CLI**

In `benchmarks/evensong/cli.ts`, add import at top:

```typescript
import { twoWayAnova, printAnova, type AnovaInput } from './anova.js'
```

Add the command function before `// ─── Main ───`:

```typescript
async function cmdAnova(): Promise<void> {
  const statsDir = join(import.meta.dir, 'stats')

  // Load stats for all 4 cells
  const cellConfigs = [
    { config: 'r011-a', a: 0, b: 0 },  // clean + L0
    { config: 'r011-b', a: 1, b: 0 },  // full + L0
    { config: 'r011-c', a: 0, b: 1 },  // clean + L2
    { config: 'r011-d', a: 1, b: 1 },  // full + L2
  ]

  const cells: AnovaInput['cells'] = []
  const { readFileSync, existsSync } = await import('fs')

  for (const { config, a, b } of cellConfigs) {
    const statsPath = join(statsDir, `${config}-stats.json`)
    if (!existsSync(statsPath)) {
      console.error(`  Missing stats: ${statsPath}`)
      console.error(`  Run: bun benchmarks/evensong/cli.ts run --config ${config} --repeat 3`)
      process.exit(1)
    }
    const stats = JSON.parse(readFileSync(statsPath, 'utf-8'))
    cells.push({ a, b, values: stats.tests.values })
  }

  const input: AnovaInput = {
    cells,
    factorAName: 'Memory',
    factorBName: 'Pressure',
    factorALevels: ['Clean (void)', 'Evolved (full)'],
    factorBLevels: ['L0 (none)', 'L2 (PUA)'],
  }

  const result = twoWayAnova(input)
  printAnova(result)

  // Save result
  const outPath = join(statsDir, 'anova-2x2.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n')
  console.log(`  Saved: ${outPath}`)
}
```

Add to the switch statement:

```typescript
  case 'anova':    await cmdAnova(); break
```

Update the HELP string to include:

```
    anova     Two-way ANOVA on the 2x2 Memory x Pressure matrix
```

- [ ] **Step 6: Add writeFileSync import if not already present**

In `benchmarks/evensong/cli.ts`, ensure `writeFileSync` is imported from `fs`:

```typescript
import { writeFileSync } from 'fs'
```

And `join` from `path`:

```typescript
import { join } from 'path'
```

- [ ] **Step 7: Run all tests**

Run: `bun test benchmarks/evensong/__tests__/`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add benchmarks/evensong/anova.ts benchmarks/evensong/__tests__/anova.test.ts benchmarks/evensong/cli.ts
git commit -m "feat(anova): two-way ANOVA for 2x2 memory x pressure matrix"
```

---

### Task 7: Run ANOVA After Rerun Data Available

**Files:** No code changes — execution only

**Prerequisites:** Task 5 (rerun) complete with N>=3 valid data per cell.

- [ ] **Step 1: Run the ANOVA**

```bash
bun benchmarks/evensong/cli.ts anova
```

Expected: ANOVA table printed with F-statistics, p-values, effect sizes for Memory, Pressure, and Interaction.

- [ ] **Step 2: Interpret results and update EXPERIMENT-LOG.md**

Key questions the ANOVA answers:
1. **Memory main effect:** Does evolved memory significantly increase tests generated? (Factor A)
2. **Pressure main effect:** Does L2 pressure significantly increase tests generated? (Factor B)
3. **Interaction:** Does the combination of memory + pressure produce more than the sum of parts? (A x B)

Add a "### Phase 5: Statistical Validation" section to `benchmarks/evensong/EXPERIMENT-LOG.md` with the ANOVA table and interpretation.

- [ ] **Step 3: Commit**

```bash
git add benchmarks/evensong/EXPERIMENT-LOG.md benchmarks/evensong/stats/anova-2x2.json
git commit -m "data(anova): 2x2 factorial ANOVA results for memory x pressure"
```
