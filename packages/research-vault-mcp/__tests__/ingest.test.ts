import { afterEach, describe, test, expect } from 'bun:test'
import { parseArxivId } from '../src/ingest/arxiv.ts'
import { fetchHtml } from '../src/ingest/html.ts'

describe('parseArxivId', () => {
  test('parses full URL with abs path', () => {
    expect(parseArxivId('https://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('parses abs/ URL shorthand', () => {
    expect(parseArxivId('abs/2501.00001')).toBe('2501.00001')
  })
  test('parses bare ID', () => {
    expect(parseArxivId('2501.00001')).toBe('2501.00001')
  })
  test('parses arxiv.org/abs/ URL without https', () => {
    expect(parseArxivId('http://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('returns null for non-arxiv URL', () => {
    expect(parseArxivId('https://example.com/paper')).toBeNull()
  })
  test('handles versioned IDs like 2501.00001v2', () => {
    expect(parseArxivId('2501.00001v2')).toBe('2501.00001v2')
  })
})

describe('fetchHtml SSRF redirect protection (regression)', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('blocks redirect from public URL to private IP', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input.toString()
      if (u.startsWith('http://example.com/')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'http://10.0.0.1/internal' },
        })
      }
      return new Response('should not be reached', { status: 200 })
    }) as typeof fetch

    await expect(fetchHtml('http://example.com/start')).rejects.toThrow(/private/i)
  })

  test('blocks redirect chain ending in private IP', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input.toString()
      if (u === 'http://example.com/start') {
        return new Response(null, { status: 302, headers: { Location: 'http://example.org/middle' } })
      }
      if (u === 'http://example.org/middle') {
        return new Response(null, { status: 302, headers: { Location: 'http://192.168.1.1/lan' } })
      }
      return new Response('should not be reached')
    }) as typeof fetch

    await expect(fetchHtml('http://example.com/start')).rejects.toThrow(/private/i)
  })

  test('allows public-to-public redirect (followed and content returned)', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input.toString()
      if (u === 'http://example.com/start') {
        return new Response(null, { status: 302, headers: { Location: 'http://example.org/final' } })
      }
      if (u === 'http://example.org/final') {
        return new Response('<html><body>final content</body></html>', { status: 200 })
      }
      return new Response('unexpected', { status: 500 })
    }) as typeof fetch

    const result = await fetchHtml('http://example.com/start')
    expect(result).toContain('final content')
  })

  test('blocks excessive redirect chain (>5 hops)', async () => {
    let hop = 0
    globalThis.fetch = (async () => {
      hop++
      return new Response(null, {
        status: 302,
        headers: { Location: `http://example${hop + 1}.com/loop` },
      })
    }) as typeof fetch

    await expect(fetchHtml('http://example1.com/loop')).rejects.toThrow(/too many redirects/i)
  }, 5000)

  test('handles relative redirect URL (resolved against current URL)', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input.toString()
      if (u === 'http://example.com/start') {
        return new Response(null, { status: 302, headers: { Location: '/relative-path' } })
      }
      if (u === 'http://example.com/relative-path') {
        return new Response('<html>relative target reached</html>', { status: 200 })
      }
      return new Response('unexpected', { status: 500 })
    }) as typeof fetch

    const result = await fetchHtml('http://example.com/start')
    expect(result).toContain('relative target reached')
  })
})
