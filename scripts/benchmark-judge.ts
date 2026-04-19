#!/usr/bin/env bun
/**
 * Wave 3+ B — judge benchmark harness.
 *
 * Runs every candidate model × every query × N runs against the real _vault
 * manifest and emits:
 *   - JSONL raw results   (benchmarks/runs/wave3-judge-YYYY-MM-DDTHHMMSS.jsonl)
 *   - Markdown summary    (benchmarks/runs/wave3-judge-YYYY-MM-DDTHHMMSS.md)
 *   - Stdout summary table
 *
 * Metrics:
 *   - Top-1 accuracy              (rankedPaths[0] === ideal)
 *   - Top-5 inclusion             (ideal ∈ rankedPaths[0..4])
 *   - MRR over topK               (1 / rank(ideal); 0 if absent)
 *   - Latency p50 / p90           (wall-clock ms)
 *   - Consistency across runs     (for each query, how many of N runs produced the same top-1)
 *
 * Concurrency control via `--concurrency N` (default 3) — Atomic can handle
 * small concurrency on cloud-proxied models (grok-3, deepseek-v3.2,
 * openrouter/*), but the local Gemma tier would serialize anyway.
 *
 * Usage:
 *   bun run scripts/benchmark-judge.ts
 *   bun run scripts/benchmark-judge.ts --models deepseek,grok3 --runs 3 --concurrency 3
 *   bun run scripts/benchmark-judge.ts --queries 5           # smoke: only first 5 queries
 */

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { buildVaultManifest } from '../src/services/retrieval/manifestBuilder.js'
import { createLocalGemmaClient, ATOMIC_MODELS } from '../src/services/api/localGemma.js'
import { createAtomicProvider } from '../src/services/retrieval/providers/atomicProvider.js'
import { vaultRetrieve, AllProvidersFailedError } from '../src/services/retrieval/vaultRetrieve.js'
import queriesJson from '../benchmarks/wave3-judge-queries.json' with { type: 'json' }

interface QueryEntry {
  id: number
  category: string
  q: string
  ideal: string
}

interface RunResult {
  model: string
  queryId: number
  runIdx: number
  category: string
  query: string
  ideal: string
  rankedPaths: string[]
  latencyMs: number
  top1Hit: boolean
  top5Hit: boolean
  rrPosition: number // 0 means not in topK
  error?: string
}

interface Args {
  models: string[]
  runs: number
  concurrency: number
  queryLimit: number
  outDir: string
}

const MODEL_ALIAS_MAP: Record<string, string> = {
  deepseek: ATOMIC_MODELS.DEEPSEEK_V32,
  'deepseek-v3.2': ATOMIC_MODELS.DEEPSEEK_V32,
  grok3: ATOMIC_MODELS.GROK_3,
  'grok-3': ATOMIC_MODELS.GROK_3,
  autofree: ATOMIC_MODELS.OR_AUTO_FREE,
  'auto-free': ATOMIC_MODELS.OR_AUTO_FREE,
}

function resolveModel(alias: string): string {
  return MODEL_ALIAS_MAP[alias] ?? alias
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith('--')) {
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(a.slice(2), next)
        i++
      } else {
        flags.set(a.slice(2), 'true')
      }
    }
  }
  const modelsStr = flags.get('models') ?? 'deepseek,grok3,autofree'
  return {
    models: modelsStr.split(',').map((s) => resolveModel(s.trim())),
    runs: parseInt(flags.get('runs') ?? '3', 10),
    concurrency: parseInt(flags.get('concurrency') ?? '3', 10),
    queryLimit: parseInt(flags.get('queries') ?? '999', 10),
    outDir: flags.get('out') ?? path.join(process.cwd(), 'benchmarks', 'runs'),
  }
}

async function runOne(model: string, q: QueryEntry, runIdx: number, manifest: Awaited<ReturnType<typeof buildVaultManifest>>): Promise<RunResult> {
  const client = createLocalGemmaClient({ model })
  const provider = createAtomicProvider(client)
  const base: RunResult = {
    model,
    queryId: q.id,
    runIdx,
    category: q.category,
    query: q.q,
    ideal: q.ideal,
    rankedPaths: [],
    latencyMs: 0,
    top1Hit: false,
    top5Hit: false,
    rrPosition: 0,
  }
  try {
    const result = await vaultRetrieve({ query: q.q, manifest, topK: 5 }, { providers: [provider] })
    const idx = result.rankedPaths.indexOf(q.ideal)
    return {
      ...base,
      rankedPaths: result.rankedPaths,
      latencyMs: result.latencyMs,
      top1Hit: result.rankedPaths[0] === q.ideal,
      top5Hit: idx >= 0 && idx < 5,
      rrPosition: idx >= 0 ? idx + 1 : 0,
    }
  } catch (err) {
    return {
      ...base,
      error: err instanceof AllProvidersFailedError
        ? err.attempts.map((a) => `${a.provider}: ${a.error}`).join('; ')
        : err instanceof Error ? err.message : String(err),
    }
  }
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await worker(items[idx]!, idx)
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
  const w = pos - lo
  return sorted[lo]! * (1 - w) + sorted[hi]! * w
}

