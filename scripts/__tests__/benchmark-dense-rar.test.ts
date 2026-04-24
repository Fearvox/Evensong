import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  assertLiveAllowed,
  isLocalBaseUrl,
  parsePipelines,
  summarizeByCategory,
  summarizePipeline,
} from '../benchmark-dense-rar.js'
import defaultQueries from '../../benchmarks/wave3-judge-queries.json' with { type: 'json' }
import adversarialQueries from '../../benchmarks/wave3-adversarial-queries.json' with { type: 'json' }

describe('benchmark-dense-rar live boundary', () => {
  test('recognizes local endpoints', () => {
    expect(isLocalBaseUrl('http://127.0.0.1:8080/v1')).toBe(true)
    expect(isLocalBaseUrl('http://localhost:1337/v1')).toBe(true)
    expect(isLocalBaseUrl('http://100.65.234.77:8080/v1')).toBe(false)
  })

  test('requires explicit live opt-in for non-local providers', () => {
    expect(() => assertLiveAllowed({
      bgeBaseURL: 'http://100.65.234.77:8080/v1',
      judgeBaseURL: 'https://api.minimax.io/v1',
      pipelines: ['dense', 'dense-rar'],
      allowLive: false,
    })).toThrow(/non-local providers/)
  })

  test('allows non-local providers when explicitly opted in', () => {
    expect(() => assertLiveAllowed({
      bgeBaseURL: 'http://100.65.234.77:8080/v1',
      judgeBaseURL: 'https://api.minimax.io/v1',
      pipelines: ['dense', 'dense-rar'],
      allowLive: true,
    })).not.toThrow()
  })

  test('bm25-only pipeline does not require live opt-in', () => {
    expect(() => assertLiveAllowed({
      bgeBaseURL: 'http://100.65.234.77:8080/v1',
      judgeBaseURL: 'https://api.minimax.io/v1',
      pipelines: ['bm25'],
      allowLive: false,
    })).not.toThrow()
  })
})

describe('benchmark-dense-rar pipeline parsing', () => {
  test('accepts sparse, dense, fused, reranked, and adaptive pipelines', () => {
    expect(parsePipelines('dense,bm25,rrf,dense-rar,dense-adaptive,rrf-rar,rrf-adaptive')).toEqual([
      'dense',
      'bm25',
      'rrf',
      'dense-rar',
      'dense-adaptive',
      'rrf-rar',
      'rrf-adaptive',
    ])
  })

  test('rejects unknown-only pipeline lists', () => {
    expect(() => parsePipelines('bogus,other')).toThrow(/Valid: dense, bm25, rrf/)
  })
})

describe('benchmark-dense-rar summary contract', () => {
  test('reports error rows separately from valid retrieval quality', () => {
    const rows = [
      {
        schemaVersion: 'dense-rar-v3',
        runId: 'r1',
        runMode: 'probe',
        pipeline: 'dense',
        queryId: 1,
        category: 'test',
        runIdx: 0,
        query: 'q',
        ideal: 'a.md',
        top1: 'a.md',
        top5: ['a.md'],
        top1Hit: true,
        top5Hit: true,
        latencyMs: 10,
        manifestSize: 2,
        resultStatus: 'ok',
      },
      {
        schemaVersion: 'dense-rar-v3',
        runId: 'r1',
        runMode: 'probe',
        pipeline: 'dense',
        queryId: 2,
        category: 'test',
        runIdx: 0,
        query: 'q2',
        ideal: 'b.md',
        top1: '',
        top5: [],
        top1Hit: false,
        top5Hit: false,
        latencyMs: 0,
        manifestSize: 2,
        resultStatus: 'error',
        error: 'provider unavailable',
      },
    ] as Parameters<typeof summarizePipeline>[0]

    const summary = summarizePipeline(rows, 'dense', 5, 2)
    expect(summary.total).toBe(2)
    expect(summary.valid).toBe(1)
    expect(summary.errors).toBe(1)
    expect(summary.top1).toBe(1)
    expect(summary.resultStatus).toBe('invalid')
  })

  test('summarizes candidate recall and miss type by category', () => {
    const rows = [
      {
        schemaVersion: 'dense-rar-v3',
        runId: 'r1',
        runMode: 'probe',
        pipeline: 'rrf',
        queryId: 1,
        category: 'negative_exclusion',
        runIdx: 0,
        query: 'q',
        ideal: 'a.md',
        top1: 'synthetic/adversarial-junk-0001.md',
        top5: ['synthetic/adversarial-junk-0001.md'],
        top1Hit: false,
        top5Hit: false,
        latencyMs: 10,
        manifestSize: 2,
        candidatePoolSize: 20,
        candidateIdealHit: true,
        candidateIdealRank: 12,
        missType: 'synthetic-distractor',
        resultStatus: 'ok',
      },
      {
        schemaVersion: 'dense-rar-v3',
        runId: 'r1',
        runMode: 'probe',
        pipeline: 'rrf',
        queryId: 2,
        category: 'negative_exclusion',
        runIdx: 0,
        query: 'q2',
        ideal: 'b.md',
        top1: 'b.md',
        top5: ['b.md'],
        top1Hit: true,
        top5Hit: true,
        latencyMs: 20,
        manifestSize: 2,
        candidatePoolSize: 20,
        candidateIdealHit: true,
        candidateIdealRank: 1,
        missType: 'none',
        resultStatus: 'ok',
      },
    ] as Parameters<typeof summarizeByCategory>[0]

    const [summary] = summarizeByCategory(rows, 'rrf')
    expect(summary?.valid).toBe(2)
    expect(summary?.top1).toBe(1)
    expect(summary?.top5).toBe(1)
    expect(summary?.candidateHits).toBe(2)
    expect(summary?.syntheticMisses).toBe(1)
  })
})

