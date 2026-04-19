#!/usr/bin/env bun
/**
 * Wave 3+ D' — Hybrid RaR scale benchmark.
 *
 * Proves the core EverMemOS §3.4 pitch: as the manifest grows, LLM-only
 * retrieval blows up in latency + token cost, but Hybrid (BM25 → LLM)
 * stays sub-linear because stage 2 only sees the top-50 candidate pool.
 *
 * Method:
 *   - Real 18-entry _vault manifest (ground truth)
 *   - Generate 182 synthetic "junk" entries on unrelated topics → 200 total
 *   - Run same 20-query benchmark through both pipelines:
 *       A) LLM-only (atomicProvider with deepseek-v3.2) on full 200 entries
 *       B) Hybrid (BM25 stage 1 top-50 → deepseek-v3.2 stage 2) on 200 entries
 *   - Compare top-1 accuracy + latency per pipeline
 *
 * Expected outcome: Hybrid equal/better top-1 + meaningfully faster + fewer
 * tokens sent to the LLM. If Hybrid does NOT hold quality, BM25 is losing
 * the ideal in its top-50 pool and stage1TopK needs to grow.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildVaultManifest } from '../src/services/retrieval/manifestBuilder.js'
import { createLocalGemmaClient, ATOMIC_MODELS } from '../src/services/api/localGemma.js'
import { createAtomicProvider } from '../src/services/retrieval/providers/atomicProvider.js'
import { createBM25Provider } from '../src/services/retrieval/providers/bm25Provider.js'
import { createHybridProvider } from '../src/services/retrieval/providers/hybridProvider.js'
import { vaultRetrieve } from '../src/services/retrieval/vaultRetrieve.js'
import type { VaultManifestEntry, VaultRetrievalProvider } from '../src/services/retrieval/types.js'
import queriesJson from '../benchmarks/wave3-judge-queries.json' with { type: 'json' }

interface QueryEntry {
  id: number
  category: string
  q: string
  ideal: string
}

interface PipelineResult {
  pipeline: 'llm-only' | 'hybrid'
  queryId: number
  query: string
  ideal: string
  top1: string
  top5: string[]
  top1Hit: boolean
  top5Hit: boolean
  latencyMs: number
  manifestSize: number
  error?: string
}

const NOISE_TOPICS = [
  'cooking carbonara pasta recipe',
  'travel guide Tokyo Shibuya',
  'fashion trends spring collection',
  'marathon training plan',
  'jazz saxophone improvisation',
  'woodworking dovetail joint technique',
  'astronomy amateur telescope setup',
  'vintage guitar restoration',
  'gardening tomato cultivation',
  'chess endgame tactics',
  'surf board waxing',
  'sourdough starter maintenance',
  'mountain biking trail review',
  'bird watching migration season',
  'ceramics wheel throwing basics',
  'bonsai tree pruning schedule',
]

function generateJunk(n: number): VaultManifestEntry[] {
  const out: VaultManifestEntry[] = []
  for (let i = 0; i < n; i++) {
    const topic = NOISE_TOPICS[i % NOISE_TOPICS.length]!
    out.push({
      path: `synthetic/junk-${String(i).padStart(4, '0')}.md`,
      title: `${topic.replace(/^\w/, (c) => c.toUpperCase())} — entry ${i}`,
      retentionScore: 0.1 + (i % 10) * 0.01, // spread 0.10–0.19, all below summaryLevel=deep
      accessCount: 0,
      lastAccess: '2025-01-01',
      summaryLevel: 'shallow',
      excerpt: `Placeholder content about ${topic}. Entry number ${i}, no overlap with benchmark topics.`,
    })
  }
  return out
}

async function runOne(
  provider: VaultRetrievalProvider,
  pipeline: 'llm-only' | 'hybrid',
  q: QueryEntry,
  manifest: VaultManifestEntry[],
): Promise<PipelineResult> {
  const base: Omit<PipelineResult, 'top1' | 'top5' | 'top1Hit' | 'top5Hit' | 'latencyMs'> = {
    pipeline,
    queryId: q.id,
    query: q.q,
    ideal: q.ideal,
    manifestSize: manifest.length,
  }
  try {
    const r = await vaultRetrieve({ query: q.q, manifest, topK: 5 }, { providers: [provider] })
    const top5 = r.rankedPaths
    return {
      ...base,
      top1: top5[0] ?? '',
      top5,
      top1Hit: top5[0] === q.ideal,
      top5Hit: top5.includes(q.ideal),
      latencyMs: r.latencyMs,
    }
  } catch (err) {
    return {
      ...base,
      top1: '',
      top5: [],
      top1Hit: false,
      top5Hit: false,
      latencyMs: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await worker(items[idx]!)
    }
  })
  await Promise.all(lanes)
  return results
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! * (1 - (pos - lo)) + sorted[hi]! * (pos - lo)
}

async function main() {
  const concurrency = parseInt(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '3', 10)
  const junkCount = parseInt(process.argv.find((a) => a.startsWith('--junk='))?.split('=')[1] ?? '182', 10)
  const stage1TopK = parseInt(process.argv.find((a) => a.startsWith('--stage1='))?.split('=')[1] ?? '50', 10)

  const real = await buildVaultManifest({ vaultRoot: process.cwd() + '/_vault' })
  const junk = generateJunk(junkCount)
  const manifest = [...real, ...junk]
  console.log(`[scale] manifest: ${real.length} real + ${junk.length} junk = ${manifest.length} total`)

  const client = createLocalGemmaClient({ model: ATOMIC_MODELS.DEEPSEEK_V32 })
  const llmOnly = createAtomicProvider(client)
  const hybrid = createHybridProvider({
    stage1: createBM25Provider(),
    stage2: llmOnly,
    stage1TopK,
  })

  const queries = queriesJson.queries as QueryEntry[]
  const work: Array<{ provider: VaultRetrievalProvider; pipeline: 'llm-only' | 'hybrid'; q: QueryEntry }> = []
  for (const q of queries) {
    work.push({ provider: llmOnly, pipeline: 'llm-only', q })
    work.push({ provider: hybrid, pipeline: 'hybrid', q })
  }

  console.log(`[scale] total calls: ${work.length}, concurrency: ${concurrency}, stage1TopK: ${stage1TopK}`)
  const t0 = Date.now()
  let done = 0
  const results = await runWithConcurrency(work, concurrency, async (u) => {
    const r = await runOne(u.provider, u.pipeline, u.q, manifest)
    done++
    if (done % 8 === 0 || done === work.length) console.log(`  [${done}/${work.length}] ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    return r
  })

  // Emit JSONL + Markdown summary
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
  const outDir = path.join(process.cwd(), 'benchmarks', 'runs')
  mkdirSync(outDir, { recursive: true })
  const jsonlPath = path.join(outDir, `wave3d-hybrid-scale-${stamp}.jsonl`)
  const mdPath = path.join(outDir, `wave3d-hybrid-scale-${stamp}.md`)
  writeFileSync(jsonlPath, results.map((r) => JSON.stringify(r)).join('\n') + '\n')

  const lines: string[] = []
  lines.push('# Wave 3+ D\' — Hybrid Scale Benchmark')
  lines.push('')
  lines.push(`- Manifest: **${manifest.length} entries** (${real.length} real + ${junk.length} junk)`)
  lines.push(`- Queries: **${queries.length}**`)
  lines.push(`- Pipelines: **llm-only** (deepseek-v3.2 over full manifest) vs **hybrid** (BM25 top-${stage1TopK} → deepseek-v3.2)`)
  lines.push(`- Total calls: **${work.length}**`)
  lines.push('')
  lines.push('| Pipeline | Top-1 | Top-5 | p50 latency | p90 latency | Avg manifest handed to LLM |')
  lines.push('|----------|-------|-------|-------------|-------------|-----------------------------|')

  for (const pipe of ['llm-only', 'hybrid'] as const) {
    const rs = results.filter((r) => r.pipeline === pipe && !r.error)
    const total = results.filter((r) => r.pipeline === pipe).length
    const top1 = rs.filter((r) => r.top1Hit).length
    const top5 = rs.filter((r) => r.top5Hit).length
    const lats = rs.map((r) => r.latencyMs).sort((a, b) => a - b)
    const p50 = Math.round(quantile(lats, 0.5))
    const p90 = Math.round(quantile(lats, 0.9))
    const avgManifest = pipe === 'hybrid' ? Math.min(stage1TopK, manifest.length) : manifest.length
    lines.push(`| ${pipe} | ${top1}/${total} (${((top1 / total) * 100).toFixed(0)}%) | ${top5}/${total} (${((top5 / total) * 100).toFixed(0)}%) | ${p50}ms | ${p90}ms | ${avgManifest} |`)
  }
  lines.push('')

  // Per-query disagreement: where hybrid picked differently than llm-only
  const byQueryLLM = new Map(results.filter((r) => r.pipeline === 'llm-only').map((r) => [r.queryId, r]))
  const byQueryHyb = new Map(results.filter((r) => r.pipeline === 'hybrid').map((r) => [r.queryId, r]))
  const disagreements: string[] = []
  for (const q of queries) {
    const a = byQueryLLM.get(q.id)
    const b = byQueryHyb.get(q.id)
    if (!a || !b) continue
    if (a.top1 !== b.top1) {
      disagreements.push(`- Q${q.id} "${q.q.slice(0, 60)}": llm=${a.top1.split('/').pop()} | hybrid=${b.top1.split('/').pop()} | ideal=${q.ideal.split('/').pop()}`)
    }
  }
  lines.push(`## Top-1 disagreements between pipelines: ${disagreements.length}/${queries.length}`)
  lines.push('')
  if (disagreements.length > 0) lines.push(...disagreements)

  const md = lines.join('\n')
  writeFileSync(mdPath, md + '\n')
  console.log(`\n${md}\n`)
  console.log(`[scale] raw:     ${jsonlPath}`)
  console.log(`[scale] summary: ${mdPath}`)
  console.log(`[scale] wall:    ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
