import { describe, test, expect } from 'bun:test'
import { cosineSim, rankByDense } from '../dense.js'

describe('cosineSim', () => {
  test('identical unit vectors → 1', () => {
    expect(cosineSim([1, 0, 0], [1, 0, 0])).toBeCloseTo(1)
  })

  test('orthogonal unit vectors → 0', () => {
    expect(cosineSim([1, 0, 0], [0, 1, 0])).toBeCloseTo(0)
  })

  test('opposite vectors → -1', () => {
    expect(cosineSim([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1)
  })

  test('parallel scaled vectors → 1 (scale-invariant)', () => {
    expect(cosineSim([1, 2, 3], [10, 20, 30])).toBeCloseTo(1)
  })

  test('zero-magnitude input returns 0 (no NaN leak)', () => {
    expect(cosineSim([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(cosineSim([1, 2, 3], [0, 0, 0])).toBe(0)
    expect(cosineSim([0, 0, 0], [0, 0, 0])).toBe(0)
  })

  test('empty input returns 0 (degenerate case)', () => {
    expect(cosineSim([], [])).toBe(0)
  })

  test('throws on length mismatch (refuse silent misalignment)', () => {
    expect(() => cosineSim([1, 2, 3], [1, 2])).toThrow(/cosineSim length mismatch: 3 vs 2/)
  })
})

describe('rankByDense', () => {
  test('ranks descending by cosine similarity', () => {
    const docs = [
      { id: 'far', embed: [-1, 0, 0] },
      { id: 'close', embed: [1, 0, 0] },
      { id: 'mid', embed: [0.5, 0.5, 0] },
    ]
    const hits = rankByDense([1, 0, 0], docs)
    expect(hits.map((h) => h.id)).toEqual(['close', 'mid', 'far'])
    expect(hits[0]!.score).toBeCloseTo(1)
    expect(hits[2]!.score).toBeCloseTo(-1)
  })

  test('topK caps the result length', () => {
    const docs = [
      { id: 'a', embed: [1, 0] },
      { id: 'b', embed: [0.5, 0.5] },
      { id: 'c', embed: [0, 1] },
    ]
    const hits = rankByDense([1, 0], docs, { topK: 2 })
    expect(hits).toHaveLength(2)
    expect(hits.map((h) => h.id)).toEqual(['a', 'b'])
  })

  test('stable sort: ties preserve original doc order', () => {
    const docs = [
      { id: 'first', embed: [1, 0] },
      { id: 'second', embed: [1, 0] },  // identical embedding → tie on score
      { id: 'third', embed: [1, 0] },
    ]
    const hits = rankByDense([1, 0], docs)
    expect(hits.map((h) => h.id)).toEqual(['first', 'second', 'third'])
    // All scores should be ~1
    for (const h of hits) expect(h.score).toBeCloseTo(1)
  })

  test('empty docs list returns empty', () => {
    expect(rankByDense([1, 2, 3], [])).toEqual([])
  })

  test('topK=0 returns empty', () => {
    const docs = [{ id: 'a', embed: [1, 0] }]
    expect(rankByDense([1, 0], docs, { topK: 0 })).toEqual([])
  })
})
