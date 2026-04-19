import { describe, test, expect, afterEach } from 'bun:test'
import {
  createBgeEmbeddingProvider,
  hashManifest,
  manifestEntryToText,
} from '../bgeEmbeddingProvider.js'
import { createBgeEmbeddingClient } from '../../../api/bgeEmbedding.js'
import type { VaultManifestEntry } from '../../types.js'

const realFetch = globalThis.fetch
function installMockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = handler as typeof globalThis.fetch
}
function restoreFetch() {
  globalThis.fetch = realFetch
}

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

/**
 * Build a mock fetch that returns deterministic embeddings based on a
 * simple keyword heuristic: each text scores along 3 axes (memory,
 * attention, food). Lets us reason about ranking without a real model.
 */
function mockEmbedFetchByKeywords(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const url = String(input)
    if (url.endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'bge-m3' }] }), { status: 200 })
    }
    const body = JSON.parse((init?.body as string) ?? '{}') as { input: string[] }
    const data = body.input.map((text, index) => {
      const lower = text.toLowerCase()
      const memory = /memor/.test(lower) ? 1 : 0
      const attention = /attention|sparse/.test(lower) ? 1 : 0
      const food = /cook|pasta|carbonara|recipe/.test(lower) ? 1 : 0
      return { embedding: [memory, attention, food], index }
    })
    return new Response(JSON.stringify({ data, model: 'bge-m3' }), { status: 200 })
  }
}

describe('manifestEntryToText', () => {
  test('concatenates title + excerpt when body absent', () => {
    const text = manifestEntryToText(manifest[0]!, true, 1000)
    expect(text).toContain('MSA: Memory Sparse Attention')
    expect(text).toContain('sparse attention for 100M tokens')
  })

  test('includes body when withBody=true and entry has body', () => {
    const entry: VaultManifestEntry = {
      ...manifest[0]!,
      body: 'Body-only term: pancakes.',
    }
    const withBody = manifestEntryToText(entry, true, 1000)
    const withoutBody = manifestEntryToText(entry, false, 1000)
    expect(withBody).toContain('pancakes')
    expect(withoutBody).not.toContain('pancakes')
  })

  test('truncates at maxChars', () => {
    const entry: VaultManifestEntry = {
      ...manifest[0]!,
      body: 'x'.repeat(5000),
    }
    const text = manifestEntryToText(entry, true, 100)
    expect(text.length).toBe(100)
  })
})

describe('hashManifest', () => {
  test('hash is deterministic for identical path order', () => {
    expect(hashManifest(manifest)).toBe(hashManifest(manifest))
  })

  test('hash differs when paths differ', () => {
    const swapped = [manifest[1]!, manifest[0]!, manifest[2]!]
    expect(hashManifest(manifest)).not.toBe(hashManifest(swapped))
  })
})

