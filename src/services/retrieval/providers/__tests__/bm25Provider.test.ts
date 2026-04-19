import { describe, test, expect } from 'bun:test'
import { createBM25Provider } from '../bm25Provider.js'
import type { VaultManifestEntry } from '../../types.js'

const manifest: VaultManifestEntry[] = [
  {
    path: 'msa.md',
    title: 'MSA: Memory Sparse Attention',
    retentionScore: 0.9,
    accessCount: 3,
    lastAccess: '2026-04-18',
    summaryLevel: 'deep',
    excerpt: 'sparse attention for 100M tokens',
  },
  {
    path: 'hypermem.md',
    title: 'HyperMem: Hypergraph Memory',
    retentionScore: 0.8,
    accessCount: 2,
    lastAccess: '2026-04-17',
    summaryLevel: 'deep',
    excerpt: 'three-layer hypergraph for long conversations',
  },
  {
    path: 'cook.md',
    title: 'Cooking Recipes',
    retentionScore: 0.3,
    accessCount: 1,
    lastAccess: '2026-01-01',
    summaryLevel: 'shallow',
    excerpt: 'pasta carbonara and fried rice',
  },
]

describe('createBM25Provider', () => {
  test('provider name defaults to bm25', () => {
    const p = createBM25Provider()
    expect(p.name).toBe('bm25')
  })

  test('available() is always true (no network)', async () => {
    const p = createBM25Provider()
    expect(await p.available()).toBe(true)
  })

  test('ranks memory/attention query ahead of cooking doc', async () => {
    const p = createBM25Provider()
    const r = await p.retrieve({ query: 'memory sparse attention', manifest, topK: 2 })
    expect(r.provider).toBe('bm25')
    expect(r.rankedPaths[0]).toBe('msa.md')
    expect(r.rankedPaths).not.toContain('cook.md') // cook.md has zero overlap → score 0
  })

  test('honors topK parameter', async () => {
    const p = createBM25Provider()
    const r = await p.retrieve({ query: 'memory', manifest, topK: 1 })
    expect(r.rankedPaths.length).toBe(1)
  })

  test('reports latency in ms (small but non-negative)', async () => {
    const p = createBM25Provider()
    const r = await p.retrieve({ query: 'memory', manifest })
    expect(r.latencyMs).toBeGreaterThanOrEqual(0)
    // BM25 over 3 docs should be microseconds, round to ms → typically 0 or 1
    expect(r.latencyMs).toBeLessThan(50)
  })

  test('custom provider name passes through', () => {
    const p = createBM25Provider({ providerName: 'stage1-bm25' })
    expect(p.name).toBe('stage1-bm25')
  })

  test('indexes body when manifest entry provides it (boosts recall on body-only terms)', async () => {
    const manifestWithBody: VaultManifestEntry[] = [
      // title+excerpt contain nothing about 'carbonara' but body does
      { path: 'a.md', title: 'Generic recipe', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep', excerpt: 'food ingredients', body: 'carbonara uses pancetta and pecorino cheese with eggs.' },
      { path: 'b.md', title: 'Generic recipe', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep', excerpt: 'food ingredients', body: 'ratatouille is a vegetable stew from Provence.' },
    ]
    const p = createBM25Provider()
    const r = await p.retrieve({ query: 'carbonara', manifest: manifestWithBody, topK: 2 })
    expect(r.rankedPaths[0]).toBe('a.md')
  })

  test('without body, the same query returns nothing (recall proof)', async () => {
    const manifestNoBody: VaultManifestEntry[] = [
      { path: 'a.md', title: 'Generic recipe', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep', excerpt: 'food ingredients' },
      { path: 'b.md', title: 'Generic recipe', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep', excerpt: 'food ingredients' },
    ]
    const p = createBM25Provider()
    const r = await p.retrieve({ query: 'carbonara', manifest: manifestNoBody, topK: 2 })
    expect(r.rankedPaths).toEqual([])
  })
})
