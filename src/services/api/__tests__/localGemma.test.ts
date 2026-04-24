import { describe, test, expect } from 'bun:test'
import { createLocalGemmaClient, LOCAL_GEMMA_DEFAULT_BASE_URL, LOCAL_GEMMA_DEFAULT_MODEL, isLocalGemmaAvailable, chatCompletionLocalGemma, LocalGemmaConnectionError, ATOMIC_MODELS } from '../localGemma.js'

describe('createLocalGemmaClient', () => {
  test('returns client with default baseURL http://127.0.0.1:1337/v1', () => {
    const client = createLocalGemmaClient()
    expect(client.baseURL).toBe(LOCAL_GEMMA_DEFAULT_BASE_URL)
    expect(LOCAL_GEMMA_DEFAULT_BASE_URL).toBe('http://127.0.0.1:1337/v1')
  })

  test('returns client with actual Atomic model name (HauhauCS-Aggressive-Q4_K_M)', () => {
    const client = createLocalGemmaClient()
    expect(client.model).toBe(LOCAL_GEMMA_DEFAULT_MODEL)
    expect(LOCAL_GEMMA_DEFAULT_MODEL).toBe('Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M')
  })

  test('accepts baseURL override via options', () => {
    const client = createLocalGemmaClient({ baseURL: 'http://192.168.1.50:1337/v1' })
    expect(client.baseURL).toBe('http://192.168.1.50:1337/v1')
  })

  test('accepts model override via options', () => {
    const client = createLocalGemmaClient({ model: 'other-model.gguf' })
    expect(client.model).toBe('other-model.gguf')
  })

  test('accepts apiKey override via options', () => {
    const client = createLocalGemmaClient({ apiKey: 'sk-test' })
    expect(client.apiKey).toBe('sk-test')
  })

  test('accepts extra OpenAI-compatible request body fields via options', () => {
    const client = createLocalGemmaClient({ extraBody: { thinking: { type: 'disabled' } } })
    expect(client.extraBody).toEqual({ thinking: { type: 'disabled' } })
  })

  test('accepts ATOMIC_MODELS.FAST as model override (grok-4-fast-reasoning)', () => {
    const client = createLocalGemmaClient({ model: ATOMIC_MODELS.FAST })
    expect(client.model).toBe('grok-4-fast-reasoning')
  })
})

describe('ATOMIC_MODELS registry', () => {
  test('exposes judge-tier 3/3-correct primary + backups', () => {
    // Primary trio (all 3/3 on dogfood reference manifest)
    expect(ATOMIC_MODELS.DEEPSEEK_V32).toBe('deepseek/deepseek-v3.2')
    expect(ATOMIC_MODELS.GROK_3).toBe('grok-3')
    expect(ATOMIC_MODELS.OR_AUTO_FREE).toBe('openrouter/auto:free')
  })

  test('exposes reasoning tier + MiniMax tier + OR paid backup + offline', () => {
    expect(ATOMIC_MODELS.FAST).toBe('grok-4-fast-reasoning')
    expect(ATOMIC_MODELS.FAST_REASONING).toBe('grok-4-1-fast-reasoning')
    expect(ATOMIC_MODELS.MINIMAX_M27).toBe('MiniMax-M2.7')
    expect(ATOMIC_MODELS.MINIMAX_M25).toBe('MiniMax-M2.5')
    expect(ATOMIC_MODELS.QWEN_36_PLUS).toBe('qwen/qwen3.6-plus')
    expect(ATOMIC_MODELS.LOCAL_GEMMA).toBe(LOCAL_GEMMA_DEFAULT_MODEL)
  })

  test('does not expose plan-locked or 404-routed IDs', () => {
    const values = Object.values(ATOMIC_MODELS) as string[]
    expect(values).not.toContain('MiniMax-M2.7-highspeed')
    expect(values).not.toContain('MiniMax-M2.5-highspeed')
    expect(values).not.toContain('deepseek/deepseek-r1:free')
    expect(values).not.toContain('qwen/qwen3-30b-a3b:free')
    expect(values).not.toContain('moonshotai/kimi-k2.5:free')
    expect(values).not.toContain('llama-4-maverick:free')
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
  test('falls back to chat/completions when /models is unsupported', async () => {
    const saved = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      const href = String(url)
      calls.push(href)
      if (href.endsWith('/models')) return new Response('not found', { status: 404 })
      if (href.endsWith('/chat/completions')) {
        return new Response('{"choices":[{"message":{"content":"ok"}}]}', { status: 200 })
      }
      return new Response('', { status: 500 })
    }) as typeof fetch
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient())).toBe(true)
      expect(calls).toEqual([
        'http://127.0.0.1:1337/v1/models',
        'http://127.0.0.1:1337/v1/chat/completions',
      ])
    } finally { globalThis.fetch = saved }
  })
  test('returns false when chat/completions fallback also fails', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      const href = String(url)
      if (href.endsWith('/models')) return new Response('not found', { status: 404 })
      return new Response('boom', { status: 503 })
    }) as typeof fetch
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

  test('sends bearer auth header when apiKey is configured', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-minimax')
      return new Response('{"data":[]}', { status: 200 })
    }) as typeof fetch
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient({ apiKey: 'sk-minimax' }))).toBe(true)
    } finally { globalThis.fetch = saved }
  })
  test('sends bearer auth header on chat/completions fallback too', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-minimax')
      const href = String(url)
      if (href.endsWith('/models')) return new Response('not found', { status: 404 })
      return new Response('{"choices":[{"message":{"content":"ok"}}]}', { status: 200 })
    }) as typeof fetch
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient({ apiKey: 'sk-minimax' }))).toBe(true)
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

  test('sends bearer auth header when apiKey is configured', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-minimax')
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
      }), { status: 200 })
    }) as typeof fetch
    try {
      const r = await chatCompletionLocalGemma(createLocalGemmaClient({ apiKey: 'sk-minimax' }), {
        messages: [{ role: 'user', content: 'hi' }],
      })
      expect(r.content).toBe('ok')
    } finally { globalThis.fetch = saved }
  })

  test('merges provider-specific extra request body fields', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = JSON.parse(String(init?.body))
      expect(body.thinking).toEqual({ type: 'disabled' })
      expect(body.model).toBe('deepseek-v4-flash')
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
      }), { status: 200 })
    }) as typeof fetch
    try {
      const r = await chatCompletionLocalGemma(
        createLocalGemmaClient({
          model: 'deepseek-v4-flash',
          extraBody: { thinking: { type: 'disabled' } },
        }),
        { messages: [{ role: 'user', content: 'hi' }] },
      )
      expect(r.content).toBe('ok')
    } finally { globalThis.fetch = saved }
  })
})
