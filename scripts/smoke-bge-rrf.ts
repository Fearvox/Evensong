#!/usr/bin/env bun
/**
 * Wave 3+H Phase 4 — Mini smoke benchmark on the 20-query handwritten set.
 *
 * Compares three stage-1 pipelines:
 *   - BM25 alone (lexical)
 *   - BGE-M3 dense alone (semantic)
 *   - RRF(BM25, BGE-M3) at k=10 (fusion)
 *
 * No LLM stage 2 in this smoke — we want to isolate stage-1 quality on
 * the handwritten reference set. Expected result: RRF fusion top-1
 * equals or exceeds both individual pipelines, with particular wins on
 * the concept queries (Q13 extended mind) that BM25 misses.
 *
 * Usage:
 *   bun run scripts/smoke-bge-rrf.ts
 *   bun run scripts/smoke-bge-rrf.ts --with-junk=100
 *   bun run scripts/smoke-bge-rrf.ts --rrf-k=20
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { buildVaultManifest } from '../src/services/retrieval/manifestBuilder.js'
import {
  createBgeEmbeddingClient,
  BGE_EMBEDDING_DEFAULT_BASE_URL,
} from '../src/services/api/bgeEmbedding.js'
import { createBgeEmbeddingProvider } from '../src/services/retrieval/providers/bgeEmbeddingProvider.js'
import { createBM25Provider } from '../src/services/retrieval/providers/bm25Provider.js'
import { createRRFFusionProvider } from '../src/services/retrieval/providers/rrfFusionProvider.js'
import type { VaultManifestEntry, VaultRetrievalProvider } from '../src/services/retrieval/types.js'
import defaultQueriesJson from '../benchmarks/wave3-judge-queries.json' with { type: 'json' }

interface QueryEntry {
  id: number
  category: string
  q: string
  ideal: string
}

interface Row {
  queryId: number
  category: string
  q: string
  ideal: string
  bm25Top1: string
  denseTop1: string
  rrfTop1: string
  bm25Hit: boolean
  denseHit: boolean
  rrfHit: boolean
  bm25LatencyMs: number
  denseLatencyMs: number
  rrfLatencyMs: number
}

const NOISE_TOPICS = [
  'cooking carbonara',
  'travel Tokyo',
  'marathon training',
  'woodworking technique',
  'astronomy telescope',
  'bonsai pruning',
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

async function timedRun(
  provider: VaultRetrievalProvider,
  query: string,
  manifest: VaultManifestEntry[],
): Promise<{ top1: string; latencyMs: number }> {
  const t0 = Date.now()
  const r = await provider.retrieve({ query, manifest, topK: 5 })
  return { top1: r.rankedPaths[0] ?? '', latencyMs: Date.now() - t0 }
}

async function main() {
  const junkCount = parseInt(
    process.argv.find((a) => a.startsWith('--with-junk='))?.split('=')[1] ?? '0',
    10,
  )
  const rrfK = parseInt(
    process.argv.find((a) => a.startsWith('--rrf-k='))?.split('=')[1] ?? '10',
    10,
  )

  const real = await buildVaultManifest({ vaultRoot: process.cwd() + '/_vault', withBody: true })
  const junk = generateJunk(junkCount)
  const manifest = [...real, ...junk]
  const queries = (defaultQueriesJson as { queries: QueryEntry[] }).queries

  console.log(`[smoke] manifest: ${real.length} real + ${junk.length} junk = ${manifest.length} total`)
  console.log(`[smoke] queries: ${queries.length} from wave3-judge-queries.json`)
  console.log(`[smoke] rrf k = ${rrfK}`)
  console.log('')

  const bm25 = createBM25Provider()
  const bgeClient = createBgeEmbeddingClient({
    baseURL: BGE_EMBEDDING_DEFAULT_BASE_URL,
    timeoutMs: 180000,
  })
  const dense = createBgeEmbeddingProvider({ client: bgeClient })
  const rrf = createRRFFusionProvider({
    providers: [bm25, dense],
    k: rrfK,
    stagePoolTopK: Math.min(50, manifest.length),
  })

  // Warmup: one retrieve fills the dense corpus cache; without this the
  // first bench iteration pays the ~60-90s cold-batch penalty.
  console.log('[smoke] warming dense corpus cache (18-200 entry batch embed)...')
  const tWarm = Date.now()
  await dense.retrieve({ query: 'warmup', manifest, topK: 1 })
  console.log(`[smoke] dense corpus warmed in ${Date.now() - tWarm}ms`)
  console.log('')

  const rows: Row[] = []
  let i = 0
  for (const q of queries) {
    i++
    // Serialize per-query so the dense backend is never hit by two
    // parallel embed requests at once (RRF internally calls dense
    // itself). Without this, rrfLatencyMs is inflated by self-
    // contention with the standalone dense timing. Codex adversarial
    // review flagged this 2026-04-19.
    const bm = await timedRun(bm25, q.q, manifest)
    const dn = await timedRun(dense, q.q, manifest)
    const rf = await timedRun(rrf, q.q, manifest)
    const row: Row = {
      queryId: q.id,
      category: q.category,
      q: q.q,
      ideal: q.ideal,
      bm25Top1: bm.top1,
      denseTop1: dn.top1,
      rrfTop1: rf.top1,
      bm25Hit: bm.top1 === q.ideal,
      denseHit: dn.top1 === q.ideal,
      rrfHit: rf.top1 === q.ideal,
      bm25LatencyMs: bm.latencyMs,
      denseLatencyMs: dn.latencyMs,
      rrfLatencyMs: rf.latencyMs,
    }
    rows.push(row)
    const shorts = (p: string) => p.split('/').pop() ?? p
    const ideal = shorts(q.ideal)
    console.log(
      `[${String(i).padStart(2, '0')}/${queries.length}] ${q.category.padEnd(11)} ` +
      `BM25=${row.bm25Hit ? '✓' : '✗'}(${bm.latencyMs}ms) ` +
      `DENSE=${row.denseHit ? '✓' : '✗'}(${dn.latencyMs}ms) ` +
      `RRF=${row.rrfHit ? '✓' : '✗'}(${rf.latencyMs}ms) ` +
      `| Q: ${q.q.slice(0, 50)}`
    )
    // Show disagreements on rank-1 for quick analysis
    if (!(row.bm25Hit && row.denseHit && row.rrfHit)) {
      console.log(
        `         want=${ideal}  bm25=${shorts(bm.top1)}  dense=${shorts(dn.top1)}  rrf=${shorts(rf.top1)}`,
      )
    }
  }

  const pct = (n: number) => `${((n / rows.length) * 100).toFixed(1)}%`
  const avg = (arr: number[]) => (arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(0)
  const bm25Hits = rows.filter((r) => r.bm25Hit).length
  const denseHits = rows.filter((r) => r.denseHit).length
  const rrfHits = rows.filter((r) => r.rrfHit).length

  const lines: string[] = []
  lines.push('')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push(`  Wave 3+H Phase 4 Smoke — ${queries.length}q × ${manifest.length}-entry manifest, rrf k=${rrfK}`)
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('')
  lines.push(`| Stage-1 pipeline            | Top-1 accuracy              | Avg latency |`)
  lines.push(`|-----------------------------|-----------------------------|-------------|`)
  lines.push(`| BM25 alone                  | ${bm25Hits}/${rows.length} (${pct(bm25Hits)})            | ${avg(rows.map((r) => r.bm25LatencyMs))}ms      |`)
  lines.push(`| BGE-M3 dense alone          | ${denseHits}/${rows.length} (${pct(denseHits)})            | ${avg(rows.map((r) => r.denseLatencyMs))}ms     |`)
  lines.push(`| **RRF(BM25, BGE) k=${rrfK.toString().padEnd(2)}**       | **${rrfHits}/${rows.length} (${pct(rrfHits)})**            | ${avg(rows.map((r) => r.rrfLatencyMs))}ms     |`)
  lines.push('')

  // Per-category breakdown
  const cats = Array.from(new Set(rows.map((r) => r.category)))
  lines.push(`## Per-category top-1`)
  lines.push('')
  lines.push(`| Category | N | BM25 | Dense | RRF |`)
  lines.push(`|----------|---|------|-------|-----|`)
  for (const cat of cats) {
    const catRows = rows.filter((r) => r.category === cat)
    const n = catRows.length
    lines.push(
      `| ${cat.padEnd(11)} | ${n} | ${catRows.filter((r) => r.bm25Hit).length}/${n} | ${catRows.filter((r) => r.denseHit).length}/${n} | ${catRows.filter((r) => r.rrfHit).length}/${n} |`,
    )
  }
  lines.push('')

  // Error breakdown: where does RRF rescue BM25? where does it lose?
  const rrfRescues = rows.filter((r) => !r.bm25Hit && r.rrfHit)
  const rrfLosses = rows.filter((r) => r.bm25Hit && !r.rrfHit)
  lines.push(`## RRF vs BM25 — rescues & regressions`)
  lines.push('')
  if (rrfRescues.length > 0) {
    lines.push(`**RRF rescued ${rrfRescues.length} query(ies) that BM25 missed:**`)
    for (const r of rrfRescues) {
      lines.push(`- Q${r.queryId} "${r.q.slice(0, 50)}" — want=\`${r.ideal.split('/').pop()}\`, bm25=\`${r.bm25Top1.split('/').pop()}\`, rrf=\`${r.rrfTop1.split('/').pop()}\``)
    }
    lines.push('')
  }
  if (rrfLosses.length > 0) {
    lines.push(`**RRF regressed on ${rrfLosses.length} query(ies) BM25 got right:**`)
    for (const r of rrfLosses) {
      lines.push(`- Q${r.queryId} "${r.q.slice(0, 50)}" — want=\`${r.ideal.split('/').pop()}\`, bm25=\`${r.bm25Top1.split('/').pop()}\`, rrf=\`${r.rrfTop1.split('/').pop()}\``)
    }
    lines.push('')
  }
  if (rrfRescues.length === 0 && rrfLosses.length === 0) {
    lines.push(`(none — RRF and BM25 agree on every query)`)
    lines.push('')
  }

  const summary = lines.join('\n')
  console.log(summary)

  // Persist artifact
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
  const outDir = path.join(process.cwd(), 'benchmarks', 'runs')
  mkdirSync(outDir, { recursive: true })
  const mdPath = path.join(outDir, `wave3h-smoke-bge-rrf-${stamp}.md`)
  const jsonlPath = path.join(outDir, `wave3h-smoke-bge-rrf-${stamp}.jsonl`)
  writeFileSync(mdPath, `# Wave 3+H Phase 4 Smoke — BGE/RRF\n\n- Manifest: ${real.length} real + ${junk.length} junk = ${manifest.length}\n- Queries: ${queries.length} (handwritten wave3-judge-queries.json)\n- RRF k: ${rrfK}\n${summary}\n`)
  writeFileSync(jsonlPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  console.log(`\n[smoke] artifact: ${mdPath}`)
  console.log(`[smoke] raw:      ${jsonlPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
