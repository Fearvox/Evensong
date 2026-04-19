import { describe, test, expect } from 'bun:test'
import { createLocalGemmaClient, LOCAL_GEMMA_DEFAULT_BASE_URL, LOCAL_GEMMA_DEFAULT_MODEL, isLocalGemmaAvailable, chatCompletionLocalGemma, LocalGemmaConnectionError } from '../localGemma.js'

describe('createLocalGemmaClient', () => {
  test('returns client with default baseURL http://127.0.0.1:1337/v1', () => {
    const client = createLocalGemmaClient()
    expect(client.baseURL).toBe(LOCAL_GEMMA_DEFAULT_BASE_URL)
    expect(LOCAL_GEMMA_DEFAULT_BASE_URL).toBe('http://127.0.0.1:1337/v1')
  })

  test('returns client with default model Gemma-4-E4B-Uncensored-Q4_K_M', () => {
    const client = createLocalGemmaClient()
    expect(client.model).toBe(LOCAL_GEMMA_DEFAULT_MODEL)
  })

  test('accepts baseURL override via options', () => {
    const client = createLocalGemmaClient({ baseURL: 'http://192.168.1.50:1337/v1' })
    expect(client.baseURL).toBe('http://192.168.1.50:1337/v1')
  })

  test('accepts model override via options', () => {
    const client = createLocalGemmaClient({ model: 'other-model.gguf' })
    expect(client.model).toBe('other-model.gguf')
  })
})

describe('isLocalGemmaAvailable', () => {
  test('returns true on 200 from /models', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async () => new Response('{"data":[]}', { status: 200 })) as typeof fetch
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient())).toBe(true)
    } finally { globalThis.fetch = saved }
  })
  test('returns false on throw', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient())).toBe(false)
    } finally { globalThis.fetch = saved }
  })
  test('returns false on non-200', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient())).toBe(false)
    } finally { globalThis.fetch = saved }
  })
  test('returns false on timeout', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async () => {
      await new Promise(r => setTimeout(r, 3000))
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient(), 100)).toBe(false)
    } finally { globalThis.fetch = saved }
  })
})

describe('chatCompletionLocalGemma', () => {
  test('returns content on 200', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'hello back' } }]
    }), { status: 200 })) as typeof fetch
    try {
      const r = await chatCompletionLocalGemma(createLocalGemmaClient(), {
        messages: [{ role: 'user', content: 'hi' }],
      })
      expect(r.content).toBe('hello back')
    } finally { globalThis.fetch = saved }
  })
  test('throws LocalGemmaConnectionError on fetch throw', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async () => { throw new Error('fail') }) as typeof fetch
    try {
      await expect(
        chatCompletionLocalGemma(createLocalGemmaClient(), { messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toBeInstanceOf(LocalGemmaConnectionError)
    } finally { globalThis.fetch = saved }
  })
  test('throws LocalGemmaConnectionError on non-200', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async () => new Response('err', { status: 503 })) as typeof fetch
    try {
      await expect(
        chatCompletionLocalGemma(createLocalGemmaClient(), { messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toBeInstanceOf(LocalGemmaConnectionError)
    } finally { globalThis.fetch = saved }
  })
})
