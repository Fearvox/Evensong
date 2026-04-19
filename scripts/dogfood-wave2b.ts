#!/usr/bin/env bun
/**
 * Wave 2B dogfood — compares retrieval judges on real Atomic + real _vault md.
 *
 * Default: runs each MODELS entry below against 3 reference queries, prints
 * a comparison table with latency + rank quality + hallucination flags.
 *
 * Override single model:  bun run scripts/dogfood-wave2b.ts grok-4-fast-reasoning
 *
 * This is a reproducible smoke test for provider/model swap decisions, not a
 * unit test. Run when adding new models to ATOMIC_MODELS or when Atomic
 * backend mapping changes.
 */

import { createLocalGemmaClient, ATOMIC_MODELS } from '../src/services/api/localGemma.js'
import { createLocalGemmaProvider } from '../src/services/retrieval/providers/localGemmaProvider.js'
import { vaultRetrieve } from '../src/services/retrieval/vaultRetrieve.js'
import type { VaultManifestEntry } from '../src/services/retrieval/types.js'

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

// Reference queries with expected ideal top-1 for ranking-quality scoring.
const queries: Array<{ q: string; ideal: string }> = [
  {
    q: 'memory sparse attention',
    ideal: '_vault/knowledge/ai-agents/memory-systems/20260411-msa-memory-sparse-attention.md',
  },
  {
    q: 'three layer hypergraph',
    ideal: '_vault/knowledge/ai-agents/memory-systems/20260411-2604-08256-hypermem.md',
  },
  {
    q: 'paging memory between RAM and disk',
    ideal: '_vault/knowledge/ai-agents/memory-systems/20260411-2310-08560-memgpt.md',
  },
]

const argModel = process.argv[2]
const MODELS = argModel
  ? [argModel]
  : [
      ATOMIC_MODELS.FAST,
      ATOMIC_MODELS.FAST_REASONING,
      ATOMIC_MODELS.MINIMAX_M27,
      ATOMIC_MODELS.GROK_3,
      ATOMIC_MODELS.LOCAL_GEMMA,
    ]

interface RunResult {
  model: string
  query: string
  latencyMs: number
  rankedTop: string
  idealMatch: boolean
  hallucinated: number
  emptyResult: boolean
  error?: string
}

async function runOne(model: string, q: string, ideal: string): Promise<RunResult> {
  const client = createLocalGemmaClient({ model })
  const provider = createLocalGemmaProvider(client)
  const manifestPaths = new Set(manifest.map((m) => m.path))
  try {
    const result = await vaultRetrieve({ query: q, manifest, topK: 2 }, { providers: [provider] })
    const top = result.rankedPaths[0] ?? '(empty)'
    return {
      model,
      query: q,
      latencyMs: result.latencyMs,
      rankedTop: top,
      idealMatch: top === ideal,
      hallucinated: result.rankedPaths.filter((p) => !manifestPaths.has(p)).length,
      emptyResult: result.rankedPaths.length === 0,
    }
  } catch (err) {
    return {
      model,
      query: q,
      latencyMs: 0,
      rankedTop: '(error)',
      idealMatch: false,
      hallucinated: 0,
      emptyResult: true,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function run() {
  console.log('=== Wave 2B Dogfood: judge comparison ===\n')
  const allResults: RunResult[] = []
  for (const model of MODELS) {
    console.log(`\n--- Model: ${model} ---`)
    for (const { q, ideal } of queries) {
      const r = await runOne(model, q, ideal)
      allResults.push(r)
      const flag = r.error
        ? `❌ ${r.error.slice(0, 60)}`
        : r.emptyResult
          ? '⚠️  empty'
          : r.idealMatch
            ? '✅'
            : `△  top=${r.rankedTop.split('/').pop()}`
      console.log(`  [${r.latencyMs.toString().padStart(6)}ms] "${q}"  ${flag}`)
    }
  }

  console.log('\n=== Summary ===\n')
  console.log('Model'.padEnd(50) + 'Avg latency  Correct top-1  Empty  Errors')
  console.log('-'.repeat(95))
  for (const model of MODELS) {
    const modelResults = allResults.filter((r) => r.model === model)
    const successful = modelResults.filter((r) => !r.error)
    const avgLat = successful.length
      ? Math.round(successful.reduce((s, r) => s + r.latencyMs, 0) / successful.length)
      : 0
    const correctTop1 = modelResults.filter((r) => r.idealMatch).length
    const empty = modelResults.filter((r) => r.emptyResult && !r.error).length
    const errors = modelResults.filter((r) => r.error).length
    console.log(
      model.padEnd(50) +
        `${avgLat.toString().padStart(6)}ms    ` +
        `${correctTop1}/${modelResults.length}         ` +
        `${empty}      ${errors}`,
    )
  }
  console.log('\n(Correct top-1 = ranked[0] exactly matches the ideal answer for that query.)')
}

run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