describe('benchmark-dense-rar adversarial query suite', () => {
  test('has unique ids and broad hard categories', () => {
    const queries = adversarialQueries.queries
    const ids = new Set(queries.map((q) => q.id))
    const texts = new Set(queries.map((q) => q.q))
    const categories = new Set(queries.map((q) => q.category))

    expect(adversarialQueries._meta.name).toBe('wave3-adversarial-retrieval')
    expect(adversarialQueries._meta.difficulty).toBe('adversarial')
    expect(ids.size).toBe(queries.length)
    expect(texts.size).toBe(queries.length)
    expect(categories).toContain('near_neighbor_memory')
    expect(categories).toContain('lexical_trap')
    expect(categories).toContain('cross_lingual')
    expect(categories).toContain('negative_exclusion')
    expect(categories).toContain('methodology_philosophy')
    expect(categories).toContain('engineering_specific')
  })

  test('uses only known vault ideal paths and records trap metadata', () => {
    const knownIdeals = new Set(defaultQueries.queries.map((q) => q.ideal))

    for (const query of adversarialQueries.queries) {
      expect(knownIdeals.has(query.ideal)).toBe(true)
      expect(query.trap.length).toBeGreaterThan(10)
      expect(query.q).not.toContain(query.ideal)
    }
  })

  test('wrapper exposes stage1 label override for honest artifacts', () => {
    const wrapper = readFileSync('scripts/run-dense-rar-benchmark.sh', 'utf-8')

    expect(wrapper).toContain('DENSE_RAR_STAGE1_LABEL')
    expect(wrapper).toContain('--stage1-label="$DENSE_RAR_STAGE1_LABEL"')
    expect(wrapper).toContain('DENSE_RAR_JUNK_MODE')
    expect(wrapper).toContain('--junk-mode="$DENSE_RAR_JUNK_MODE"')
    expect(wrapper).toContain('DENSE_RAR_FINAL_TOP_K')
    expect(wrapper).toContain('--final-top-k="$DENSE_RAR_FINAL_TOP_K"')
    expect(wrapper).toContain('DENSE_RAR_RRF_K')
    expect(wrapper).toContain('--rrf-k="$DENSE_RAR_RRF_K"')
    expect(wrapper).toContain('DENSE_RAR_RRF_POOL')
    expect(wrapper).toContain('--rrf-pool="$DENSE_RAR_RRF_POOL"')
    expect(wrapper).toContain('DENSE_RAR_JUDGE_THINKING')
    expect(wrapper).toContain('--judge-thinking="$DENSE_RAR_JUDGE_THINKING"')
    expect(wrapper).toContain('DENSE_RAR_BGE_MODEL')
    expect(wrapper).toContain('--embedding-model="$DENSE_RAR_BGE_MODEL"')
  })
})
