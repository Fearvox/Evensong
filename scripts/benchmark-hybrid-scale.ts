#!/usr/bin/env bun
/**
 * Wave 3+ D' / 3+G — Hybrid RaR scale benchmark (multi-pipeline).
 *
 * Proves the core EverMemOS §3.4 pitch: as the manifest grows, LLM-only
 * retrieval blows up in latency + token cost, but Hybrid (BM25 → LLM)
 * stays sub-linear because stage 2 only sees the top-K candidate pool.
 * The adaptive variant extends that by gating stage 2 on BM25 confidence
 * (scores[0] / scores[1] >= threshold → skip LLM entirely).
 *
 * Method:
 *   - Real 18-entry _vault manifest (ground truth)
 *   - Generate 182 synthetic "junk" entries on unrelated topics → 200 total
 *   - Run queries through selected pipelines (--pipelines flag, default
 *     "llm-only,hybrid"; add "adaptive" for Wave 3+G):
 *       A) LLM-only (atomicProvider with deepseek-v3.2) on full manifest
 *       B) Hybrid (BM25 stage 1 top-K → deepseek-v3.2 stage 2)
 *       C) Adaptive Hybrid (BM25 stage 1; skip stage 2 when BM25 gap
 *          ratio >= --gap-ratio, default 1.5)
 *   - Compare top-1 accuracy + latency per pipeline, plus adaptive skip rate.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildVaultManifest } from '../src/services/retrieval/manifestBuilder.js'
import { createLocalGemmaClient, ATOMIC_MODELS } from '../src/services/api/localGemma.js'
import { createAtomicProvider } from '../src/services/retrieval/providers/atomicProvider.js'
import { createBM25Provider } from '../src/services/retrieval/providers/bm25Provider.js'
import { createHybridProvider } from '../src/services/retrieval/providers/hybridProvider.js'
import { createAdaptiveHybridProvider } from '../src/services/retrieval/providers/adaptiveHybridProvider.js'
import { vaultRetrieve } from '../src/services/retrieval/vaultRetrieve.js'
import type { VaultManifestEntry, VaultRetrievalProvider } from '../src/services/retrieval/types.js'
import { readFileSync } from 'node:fs'
import defaultQueriesJson from '../benchmarks/wave3-judge-queries.json' with { type: 'json' }

type Pipeline = 'llm-only' | 'hybrid' | 'adaptive'

interface QueryEntry {
  id: number
  category: string
  q: string
  ideal: string
}

interface PipelineResult {
  pipeline: Pipeline
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
  /** For adaptive: true when stage 2 was skipped (BM25 confident alone). */
  stage2Skipped?: boolean
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
      title: `${topic} ${i}`,
      retentionScore: 0.1,
      accessCount: 0,
      lastAccess: '2026-01-01',
      summaryLevel: 'shallow',
      excerpt: `synthetic noise entry ${i} — ${topic}`,
    })
  }
  return out
}

