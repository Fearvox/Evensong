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
import { readFileSync } from 'node:fs'
import defaultQueriesJson from '../benchmarks/wave3-judge-queries.json' with { type: 'json' }

interface QueryEntry {
  id: number
  category: string
  q: string
  ideal: string
}

interface PipelineResult {
  pipeline: 'llm-only' | 'hybrid'
  queryId: number
  runIdx: number
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
  runIdx: number,
): Promise<PipelineResult> {
  const base: Omit<PipelineResult, 'top1' | 'top5' | 'top1Hit' | 'top5Hit' | 'latencyMs'> = {
    pipeline,
    queryId: q.id,
    runIdx,
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
  const runs = parseInt(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] ?? '1', 10)
  const queriesFile = process.argv.find((a) => a.startsWith('--queries-file='))?.split('=')[1]
  const withBody = process.argv.includes('--with-body')

  const queriesObj = queriesFile
    ? JSON.parse(readFileSync(queriesFile, 'utf-8'))
    : defaultQueriesJson
  const queries = queriesObj.queries as QueryEntry[]
  console.log(`[scale] queries: ${queries.length} from ${queriesFile ?? 'default wave3-judge-queries.json'}`)

  const real = await buildVaultManifest({ vaultRoot: process.cwd() + '/_vault', withBody })
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

  const work: Array<{ provider: VaultRetrievalProvider; pipeline: 'llm-only' | 'hybrid'; q: QueryEntry; runIdx: number }> = []
  // Interleave runs + pipelines + queries so transient rate-limits don't
  // cluster into one cell of the result matrix.
  for (let runIdx = 0; runIdx < runs; runIdx++) {
    for (const q of queries) {
      work.push({ provider: llmOnly, pipeline: 'llm-only', q, runIdx })
      work.push({ provider: hybrid, pipeline: 'hybrid', q, runIdx })
    }
  }

  console.log(`[scale] runs: ${runs}, total calls: ${work.length}, concurrency: ${concurrency}, stage1TopK: ${stage1TopK}`)
  const t0 = Date.now()
  let done = 0
  const results = await runWithConcurrency(work, concurrency, async (u) => {
    const r = await runOne(u.provider, u.pipeline, u.q, manifest, u.runIdx)
    done++
    if (done % 10 === 0 || done === work.length) console.log(`  [${done}/${work.length}] ${((Date.now() - t0) / 1000).toFixed(1)}s`)
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
  lines.push(`- Runs per (pipeline × query): **${runs}**`)
  lines.push(`- Pipelines: **llm-only** (deepseek-v3.2 over full manifest) vs **hybrid** (BM25 top-${stage1TopK} → deepseek-v3.2)`)
  lines.push(`- Total calls: **${work.length}**`)
  lines.push('')
  lines.push('## Aggregated (all runs flattened)')
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
    lines.push(`| ${pipe} | ${top1}/${total} (${((top1 / total) * 100).toFixed(1)}%) | ${top5}/${total} (${((top5 / total) * 100).toFixed(1)}%) | ${p50}ms | ${p90}ms | ${avgManifest} |`)
  }
  lines.push('')

  // Per-run breakdown (variance visibility)
  if (runs > 1) {
    lines.push('## Per-run top-1 accuracy (variance inspection)')
    lines.push('')
    const header = ['Pipeline', ...Array.from({ length: runs }, (_, i) => `run ${i}`), 'mean', 'stddev']
    lines.push(`| ${header.join(' | ')} |`)
    lines.push(`| ${header.map(() => '---').join(' | ')} |`)
    for (const pipe of ['llm-only', 'hybrid'] as const) {
      const perRun: number[] = []
      for (let runIdx = 0; runIdx < runs; runIdx++) {
        const rs = results.filter((r) => r.pipeline === pipe && r.runIdx === runIdx && !r.error)
        const total = results.filter((r) => r.pipeline === pipe && r.runIdx === runIdx).length
        const top1 = rs.filter((r) => r.top1Hit).length
        perRun.push(total > 0 ? top1 / total : 0)
      }
      const mean = perRun.reduce((s, x) => s + x, 0) / perRun.length
      const variance = perRun.reduce((s, x) => s + (x - mean) ** 2, 0) / perRun.length
      const stddev = Math.sqrt(variance)
      const row = [
        pipe,
        ...perRun.map((x) => (x * 100).toFixed(1) + '%'),
        (mean * 100).toFixed(2) + '%',
        (stddev * 100).toFixed(2) + ' pp',
      ]
      lines.push(`| ${row.join(' | ')} |`)
    }
    lines.push('')
  }

  // Per-query consistency: how often does each pipeline pick the same top-1 across runs
  if (runs > 1) {
    lines.push('## Per-query run-to-run consistency')
    lines.push('')
    lines.push('| Pipeline | Queries w/ identical top-1 across all runs | Partial disagreement |')
    lines.push('|----------|---------------------------------------------|----------------------|')
    for (const pipe of ['llm-only', 'hybrid'] as const) {
      const byQuery = new Map<number, Set<string>>()
      for (const r of results.filter((r) => r.pipeline === pipe && !r.error)) {
        if (!byQuery.has(r.queryId)) byQuery.set(r.queryId, new Set())
        byQuery.get(r.queryId)!.add(r.top1)
      }
      let stable = 0
      let partial = 0
      for (const set of byQuery.values()) {
        if (set.size === 1) stable++
        else if (set.size > 1) partial++
      }
      lines.push(`| ${pipe} | ${stable}/${byQuery.size} | ${partial}/${byQuery.size} |`)
    }
    lines.push('')
  }

  // Per-query disagreement across pipelines (aggregated over runs: query is
  // "disagreed" if ANY run shows a different top-1 between pipelines).
  lines.push('## Top-1 disagreements between pipelines (any run)')
  lines.push('')
  const disagreements: string[] = []
  for (const q of queries) {
    const llmTops = new Set(results.filter((r) => r.pipeline === 'llm-only' && r.queryId === q.id && !r.error).map((r) => r.top1))
    const hybTops = new Set(results.filter((r) => r.pipeline === 'hybrid' && r.queryId === q.id && !r.error).map((r) => r.top1))
    const llmSet = Array.from(llmTops).sort().join(' | ') || '(none)'
    const hybSet = Array.from(hybTops).sort().join(' | ') || '(none)'
    // Use union diff: disagreement if the sets aren't equal.
    const equal = llmTops.size === hybTops.size && Array.from(llmTops).every((x) => hybTops.has(x))
    if (!equal) {
      disagreements.push(`- **Q${q.id}** "${q.q.slice(0, 60)}"  ideal=\`${q.ideal.split('/').pop()}\`  llm→\`${llmSet.split('/').pop()}\`  hybrid→\`${hybSet.split('/').pop()}\``)
    }
  }
  if (disagreements.length === 0) {
    lines.push('(none — pipelines agree on top-1 across all runs)')
  } else {
    lines.push(...disagreements)
  }
  lines.push('')

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
