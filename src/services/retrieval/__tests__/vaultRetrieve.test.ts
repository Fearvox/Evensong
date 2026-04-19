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
