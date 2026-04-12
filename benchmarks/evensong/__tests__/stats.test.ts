import { describe, test, expect } from 'bun:test'
import { aggregateStats } from '../stats.js'
import type { RunResult } from '../types.js'

function makeResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    run: 'R001',
    codename: 'test',
    date: '2026-04-11',
    model: 'Opus-4.6',
    mode: 'test',
    services: 8,
    tests: 500,
    failures: 0,
    assertions: 1200,
    time_min: 20,
    criteria: '8/8',
    grade: null,
    notes: 'test',
    ...overrides,
  }
}

describe('aggregateStats', () => {
  test('computes mean/std for 3 identical runs', () => {
    const results = [
      makeResult({ run: 'R001', tests: 500 }),
      makeResult({ run: 'R002', tests: 500 }),
      makeResult({ run: 'R003', tests: 500 }),
    ]
    const stats = aggregateStats('r011-b', results)

    expect(stats.n).toBe(3)
    expect(stats.tests.mean).toBe(500)
    expect(stats.tests.std).toBe(0)
    expect(stats.all_green).toBe(true)
    expect(stats.tests_cv).toBe(0)
  })

  test('computes correct std for varied runs', () => {
    const results = [
      makeResult({ run: 'R001', tests: 400 }),
      makeResult({ run: 'R002', tests: 500 }),
      makeResult({ run: 'R003', tests: 600 }),
    ]
    const stats = aggregateStats('test', results)

    expect(stats.tests.mean).toBe(500)
    expect(stats.tests.std).toBe(100)
    expect(stats.tests.min).toBe(400)
    expect(stats.tests.max).toBe(600)
  })

  test('reports all_green false when any run has failures', () => {
    const results = [
      makeResult({ run: 'R001', failures: 0 }),
      makeResult({ run: 'R002', failures: 2 }),
    ]
    const stats = aggregateStats('test', results)

    expect(stats.all_green).toBe(false)
  })

  test('handles null assertions gracefully', () => {
    const results = [
      makeResult({ run: 'R001', assertions: null }),
      makeResult({ run: 'R002', assertions: null }),
    ]
    const stats = aggregateStats('test', results)

    expect(stats.assertions).toBeNull()
  })

  test('computes CI95 margin for n=3', () => {
    const results = [
      makeResult({ run: 'R001', tests: 600, time_min: 18 }),
      makeResult({ run: 'R002', tests: 641, time_min: 22 }),
      makeResult({ run: 'R003', tests: 620, time_min: 20 }),
    ]
    const stats = aggregateStats('r011-b', results)

    // t(df=2, 95%) = 4.30, std ≈ 20.5, margin ≈ 4.30 * 20.5/√3 ≈ 50.9
    expect(stats.tests.ci95_margin).toBeGreaterThan(40)
    expect(stats.tests.ci95_margin).toBeLessThan(60)
    expect(stats.config).toBe('r011-b')
  })

  test('throws on empty results', () => {
    expect(() => aggregateStats('test', [])).toThrow()
  })

  test('CV indicates reproducibility level', () => {
    // Low variance → excellent
    const low = aggregateStats('test', [
      makeResult({ run: 'R001', tests: 500 }),
      makeResult({ run: 'R002', tests: 510 }),
      makeResult({ run: 'R003', tests: 495 }),
    ])
    expect(low.tests_cv!).toBeLessThan(0.1)

    // High variance → high
    const high = aggregateStats('test', [
      makeResult({ run: 'R001', tests: 300 }),
      makeResult({ run: 'R002', tests: 700 }),
      makeResult({ run: 'R003', tests: 500 }),
    ])
    expect(high.tests_cv!).toBeGreaterThan(0.2)
  })
})
