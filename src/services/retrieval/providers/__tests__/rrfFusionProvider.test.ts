import { describe, test, expect } from 'bun:test'
import { createRRFFusionProvider } from '../rrfFusionProvider.js'
import type {
  VaultManifestEntry,
  VaultRetrievalProvider,
  VaultRetrievalRequest,
  VaultRetrievalResult,
} from '../../types.js'

const manifest: VaultManifestEntry[] = [
  { path: 'a.md', title: 'A', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-04-18', summaryLevel: 'deep' },
  { path: 'b.md', title: 'B', retentionScore: 0.8, accessCount: 1, lastAccess: '2026-04-18', summaryLevel: 'deep' },
  { path: 'c.md', title: 'C', retentionScore: 0.7, accessCount: 1, lastAccess: '2026-04-18', summaryLevel: 'deep' },
  { path: 'd.md', title: 'D', retentionScore: 0.6, accessCount: 1, lastAccess: '2026-04-18', summaryLevel: 'deep' },
]

function stubProvider(name: string, ranking: string[]): VaultRetrievalProvider {
  return {
    name,
    available: async () => true,
    retrieve: async (_req: VaultRetrievalRequest): Promise<VaultRetrievalResult> => ({
      rankedPaths: ranking,
      provider: name,
      latencyMs: 0,
    }),
  }
}

function failingProvider(name: string): VaultRetrievalProvider {
  return {
    name,
    available: async () => true,
    retrieve: async () => {
      throw new Error(`${name} forced failure`)
    },
  }
}

describe('createRRFFusionProvider — construction', () => {
  test('throws on empty providers array', () => {
    expect(() => createRRFFusionProvider({ providers: [] })).toThrow(
      /non-empty/,
    )
  })

  test('default provider name concatenates child names with +', () => {
    const p = createRRFFusionProvider({
      providers: [stubProvider('bm25', []), stubProvider('dense', [])],
    })
    expect(p.name).toBe('rrf:bm25+dense')
  })

  test('custom provider name passes through', () => {
    const p = createRRFFusionProvider({
      providers: [stubProvider('bm25', [])],
      providerName: 'stage1-fused',
    })
    expect(p.name).toBe('stage1-fused')
  })
})

describe('createRRFFusionProvider — fusion semantics', () => {
  test('rank 1 in BOTH providers dominates', async () => {
    const bm25 = stubProvider('bm25', ['a.md', 'b.md', 'c.md'])
    const dense = stubProvider('dense', ['a.md', 'c.md', 'b.md'])
    const rrf = createRRFFusionProvider({ providers: [bm25, dense], k: 10 })
    const r = await rrf.retrieve({ query: 'q', manifest, topK: 3 })
    // a.md is #1 in both → 2/(10+1) = 2/11 ≈ 0.182, highest
    expect(r.rankedPaths[0]).toBe('a.md')
    expect(r.scores?.[0]).toBeCloseTo(2 / 11)
  })

  test('partial hit (only one provider ranks doc) still scored', async () => {
    const bm25 = stubProvider('bm25', ['a.md', 'b.md'])
    const dense = stubProvider('dense', ['c.md', 'd.md'])
    const rrf = createRRFFusionProvider({ providers: [bm25, dense], k: 10 })
    const r = await rrf.retrieve({ query: 'q', manifest, topK: 4 })
    expect(r.rankedPaths).toHaveLength(4)
    // a.md (rank1 bm25) and c.md (rank1 dense) both score 1/(10+1)
    expect(r.rankedPaths.slice(0, 2).sort()).toEqual(['a.md', 'c.md'])
    expect(r.scores?.[0]).toBeCloseTo(1 / 11)
  })

  test('lower k emphasizes rank-1 more (steeper rank decay)', async () => {
    const bm25 = stubProvider('bm25', ['a.md', 'b.md', 'c.md'])
    const dense = stubProvider('dense', ['c.md', 'b.md', 'a.md'])
    // a.md: rank1 in bm25, rank3 in dense
    // c.md: rank3 in bm25, rank1 in dense
    // With low k, the rank-1 hits dominate equally → tie between a and c
    const rrfLowK = createRRFFusionProvider({ providers: [bm25, dense], k: 1 })
    const rLow = await rrfLowK.retrieve({ query: 'q', manifest, topK: 3 })
    expect(rLow.rankedPaths.slice(0, 2).sort()).toEqual(['a.md', 'c.md'])
    // b.md always rank 2 → 2/(1+2) = 0.667 vs a/c: 1/2 + 1/4 = 0.75 — a,c win
    // With high k=60, rank-1 and rank-3 are closer, changing relative ordering sensitivity
    const rrfHighK = createRRFFusionProvider({ providers: [bm25, dense], k: 60 })
    const rHigh = await rrfHighK.retrieve({ query: 'q', manifest, topK: 3 })
    // Still a/c tied, but scores compress — sanity check that k affects magnitude
    expect(rHigh.scores?.[0]).toBeLessThan(rLow.scores?.[0] ?? Infinity)
  })

  test('propagates req.topK to output slicing', async () => {
    const bm25 = stubProvider('bm25', ['a.md', 'b.md', 'c.md', 'd.md'])
    const dense = stubProvider('dense', ['a.md', 'b.md', 'c.md', 'd.md'])
    const rrf = createRRFFusionProvider({ providers: [bm25, dense] })
    const r = await rrf.retrieve({ query: 'q', manifest, topK: 2 })
    expect(r.rankedPaths).toHaveLength(2)
    expect(r.rankedPaths).toEqual(['a.md', 'b.md'])
  })

  test('passes stagePoolTopK to children (not req.topK)', async () => {
    let bm25TopK = -1
    let denseTopK = -1
    const bm25: VaultRetrievalProvider = {
      name: 'bm25',
      available: async () => true,
      retrieve: async (req) => {
        bm25TopK = req.topK ?? -1
        return { rankedPaths: ['a.md'], provider: 'bm25', latencyMs: 0 }
      },
    }
    const dense: VaultRetrievalProvider = {
      name: 'dense',
      available: async () => true,
      retrieve: async (req) => {
        denseTopK = req.topK ?? -1
        return { rankedPaths: ['a.md'], provider: 'dense', latencyMs: 0 }
      },
    }
    const rrf = createRRFFusionProvider({
      providers: [bm25, dense],
      stagePoolTopK: 75,
    })
    await rrf.retrieve({ query: 'q', manifest, topK: 5 })
    expect(bm25TopK).toBe(75)
    expect(denseTopK).toBe(75)
  })

  test('tolerates a child provider throwing (Promise.allSettled)', async () => {
    const bm25 = stubProvider('bm25', ['a.md', 'b.md'])
    const dense = failingProvider('dense')
    const rrf = createRRFFusionProvider({ providers: [bm25, dense] })
    const r = await rrf.retrieve({ query: 'q', manifest, topK: 2 })
    // dense failed; bm25 contributes alone
    expect(r.rankedPaths).toEqual(['a.md', 'b.md'])
    expect(r.scores?.[0]).toBeCloseTo(1 / 11) // rank 1 under k=10
  })

  test('both children fail → empty ranking (not throw)', async () => {
    const bm25 = failingProvider('bm25')
    const dense = failingProvider('dense')
    const rrf = createRRFFusionProvider({ providers: [bm25, dense] })
    const r = await rrf.retrieve({ query: 'q', manifest, topK: 5 })
    expect(r.rankedPaths).toEqual([])
    expect(r.scores).toEqual([])
  })
})

describe('createRRFFusionProvider — tie-breaking', () => {
  test('ties break by best single-provider rank first', async () => {
    // a.md: rank 1 in p1, rank 5 in p2 → score = 1/11 + 1/15 ≈ 0.158
    // b.md: rank 2 in p1, rank 2 in p2 → score = 2/12 ≈ 0.167 — different
    // Craft a real tie:
    // x: rank 1 in p1, absent in p2 → 1/11
    // y: absent in p1, rank 1 in p2 → 1/11 (tie)
    // Tie-break rule: both have bestRank=1; fall to discovery order (p1 came first, so x first)
    const p1 = stubProvider('p1', ['x.md'])
    const p2 = stubProvider('p2', ['y.md'])
    const rrf = createRRFFusionProvider({
      providers: [p1, p2],
      k: 10,
    })
    const r = await rrf.retrieve({
      query: 'q',
      manifest: [
        { path: 'x.md', title: 'X', retentionScore: 1, accessCount: 1, lastAccess: '', summaryLevel: 'deep' },
        { path: 'y.md', title: 'Y', retentionScore: 1, accessCount: 1, lastAccess: '', summaryLevel: 'deep' },
      ],
      topK: 2,
    })
    expect(r.rankedPaths).toEqual(['x.md', 'y.md'])
    expect(r.scores?.[0]).toBeCloseTo(1 / 11)
    expect(r.scores?.[1]).toBeCloseTo(1 / 11)
  })
})

describe('createRRFFusionProvider — availability', () => {
  test('available = true if at least one child is available', async () => {
    const up: VaultRetrievalProvider = {
      name: 'up',
      available: async () => true,
      retrieve: async () => ({ rankedPaths: [], provider: 'up', latencyMs: 0 }),
    }
    const down: VaultRetrievalProvider = {
      name: 'down',
      available: async () => false,
      retrieve: async () => ({ rankedPaths: [], provider: 'down', latencyMs: 0 }),
    }
    const rrf = createRRFFusionProvider({ providers: [up, down] })
    expect(await rrf.available()).toBe(true)
  })

  test('available = false when all children unavailable', async () => {
    const down1: VaultRetrievalProvider = {
      name: 'd1',
      available: async () => false,
      retrieve: async () => ({ rankedPaths: [], provider: 'd1', latencyMs: 0 }),
    }
    const down2: VaultRetrievalProvider = {
      name: 'd2',
      available: async () => false,
      retrieve: async () => ({ rankedPaths: [], provider: 'd2', latencyMs: 0 }),
    }
    const rrf = createRRFFusionProvider({ providers: [down1, down2] })
    expect(await rrf.available()).toBe(false)
  })

  test('child availability throw is caught (coerced to false)', async () => {
    const throws: VaultRetrievalProvider = {
      name: 'throws',
      available: async () => { throw new Error('probe fail') },
      retrieve: async () => ({ rankedPaths: [], provider: 'throws', latencyMs: 0 }),
    }
    const up: VaultRetrievalProvider = {
      name: 'up',
      available: async () => true,
      retrieve: async () => ({ rankedPaths: [], provider: 'up', latencyMs: 0 }),
    }
    const rrf = createRRFFusionProvider({ providers: [throws, up] })
    expect(await rrf.available()).toBe(true)
  })
})
