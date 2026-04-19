import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import {
  createBgeEmbeddingClient,
  embedBge,
  isBgeEmbeddingAvailable,
  BgeEmbeddingConnectionError,
  BGE_EMBEDDING_DEFAULT_BASE_URL,
  BGE_EMBEDDING_DROPLET_BASE_URL,
  BGE_EMBEDDING_ATOMIC_BASE_URL,
  BGE_EMBEDDING_DEFAULT_MODEL,
  BGE_EMBEDDING_DEFAULT_DIMS,
} from '../bgeEmbedding.js'

// bun:test does not provide jest.spyOn style global mocks; we monkey-patch
// globalThis.fetch per-test. Save original and restore so other tests are
// unaffected.
const realFetch = globalThis.fetch

function installMockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = handler as typeof globalThis.fetch
}

function restoreFetch() {
  globalThis.fetch = realFetch
}

describe('createBgeEmbeddingClient', () => {
  test('defaults point at ccr-droplet (not atomic 1337 — atomic upstream bug blocks embed)', () => {
    const c = createBgeEmbeddingClient()
    expect(c.baseURL).toBe(BGE_EMBEDDING_DEFAULT_BASE_URL)
    expect(c.baseURL).toBe('http://100.65.234.77:8080/v1')
    expect(BGE_EMBEDDING_DEFAULT_BASE_URL).toBe(BGE_EMBEDDING_DROPLET_BASE_URL)
    expect(c.model).toBe(BGE_EMBEDDING_DEFAULT_MODEL)
    expect(c.model).toBe('bge-m3')
  })

  test('BGE_EMBEDDING_ATOMIC_BASE_URL exposed for the post-upstream-fix migration', () => {
    expect(BGE_EMBEDDING_ATOMIC_BASE_URL).toBe('http://127.0.0.1:1337/v1')
  })

  test('timeout defaults to 60s (covers cold corpus batch on CPU llama-server)', () => {
    expect(createBgeEmbeddingClient().timeoutMs).toBe(60000)
  })

  test('options override baseURL / model / timeout', () => {
    const c = createBgeEmbeddingClient({
      baseURL: 'http://100.65.234.77:8080/v1',
      model: 'bge-m3-Q4_K_M',
      timeoutMs: 5000,
    })
    expect(c.baseURL).toBe('http://100.65.234.77:8080/v1')
    expect(c.model).toBe('bge-m3-Q4_K_M')
    expect(c.timeoutMs).toBe(5000)
  })

  test('BGE_EMBEDDING_DEFAULT_DIMS matches BGE-M3 1024-dim contract', () => {
    expect(BGE_EMBEDDING_DEFAULT_DIMS).toBe(1024)
  })
})

