import { describe, test, expect } from 'bun:test'

describe('full-memory test counting logic', () => {
  test('when pre-existing tests exist and no new tests generated, tests should be 0', () => {
    const totalFromBunTest = 787
    const newTestCount = 0
    const preSnapshotSize = 32

    const effectiveTests = preSnapshotSize > 0 ? newTestCount : totalFromBunTest
    expect(effectiveTests).toBe(0)
  })

  test('when clean room and model generates tests, use bun test total', () => {
    const totalFromBunTest = 485
    const newTestCount = 485
    const preSnapshotSize = 0

    const effectiveTests = preSnapshotSize > 0 ? newTestCount : totalFromBunTest
    expect(effectiveTests).toBe(485)
  })

  test('when full memory and model generates additional tests, use diff count', () => {
    const totalFromBunTest = 850
    const newTestCount = 63
    const preSnapshotSize = 32

    const effectiveTests = preSnapshotSize > 0 ? newTestCount : totalFromBunTest
    expect(effectiveTests).toBe(63)
  })
})
