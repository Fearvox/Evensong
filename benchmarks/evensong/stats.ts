/**
 * Evensong Stats — Statistical aggregation for repeated experiment runs
 *
 * Reads multiple RunResults from the same config, computes mean/std/CI,
 * writes a summary to benchmarks/evensong/stats/<config>-stats.json
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { RunResult } from './types.js'

const STATS_DIR = join(import.meta.dir, 'stats')

// ─── Types ──────────────────────────────────────────────────────────────

export interface StatsSummary {
  config: string
  n: number
  runs: string[]
  date: string

  tests:      DescriptiveStats
  failures:   DescriptiveStats
  assertions: DescriptiveStats | null
  time_min:   DescriptiveStats

  /** All runs passed (0 failures)? */
  all_green: boolean
  /** Coefficient of variation for tests — measures reproducibility */
  tests_cv: number | null
}

export interface DescriptiveStats {
  mean: number
  std: number
  min: number
  max: number
  /** 95% confidence interval (mean ± margin) */
  ci95_margin: number
  values: number[]
}

// ─── Math Helpers ───────────────────────────────────────────────────────

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const variance = xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(variance)
}

function ci95Margin(xs: number[]): number {
  if (xs.length < 2) return 0
  // t-value approximation for small samples (n=3: t≈4.30, n=5: t≈2.78)
  const tValues: Record<number, number> = { 2: 12.71, 3: 4.30, 4: 3.18, 5: 2.78, 6: 2.57, 7: 2.45, 8: 2.36, 9: 2.31, 10: 2.26 }
  const t = tValues[xs.length] ?? 1.96  // fallback to z for large n
  return t * (std(xs) / Math.sqrt(xs.length))
}

function descriptive(xs: number[]): DescriptiveStats {
  return {
    mean: round2(mean(xs)),
    std: round2(std(xs)),
    min: Math.min(...xs),
    max: Math.max(...xs),
    ci95_margin: round2(ci95Margin(xs)),
    values: xs,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Core ───────────────────────────────────────────────────────────────

/**
 * Aggregate multiple RunResults into a StatsSummary
 */
export function aggregateStats(configName: string, results: RunResult[]): StatsSummary {
  const valid = results.filter(r => !r.invalid)
  if (valid.length === 0) throw new Error(`No valid results to aggregate (${results.length} total, all invalid)`)

  const tests = valid.map(r => r.tests)
  const failures = valid.map(r => r.failures)
  const times = valid.map(r => r.time_min)
  const assertions = valid.map(r => r.assertions).filter((a): a is number => a != null)

  const testsMean = mean(tests)
  const testsStd = std(tests)

  return {
    config: configName,
    n: valid.length,
    runs: valid.map(r => r.run),
    date: new Date().toISOString().split('T')[0],

    tests: descriptive(tests),
    failures: descriptive(failures),
    assertions: assertions.length > 0 ? descriptive(assertions) : null,
    time_min: descriptive(times),

    all_green: failures.every(f => f === 0),
    tests_cv: testsMean > 0 ? round2(testsStd / testsMean) : null,
  }
}

/**
 * Save stats summary to disk
 */
export function saveStats(summary: StatsSummary): string {
  mkdirSync(STATS_DIR, { recursive: true })
  const filename = `${summary.config}-stats.json`
  const filepath = join(STATS_DIR, filename)
  writeFileSync(filepath, JSON.stringify(summary, null, 2) + '\n')
  return filepath
}

/**
 * Print stats summary to console
 */
export function printStats(s: StatsSummary): void {
  console.log(`\n  EVENSONG STATS — ${s.config} (n=${s.n})`)
  console.log(`  ${'═'.repeat(55)}`)
  console.log(`  Runs: ${s.runs.join(', ')}`)
  console.log(`  Date: ${s.date}`)
  console.log(`  ${'─'.repeat(55)}`)
  console.log(`  ${'Metric'.padEnd(16)} ${'Mean'.padEnd(10)} ${'Std'.padEnd(10)} ${'Range'.padEnd(14)} 95% CI`)
  console.log(`  ${'─'.repeat(55)}`)

  const row = (label: string, d: DescriptiveStats) => {
    const range = `${d.min}–${d.max}`
    const ci = `±${d.ci95_margin}`
    console.log(`  ${label.padEnd(16)} ${String(d.mean).padEnd(10)} ${String(d.std).padEnd(10)} ${range.padEnd(14)} ${ci}`)
  }

  row('Tests', s.tests)
  row('Failures', s.failures)
  if (s.assertions) row('Assertions', s.assertions)
  row('Time (min)', s.time_min)

  console.log(`  ${'─'.repeat(55)}`)
  console.log(`  All green:  ${s.all_green ? 'YES' : 'NO'}`)
  if (s.tests_cv != null) {
    console.log(`  Tests CV:   ${s.tests_cv} (${s.tests_cv < 0.1 ? 'excellent' : s.tests_cv < 0.2 ? 'acceptable' : 'high variance'} reproducibility)`)
  }
  console.log()
}
