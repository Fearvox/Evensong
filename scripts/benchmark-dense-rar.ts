#!/usr/bin/env bun
/**
 * Wave 3+I — Dense-first RAR benchmark.
 *
 * Purpose:
 *   - Stage 1: BGE-M3 dense retrieval over the vault manifest
 *   - Stage 2: MiniMax (or any OpenAI-compatible judge) reranks the top-K pool
 *   - Adaptive variant: skip the judge when dense rank-1 is sufficiently
 *     ahead of rank-2
 *
 * This is the practical bridge between the Wave 3+H "dense wins stage 1"
 * finding and the Wave 3+I "dense + judge" target described in the handoff.
 *
 * Example:
 *   bun run scripts/benchmark-dense-rar.ts \
 *     --vault-root /path/to/research-vault \
 *     --queries-file benchmarks/wave3-judge-queries.json \
 *     --pipelines dense,dense-rar,dense-adaptive \
 *     --judge-model MiniMax-M2.7 \
 *     --judge-base-url https://api.minimax.io/v1 \
 *     --judge-api-key-env MINIMAX_API_KEY
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { buildVaultManifest } from '../src/services/retrieval/manifestBuilder.js'
import {
  createLocalGemmaClient,
  ATOMIC_MODELS,
} from '../src/services/api/localGemma.js'
import {
  createBgeEmbeddingClient,
  BGE_EMBEDDING_DEFAULT_BASE_URL,
} from '../src/services/api/bgeEmbedding.js'
import { createAtomicProvider } from '../src/services/retrieval/providers/atomicProvider.js'
import { createBgeEmbeddingProvider } from '../src/services/retrieval/providers/bgeEmbeddingProvider.js'
import { createHybridProvider } from '../src/services/retrieval/providers/hybridProvider.js'
import { createAdaptiveHybridProvider } from '../src/services/retrieval/providers/adaptiveHybridProvider.js'
import { createBM25Provider } from '../src/services/retrieval/providers/bm25Provider.js'
import { createRRFFusionProvider } from '../src/services/retrieval/providers/rrfFusionProvider.js'
import { vaultRetrieve } from '../src/services/retrieval/vaultRetrieve.js'
import type {
  VaultManifestEntry,
  VaultRetrievalProvider,
} from '../src/services/retrieval/types.js'
import defaultQueriesJson from '../benchmarks/wave3-judge-queries.json' with { type: 'json' }

type Pipeline =
  | 'dense'
  | 'bm25'
  | 'rrf'
  | 'dense-rar'
  | 'dense-adaptive'
  | 'rrf-rar'
  | 'rrf-adaptive'
type RunMode = 'probe' | 'formal'
type JunkMode = 'generic' | 'adversarial' | 'mixed'
type JudgeThinking = 'default' | 'disabled' | 'enabled'
type MissType = 'none' | 'synthetic-distractor' | 'real-near-miss' | 'empty' | 'error'

const SCHEMA_VERSION = 'dense-rar-v3'
const VALID_PIPELINES: Pipeline[] = [
  'dense',
  'bm25',
  'rrf',
  'dense-rar',
  'dense-adaptive',
  'rrf-rar',
  'rrf-adaptive',
]

interface QueryEntry {
  id: number
  category: string
  q: string
  ideal: string
  difficulty?: string
  trap?: string
}

interface QuerySuiteMetadata {
  name?: string
  version?: string
  difficulty?: string
  description?: string
  categories?: string[]
}

interface DenseRarResult {
  schemaVersion: typeof SCHEMA_VERSION
  runId: string
  runMode: RunMode
  pipeline: Pipeline
  queryId: number
  category: string
  difficulty?: string
  trap?: string
  runIdx: number
  query: string
  ideal: string
  top1: string
  top5: string[]
  top1Hit: boolean
  top5Hit: boolean
  latencyMs: number
  manifestSize: number
  candidatePoolSize?: number
  candidateIdealRank?: number
  candidateIdealHit?: boolean
  stage1Provider?: string
  stage2Provider?: string
  stage2Ran?: boolean
  missType?: MissType
  resultStatus: 'ok' | 'error'
  stage2Skipped?: boolean
  diagnostics?: Record<string, unknown>
  error?: string
}

interface DenseRarRunMetadata {
  schemaVersion: typeof SCHEMA_VERSION
  runId: string
  runMode: RunMode
  createdAt: string
  liveAllowed: boolean
  git: {
    commit: string
    dirty: boolean
    dirtyFiles: string[]
  }
  inputs: {
    vaultRoot: string
    queriesFile: string
    querySuite: {
      name: string
      version: string
      difficulty: string
      categories: string[]
    }
    queriesHash: string
    manifestHash: string
    manifestReal: number
    manifestJunk: number
    junkMode: JunkMode
    withBody: boolean
    finalTopK: number
    stage1TopK: number
    rrfK: number
    rrfPool: number
    rrfChildTimeoutMs: number | 'infinity'
  }
  providers: {
    stage1Label: string
    bgeBaseURL: string
    bgeModel: string
    bgeTimeoutMs: number
    bgeCorpusBatchSize: number
    judgeModel: string
    judgeBaseURL: string
    judgeApiKeyEnv: string
    judgeThinking: JudgeThinking
  }
}

export interface PipelineSummary {
  pipeline: Pipeline
  total: number
  valid: number
  errors: number
  top1: number
  top5: number
  p50: number
  p90: number
  avg: number
  judgeExposure: string
  resultStatus: 'ok' | 'invalid'
}

function summarizeProgress(result: DenseRarResult): string {
  const head = `q${result.queryId}:${result.pipeline}:run${result.runIdx}`
  if (result.error) {
    const compact = result.error.length > 120
      ? `${result.error.slice(0, 117)}...`
      : result.error
    return `${head} error=${compact}`
  }

  const outcome = result.top1Hit ? 'top1-hit' : result.top5Hit ? 'top5-hit' : 'miss'
  const stage2 = result.stage2Skipped ? ' stage2=skipped' : ''
  const candidate =
    result.candidateIdealRank !== undefined
      ? ` candidateRank=${result.candidateIdealRank}`
      : result.candidateIdealHit === false
        ? ' candidateMiss'
        : ''
  const top1 = result.top1 ? ` top1=${result.top1}` : ''
  return `${head} ${outcome} latency=${result.latencyMs}ms${stage2}${candidate}${top1}`
}

function parseBool(raw: string | undefined): boolean {
  return /^(1|true|yes|y)$/i.test(raw ?? '')
}

export function isLocalBaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function publicProviderLabel(raw: string): string {
  return isLocalBaseUrl(raw) ? raw : '<NON_LOCAL_PROVIDER_ENDPOINT>'
}

export function assertLiveAllowed(params: {
  bgeBaseURL: string
  judgeBaseURL: string
  pipelines: Pipeline[]
  allowLive: boolean
}): void {
  const needsBge =
    params.pipelines.some(pipelineUsesDense) && !isLocalBaseUrl(params.bgeBaseURL)
  const needsJudge =
    params.pipelines.some(pipelineUsesJudge) && !isLocalBaseUrl(params.judgeBaseURL)
  if ((needsBge || needsJudge) && !params.allowLive) {
    throw new Error(
      [
        'Dense RAR would call non-local providers.',
        `BGE=${publicProviderLabel(params.bgeBaseURL)}`,
        `judge=${publicProviderLabel(params.judgeBaseURL)}`,
        'Set --allow-live=true or DENSE_RAR_ALLOW_LIVE=1 to run this as an explicit live/provider benchmark.',
      ].join(' '),
    )
  }
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function getGitMetadata(): DenseRarRunMetadata['git'] {
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf-8',
  }).stdout.trim() || 'unknown'
  const status = spawnSync('git', ['status', '--porcelain'], {
    encoding: 'utf-8',
  }).stdout
  const dirtyFiles = status
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return { commit, dirty: dirtyFiles.length > 0, dirtyFiles }
}

function manifestIdentityHash(manifest: VaultManifestEntry[]): string {
  return hashText(JSON.stringify(manifest.map((entry) => ({
    path: entry.path,
    title: entry.title,
    retentionScore: entry.retentionScore,
    accessCount: entry.accessCount,
    lastAccess: entry.lastAccess,
    summaryLevel: entry.summaryLevel,
    excerpt: entry.excerpt,
    bodyHash: entry.body ? hashText(entry.body) : undefined,
  }))))
}

function buildRunMetadata(params: {
  runId: string
  runMode: RunMode
  liveAllowed: boolean
  vaultRoot: string
  queriesFile: string
  querySuite: QuerySuiteMetadata
  queriesText: string
  manifest: VaultManifestEntry[]
  realCount: number
  junkCount: number
  junkMode: JunkMode
  withBody: boolean
  finalTopK: number
  stage1TopK: number
  rrfK: number
  rrfPool: number
  rrfChildTimeoutMs: number | 'infinity'
  bgeBaseURL: string
  bgeModel: string
  stage1Label: string
  bgeTimeoutMs: number
  bgeCorpusBatchSize: number
  judgeModel: string
  judgeBaseURL: string
  judgeApiKeyEnv: string
  judgeThinking: JudgeThinking
}): DenseRarRunMetadata {
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: params.runId,
    runMode: params.runMode,
    createdAt: new Date().toISOString(),
    liveAllowed: params.liveAllowed,
    git: getGitMetadata(),
    inputs: {
      vaultRoot: params.vaultRoot,
      queriesFile: params.queriesFile,
      querySuite: {
        name: params.querySuite.name ?? path.basename(params.queriesFile).replace(/\.json$/i, ''),
        version: params.querySuite.version ?? 'unknown',
        difficulty: params.querySuite.difficulty ?? 'unknown',
        categories: params.querySuite.categories ?? [],
      },
      queriesHash: hashText(params.queriesText),
      manifestHash: manifestIdentityHash(params.manifest),
      manifestReal: params.realCount,
      manifestJunk: params.junkCount,
      junkMode: params.junkMode,
      withBody: params.withBody,
      finalTopK: params.finalTopK,
      stage1TopK: params.stage1TopK,
      rrfK: params.rrfK,
      rrfPool: params.rrfPool,
      rrfChildTimeoutMs: params.rrfChildTimeoutMs,
    },
    providers: {
      stage1Label: params.stage1Label,
      bgeBaseURL: publicProviderLabel(params.bgeBaseURL),
      bgeModel: params.bgeModel,
      bgeTimeoutMs: params.bgeTimeoutMs,
      bgeCorpusBatchSize: params.bgeCorpusBatchSize,
      judgeModel: params.judgeModel,
      judgeBaseURL: params.judgeBaseURL,
      judgeApiKeyEnv: params.judgeApiKeyEnv,
      judgeThinking: params.judgeThinking,
    },
  }
}

export function summarizePipeline(
  results: DenseRarResult[],
  pipeline: Pipeline,
  stage1TopK: number,
  manifestLength: number,
): PipelineSummary {
  const all = results.filter((r) => r.pipeline === pipeline)
  const validRows = all.filter((r) => !r.error)
  const errors = all.length - validRows.length
  const top1 = validRows.filter((r) => r.top1Hit).length
  const top5 = validRows.filter((r) => r.top5Hit).length
  const lats = validRows.map((r) => r.latencyMs).sort((a, b) => a - b)
  const p50 = Math.round(quantile(lats, 0.5))
  const p90 = Math.round(quantile(lats, 0.9))
  const avg = lats.length > 0
    ? Math.round(lats.reduce((sum, x) => sum + x, 0) / lats.length)
    : 0

  let judgeExposure = '0'
  if (pipeline === 'dense-rar' || pipeline === 'rrf-rar') {
    judgeExposure = String(Math.min(stage1TopK, manifestLength))
  } else if (pipeline === 'dense-adaptive' || pipeline === 'rrf-adaptive') {
    const skipped = validRows.filter((r) => r.stage2Skipped).length
    const skipPct = validRows.length > 0 ? (skipped / validRows.length) * 100 : 0
    judgeExposure =
      `${Math.min(stage1TopK, manifestLength)} on ${(100 - skipPct).toFixed(0)}%` +
      `, 0 on ${skipPct.toFixed(0)}%`
  }

  return {
    pipeline,
    total: all.length,
    valid: validRows.length,
    errors,
    top1,
    top5,
    p50,
    p90,
    avg,
    judgeExposure,
    resultStatus: errors === 0 ? 'ok' : 'invalid',
  }
}

export interface CategorySummary {
  category: string
  total: number
  valid: number
  errors: number
  top1: number
  top5: number
  candidateHits: number
  candidateMisses: number
  syntheticMisses: number
  realMisses: number
  emptyMisses: number
}

export function summarizeByCategory(
  results: DenseRarResult[],
  pipeline: Pipeline,
): CategorySummary[] {
  const summaries = new Map<string, CategorySummary>()
  for (const row of results.filter((r) => r.pipeline === pipeline)) {
    const current = summaries.get(row.category) ?? {
      category: row.category,
      total: 0,
      valid: 0,
      errors: 0,
      top1: 0,
      top5: 0,
      candidateHits: 0,
      candidateMisses: 0,
      syntheticMisses: 0,
      realMisses: 0,
      emptyMisses: 0,
    }
    current.total++
    if (row.resultStatus === 'error') {
      current.errors++
    } else {
      current.valid++
      if (row.top1Hit) current.top1++
      if (row.top5Hit) current.top5++
      if (row.candidateIdealHit) current.candidateHits++
      if (row.candidateIdealHit === false) current.candidateMisses++
      if (row.missType === 'synthetic-distractor') current.syntheticMisses++
      if (row.missType === 'real-near-miss') current.realMisses++
      if (row.missType === 'empty') current.emptyMisses++
    }
    summaries.set(row.category, current)
  }
  return Array.from(summaries.values()).sort((a, b) =>
    a.category.localeCompare(b.category),
  )
}

interface NoiseTopic {
  title: string
  excerpt: string
}

const GENERIC_NOISE_TOPICS: NoiseTopic[] = [
  { title: 'cooking carbonara pasta recipe', excerpt: 'synthetic noise about cooking pasta and sauce' },
  { title: 'travel guide Tokyo Shibuya', excerpt: 'synthetic noise about city travel planning' },
  { title: 'fashion trends spring collection', excerpt: 'synthetic noise about seasonal fashion' },
  { title: 'marathon training plan', excerpt: 'synthetic noise about running schedules' },
  { title: 'jazz saxophone improvisation', excerpt: 'synthetic noise about music practice' },
  { title: 'woodworking dovetail joint technique', excerpt: 'synthetic noise about woodworking craft' },
  { title: 'astronomy amateur telescope setup', excerpt: 'synthetic noise about telescope observing' },
  { title: 'vintage guitar restoration', excerpt: 'synthetic noise about repairing instruments' },
  { title: 'gardening tomato cultivation', excerpt: 'synthetic noise about home gardening' },
  { title: 'chess endgame tactics', excerpt: 'synthetic noise about chess study' },
  { title: 'surf board waxing', excerpt: 'synthetic noise about sports equipment' },
  { title: 'sourdough starter maintenance', excerpt: 'synthetic noise about bread fermentation' },
  { title: 'mountain biking trail review', excerpt: 'synthetic noise about biking routes' },
  { title: 'bird watching migration season', excerpt: 'synthetic noise about birding' },
  { title: 'ceramics wheel throwing basics', excerpt: 'synthetic noise about pottery' },
  { title: 'bonsai tree pruning schedule', excerpt: 'synthetic noise about miniature tree care' },
]

const ADVERSARIAL_NOISE_TOPICS: NoiseTopic[] = [
  {
    title: 'memory sparse attention market landscape',
    excerpt: 'near-neighbor decoy mixing long-context sparse attention terms with product competitor language',
  },
  {
    title: 'hypergraph memory operating system paging',
    excerpt: 'near-neighbor decoy combining HyperMem graph language with MemGPT virtual memory language',
  },
  {
    title: 'emotional reflexion prompt feedback',
    excerpt: 'near-neighbor decoy mixing emotion prompts, verbal reinforcement, and reflective agents',
  },
  {
    title: 'extended mind AI blackmail benchmark',
    excerpt: 'near-neighbor decoy combining philosophy of cognition with AI safety insider-threat benchmark wording',
  },
  {
    title: 'first principles evensong supervisor methodology',
    excerpt: 'near-neighbor decoy mixing Elon first-principles method, Evensong audit, and supervisor framing',
  },
  {
    title: 'transformer lottery sparse trainable attention',
    excerpt: 'near-neighbor decoy combining transformer attention, lottery tickets, sparse subnetworks, and training',
  },
  {
    title: 'Hermes memory causation public synthesis',
    excerpt: 'near-neighbor decoy mixing Hermes synthesis, Chinese Evensong paper, and memory causality claims',
  },
  {
    title: 'agent benchmark competitor landscape',
    excerpt: 'near-neighbor decoy mixing product landscape with adversarial agent behavior evaluation',
  },
  {
    title: 'long context graph retrieval beyond pairwise RAG',
    excerpt: 'near-neighbor decoy combining MSA context scaling with HyperMem relational retrieval',
  },
  {
    title: 'cognitive systems one two external notebooks',
    excerpt: 'near-neighbor decoy mixing Kahneman system thinking with extended-mind external artifact cognition',
  },
]

function noiseTopicsForMode(mode: JunkMode): NoiseTopic[] {
  if (mode === 'generic') return GENERIC_NOISE_TOPICS
  if (mode === 'adversarial') return ADVERSARIAL_NOISE_TOPICS
  return [...ADVERSARIAL_NOISE_TOPICS, ...GENERIC_NOISE_TOPICS]
}

function generateJunk(n: number, mode: JunkMode): VaultManifestEntry[] {
  const topics = noiseTopicsForMode(mode)
  const out: VaultManifestEntry[] = []
  for (let i = 0; i < n; i++) {
    const topic = topics[i % topics.length]!
    out.push({
      path: `synthetic/${mode}-junk-${String(i).padStart(4, '0')}.md`,
      title: `${topic.title} ${i}`,
      retentionScore: 0.1,
      accessCount: 0,
      lastAccess: '2026-01-01',
      summaryLevel: 'shallow',
      excerpt: `synthetic ${mode} noise entry ${i} -- ${topic.excerpt}`,
    })
  }
  return out
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! * (1 - (pos - lo)) + sorted[hi]! * (pos - lo)
}

function pipelineUsesDense(pipeline: Pipeline): boolean {
  return pipeline !== 'bm25'
}

function pipelineUsesJudge(pipeline: Pipeline): boolean {
  return ['dense-rar', 'dense-adaptive', 'rrf-rar', 'rrf-adaptive'].includes(pipeline)
}

function pipelineUsesAdaptive(pipeline: Pipeline): boolean {
  return ['dense-adaptive', 'rrf-adaptive'].includes(pipeline)
}

function pipelineUsesRRF(pipeline: Pipeline): boolean {
  return ['rrf', 'rrf-rar', 'rrf-adaptive'].includes(pipeline)
}

function isDirectStage1Pipeline(pipeline: Pipeline): boolean {
  return ['dense', 'bm25', 'rrf'].includes(pipeline)
}

export function parsePipelines(raw: string | undefined): Pipeline[] {
  const requested = (raw ?? 'dense,dense-rar,dense-adaptive')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as Pipeline[]
  const filtered = requested.filter((p) => VALID_PIPELINES.includes(p))
  if (filtered.length === 0) {
    throw new Error(
      `--pipelines produced empty set (raw="${raw}"). Valid: ${VALID_PIPELINES.join(', ')}`,
    )
  }
  return filtered
}

function extractRankedPaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string')
}

function getStage1RankedPaths(
  pipeline: Pipeline,
  rankedPaths: string[],
  diagnostics: Record<string, unknown> | undefined,
): string[] {
  const stage1RankedPaths = extractRankedPaths(diagnostics?.stage1RankedPaths)
  if (stage1RankedPaths.length > 0) return stage1RankedPaths
  if (isDirectStage1Pipeline(pipeline)) return rankedPaths
  return []
}

function getStage2Ran(
  pipeline: Pipeline,
  diagnostics: Record<string, unknown> | undefined,
): boolean {
  if (!pipelineUsesJudge(pipeline)) return false
  if (diagnostics?.stage2Skipped === true) return false
  return typeof diagnostics?.stage2Provider === 'string'
}

function getStage2Provider(
  diagnostics: Record<string, unknown> | undefined,
): string | undefined {
  return typeof diagnostics?.stage2Provider === 'string'
    ? diagnostics.stage2Provider
    : undefined
}

function classifyMiss(top1Hit: boolean, top1: string): MissType {
  if (top1Hit) return 'none'
  if (!top1) return 'empty'
  if (top1.startsWith('synthetic/')) return 'synthetic-distractor'
  return 'real-near-miss'
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const idx = cursor++
        if (idx >= items.length) return
        results[idx] = await worker(items[idx]!)
      }
    },
  )
  await Promise.all(lanes)
  return results
}

async function runOne(
  provider: VaultRetrievalProvider,
  pipeline: Pipeline,
  q: QueryEntry,
  manifest: VaultManifestEntry[],
  runIdx: number,
  runId: string,
  runMode: RunMode,
  finalTopK: number,
  candidateTopK: number,
): Promise<DenseRarResult> {
  const base: Omit<
    DenseRarResult,
    'top1' | 'top5' | 'top1Hit' | 'top5Hit' | 'latencyMs' | 'resultStatus'
  > = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    runMode,
    pipeline,
    queryId: q.id,
    category: q.category,
    difficulty: q.difficulty,
    trap: q.trap,
    runIdx,
    query: q.q,
    ideal: q.ideal,
    manifestSize: manifest.length,
  }
  try {
    const requestTopK = isDirectStage1Pipeline(pipeline)
      ? Math.max(finalTopK, candidateTopK)
      : finalTopK
    const r = await vaultRetrieve(
      { query: q.q, manifest, topK: requestTopK },
      { providers: [provider] },
    )
    const diagnostics = r.diagnostics
    const candidatePaths = getStage1RankedPaths(pipeline, r.rankedPaths, diagnostics)
    const candidateIdealIdx = candidatePaths.indexOf(q.ideal)
    const top5 = r.rankedPaths.slice(0, finalTopK)
    const top1 = top5[0] ?? ''
    const stage2Skipped = pipelineUsesAdaptive(pipeline)
      ? diagnostics?.stage2Skipped === true
      : undefined
    return {
      ...base,
      top1,
      top5,
      top1Hit: top1 === q.ideal,
      top5Hit: top5.includes(q.ideal),
      latencyMs: r.latencyMs,
      candidatePoolSize: candidatePaths.length,
      candidateIdealRank: candidateIdealIdx >= 0 ? candidateIdealIdx + 1 : undefined,
      candidateIdealHit: candidateIdealIdx >= 0,
      stage1Provider: typeof diagnostics?.stage1Provider === 'string'
        ? diagnostics.stage1Provider
        : r.provider,
      stage2Provider: getStage2Provider(diagnostics),
      stage2Ran: getStage2Ran(pipeline, diagnostics),
      missType: classifyMiss(top1 === q.ideal, top1),
      resultStatus: 'ok',
      stage2Skipped,
      diagnostics,
    }
  } catch (err) {
    return {
      ...base,
      top1: '',
      top5: [],
      top1Hit: false,
      top5Hit: false,
      latencyMs: 0,
      candidatePoolSize: 0,
      candidateIdealHit: false,
      stage1Provider: provider.name,
      stage2Ran: false,
      missType: 'error',
      resultStatus: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function main() {
  const argMap = new Map<string, string>()
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.split('=')
    if (key?.startsWith('--')) argMap.set(key.slice(2), value ?? 'true')
  }

  const concurrency = parseInt(argMap.get('concurrency') ?? '3', 10)
  const junkCount = parseInt(argMap.get('junk') ?? '182', 10)
  const junkMode = (argMap.get('junk-mode') ?? process.env.DENSE_RAR_JUNK_MODE ?? 'generic') as JunkMode
  const stage1TopK = parseInt(argMap.get('stage1') ?? '20', 10)
  const finalTopK = parseInt(
    argMap.get('final-top-k') ??
      process.env.DENSE_RAR_FINAL_TOP_K ??
      '5',
    10,
  )
  const rrfK = parseInt(
    argMap.get('rrf-k') ??
      process.env.DENSE_RAR_RRF_K ??
      '10',
    10,
  )
  const rrfPool = parseInt(
    argMap.get('rrf-pool') ??
      process.env.DENSE_RAR_RRF_POOL ??
      String(stage1TopK),
    10,
  )
  const rawRrfChildTimeout =
    argMap.get('rrf-child-timeout-ms') ??
    process.env.DENSE_RAR_RRF_CHILD_TIMEOUT_MS ??
    '600000'
  const rrfChildTimeoutMs = /^(inf|infinity|0)$/i.test(rawRrfChildTimeout)
    ? Number.POSITIVE_INFINITY
    : parseInt(rawRrfChildTimeout, 10)
  const runs = parseInt(argMap.get('runs') ?? '1', 10)
  const queriesFile = argMap.get('queries-file')
  const withBody = argMap.get('with-body') === 'true'
  const pipelines = parsePipelines(argMap.get('pipelines'))
  const gapRatio = parseFloat(argMap.get('gap-ratio') ?? '1.5')
  const bgeTimeoutMs = parseInt(
    argMap.get('embedding-timeout-ms') ??
      process.env.DENSE_RAR_EMBEDDING_TIMEOUT_MS ??
      '60000',
    10,
  )
  const bgeCorpusBatchSize = parseInt(
    argMap.get('corpus-batch-size') ??
      process.env.DENSE_RAR_CORPUS_BATCH_SIZE ??
      '50',
    10,
  )
  const limitN = parseInt(argMap.get('limit') ?? '0', 10)
  const progressEvery = Math.max(1, parseInt(argMap.get('progress-every') ?? '10', 10))
  const runMode = (argMap.get('mode') ?? process.env.DENSE_RAR_MODE ?? 'probe') as RunMode
  if (!['probe', 'formal'].includes(runMode)) {
    throw new Error(`Invalid --mode=${runMode}. Valid: probe, formal`)
  }
  if (!['generic', 'adversarial', 'mixed'].includes(junkMode)) {
    throw new Error(`Invalid --junk-mode=${junkMode}. Valid: generic, adversarial, mixed`)
  }
  if (!Number.isFinite(bgeTimeoutMs) || bgeTimeoutMs <= 0) {
    throw new Error(`Invalid --embedding-timeout-ms=${bgeTimeoutMs}`)
  }
  if (!Number.isFinite(bgeCorpusBatchSize) || bgeCorpusBatchSize <= 0) {
    throw new Error(`Invalid --corpus-batch-size=${bgeCorpusBatchSize}`)
  }
  if (!Number.isFinite(finalTopK) || finalTopK <= 0) {
    throw new Error(`Invalid --final-top-k=${finalTopK}`)
  }
  if (!Number.isFinite(stage1TopK) || stage1TopK <= 0) {
    throw new Error(`Invalid --stage1=${stage1TopK}`)
  }
  if (!Number.isFinite(rrfK) || rrfK <= 0) {
    throw new Error(`Invalid --rrf-k=${rrfK}`)
  }
  if (!Number.isFinite(rrfPool) || rrfPool <= 0) {
    throw new Error(`Invalid --rrf-pool=${rrfPool}`)
  }
  if (!Number.isFinite(rrfChildTimeoutMs) && rrfChildTimeoutMs !== Number.POSITIVE_INFINITY) {
    throw new Error(`Invalid --rrf-child-timeout-ms=${rawRrfChildTimeout}`)
  }
  const allowLive = parseBool(argMap.get('allow-live') ?? process.env.DENSE_RAR_ALLOW_LIVE)
  const vaultRoot = argMap.get('vault-root') ?? `${process.cwd()}/_vault`
  const judgeModel = argMap.get('judge-model') ?? ATOMIC_MODELS.MINIMAX_M27
  const judgeBaseURL = argMap.get('judge-base-url') ?? 'https://api.minimax.io/v1'
  const judgeApiKeyEnv = argMap.get('judge-api-key-env') ?? 'MINIMAX_API_KEY'
  const judgeThinking = (
    argMap.get('judge-thinking') ??
    process.env.DENSE_RAR_JUDGE_THINKING ??
    'default'
  ) as JudgeThinking
  const bgeBaseURL = argMap.get('bge-base-url') ?? BGE_EMBEDDING_DEFAULT_BASE_URL
  const bgeModel =
    argMap.get('embedding-model') ??
    process.env.DENSE_RAR_BGE_MODEL ??
    'bge-m3'
  const stage1Label =
    argMap.get('stage1-label') ??
    process.env.DENSE_RAR_STAGE1_LABEL ??
    'BGE-M3 dense'

  if (!['default', 'disabled', 'enabled'].includes(judgeThinking)) {
    throw new Error(`Invalid --judge-thinking=${judgeThinking}. Valid: default, disabled, enabled`)
  }
  assertLiveAllowed({ bgeBaseURL, judgeBaseURL, pipelines, allowLive })

  if (
    pipelines.some(pipelineUsesJudge) &&
    !(process.env[judgeApiKeyEnv]?.trim())
  ) {
    throw new Error(
      `Judge API key missing: env ${judgeApiKeyEnv} is required for pipelines ${pipelines.join(', ')}`,
    )
  }

  const queriesText = queriesFile
    ? readFileSync(queriesFile, 'utf-8')
    : JSON.stringify(defaultQueriesJson)
  const queriesObj = queriesFile ? JSON.parse(queriesText) : defaultQueriesJson
  const querySuite = (queriesObj._meta ?? {}) as QuerySuiteMetadata
  const allQueries = queriesObj.queries as QueryEntry[]
  const queries = limitN > 0 ? allQueries.slice(0, limitN) : allQueries

  const real = await buildVaultManifest({ vaultRoot, withBody })
  const junk = generateJunk(junkCount, junkMode)
  const manifest = [...real, ...junk]

  const judgeClient = createLocalGemmaClient({
    baseURL: judgeBaseURL,
    model: judgeModel,
    apiKey: process.env[judgeApiKeyEnv],
    extraBody: judgeThinking === 'default'
      ? undefined
      : { thinking: { type: judgeThinking } },
    // MiniMax judge responses can spike above 30s under load; keep the
    // benchmark path patient so we measure retrieval quality instead of
    // shedding valid runs at the transport boundary.
    timeoutMs: 60000,
  })
  const denseStage1 = createBgeEmbeddingProvider({
    client: createBgeEmbeddingClient({
      baseURL: bgeBaseURL,
      model: bgeModel,
      timeoutMs: bgeTimeoutMs,
    }),
    providerName: `dense:${stage1Label}`,
    withBody,
    corpusBatchSize: bgeCorpusBatchSize,
  })
  const judge = createAtomicProvider(judgeClient, {
    providerName: `judge:${judgeModel}`,
  })
  const bm25Stage1 = createBM25Provider({ providerName: 'bm25' })
  const rrfStage1 = createRRFFusionProvider({
    providers: [bm25Stage1, denseStage1],
    k: rrfK,
    stagePoolTopK: rrfPool,
    perChildTimeoutMs: rrfChildTimeoutMs,
    providerName: `rrf:bm25+dense:${stage1Label}`,
  })

  const providerByPipeline: Record<Pipeline, VaultRetrievalProvider> = {
    dense: denseStage1,
    bm25: bm25Stage1,
    rrf: rrfStage1,
    'dense-rar': createHybridProvider({
      stage1: denseStage1,
      stage2: judge,
      stage1TopK,
      providerName: `dense-rar:${judgeModel}`,
    }),
    'dense-adaptive': createAdaptiveHybridProvider({
      stage1: denseStage1,
      stage2: judge,
      stage1TopK,
      gapRatioThreshold: gapRatio,
      providerName: `dense-adaptive:${judgeModel}`,
    }),
    'rrf-rar': createHybridProvider({
      stage1: rrfStage1,
      stage2: judge,
      stage1TopK,
      providerName: `rrf-rar:${judgeModel}`,
    }),
    'rrf-adaptive': createAdaptiveHybridProvider({
      stage1: rrfStage1,
      stage2: judge,
      stage1TopK,
      gapRatioThreshold: gapRatio,
      providerName: `rrf-adaptive:${judgeModel}`,
    }),
  }

  const work: Array<{
    provider: VaultRetrievalProvider
    pipeline: Pipeline
    q: QueryEntry
    runIdx: number
  }> = []

  for (let runIdx = 0; runIdx < runs; runIdx++) {
    for (const q of queries) {
      for (const pipeline of pipelines) {
        work.push({
          provider: providerByPipeline[pipeline],
          pipeline,
          q,
          runIdx,
        })
      }
    }
  }

  console.log(
    `[dense-rar] queries: ${queries.length}${limitN > 0 ? ` (limit=${limitN} of ${allQueries.length})` : ''}`,
  )
  console.log(
    `[dense-rar] manifest: ${real.length} real + ${junk.length} ${junkMode} junk = ${manifest.length} total`,
  )
  console.log(`[dense-rar] vault: ${vaultRoot}`)
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
  const runId = `dense-rar-${stamp}`
  const metadata = buildRunMetadata({
    runId,
    runMode,
    liveAllowed: allowLive,
    vaultRoot,
    queriesFile: queriesFile ?? 'embedded:benchmarks/wave3-judge-queries.json',
    querySuite,
    queriesText,
    manifest,
    realCount: real.length,
    junkCount: junk.length,
    junkMode,
    withBody,
    finalTopK,
    stage1TopK,
    rrfK,
    rrfPool,
    rrfChildTimeoutMs: Number.isFinite(rrfChildTimeoutMs)
      ? rrfChildTimeoutMs
      : 'infinity',
    bgeBaseURL,
    bgeModel,
    stage1Label,
    bgeTimeoutMs,
    bgeCorpusBatchSize,
    judgeModel,
    judgeBaseURL,
    judgeApiKeyEnv,
    judgeThinking,
  })

  console.log(`[dense-rar] run: ${runId} (${runMode}, live=${allowLive ? 'explicit' : 'blocked'})`)
  console.log(`[dense-rar] stage1: ${stage1Label} @ ${publicProviderLabel(bgeBaseURL)} (model=${bgeModel})`)
  console.log(
    `[dense-rar] query suite: ${metadata.inputs.querySuite.name} ` +
      `(${metadata.inputs.querySuite.version}, ${metadata.inputs.querySuite.difficulty})`,
  )
  console.log(
    `[dense-rar] embedding: timeout=${bgeTimeoutMs}ms, corpusBatchSize=${bgeCorpusBatchSize}`,
  )
  if (pipelines.some(pipelineUsesRRF)) {
    console.log(
      `[dense-rar] rrf: k=${rrfK}, pool=${rrfPool}, childTimeout=${
        Number.isFinite(rrfChildTimeoutMs) ? `${rrfChildTimeoutMs}ms` : 'infinity'
      }`,
    )
  }
  console.log(
    `[dense-rar] judge: ${judgeModel} @ ${judgeBaseURL} (env=${judgeApiKeyEnv}, thinking=${judgeThinking})`,
  )
  console.log(
    `[dense-rar] pipelines: ${pipelines.join(', ')}${pipelines.some(pipelineUsesAdaptive) ? ` (gap-ratio=${gapRatio})` : ''}`,
  )
  console.log(
    `[dense-rar] runs: ${runs}, total calls: ${work.length}, concurrency: ${concurrency}, stage1TopK: ${stage1TopK}, finalTopK: ${finalTopK}`,
  )
  console.log(`[dense-rar] progress-every: ${progressEvery}`)

  const t0 = Date.now()
  let done = 0
  const results = await runWithConcurrency(work, concurrency, async (u) => {
    const r = await runOne(
      u.provider,
      u.pipeline,
      u.q,
      manifest,
      u.runIdx,
      runId,
      runMode,
      finalTopK,
      stage1TopK,
    )
    done++
    if (done % progressEvery === 0 || done === work.length) {
      console.log(
        `  [${done}/${work.length}] ${((Date.now() - t0) / 1000).toFixed(1)}s ${summarizeProgress(r)}`,
      )
    }
    return r
  })

  const outDir = path.join(process.cwd(), 'benchmarks', 'runs')
  mkdirSync(outDir, { recursive: true })
  const jsonlPath = path.join(outDir, `wave3i-dense-rar-${stamp}.jsonl`)
  const mdPath = path.join(outDir, `wave3i-dense-rar-${stamp}.md`)
  const metaPath = path.join(outDir, `wave3i-dense-rar-${stamp}.meta.json`)
  writeFileSync(jsonlPath, results.map((r) => JSON.stringify(r)).join('\n') + '\n')
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n')

  const lines: string[] = []
  lines.push('# Wave 3+I Dense-first RAR Benchmark')
  lines.push('')
  lines.push(`- Schema: **${SCHEMA_VERSION}**`)
  lines.push(`- Run ID: **${runId}**`)
  lines.push(`- Mode: **${runMode}**${allowLive ? ' (live providers explicitly allowed)' : ''}`)
  lines.push(`- Git: **${metadata.git.commit}**${metadata.git.dirty ? ` (dirty: ${metadata.git.dirtyFiles.length} paths)` : ' (clean)'}`)
  lines.push(`- Vault root: **${vaultRoot}**`)
  lines.push(`- Manifest: **${manifest.length} entries** (${real.length} real + ${junk.length} ${junkMode} junk)`)
  lines.push(`- Manifest hash: **${metadata.inputs.manifestHash.slice(0, 16)}**`)
  lines.push(`- Queries hash: **${metadata.inputs.queriesHash.slice(0, 16)}**`)
  lines.push(`- Query suite: **${metadata.inputs.querySuite.name}** (${metadata.inputs.querySuite.version}, ${metadata.inputs.querySuite.difficulty})`)
  if (metadata.inputs.querySuite.categories.length > 0) {
    lines.push(`- Query categories: ${metadata.inputs.querySuite.categories.join(', ')}`)
  }
  lines.push(`- Queries: **${queries.length}**`)
  lines.push(`- Runs per (pipeline × query): **${runs}**`)
  lines.push(`- Stage 1: **${stage1Label}** via ${publicProviderLabel(bgeBaseURL)} (model: **${bgeModel}**)`)
  lines.push(`- Embedding timeout: **${bgeTimeoutMs}ms**`)
  lines.push(`- Corpus batch size: **${bgeCorpusBatchSize}**`)
  lines.push(`- Stage-1 candidate pool: **${stage1TopK}**`)
  lines.push(`- Final top-K: **${finalTopK}**`)
  if (pipelines.some(pipelineUsesRRF)) {
    lines.push(`- RRF: **k=${rrfK}**, child pool **${rrfPool}**, child timeout **${
      Number.isFinite(rrfChildTimeoutMs) ? `${rrfChildTimeoutMs}ms` : 'infinity'
    }**`)
  }
  lines.push(`- Stage 2 judge: **${judgeModel}** via ${judgeBaseURL} (thinking: ${judgeThinking})`)
  lines.push(`- Pipelines: ${pipelines.join(', ')}`)
  lines.push(`- Total calls: **${work.length}**`)
  lines.push('')
  lines.push('## Aggregated (all runs flattened)')
  lines.push('')
  lines.push('| Pipeline | Status | Valid | Errors | Top-1 | Top-5 | p50 latency | p90 latency | Avg latency | Judge exposure |')
  lines.push('|----------|--------|-------|--------|-------|-------|-------------|-------------|-------------|----------------|')

  for (const pipeline of pipelines) {
    const s = summarizePipeline(results, pipeline, stage1TopK, manifest.length)

    lines.push(
      `| ${pipeline} | ${s.resultStatus} | ${s.valid}/${s.total} | ${s.errors} | ` +
      `${s.top1}/${s.valid} (${s.valid > 0 ? ((s.top1 / s.valid) * 100).toFixed(1) : '0.0'}%) | ` +
      `${s.top5}/${s.valid} (${s.valid > 0 ? ((s.top5 / s.valid) * 100).toFixed(1) : '0.0'}%) | ` +
      `${s.p50}ms | ${s.p90}ms | ${s.avg}ms | ${s.judgeExposure} |`,
    )
  }
  lines.push('')

  lines.push('## Candidate Recall by Category')
  lines.push('')
  lines.push('| Pipeline | Category | Valid | Top-1 | Top-5 | Candidate hit | Candidate miss | Synthetic miss | Real miss | Empty miss |')
  lines.push('|----------|----------|-------|-------|-------|---------------|----------------|----------------|-----------|------------|')
  for (const pipeline of pipelines) {
    for (const s of summarizeByCategory(results, pipeline)) {
      lines.push(
        `| ${pipeline} | ${s.category} | ${s.valid}/${s.total} | ` +
        `${s.top1}/${s.valid} | ${s.top5}/${s.valid} | ` +
        `${s.candidateHits}/${s.valid} | ${s.candidateMisses}/${s.valid} | ` +
        `${s.syntheticMisses} | ${s.realMisses} | ${s.emptyMisses} |`,
      )
    }
  }
  lines.push('')

  const totalErrors = results.filter((r) => r.error).length
  const formalEligible = runMode === 'formal' && allowLive && totalErrors === 0 && !metadata.git.dirty
  lines.push('## Trust Status')
  lines.push('')
  lines.push(`- Result status: **${totalErrors === 0 ? 'valid-execution' : 'invalid-infra'}**`)
  lines.push(`- Formal eligible: **${formalEligible ? 'yes' : 'no'}**`)
  if (!formalEligible) {
    const reasons = [
      runMode !== 'formal' ? 'mode is probe' : null,
      !allowLive ? 'live providers not explicitly allowed' : null,
      totalErrors > 0 ? `${totalErrors} provider/run errors` : null,
      metadata.git.dirty ? `dirty git state (${metadata.git.dirtyFiles.length} paths)` : null,
    ].filter(Boolean)
    lines.push(`- Formal blockers: ${reasons.join('; ')}`)
  }
  lines.push('')

  const adaptivePipelines = pipelines.filter(pipelineUsesAdaptive)
  if (adaptivePipelines.length > 0) {
    lines.push('## Adaptive gating stats')
    lines.push('')
    for (const pipeline of adaptivePipelines) {
      const rs = results.filter((r) => r.pipeline === pipeline && !r.error)
      const skipped = rs.filter((r) => r.stage2Skipped)
      const invoked = rs.filter((r) => !r.stage2Skipped)
      const skipTop1 = skipped.filter((r) => r.top1Hit).length
      const invTop1 = invoked.filter((r) => r.top1Hit).length
      lines.push(`### ${pipeline}`)
      lines.push('')
      lines.push(
        `- Skip rate: **${skipped.length}/${rs.length} (${((skipped.length / Math.max(1, rs.length)) * 100).toFixed(1)}%)**`,
      )
      lines.push(
        `- Top-1 on skipped queries: **${skipTop1}/${skipped.length} (${skipped.length > 0 ? ((skipTop1 / skipped.length) * 100).toFixed(1) : '0'}%)**`,
      )
      lines.push(
        `- Top-1 on invoked queries: **${invTop1}/${invoked.length} (${invoked.length > 0 ? ((invTop1 / invoked.length) * 100).toFixed(1) : '0'}%)**`,
      )
      lines.push(`- Gate threshold: stage1_score[0] / stage1_score[1] ≥ ${gapRatio}`)
      lines.push('')
    }
  }

  if (runs > 1) {
    lines.push('## Per-run top-1 accuracy')
    lines.push('')
    const header = ['Pipeline', ...Array.from({ length: runs }, (_, i) => `run ${i}`), 'mean', 'stddev']
    lines.push(`| ${header.join(' | ')} |`)
    lines.push(`| ${header.map(() => '---').join(' | ')} |`)
    for (const pipeline of pipelines) {
      const perRun: number[] = []
      for (let runIdx = 0; runIdx < runs; runIdx++) {
        const rs = results.filter(
          (r) => r.pipeline === pipeline && r.runIdx === runIdx && !r.error,
        )
        const total = results.filter(
          (r) => r.pipeline === pipeline && r.runIdx === runIdx,
        ).length
        const top1 = rs.filter((r) => r.top1Hit).length
        perRun.push(total > 0 ? top1 / total : 0)
      }
      const mean = perRun.reduce((sum, x) => sum + x, 0) / perRun.length
      const variance = perRun.reduce((sum, x) => sum + (x - mean) ** 2, 0) / perRun.length
      const stddev = Math.sqrt(variance)
      const row = [
        pipeline,
        ...perRun.map((x) => `${(x * 100).toFixed(1)}%`),
        `${(mean * 100).toFixed(2)}%`,
        `${(stddev * 100).toFixed(2)} pp`,
      ]
      lines.push(`| ${row.join(' | ')} |`)
    }
    lines.push('')
  }

  const md = lines.join('\n')
  writeFileSync(mdPath, `${md}\n`)
  console.log(`\n${md}\n`)
  console.log(`[dense-rar] raw:     ${jsonlPath}`)
  console.log(`[dense-rar] meta:    ${metaPath}`)
  console.log(`[dense-rar] summary: ${mdPath}`)
  console.log(`[dense-rar] wall:    ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
