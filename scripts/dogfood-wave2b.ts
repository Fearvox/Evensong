#!/usr/bin/env bun
/**
 * Wave 2B dogfood — real Atomic Chat + real _vault manifest.
 * One-shot script: not a test, not shipped. Run once, discard.
 *
 * Tests the hypothesis that localGemmaProvider with MOCK tests alone misses:
 *   1. Model name mismatch (plan wrote short name; Atomic serves long name)
 *   2. Real LLM output format (does it actually return JSON array as prompted?)
 *   3. Real latency
 *   4. Hallucination guard (LLM returning paths not in manifest)
 */

import { createLocalGemmaClient } from '../src/services/api/localGemma.js'
import { createLocalGemmaProvider } from '../src/services/retrieval/providers/localGemmaProvider.js'
import { vaultRetrieve } from '../src/services/retrieval/vaultRetrieve.js'
import type { VaultManifestEntry } from '../src/services/retrieval/types.js'

const ACTUAL_ATOMIC_MODEL = 'Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M'

const manifest: VaultManifestEntry[] = [
  {
    path: '_vault/knowledge/ai-agents/memory-systems/20260411-msa-memory-sparse-attention.md',
    title: 'MSA: Memory Sparse Attention',
    retentionScore: 0.85,
    accessCount: 3,
    lastAccess: '2026-04-18',
    summaryLevel: 'deep',
    excerpt: 'End-to-end sparse attention for long-context memory retrieval.',
  },
  {
    path: '_vault/knowledge/ai-agents/memory-systems/20260411-2604-08256-hypermem.md',
    title: 'HyperMem: Three-layer Hypergraph Memory',
    retentionScore: 0.72,
    accessCount: 2,
    lastAccess: '2026-04-17',
    summaryLevel: 'deep',
    excerpt: 'Topic/Episode/Fact hypergraph structure for LoCoMo benchmark.',
  },
  {
    path: '_vault/knowledge/ai-agents/memory-systems/20260411-2310-08560-memgpt.md',
    title: 'MemGPT: LLM as Operating System',
    retentionScore: 0.6,
    accessCount: 1,
    lastAccess: '2026-04-16',
    summaryLevel: 'shallow',
    excerpt: 'In-context = RAM, external = Disk, interrupt → swap memory paging.',
  },
  {
    path: '_vault/knowledge/ai-agents/memory-systems/20260411-competitor-landscape.md',
    title: 'Memory Systems Competitor Landscape',
    retentionScore: 0.55,
    accessCount: 1,
    lastAccess: '2026-04-15',
    summaryLevel: 'shallow',
    excerpt: 'Mem0 vs HyperMem vs EverMemOS vs MemGPT comparison.',
  },
]

async function run() {
  console.log('=== Wave 2B Dogfood ===')
  console.log(`Atomic endpoint: http://127.0.0.1:1337/v1`)
  console.log(`Using ACTUAL model name: ${ACTUAL_ATOMIC_MODEL}`)
  console.log(`Manifest size: ${manifest.length} entries\n`)

  const client = createLocalGemmaClient({ model: ACTUAL_ATOMIC_MODEL })
  const provider = createLocalGemmaProvider(client)

  // Probe 1: health
  const alive = await provider.available()
  console.log(`[1] available(): ${alive}`)
  if (!alive) {
    console.error('Atomic not reachable. Aborting.')
    process.exit(1)
  }

  // Probe 2: single retrieval via provider
  const queries = [
    'memory sparse attention',
    'three layer hypergraph',
    'what is the best memory system for long conversations',
  ]

  for (const query of queries) {
    console.log(`\n[2] Query: "${query}"`)
    const start = Date.now()
    try {
      const result = await vaultRetrieve(
        { query, manifest, topK: 2 },
        { providers: [provider] },
      )
      console.log(`    Provider: ${result.provider}`)
      console.log(`    Latency: ${result.latencyMs}ms (wall: ${Date.now() - start}ms)`)
      console.log(`    Ranked: ${JSON.stringify(result.rankedPaths)}`)
      // Hallucination guard check: every returned path must be in manifest
      const manifestPaths = new Set(manifest.map((m) => m.path))
      const hallucinated = result.rankedPaths.filter((p) => !manifestPaths.has(p))
      if (hallucinated.length > 0) {
        console.log(`    ⚠️  HALLUCINATED (not in manifest): ${JSON.stringify(hallucinated)}`)
      } else {
        console.log(`    ✅ All paths grounded in manifest.`)
      }
    } catch (err) {
      console.log(`    ❌ ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log('\n=== Dogfood done ===')
}

run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
