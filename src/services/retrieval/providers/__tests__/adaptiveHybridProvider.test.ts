import { describe, test, expect, mock } from 'bun:test'
import { createAdaptiveHybridProvider } from '../adaptiveHybridProvider.js'
import type { VaultRetrievalProvider, VaultManifestEntry } from '../../types.js'

const manifest: VaultManifestEntry[] = [
  { path: 'a.md', title: 'A', retentionScore: 0.9, accessCount: 3, lastAccess: '2026-04-18', summaryLevel: 'deep' },
  { path: 'b.md', title: 'B', retentionScore: 0.7, accessCount: 2, lastAccess: '2026-04-17', summaryLevel: 'deep' },
  { path: 'c.md', title: 'C', retentionScore: 0.5, accessCount: 1, lastAccess: '2026-04-16', summaryLevel: 'shallow' },
]

function makeStage1(ranked: string[], scores: number[]): VaultRetrievalProvider & { calls: number } {
  const state = { calls: 0 }
  const p = {
    name: 'mock-stage1',
    available: async () => true,
    retrieve: async () => {
      state.calls++
      return { rankedPaths: ranked, scores, provider: 'mock-stage1', latencyMs: 5 }
    },
  } as VaultRetrievalProvider
  Object.defineProperty(p, 'calls', { get: () => state.calls, enumerable: true })
  return p as VaultRetrievalProvider & { calls: number }
}

function makeStage2(ranked: string[]): VaultRetrievalProvider & { calls: number; lastManifestSize: number } {
  const state = { calls: 0, lastManifestSize: 0 }
  const p = {
    name: 'mock-stage2-llm',
    available: async () => true,
    retrieve: async (req: { manifest: unknown[] }) => {
      state.calls++
      state.lastManifestSize = req.manifest.length
      return { rankedPaths: ranked, provider: 'mock-stage2-llm', latencyMs: 1500 }
    },
  } as unknown as VaultRetrievalProvider
  Object.defineProperty(p, 'calls', { get: () => state.calls, enumerable: true })
  Object.defineProperty(p, 'lastManifestSize', { get: () => state.lastManifestSize, enumerable: true })
  return p as VaultRetrievalProvider & { calls: number; lastManifestSize: number }
}

describe('createAdaptiveHybridProvider — gap-based stage 2 gating', () => {
  test('confident stage 1 (large gap) SKIPS stage 2 LLM call', async () => {
    // gap_ratio = 20 / 5 = 4.0 > 1.5 threshold → skip
    const s1 = makeStage1(['a.md', 'b.md', 'c.md'], [20.0, 5.0, 2.0])
    const s2 = makeStage2([])
    const p = createAdaptiveHybridProvider({ stage1: s1, stage2: s2 })
    const r = await p.retrieve({ query: 'q', manifest, topK: 3 })

    expect(s1.calls).toBe(1)
    expect(s2.calls).toBe(0) // SKIPPED
    expect(r.rankedPaths).toEqual(['a.md', 'b.md', 'c.md'])
    expect(r.provider).toBe('adaptive:mock-stage2-llm')
  })

  test('unconfident stage 1 (small gap) INVOKES stage 2 LLM rerank', async () => {
    // gap_ratio = 10.0 / 9.5 = 1.05 < 1.5 → invoke LLM
    const s1 = makeStage1(['a.md', 'b.md', 'c.md'], [10.0, 9.5, 3.0])
    const s2 = makeStage2(['b.md', 'a.md'])
    const p = createAdaptiveHybridProvider({ stage1: s1, stage2: s2 })
    const r = await p.retrieve({ query: 'q', manifest, topK: 3 })

    expect(s1.calls).toBe(1)
    expect(s2.calls).toBe(1) // INVOKED
    expect(s2.lastManifestSize).toBeLessThanOrEqual(3) // narrowed pool
    expect(r.rankedPaths).toEqual(['b.md', 'a.md']) // stage 2 reranked
  })

  test('empty stage 1 result skips stage 2 entirely (no pool to rerank)', async () => {
    const s1 = makeStage1([], [])
    const s2 = makeStage2(['should-not-be-called'])
    const p = createAdaptiveHybridProvider({ stage1: s1, stage2: s2 })
    const r = await p.retrieve({ query: 'q', manifest })

    expect(s2.calls).toBe(0)
    expect(r.rankedPaths).toEqual([])
  })

  test('custom gap_ratio threshold overrides the 1.5 default', async () => {
    // gap_ratio = 2.0 / 1.5 = 1.33 < 1.5 default (would invoke),
    // but with threshold=1.2 → skip
    const s1 = makeStage1(['a.md', 'b.md'], [2.0, 1.5])
    const s2 = makeStage2([])
    const p = createAdaptiveHybridProvider({ stage1: s1, stage2: s2, gapRatioThreshold: 1.2 })
    const r = await p.retrieve({ query: 'q', manifest })

    expect(s2.calls).toBe(0)
    expect(r.rankedPaths).toEqual(['a.md', 'b.md'])
  })

  test('single-hit stage 1 (no top-2 for gap) skips stage 2 — nothing to disambiguate', async () => {
    const s1 = makeStage1(['a.md'], [7.5])
    const s2 = makeStage2([])
    const p = createAdaptiveHybridProvider({ stage1: s1, stage2: s2 })
    const r = await p.retrieve({ query: 'q', manifest })

    expect(s2.calls).toBe(0)
    expect(r.rankedPaths).toEqual(['a.md'])
  })

  test('stage 1 without scores falls through to stage 2 (cannot measure confidence)', async () => {
    const s1UnScored: VaultRetrievalProvider = {
      name: 'no-scores',
      available: async () => true,
      retrieve: async () => ({
        rankedPaths: ['a.md', 'b.md'],
        // scores field intentionally omitted
        provider: 'no-scores',
        latencyMs: 5,
      }),
    }
    const s2 = makeStage2(['a.md'])
    const p = createAdaptiveHybridProvider({ stage1: s1UnScored, stage2: s2 })
    await p.retrieve({ query: 'q', manifest })

    expect(s2.calls).toBe(1) // fall through — can't trust without scores
  })

  test('result.scores is forwarded only when stage 2 skipped', async () => {
    // skip branch: scores should surface from stage 1
    const s1Skip = makeStage1(['a.md'], [10.0])
    const s2 = makeStage2([])
    const p = createAdaptiveHybridProvider({ stage1: s1Skip, stage2: s2 })
    const rSkip = await p.retrieve({ query: 'q', manifest })
    expect(rSkip.scores).toEqual([10.0])

    // invoke branch: LLM has no numeric score → should be undefined
    const s1Invoke = makeStage1(['a.md', 'b.md'], [1.1, 1.0])
    const s2Invoke = makeStage2(['a.md'])
    const pInvoke = createAdaptiveHybridProvider({ stage1: s1Invoke, stage2: s2Invoke })
    const rInvoke = await pInvoke.retrieve({ query: 'q', manifest })
    expect(rInvoke.scores).toBeUndefined()
  })
})