describe('embedBge', () => {
  afterEach(restoreFetch)

  test('empty input returns empty array without HTTP call', async () => {
    let called = false
    installMockFetch(async () => {
      called = true
      return new Response('{}', { status: 200 })
    })
    const vectors = await embedBge(createBgeEmbeddingClient(), [])
    expect(vectors).toEqual([])
    expect(called).toBe(false)
  })

  test('posts to /embeddings with model + input[] and returns aligned vectors', async () => {
    let seenBody: any = null
    installMockFetch(async (input, init) => {
      expect(String(input)).toBe(`${BGE_EMBEDDING_DEFAULT_BASE_URL}/embeddings`)
      expect(init?.method).toBe('POST')
      seenBody = JSON.parse((init?.body as string) ?? '{}')
      return new Response(
        JSON.stringify({
          data: [
            { embedding: [0.1, 0.2, 0.3], index: 0 },
            { embedding: [0.4, 0.5, 0.6], index: 1 },
          ],
          model: 'bge-m3',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    const vectors = await embedBge(createBgeEmbeddingClient(), ['alpha', 'beta'])
    expect(seenBody.model).toBe('bge-m3')
    expect(seenBody.input).toEqual(['alpha', 'beta'])
    expect(vectors).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ])
  })

  test('defensively reorders response by index field', async () => {
    installMockFetch(async () =>
      new Response(
        JSON.stringify({
          data: [
            // Server returned reordered; we must sort back to input order.
            { embedding: [9, 9, 9], index: 1 },
            { embedding: [1, 1, 1], index: 0 },
          ],
        }),
        { status: 200 },
      ),
    )
    const vectors = await embedBge(createBgeEmbeddingClient(), ['a', 'b'])
    expect(vectors[0]).toEqual([1, 1, 1])
    expect(vectors[1]).toEqual([9, 9, 9])
  })

  test('throws BgeEmbeddingConnectionError on HTTP 404 (model not loaded)', async () => {
    installMockFetch(async () =>
      new Response('No running session found for model bge-m3', { status: 404 }),
    )
    await expect(embedBge(createBgeEmbeddingClient(), ['query'])).rejects.toThrow(
      BgeEmbeddingConnectionError,
    )
  })

  test('throws when data array length mismatches input length', async () => {
    installMockFetch(async () =>
      new Response(
        JSON.stringify({ data: [{ embedding: [1], index: 0 }] }),
        { status: 200 },
      ),
    )
    await expect(embedBge(createBgeEmbeddingClient(), ['a', 'b'])).rejects.toThrow(
      /returned 1 vectors for 2 inputs/,
    )
  })

  test('throws when an entry has no embedding vector', async () => {
    installMockFetch(async () =>
      new Response(
        JSON.stringify({ data: [{ index: 0 }] }),
        { status: 200 },
      ),
    )
    await expect(embedBge(createBgeEmbeddingClient(), ['a'])).rejects.toThrow(
      /has no embedding vector/,
    )
  })

  test('wraps transport failure as BgeEmbeddingConnectionError', async () => {
    installMockFetch(async () => {
      throw new Error('ECONNREFUSED')
    })
    await expect(embedBge(createBgeEmbeddingClient(), ['a'])).rejects.toThrow(
      /BGE embedding connection failed/,
    )
  })
})

describe('isBgeEmbeddingAvailable — POST /embeddings probe (not /models)', () => {
  afterEach(restoreFetch)

  test('true on HTTP 200 with non-empty embedding vector', async () => {
    installMockFetch(async (input, init) => {
      // Hard contract: probe must POST to /embeddings, not GET /models
      expect(String(input)).toContain('/embeddings')
      expect(init?.method).toBe('POST')
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }] }),
        { status: 200 },
      )
    })
    expect(await isBgeEmbeddingAvailable(createBgeEmbeddingClient())).toBe(true)
  })

  test('false on HTTP 501 (the exact atomic-chat upstream bug it is meant to catch)', async () => {
    installMockFetch(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 501,
            message: 'This server does not support embeddings. Start it with `--embeddings`',
          },
        }),
        { status: 501 },
      ),
    )
    expect(await isBgeEmbeddingAvailable(createBgeEmbeddingClient())).toBe(false)
  })

  test('false on HTTP 404 (model not loaded)', async () => {
    installMockFetch(async () => new Response('No running session', { status: 404 }))
    expect(await isBgeEmbeddingAvailable(createBgeEmbeddingClient())).toBe(false)
  })

  test('false on HTTP 200 but empty embedding vector', async () => {
    installMockFetch(async () =>
      new Response(JSON.stringify({ data: [{ embedding: [] }] }), { status: 200 }),
    )
    expect(await isBgeEmbeddingAvailable(createBgeEmbeddingClient())).toBe(false)
  })

  test('false on malformed response shape', async () => {
    installMockFetch(async () =>
      new Response(JSON.stringify({ some: 'other' }), { status: 200 }),
    )
    expect(await isBgeEmbeddingAvailable(createBgeEmbeddingClient())).toBe(false)
  })

  test('false on transport error (no throw, swallowed)', async () => {
    installMockFetch(async () => {
      throw new Error('ECONNREFUSED')
    })
    expect(await isBgeEmbeddingAvailable(createBgeEmbeddingClient())).toBe(false)
  })
})