describe('createBgeEmbeddingProvider', () => {
  afterEach(restoreFetch)

  test('provider name defaults to dense:<model>', () => {
    const p = createBgeEmbeddingProvider({ client: createBgeEmbeddingClient() })
    expect(p.name).toBe('dense:bge-m3')
  })

  test('custom provider name passes through', () => {
    const p = createBgeEmbeddingProvider({
      client: createBgeEmbeddingClient(),
      providerName: 'dense-stage1',
    })
    expect(p.name).toBe('dense-stage1')
  })

  test('empty manifest returns empty result with no HTTP calls', async () => {
    let called = false
    installMockFetch(async () => {
      called = true
      return new Response('{}', { status: 200 })
    })
    const p = createBgeEmbeddingProvider({ client: createBgeEmbeddingClient() })
    const r = await p.retrieve({ query: 'test', manifest: [], topK: 5 })
    expect(r.rankedPaths).toEqual([])
    expect(r.scores).toEqual([])
    expect(r.provider).toBe('dense:bge-m3')
    expect(called).toBe(false)
  })

  test('ranks memory query ahead of cooking doc', async () => {
    installMockFetch(mockEmbedFetchByKeywords())
    const p = createBgeEmbeddingProvider({ client: createBgeEmbeddingClient() })
    const r = await p.retrieve({ query: 'memory systems', manifest, topK: 3 })
    expect(r.rankedPaths[0]).toMatch(/msa\.md|hypermem\.md/)
    expect(r.rankedPaths[2]).toBe('cook.md')
    expect(r.scores).toBeDefined()
    expect(r.scores!.length).toBe(3)
    expect(r.scores![0]).toBeGreaterThan(r.scores![2]!)
  })

  test('returns cosine scores aligned with rankedPaths', async () => {
    installMockFetch(mockEmbedFetchByKeywords())
    const p = createBgeEmbeddingProvider({ client: createBgeEmbeddingClient() })
    const r = await p.retrieve({ query: 'pasta recipe', manifest, topK: 3 })
    // "pasta recipe" should score highest on cook.md
    expect(r.rankedPaths[0]).toBe('cook.md')
    // Scores descending
    for (let i = 1; i < r.scores!.length; i++) {
      expect(r.scores![i - 1]).toBeGreaterThanOrEqual(r.scores![i]!)
    }
  })

  test('honors topK cap', async () => {
    installMockFetch(mockEmbedFetchByKeywords())
    const p = createBgeEmbeddingProvider({ client: createBgeEmbeddingClient() })
    const r = await p.retrieve({ query: 'memory', manifest, topK: 1 })
    expect(r.rankedPaths).toHaveLength(1)
    expect(r.scores).toHaveLength(1)
  })

  test('caches corpus embeddings across calls with same manifest', async () => {
    let embedCalls = 0
    installMockFetch(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'bge-m3' }] }), { status: 200 })
      embedCalls++
      const body = JSON.parse((init?.body as string) ?? '{}') as { input: string[] }
      return new Response(
        JSON.stringify({
          data: body.input.map((_, index) => ({ embedding: [1, 0, 0], index })),
        }),
        { status: 200 },
      )
    })
    const p = createBgeEmbeddingProvider({ client: createBgeEmbeddingClient() })
    await p.retrieve({ query: 'q1', manifest, topK: 2 })
    await p.retrieve({ query: 'q2', manifest, topK: 2 })
    await p.retrieve({ query: 'q3', manifest, topK: 2 })
    // 1 corpus embed + 3 query embeds = 4 (not 6)
    expect(embedCalls).toBe(4)
  })

  test('cache rebuilds when manifest paths change', async () => {
    let embedCalls = 0
    installMockFetch(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'bge-m3' }] }), { status: 200 })
      embedCalls++
      const body = JSON.parse((init?.body as string) ?? '{}') as { input: string[] }
      return new Response(
        JSON.stringify({
          data: body.input.map((_, index) => ({ embedding: [1, 0, 0], index })),
        }),
        { status: 200 },
      )
    })
    const p = createBgeEmbeddingProvider({ client: createBgeEmbeddingClient() })
    await p.retrieve({ query: 'q', manifest, topK: 2 })
    // Different manifest (subset) → new cache key → new corpus embed call
    await p.retrieve({ query: 'q', manifest: manifest.slice(0, 2), topK: 2 })
    // 1 corpus + 1 query for first call = 2
    // 1 corpus + 1 query for second call = 2
    // Total: 4
    expect(embedCalls).toBe(4)
  })

  test('propagates HTTP errors from the embedding client', async () => {
    installMockFetch(async () => new Response('no session', { status: 404 }))
    const p = createBgeEmbeddingProvider({ client: createBgeEmbeddingClient() })
    await expect(p.retrieve({ query: 'q', manifest, topK: 2 })).rejects.toThrow(
      /HTTP 404/,
    )
  })

  test('latencyMs is non-negative', async () => {
    installMockFetch(mockEmbedFetchByKeywords())
    const p = createBgeEmbeddingProvider({ client: createBgeEmbeddingClient() })
    const r = await p.retrieve({ query: 'memory', manifest })
    expect(r.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
