import { describe, test, expect, mock } from 'bun:test'
import type { VaultManifestEntry } from '../types.js'
import { vaultRetrieve, AllProvidersFailedError } from '../vaultRetrieve.js'

const sample: VaultManifestEntry[] = [
  { path: 'knowledge/msa.md', title: 'MSA', retentionScore: 0.9, accessCount: 5, lastAccess: '2026-04-18', summaryLevel: 'deep' },
]

describe('vaultRetrieve', () => {
  test('uses primary when available', async () => {
    const retrieve = mock(async () => ({ rankedPaths: ['knowledge/msa.md'], provider: 'local-gemma', latencyMs: 300 }))
    const result = await vaultRetrieve(
      { query: 'msa', manifest: sample, topK: 1 },
      { providers: [{ name: 'local-gemma', available: async () => true, retrieve }] },
    )
    expect(result.provider).toBe('local-gemma')
    expect(retrieve).toHaveBeenCalledTimes(1)
  })
})

describe('vaultRetrieve fallback', () => {
  test('skips unavailable provider to next', async () => {
    const a = mock(async () => ({ rankedPaths: [], provider: 'a', latencyMs: 0 }))
    const b = mock(async () => ({ rankedPaths: ['knowledge/msa.md'], provider: 'b', latencyMs: 100 }))
    const result = await vaultRetrieve({ query: 'q', manifest: sample }, {
      providers: [
        { name: 'a', available: async () => false, retrieve: a },
        { name: 'b', available: async () => true, retrieve: b },
      ],
    })
    expect(result.provider).toBe('b')
    expect(a).toHaveBeenCalledTimes(0)
    expect(b).toHaveBeenCalledTimes(1)
  })

  test('falls through 3 providers when first 2 throw', async () => {
    const a = mock(async () => { throw new Error('conn') })
    const b = mock(async () => { throw new Error('5xx') })
    const c = mock(async () => ({ rankedPaths: ['knowledge/msa.md'], provider: 'c', latencyMs: 200 }))
    const result = await vaultRetrieve({ query: 'q', manifest: sample }, {
      providers: [
        { name: 'a', available: async () => true, retrieve: a },
        { name: 'b', available: async () => true, retrieve: b },
        { name: 'c', available: async () => true, retrieve: c },
      ],
    })
    expect(result.provider).toBe('c')
  })

  test('deduplicates and drops stale provider paths before returning context', async () => {
    const retrieve = mock(async () => ({
      rankedPaths: ['knowledge/msa.md', 'missing/stale.md', 'knowledge/msa.md'],
      provider: 'noisy-api',
      latencyMs: 40,
    }))
    const result = await vaultRetrieve({ query: 'msa', manifest: sample, topK: 5 }, {
      providers: [{ name: 'noisy-api', available: async () => true, retrieve }],
    })
    expect(result.rankedPaths).toEqual(['knowledge/msa.md'])
  })

  test('falls back when a provider returns only stale paths', async () => {
    const stale = mock(async () => ({ rankedPaths: ['missing/stale.md'], provider: 'stale-api', latencyMs: 20 }))
    const fallback = mock(async () => ({ rankedPaths: ['knowledge/msa.md'], provider: 'fallback-api', latencyMs: 30 }))
    const result = await vaultRetrieve({ query: 'msa', manifest: sample, topK: 1 }, {
      providers: [
        { name: 'stale-api', available: async () => true, retrieve: stale },
        { name: 'fallback-api', available: async () => true, retrieve: fallback },
      ],
    })
    expect(result.provider).toBe('fallback-api')
    expect(stale).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  test('throws AllProvidersFailedError when every provider fails', async () => {
    await expect(vaultRetrieve({ query: 'q', manifest: sample }, {
      providers: [
        { name: 'x', available: async () => false, retrieve: mock(async () => ({ rankedPaths: [], provider: 'x', latencyMs: 0 })) },
        { name: 'y', available: async () => true, retrieve: mock(async () => { throw new Error('boom') }) },
      ],
    })).rejects.toBeInstanceOf(AllProvidersFailedError)
  })
})
