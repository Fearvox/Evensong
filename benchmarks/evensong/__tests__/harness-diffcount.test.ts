import { describe, test, expect } from 'bun:test'
import {
  calculateEffectiveTestMetrics,
  diffSnapshots,
  parseBunTestOutput,
  type TestFileSnapshot,
} from '../harness.js'

describe('full-memory test counting logic', () => {
  test('when pre-existing tests exist and no new tests generated, tests should be 0', () => {
    const effective = calculateEffectiveTestMetrics({
      hasPreExisting: true,
      postRunTests: 787,
      preRunTests: 787,
      newTestCount: 0,
      failures: 0,
    })
    expect(effective.effectiveTests).toBe(0)
    expect(effective.testsPre).toBe(787)
    expect(effective.testsNew).toBe(0)
  })

  test('when clean room and model generates tests, use bun test total', () => {
    const effective = calculateEffectiveTestMetrics({
      hasPreExisting: false,
      postRunTests: 485,
      preRunTests: 0,
      newTestCount: 485,
      failures: 0,
    })
    expect(effective.effectiveTests).toBe(485)
    expect(effective.testsPre).toBe(0)
    expect(effective.testsNew).toBe(485)
  })

  test('when full memory and model generates additional tests, use bun test delta', () => {
    const effective = calculateEffectiveTestMetrics({
      hasPreExisting: true,
      postRunTests: 850,
      preRunTests: 787,
      newTestCount: 63,
      failures: 0,
    })
    expect(effective.effectiveTests).toBe(63)
    expect(effective.testsNew).toBe(63)
  })

  test('never reports negative deltas or negative failures', () => {
    const effective = calculateEffectiveTestMetrics({
      hasPreExisting: true,
      postRunTests: 780,
      preRunTests: 787,
      newTestCount: 0,
      failures: -1,
    })
    expect(effective.effectiveTests).toBe(0)
    expect(effective.effectiveFailures).toBe(0)
  })

  test('parses total test count from real bun summary instead of pass count', () => {
    const parsed = parseBunTestOutput([
      '  787 pass',
      '  2 fail',
      '  2192 expect() calls',
      'Ran 789 tests across 32 files. [114.00ms]',
    ].join('\n'))

    expect(parsed.valid).toBe(true)
    expect(parsed.tests).toBe(789)
    expect(parsed.failures).toBe(2)
    expect(parsed.assertions).toBe(2192)
  })

  test('rejects model prose as bun-test metrics', () => {
    const parsed = parseBunTestOutput('I added 42 tests and all pass in theory.')

    expect(parsed.valid).toBe(false)
    expect(parsed.tests).toBe(0)
  })

  test('modified-file diff uses stored pre test count, not fixed heuristic', () => {
    const pre = new Map<string, TestFileSnapshot>([
      ['services/a.test.ts', { hash: 'old', testCount: 3 }],
    ])
    const post = new Map<string, TestFileSnapshot>([
      ['services/a.test.ts', { hash: 'new', testCount: 5 }],
      ['services/b.test.ts', { hash: 'b', testCount: 4 }],
    ])

    const diff = diffSnapshots(pre, post, '/tmp/not-used')

    expect(diff.modifiedFiles).toEqual(['services/a.test.ts'])
    expect(diff.newFiles).toEqual(['services/b.test.ts'])
    expect(diff.newTestCount).toBe(6)
  })
})
