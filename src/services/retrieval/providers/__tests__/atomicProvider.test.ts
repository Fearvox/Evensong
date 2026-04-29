import { describe, test, expect } from 'bun:test'
import { createAtomicProvider, parseJudgeOutputDetailed } from '../atomicProvider.js'
import { createLocalGemmaClient, ATOMIC_MODELS } from '../../../api/localGemma.js'

describe('createAtomicProvider', () => {
  test('uses provided provider name (not hardcoded)', () => {
    const p = createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.GROK_3 }), {
      providerName: 'atomic-grok-3',
    })
    expect(p.name).toBe('atomic-grok-3')
  })

  test('routes retrieve call through client-model + returns that provider name', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0]) => {
      if (url.toString().endsWith('/models')) return new Response('{"data":[]}', { status: 200 })
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '["a.md"]' } }] }),
        { status: 200 },
      )
    }) as typeof fetch
    try {
      const p = createAtomicProvider(
        createLocalGemmaClient({ model: ATOMIC_MODELS.GROK_3 }),
        { providerName: 'atomic-grok-3' },
      )
      const r = await p.retrieve({
        query: 'q',
        manifest: [
          {
            path: 'a.md',
            title: 'A',
            retentionScore: 0.9,
            accessCount: 1,
            lastAccess: '2026-01-01',
            summaryLevel: 'deep',
          },
        ],
      })
      expect(r.provider).toBe('atomic-grok-3')
      expect(r.rankedPaths).toEqual(['a.md'])
      expect(r.diagnostics?.judgeParseMode).toBe('json')
      expect(r.diagnostics?.rawJudgeResponse).toBe('["a.md"]')
    } finally {
      globalThis.fetch = saved
    }
  })

  test('defaults providerName to client model id when options omitted', () => {
    const p = createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.MINIMAX_M27 }))
    expect(p.name).toBe(`atomic:${ATOMIC_MODELS.MINIMAX_M27}`)
  })

  test('drops hallucinated paths from JSON-array output (not in manifest)', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0]) => {
      if (url.toString().endsWith('/models')) return new Response('{"data":[]}', { status: 200 })
      // LLM returns 3 paths but only "real.md" is in the manifest
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '["real.md","hallucinated.md","also-fake.md"]' } }],
        }),
        { status: 200 },
      )
    }) as typeof fetch
    try {
      const p = createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.GROK_3 }))
      const r = await p.retrieve({
        query: 'q',
        manifest: [
          {
            path: 'real.md',
            title: 'R',
            retentionScore: 0.9,
            accessCount: 1,
            lastAccess: '2026-01-01',
            summaryLevel: 'deep',
          },
        ],
      })
      expect(r.rankedPaths).toEqual(['real.md'])
      expect(r.diagnostics?.judgeDiscardedPaths).toEqual(['hallucinated.md', 'also-fake.md'])
    } finally {
      globalThis.fetch = saved
    }
  })

  test('dedupes JSON-array output and honors topK', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0]) => {
      if (url.toString().endsWith('/models')) return new Response('{"data":[]}', { status: 200 })
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '["a.md","a.md","b.md","c.md"]' } }],
        }),
        { status: 200 },
      )
    }) as typeof fetch
    try {
      const p = createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.GROK_3 }))
      const r = await p.retrieve({
        query: 'q',
        topK: 2,
        manifest: [
          { path: 'a.md', title: 'A', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
          { path: 'b.md', title: 'B', retentionScore: 0.8, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
          { path: 'c.md', title: 'C', retentionScore: 0.7, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
        ],
      })
      expect(r.rankedPaths).toEqual(['a.md', 'b.md'])
    } finally {
      globalThis.fetch = saved
    }
  })

  test('reports regex fallback mode for prose output', () => {
    const parsed = parseJudgeOutputDetailed(
      'I would choose a.md first, then maybe b.md.',
      [
        {
          path: 'a.md',
          title: 'A',
          retentionScore: 0.9,
          accessCount: 1,
          lastAccess: '2026-01-01',
          summaryLevel: 'deep',
        },
        {
          path: 'b.md',
          title: 'B',
          retentionScore: 0.8,
          accessCount: 1,
          lastAccess: '2026-01-01',
          summaryLevel: 'deep',
        },
      ],
    )
    expect(parsed.parseMode).toBe('regex')
    expect(parsed.rankedPaths).toEqual(['a.md', 'b.md'])
    expect(parsed.rawResponse).toContain('choose a.md')
  })

  test('honors topK in regex fallback mode', () => {
    const parsed = parseJudgeOutputDetailed(
      'I would choose a.md first, then b.md, then c.md.',
      [
        { path: 'a.md', title: 'A', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
        { path: 'b.md', title: 'B', retentionScore: 0.8, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
        { path: 'c.md', title: 'C', retentionScore: 0.7, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
      ],
      2,
    )
    expect(parsed.parseMode).toBe('regex')
    expect(parsed.rankedPaths).toEqual(['a.md', 'b.md'])
  })

  test('returns no paths when maxPaths is zero', () => {
    const parsed = parseJudgeOutputDetailed(
      '["a.md"]',
      [{ path: 'a.md', title: 'A', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' }],
      0,
    )
    expect(parsed.rankedPaths).toEqual([])
  })

  test('marks provider healthy after a successful retrieve', async () => {
    const saved = globalThis.fetch
    let modelCalls = 0
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0]) => {
      if (url.toString().endsWith('/models')) {
        modelCalls++
        return new Response('{"data":[]}', { status: 200 })
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '["a.md"]' } }] }),
        { status: 200 },
      )
    }) as typeof fetch
    try {
      const p = createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.MINIMAX_M27 }))
      await p.retrieve({
        query: 'q',
        manifest: [
          {
            path: 'a.md',
            title: 'A',
            retentionScore: 0.9,
            accessCount: 1,
            lastAccess: '2026-01-01',
            summaryLevel: 'deep',
          },
        ],
      })
      expect(await p.available()).toBe(true)
      expect(modelCalls).toBe(0)
    } finally {
      globalThis.fetch = saved
    }
  })

  test('dedupes concurrent availability probes', async () => {
    const saved = globalThis.fetch
    let modelCalls = 0
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0]) => {
      if (url.toString().endsWith('/models')) {
        modelCalls++
        await new Promise((resolve) => setTimeout(resolve, 20))
        return new Response('{"data":[]}', { status: 200 })
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '["a.md"]' } }] }),
        { status: 200 },
      )
    }) as typeof fetch
    try {
      const p = createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.MINIMAX_M27 }))
      const [a, b] = await Promise.all([p.available(), p.available()])
      expect(a).toBe(true)
      expect(b).toBe(true)
      expect(modelCalls).toBe(1)
    } finally {
      globalThis.fetch = saved
    }
  })
})
