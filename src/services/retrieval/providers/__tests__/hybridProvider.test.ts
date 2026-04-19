import { describe, test, expect, mock } from 'bun:test'
import { createHybridProvider } from '../hybridProvider.js'
import { createBM25Provider } from '../bm25Provider.js'
import type { VaultManifestEntry, VaultRetrievalProvider } from '../../types.js'

const manifest: VaultManifestEntry[] = [
  { path: 'msa.md', title: 'MSA Memory Sparse Attention', retentionScore: 0.9, accessCount: 3, lastAccess: '2026-04-18', summaryLevel: 'deep', excerpt: 'sparse attention 100M tokens' },
  { path: 'hypermem.md', title: 'HyperMem Hypergraph Memory', retentionScore: 0.8, accessCount: 2, lastAccess: '2026-04-17', summaryLevel: 'deep', excerpt: 'three-layer hypergraph' },
  { path: 'memgpt.md', title: 'MemGPT LLM OS', retentionScore: 0.6, accessCount: 1, lastAccess: '2026-04-16', summaryLevel: 'shallow', excerpt: 'paging memory' },
  { path: 'cook.md', title: 'Cooking Recipes', retentionScore: 0.3, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'shallow', excerpt: 'pasta and rice' },
  { path: 'gym.md', title: 'Gym Workout', retentionScore: 0.2, accessCount: 0, lastAccess: '', summaryLevel: 'shallow', excerpt: 'bench press squat' },
]

function stubLLMProvider(rankedPaths: string[]): VaultRetrievalProvider & { calls: Array<{ manifestSize: number }> } {
  const calls: Array<{ manifestSize: number }> = []
  const provider: VaultRetrievalProvider = {
    name: 'stub-llm',
    available: async () => true,
    retrieve: async (req) => {
      calls.push({ manifestSize: req.manifest.length })
      return { rankedPaths, provider: 'stub-llm', latencyMs: 500 }
    },
  }
  return Object.assign(provider, { calls })
}

describe('createHybridProvider', () => {
  test('stage 1 (BM25) narrows manifest before passing to stage 2', async () => {
    const llm = stubLLMProvider(['msa.md', 'hypermem.md'])
    const hybrid = createHybridProvider({
      stage2: llm,
      stage1TopK: 3,
    })
    const r = await hybrid.retrieve({ query: 'memory attention', manifest, topK: 2 })
    expect(llm.calls.length).toBe(1)
    // The stub LLM saw a narrowed manifest of <=3 entries (stage1TopK)
    expect(llm.calls[0]!.manifestSize).toBeLessThanOrEqual(3)
    expect(r.rankedPaths).toEqual(['msa.md', 'hypermem.md'])
  })

  test('default providerName is hybrid:<stage2.name>', () => {
    const llm = stubLLMProvider([])
    const hybrid = createHybridProvider({ stage2: llm })
    expect(hybrid.name).toBe('hybrid:stub-llm')
  })

  test('custom providerName overrides the default', () => {
    const llm = stubLLMProvider([])
    const hybrid = createHybridProvider({ stage2: llm, providerName: 'rar' })
    expect(hybrid.name).toBe('rar')
  })

  test('available() delegates to stage2', async () => {
    const unavailable: VaultRetrievalProvider = {
      name: 'offline-llm',
      available: async () => false,
      retrieve: async () => ({ rankedPaths: [], provider: 'offline-llm', latencyMs: 0 }),
    }
    const hybrid = createHybridProvider({ stage2: unavailable })
    expect(await hybrid.available()).toBe(false)
  })

  test('when stage1 returns [] the stage2 receives empty manifest (skips LLM call)', async () => {
    const llm = stubLLMProvider([])
    const hybrid = createHybridProvider({ stage2: llm, stage1TopK: 5 })
    // Query has no overlap with any manifest entry → BM25 returns nothing
    const r = await hybrid.retrieve({ query: 'astrophysics quasar spectroscopy', manifest })
    // Stage 2 should NOT be called because there's nothing to rerank.
    expect(llm.calls.length).toBe(0)
    expect(r.rankedPaths).toEqual([])
    expect(r.provider).toBe('hybrid:stub-llm')
  })

  test('integrates with real BM25Provider as stage1 signal', async () => {
    const llm = stubLLMProvider(['msa.md'])
    const hybrid = createHybridProvider({
      stage1: createBM25Provider(),
      stage2: llm,
      stage1TopK: 2,
    })
    const r = await hybrid.retrieve({ query: 'sparse memory attention', manifest })
    // Stage 1 BM25 keeps msa.md + hypermem.md (both match 'memory'). cook.md gym.md drop.
    expect(llm.calls[0]!.manifestSize).toBeLessThanOrEqual(2)
    expect(r.rankedPaths).toEqual(['msa.md'])
  })
})