function summarize(results: RunResult[], models: string[], runs: number, queryCount: number): string {
  const lines: string[] = []
  lines.push('# Wave 3+ B Judge Benchmark — Summary')
  lines.push('')
  lines.push(`- Queries: **${queryCount}**`)
  lines.push(`- Models: **${models.length}**  (${models.join(', ')})`)
  lines.push(`- Runs per (model × query): **${runs}**`)
  lines.push(`- Total calls: **${models.length * queryCount * runs}**`)
  lines.push('')
  lines.push('## Summary Table')
  lines.push('')
  lines.push('| Model | Top-1 | Top-5 | MRR | p50 lat | p90 lat | Errors |')
  lines.push('|-------|-------|-------|-----|---------|---------|--------|')

  for (const model of models) {
    const subset = results.filter((r) => r.model === model)
    const successful = subset.filter((r) => !r.error)
    const total = subset.length
    const errors = total - successful.length
    const top1 = successful.filter((r) => r.top1Hit).length
    const top5 = successful.filter((r) => r.top5Hit).length
    const mrr = successful.reduce((s, r) => s + (r.rrPosition > 0 ? 1 / r.rrPosition : 0), 0) / Math.max(successful.length, 1)
    const latencies = successful.map((r) => r.latencyMs).sort((a, b) => a - b)
    const p50 = Math.round(quantile(latencies, 0.5))
    const p90 = Math.round(quantile(latencies, 0.9))
    lines.push(
      `| ${model} | ${top1}/${total} (${((top1 / total) * 100).toFixed(0)}%) | ${top5}/${total} (${((top5 / total) * 100).toFixed(0)}%) | ${mrr.toFixed(3)} | ${p50}ms | ${p90}ms | ${errors} |`,
    )
  }
  lines.push('')

  // Per-model consistency across runs
  lines.push('## Consistency (same top-1 across runs, per query)')
  lines.push('')
  lines.push('| Model | Queries with identical top-1 across all runs | Partial agreement |')
  lines.push('|-------|---|---|')
  for (const model of models) {
    const byQuery = new Map<number, Set<string>>()
    for (const r of results.filter((x) => x.model === model && !x.error)) {
      const top = r.rankedPaths[0] ?? ''
      if (!byQuery.has(r.queryId)) byQuery.set(r.queryId, new Set())
      byQuery.get(r.queryId)!.add(top)
    }
    let stable = 0
    let partial = 0
    for (const set of byQuery.values()) {
      if (set.size === 1) stable++
      else if (set.size > 1) partial++
    }
    lines.push(`| ${model} | ${stable}/${byQuery.size} | ${partial}/${byQuery.size} |`)
  }
  lines.push('')

  lines.push('## Category Breakdown (top-1 rate per category)')
  lines.push('')
  const categories = Array.from(new Set(results.map((r) => r.category)))
  const header = ['Category', ...models]
  lines.push(`| ${header.join(' | ')} |`)
  lines.push(`| ${header.map(() => '---').join(' | ')} |`)
  for (const cat of categories) {
    const row: string[] = [cat]
    for (const model of models) {
      const subset = results.filter((r) => r.model === model && r.category === cat && !r.error)
      const top1 = subset.filter((r) => r.top1Hit).length
      row.push(`${top1}/${subset.length}`)
    }
    lines.push(`| ${row.join(' | ')} |`)
  }
  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  console.log(`[bench] manifest loading...`)
  const manifest = await buildVaultManifest({ vaultRoot: process.cwd() + '/_vault' })
  const allQueries = (queriesJson.queries as QueryEntry[]).slice(0, args.queryLimit)
  console.log(`[bench] manifest: ${manifest.length} entries, queries: ${allQueries.length}`)
  console.log(`[bench] models: ${args.models.join(', ')}`)
  console.log(`[bench] runs per combo: ${args.runs}, concurrency: ${args.concurrency}`)

  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
  mkdirSync(args.outDir, { recursive: true })
  const jsonlPath = path.join(args.outDir, `wave3-judge-${stamp}.jsonl`)
  const mdPath = path.join(args.outDir, `wave3-judge-${stamp}.md`)

  // Build (model, query, runIdx) work units; interleave models so transient
  // rate-limit on one model doesn't skew latency for another.
  const workUnits: Array<{ model: string; q: QueryEntry; runIdx: number }> = []
  for (let runIdx = 0; runIdx < args.runs; runIdx++) {
    for (const q of allQueries) {
      for (const model of args.models) {
        workUnits.push({ model, q, runIdx })
      }
    }
  }
  console.log(`[bench] total calls: ${workUnits.length}`)
  const t0 = Date.now()

  let done = 0
  const results = await runWithConcurrency(workUnits, args.concurrency, async (unit) => {
    const r = await runOne(unit.model, unit.q, unit.runIdx, manifest)
    appendFileSync(jsonlPath, JSON.stringify(r) + '\n')
    done++
    if (done % 10 === 0 || done === workUnits.length) {
      console.log(`  [${done}/${workUnits.length}]  ${((Date.now() - t0) / 1000).toFixed(1)}s elapsed`)
    }
    return r
  })

  const md = summarize(results, args.models, args.runs, allQueries.length)
  writeFileSync(mdPath, md + '\n')
  console.log(`\n${md}\n`)
  console.log(`[bench] raw:     ${jsonlPath}`)
  console.log(`[bench] summary: ${mdPath}`)
  console.log(`[bench] wall:    ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((err) => {
  console.error('[bench] fatal:', err)
  process.exit(1)
})
