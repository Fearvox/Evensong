import { describe, test, expect } from 'bun:test'
import { createLocalGemmaProvider } from '../localGemmaProvider.js'
import { createLocalGemmaClient } from '../../../api/localGemma.js'

describe('createLocalGemmaProvider', () => {
  test('returns VaultRetrievalProvider shape', () => {
    const p = createLocalGemmaProvider(createLocalGemmaClient())
    expect(p.name).toBe('local-gemma')
  })
  test('parses JSON array from LLM output as rankedPaths', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0]) => {
      if (url.toString().endsWith('/models')) return new Response('{"data":[]}', { status: 200 })
      return new Response(JSON.stringify({
        choices: [{ message: { content: '["a.md","b.md"]' } }]
      }), { status: 200 })
    }) as typeof fetch
    try {
      const p = createLocalGemmaProvider(createLocalGemmaClient())
      const r = await p.retrieve({
        query: 'q',
        manifest: [{ path: 'a.md', title: 'A', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' }],
      })
      expect(r.rankedPaths).toEqual(['a.md', 'b.md'])
    } finally { globalThis.fetch = saved }
  })
  test('heuristic parse extracts .md paths from prose output', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0]) => {
      if (url.toString().endsWith('/models')) return new Response('{"data":[]}', { status: 200 })
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Most relevant: a.md and b.md.' } }]
      }), { status: 200 })
    }) as typeof fetch
    try {
      const p = createLocalGemmaProvider(createLocalGemmaClient())
      const r = await p.retrieve({
        query: 'q',
        manifest: [
          { path: 'a.md', title: 'A', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
          { path: 'b.md', title: 'B', retentionScore: 0.8, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
        ],
      })
      expect(r.rankedPaths).toContain('a.md')
      expect(r.rankedPaths).toContain('b.md')
    } finally { globalThis.fetch = saved }
  })
})
