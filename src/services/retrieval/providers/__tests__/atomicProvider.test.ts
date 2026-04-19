import { describe, test, expect } from 'bun:test'
import { createAtomicProvider } from '../atomicProvider.js'
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
    } finally {
      globalThis.fetch = saved
    }
  })

  test('defaults providerName to client model id when options omitted', () => {
    const p = createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.MINIMAX_M27 }))
    expect(p.name).toBe(`atomic:${ATOMIC_MODELS.MINIMAX_M27}`)
  })
})
