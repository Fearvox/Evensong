/**
 * Metrics collector for EVOL-03.
 * Tracks test count, pass rate, feature flag coverage, and destructive action rate.
 */

import { existsSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { MetricsSnapshot, MetricsHistory } from './types.js'

const METRICS_DIR = join(homedir(), '.claude', 'ult-evo')
const METRICS_FILE = join(METRICS_DIR, 'metrics-history.json')

// Destructive patterns in commit subjects
const DESTRUCTIVE_PATTERNS = [
  /\brm\b.*-rf\b/i,
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /--no-verify\b/i,
  /\bdrop\b.*\btable\b/i,
  /\bdelete\b.*\bbranch\b/i,
  /\bforce\s+push\b/i,
]

/**
 * Run bun test and parse output for pass/fail counts.
 * Runs both the microservice test suite and any src/ tests.
 */
export async function collectTestMetrics(
  cwd: string,
): Promise<{ testCount: number; passCount: number; failCount: number }> {
  let totalPass = 0
  let totalFail = 0

  // Run microservice tests via services/run-tests.ts
  try {
    const svcProc = Bun.spawn(
      ['bun', 'test', 'services/'],
      {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const svcOut = await new Response(svcProc.stdout).text()
    const svcErr = await new Response(svcProc.stderr).text()
    await svcProc.exited
    const combined = svcOut + svcErr

    const passMatch = combined.match(/(\d+)\s+pass/)
    const failMatch = combined.match(/(\d+)\s+fail/)
    if (passMatch) totalPass += parseInt(passMatch[1]!, 10)
    if (failMatch) totalFail += parseInt(failMatch[1]!, 10)
  } catch {
    // Test runner unavailable — counts stay at 0
  }

  // Also run any src/ tests if they exist
  try {
    const srcTestProc = Bun.spawn(
      ['bun', 'test', 'src/'],
      {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const srcOut = await new Response(srcTestProc.stdout).text()
    const srcErr = await new Response(srcTestProc.stderr).text()
    await srcTestProc.exited
    const combined = srcOut + srcErr

    const passMatch = combined.match(/(\d+)\s+pass/)
    const failMatch = combined.match(/(\d+)\s+fail/)
    if (passMatch) totalPass += parseInt(passMatch[1]!, 10)
    if (failMatch) totalFail += parseInt(failMatch[1]!, 10)
  } catch {
    // No src/ tests
  }

  return {
    testCount: totalPass + totalFail,
    passCount: totalPass,
    failCount: totalFail,
  }
}

/**
 * Count feature flags defined in the codebase and how many are active.
 * "Active" = enabled in ~/.claude/feature-flags.json.
 */
export async function collectFeatureFlagMetrics(
  cwd: string,
): Promise<{ featureFlagCount: number; featureFlagsActive: number }> {
  // Find all unique feature flag names in src/
  const proc = Bun.spawn(
    ['grep', '-roh', "feature(['\"][A-Z_]*['\"])", 'src/'],
    {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const output = await new Response(proc.stdout).text()
  await proc.exited

  const flagNames = new Set<string>()
  const re = /feature\(['"]([\w]+)['"]\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(output)) !== null) {
    flagNames.add(match[1]!)
  }

  // Check which are enabled
  let activeCount = 0
  const flagsFile = join(homedir(), '.claude', 'feature-flags.json')
  if (existsSync(flagsFile)) {
    try {
      const raw = await readFile(flagsFile, 'utf-8')
      const flags = JSON.parse(raw) as Record<string, boolean>
      for (const name of flagNames) {
        if (flags[name]) activeCount++
      }
    } catch {
      // Malformed flags file
    }
  }

  return {
    featureFlagCount: flagNames.size,
    featureFlagsActive: activeCount,
  }
}

/**
 * Calculate destructive action rate from recent commits.
 * Returns percentage of commits with destructive patterns.
 */
export async function collectDestructiveRate(
  cwd: string,
  commitCount = 100,
): Promise<number> {
  const proc = Bun.spawn(
    ['git', 'log', `--format=%s`, `-${commitCount}`],
    {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const output = await new Response(proc.stdout).text()
  await proc.exited

  const lines = output.trim().split('\n').filter(Boolean)
  if (lines.length === 0) return 0

  let destructiveCount = 0
  for (const line of lines) {
    if (DESTRUCTIVE_PATTERNS.some(p => p.test(line))) {
      destructiveCount++
    }
  }

  return Math.round((destructiveCount / lines.length) * 10000) / 100
}

/**
 * Get the current git HEAD short hash.
 */
export async function getHeadRef(cwd: string): Promise<string> {
  const proc = Bun.spawn(['git', 'rev-parse', '--short', 'HEAD'], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const output = await new Response(proc.stdout).text()
  await proc.exited
  return output.trim()
}

/**
 * Collect a full MetricsSnapshot.
 */
export async function collectMetrics(cwd: string): Promise<MetricsSnapshot> {
  const [testMetrics, flagMetrics, destructiveRate, ref] = await Promise.all([
    collectTestMetrics(cwd),
    collectFeatureFlagMetrics(cwd),
    collectDestructiveRate(cwd),
    getHeadRef(cwd),
  ])

  const passRate =
    testMetrics.testCount > 0
      ? Math.round((testMetrics.passCount / testMetrics.testCount) * 10000) / 100
      : 0

  return {
    timestamp: new Date().toISOString(),
    ref,
    testCount: testMetrics.testCount,
    passCount: testMetrics.passCount,
    failCount: testMetrics.failCount,
    passRate,
    featureFlagCount: flagMetrics.featureFlagCount,
    featureFlagsActive: flagMetrics.featureFlagsActive,
    destructiveActionRate: destructiveRate,
  }
}

/**
 * Load metrics history from disk.
 */
export async function loadMetricsHistory(): Promise<MetricsHistory> {
  if (!existsSync(METRICS_FILE)) {
    return { snapshots: [] }
  }
  try {
    const raw = await readFile(METRICS_FILE, 'utf-8')
    return JSON.parse(raw) as MetricsHistory
  } catch {
    return { snapshots: [] }
  }
}

/**
 * Save a new metrics snapshot to history.
 */
export async function saveMetricsSnapshot(
  snapshot: MetricsSnapshot,
): Promise<void> {
  const history = await loadMetricsHistory()
  history.snapshots.push(snapshot)

  // Keep last 100 snapshots
  if (history.snapshots.length > 100) {
    history.snapshots = history.snapshots.slice(-100)
  }

  await mkdir(METRICS_DIR, { recursive: true })
  await writeFile(METRICS_FILE, JSON.stringify(history, null, 2), 'utf-8')
}

/**
 * Get the previous (most recent) metrics snapshot, or null.
 */
export async function getPreviousSnapshot(): Promise<MetricsSnapshot | null> {
  const history = await loadMetricsHistory()
  if (history.snapshots.length === 0) return null
  return history.snapshots[history.snapshots.length - 1]!
}

/**
 * Format a MetricsSnapshot as human-readable text.
 */
export function formatMetrics(
  current: MetricsSnapshot,
  previous: MetricsSnapshot | null,
): string {
  const lines: string[] = []
  lines.push(`## Metrics (${current.ref})`)
  lines.push(`Collected: ${current.timestamp}\n`)

  lines.push('| Metric | Value | Delta |')
  lines.push('|--------|-------|-------|')

  const delta = (cur: number, prev: number | undefined): string => {
    if (prev === undefined) return '-'
    const d = cur - prev
    if (d === 0) return '='
    return d > 0 ? `+${d}` : `${d}`
  }

  const pctDelta = (cur: number, prev: number | undefined): string => {
    if (prev === undefined) return '-'
    const d = cur - prev
    if (Math.abs(d) < 0.01) return '='
    return d > 0 ? `+${d.toFixed(2)}%` : `${d.toFixed(2)}%`
  }

  lines.push(
    `| Test count | ${current.testCount} | ${delta(current.testCount, previous?.testCount)} |`,
  )
  lines.push(
    `| Pass rate | ${current.passRate}% | ${pctDelta(current.passRate, previous?.passRate)} |`,
  )
  lines.push(
    `| Pass / Fail | ${current.passCount} / ${current.failCount} | ${delta(current.passCount, previous?.passCount)} / ${delta(current.failCount, previous?.failCount)} |`,
  )
  lines.push(
    `| Feature flags (total) | ${current.featureFlagCount} | ${delta(current.featureFlagCount, previous?.featureFlagCount)} |`,
  )
  lines.push(
    `| Feature flags (active) | ${current.featureFlagsActive} | ${delta(current.featureFlagsActive, previous?.featureFlagsActive)} |`,
  )
  lines.push(
    `| Destructive action rate | ${current.destructiveActionRate}% | ${pctDelta(current.destructiveActionRate, previous?.destructiveActionRate)} |`,
  )

  return lines.join('\n')
}
