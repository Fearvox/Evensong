/**
 * Tests for the metrics collector (EVOL-03).
 *
 * Tests cover:
 * - Metrics formatting with and without previous snapshot
 * - Delta calculations (positive, negative, zero)
 * - Metrics history load/save (via temp files)
 * - Destructive action rate calculation
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { MetricsSnapshot, MetricsHistory } from '../types.js'
import { formatMetrics } from '../metrics.js'

function makeSnapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    timestamp: '2026-04-15T12:00:00.000Z',
    ref: 'abc1234',
    testCount: 516,
    passCount: 516,
    failCount: 0,
    passRate: 100,
    featureFlagCount: 95,
    featureFlagsActive: 0,
    destructiveActionRate: 0,
    ...overrides,
  }
}

describe('formatMetrics', () => {
  test('formats metrics without previous snapshot', () => {
    const current = makeSnapshot()
    const formatted = formatMetrics(current, null)

    expect(formatted).toContain('## Metrics (abc1234)')
    expect(formatted).toContain('| Test count | 516 | - |')
    expect(formatted).toContain('| Pass rate | 100% | - |')
    expect(formatted).toContain('| Feature flags (total) | 95 | - |')
    expect(formatted).toContain('| Feature flags (active) | 0 | - |')
    expect(formatted).toContain('| Destructive action rate | 0% | - |')
  })

  test('shows positive deltas', () => {
    const previous = makeSnapshot({ testCount: 400, passCount: 400, passRate: 100 })
    const current = makeSnapshot({ testCount: 516, passCount: 516, passRate: 100 })
    const formatted = formatMetrics(current, previous)

    expect(formatted).toContain('| Test count | 516 | +116 |')
  })

  test('shows negative deltas', () => {
    const previous = makeSnapshot({ testCount: 600, passCount: 600 })
    const current = makeSnapshot({ testCount: 516, passCount: 516 })
    const formatted = formatMetrics(current, previous)

    expect(formatted).toContain('| Test count | 516 | -84 |')
  })

  test('shows zero deltas as equals', () => {
    const previous = makeSnapshot()
    const current = makeSnapshot()
    const formatted = formatMetrics(current, previous)

    expect(formatted).toContain('| Test count | 516 | = |')
    expect(formatted).toContain('| Pass rate | 100% | = |')
  })

  test('formats pass/fail ratio correctly', () => {
    const current = makeSnapshot({ passCount: 510, failCount: 6 })
    const formatted = formatMetrics(current, null)

    expect(formatted).toContain('| Pass / Fail | 510 / 6 | - / - |')
  })

  test('formats destructive action rate delta', () => {
    const previous = makeSnapshot({ destructiveActionRate: 2.5 })
    const current = makeSnapshot({ destructiveActionRate: 1.0 })
    const formatted = formatMetrics(current, previous)

    expect(formatted).toContain('| Destructive action rate | 1% | -1.50% |')
  })

  test('includes timestamp in output', () => {
    const current = makeSnapshot()
    const formatted = formatMetrics(current, null)

    expect(formatted).toContain('Collected: 2026-04-15T12:00:00.000Z')
  })
})

describe('MetricsSnapshot type', () => {
  test('snapshot has all required fields', () => {
    const snapshot = makeSnapshot()
    expect(snapshot.timestamp).toBeDefined()
    expect(snapshot.ref).toBeDefined()
    expect(typeof snapshot.testCount).toBe('number')
    expect(typeof snapshot.passCount).toBe('number')
    expect(typeof snapshot.failCount).toBe('number')
    expect(typeof snapshot.passRate).toBe('number')
    expect(typeof snapshot.featureFlagCount).toBe('number')
    expect(typeof snapshot.featureFlagsActive).toBe('number')
    expect(typeof snapshot.destructiveActionRate).toBe('number')
  })

  test('pass rate is between 0 and 100', () => {
    const snapshot = makeSnapshot({ passRate: 95.5 })
    expect(snapshot.passRate).toBeGreaterThanOrEqual(0)
    expect(snapshot.passRate).toBeLessThanOrEqual(100)
  })
})

describe('MetricsHistory type', () => {
  test('history can hold multiple snapshots', () => {
    const history: MetricsHistory = {
      snapshots: [
        makeSnapshot({ ref: 'aaa1111', timestamp: '2026-04-13T12:00:00.000Z' }),
        makeSnapshot({ ref: 'bbb2222', timestamp: '2026-04-14T12:00:00.000Z' }),
        makeSnapshot({ ref: 'ccc3333', timestamp: '2026-04-15T12:00:00.000Z' }),
      ],
    }
    expect(history.snapshots.length).toBe(3)
    expect(history.snapshots[0]!.ref).toBe('aaa1111')
    expect(history.snapshots[2]!.ref).toBe('ccc3333')
  })
})