async function runOne(
  provider: VaultRetrievalProvider,
  pipeline: Pipeline,
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
    // Adaptive: when result.scores is populated, stage 2 was skipped
    // (see adaptiveHybridProvider.ts — skip branch forwards BM25 scores,
    //  invoke branch returns no scores).
    const stage2Skipped =
      pipeline === 'adaptive'
        ? Array.isArray(r.scores) && r.scores.length > 0
        : undefined
    return {
      ...base,
      top1: top5[0] ?? '',
      top5,
      top1Hit: top5[0] === q.ideal,
      top5Hit: top5.includes(q.ideal),
      latencyMs: r.latencyMs,
      stage2Skipped,
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

function parsePipelines(raw: string | undefined): Pipeline[] {
  const requested = (raw ?? 'llm-only,hybrid')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as Pipeline[]
  const valid: Pipeline[] = ['llm-only', 'hybrid', 'adaptive']
  const filtered = requested.filter((p) => valid.includes(p))
  if (filtered.length === 0) throw new Error(`--pipelines produced empty set (raw="${raw}"). Valid: ${valid.join(',')}`)
  return filtered
}

async function main() {
  const concurrency = parseInt(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '3', 10)
  const junkCount = parseInt(process.argv.find((a) => a.startsWith('--junk='))?.split('=')[1] ?? '182', 10)
  const stage1TopK = parseInt(process.argv.find((a) => a.startsWith('--stage1='))?.split('=')[1] ?? '50', 10)
  const runs = parseInt(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] ?? '1', 10)
  const queriesFile = process.argv.find((a) => a.startsWith('--queries-file='))?.split('=')[1]
  const withBody = process.argv.includes('--with-body')
  const pipelinesRaw = process.argv.find((a) => a.startsWith('--pipelines='))?.split('=')[1]
  const pipelines = parsePipelines(pipelinesRaw)
  const gapRatio = parseFloat(process.argv.find((a) => a.startsWith('--gap-ratio='))?.split('=')[1] ?? '1.5')
  const limitN = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0', 10)

  const queriesObj = queriesFile
    ? JSON.parse(readFileSync(queriesFile, 'utf-8'))
    : defaultQueriesJson
  const allQueries = queriesObj.queries as QueryEntry[]
  const queries = limitN > 0 ? allQueries.slice(0, limitN) : allQueries
  console.log(`[scale] queries: ${queries.length}${limitN > 0 ? ` (limit=${limitN} of ${allQueries.length})` : ''} from ${queriesFile ?? 'default wave3-judge-queries.json'}`)

  const real = await buildVaultManifest({ vaultRoot: process.cwd() + '/_vault', withBody })
  const junk = generateJunk(junkCount)
  const manifest = [...real, ...junk]
  console.log(`[scale] manifest: ${real.length} real + ${junk.length} junk = ${manifest.length} total`)
  console.log(`[scale] pipelines: ${pipelines.join(', ')}${pipelines.includes('adaptive') ? ` (gap-ratio=${gapRatio})` : ''}`)

  const client = createLocalGemmaClient({ model: ATOMIC_MODELS.DEEPSEEK_V32 })
  const llmOnly = createAtomicProvider(client)
  const hybrid = createHybridProvider({
    stage1: createBM25Provider(),
    stage2: llmOnly,
    stage1TopK,
  })
  const adaptive = createAdaptiveHybridProvider({
    stage1: createBM25Provider(),
    stage2: llmOnly,
    stage1TopK,
    gapRatioThreshold: gapRatio,
  })
  const providerByPipeline: Record<Pipeline, VaultRetrievalProvider> = {
    'llm-only': llmOnly,
    hybrid,
    adaptive,
  }

  const work: Array<{ provider: VaultRetrievalProvider; pipeline: Pipeline; q: QueryEntry; runIdx: number }> = []
  // Interleave runs + pipelines + queries so transient rate-limits don't
  // cluster into one cell of the result matrix.
  for (let runIdx = 0; runIdx < runs; runIdx++) {
    for (const q of queries) {
      for (const pipe of pipelines) {
        work.push({ provider: providerByPipeline[pipe], pipeline: pipe, q, runIdx })
      }
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
  const filePrefix = pipelines.includes('adaptive') ? 'wave3g-pipelines' : 'wave3d-hybrid-scale'
  const jsonlPath = path.join(outDir, `${filePrefix}-${stamp}.jsonl`)
  const mdPath = path.join(outDir, `${filePrefix}-${stamp}.md`)
  writeFileSync(jsonlPath, results.map((r) => JSON.stringify(r)).join('\n') + '\n')

  const lines: string[] = []
  const titleSuffix = pipelines.includes('adaptive') ? "D' + G — Hybrid + Adaptive Scale" : "D' — Hybrid Scale"
  lines.push(`# Wave 3+ ${titleSuffix} Benchmark`)
  lines.push('')
  lines.push(`- Manifest: **${manifest.length} entries** (${real.length} real + ${junk.length} junk)`)
  lines.push(`- Queries: **${queries.length}**`)
  lines.push(`- Runs per (pipeline × query): **${runs}**`)
  const pipelineDescs: string[] = []
  for (const p of pipelines) {
    if (p === 'llm-only') pipelineDescs.push('**llm-only** (deepseek-v3.2 over full manifest)')
    else if (p === 'hybrid') pipelineDescs.push(`**hybrid** (BM25 top-${stage1TopK} → deepseek-v3.2)`)
    else if (p === 'adaptive') pipelineDescs.push(`**adaptive** (BM25 top-${stage1TopK}, skip stage 2 when BM25 gap_ratio ≥ ${gapRatio})`)
  }
  lines.push(`- Pipelines: ${pipelineDescs.join(' · ')}`)
  lines.push(`- Total calls: **${work.length}**`)
  lines.push('')
  lines.push('## Aggregated (all runs flattened)')
  lines.push('')
  lines.push('| Pipeline | Top-1 | Top-5 | p50 latency | p90 latency | Avg latency | Avg manifest handed to LLM |')
  lines.push('|----------|-------|-------|-------------|-------------|-------------|-----------------------------|')

  for (const pipe of pipelines) {
    const rs = results.filter((r) => r.pipeline === pipe && !r.error)
    const total = results.filter((r) => r.pipeline === pipe).length
    const top1 = rs.filter((r) => r.top1Hit).length
    const top5 = rs.filter((r) => r.top5Hit).length
    const lats = rs.map((r) => r.latencyMs).sort((a, b) => a - b)
    const p50 = Math.round(quantile(lats, 0.5))
    const p90 = Math.round(quantile(lats, 0.9))
    const avg = lats.length > 0 ? Math.round(lats.reduce((s, x) => s + x, 0) / lats.length) : 0
    let avgManifest: string
    if (pipe === 'llm-only') avgManifest = String(manifest.length)
    else if (pipe === 'hybrid') avgManifest = String(Math.min(stage1TopK, manifest.length))
    else {
      const skipped = rs.filter((r) => r.stage2Skipped).length
      const skipPct = rs.length > 0 ? (skipped / rs.length) * 100 : 0
      avgManifest = `${Math.min(stage1TopK, manifest.length)} on ${(100 - skipPct).toFixed(0)}% of queries, 0 on ${skipPct.toFixed(0)}% (skipped)`
    }
    lines.push(`| ${pipe} | ${top1}/${total} (${((top1 / total) * 100).toFixed(1)}%) | ${top5}/${total} (${((top5 / total) * 100).toFixed(1)}%) | ${p50}ms | ${p90}ms | ${avg}ms | ${avgManifest} |`)
  }
  lines.push('')

  // Adaptive-only: gating stats
  if (pipelines.includes('adaptive')) {
    const rs = results.filter((r) => r.pipeline === 'adaptive' && !r.error)
    const skipped = rs.filter((r) => r.stage2Skipped)
    const invoked = rs.filter((r) => !r.stage2Skipped)
    const skipTop1 = skipped.filter((r) => r.top1Hit).length
    const invTop1 = invoked.filter((r) => r.top1Hit).length
    lines.push('## Adaptive gating stats')
    lines.push('')
    lines.push(`- Skip rate: **${skipped.length}/${rs.length} (${((skipped.length / Math.max(1, rs.length)) * 100).toFixed(1)}%)** — stage 2 LLM call avoided when BM25 gap_ratio ≥ ${gapRatio}`)
    lines.push(`- Top-1 on skipped queries: **${skipTop1}/${skipped.length} (${skipped.length > 0 ? ((skipTop1 / skipped.length) * 100).toFixed(1) : '0'}%)** — how often BM25 alone got it right on its confident picks`)
    lines.push(`- Top-1 on invoked queries: **${invTop1}/${invoked.length} (${invoked.length > 0 ? ((invTop1 / invoked.length) * 100).toFixed(1) : '0'}%)** — how often stage 2 LLM resolved the ambiguous BM25 cases`)
    lines.push(`- Gate threshold: gap_ratio = scores[0] / scores[1] ≥ ${gapRatio}`)
    lines.push('')
  }

  // Per-run breakdown (variance visibility)
  if (runs > 1) {
    lines.push('## Per-run top-1 accuracy (variance inspection)')
    lines.push('')
    const header = ['Pipeline', ...Array.from({ length: runs }, (_, i) => `run ${i}`), 'mean', 'stddev']
    lines.push(`| ${header.join(' | ')} |`)
    lines.push(`| ${header.map(() => '---').join(' | ')} |`)
    for (const pipe of pipelines) {
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

  // Per-query consistency
  if (runs > 1) {
    lines.push('## Per-query run-to-run consistency')
    lines.push('')
    lines.push('| Pipeline | Queries w/ identical top-1 across all runs | Partial disagreement |')
    lines.push('|----------|---------------------------------------------|----------------------|')
    for (const pipe of pipelines) {
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

  // Per-query disagreement across ALL enabled pipelines (any run)
  lines.push('## Top-1 disagreements between pipelines (any run)')
  lines.push('')
  const disagreements: string[] = []
  for (const q of queries) {
    const topsByPipe: Record<Pipeline, Set<string>> = {
      'llm-only': new Set(),
      hybrid: new Set(),
      adaptive: new Set(),
    }
    for (const p of pipelines) {
      for (const r of results.filter((r) => r.pipeline === p && r.queryId === q.id && !r.error)) {
        topsByPipe[p].add(r.top1)
      }
    }
    const union = new Set<string>()
    for (const p of pipelines) for (const v of topsByPipe[p]) union.add(v)
    if (union.size <= 1) continue
    const parts = pipelines
      .map((p) => {
        const vals = Array.from(topsByPipe[p]).sort().map((x) => x.split('/').pop()).join(' | ') || '(none)'
        return `${p}→\`${vals}\``
      })
      .join('  ')
    disagreements.push(`- **Q${q.id}** "${q.q.slice(0, 60)}"  ideal=\`${q.ideal.split('/').pop()}\`  ${parts}`)
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
