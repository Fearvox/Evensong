export const LOCAL_GEMMA_DEFAULT_BASE_URL = 'http://127.0.0.1:1337/v1'
export const LOCAL_GEMMA_DEFAULT_MODEL = 'Gemma-4-E4B-Uncensored-Q4_K_M'

export interface LocalGemmaClientOptions {
  baseURL?: string
  model?: string
  timeoutMs?: number
}

export interface LocalGemmaClient {
  baseURL: string
  model: string
  timeoutMs: number
}

export function createLocalGemmaClient(options: LocalGemmaClientOptions = {}): LocalGemmaClient {
  return {
    baseURL: options.baseURL ?? LOCAL_GEMMA_DEFAULT_BASE_URL,
    model: options.model ?? LOCAL_GEMMA_DEFAULT_MODEL,
    timeoutMs: options.timeoutMs ?? 30000,
  }
}

export class LocalGemmaConnectionError extends Error {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'LocalGemmaConnectionError'
    this.cause = cause
  }
}

export interface LocalGemmaChatRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
}

export interface LocalGemmaChatResponse {
  content: string
  raw: unknown
}

export async function chatCompletionLocalGemma(
  client: LocalGemmaClient,
  request: LocalGemmaChatRequest,
): Promise<LocalGemmaChatResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), client.timeoutMs)
  let response: Response
  try {
    response = await fetch(`${client.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: client.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 1024,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    throw new LocalGemmaConnectionError(
      `Local Gemma connection failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    )
  } finally {
    clearTimeout(timer)
  }

  if (response.status !== 200) {
    const body = await response.text().catch(() => '')
    throw new LocalGemmaConnectionError(
      `Local Gemma returned HTTP ${response.status}: ${body.slice(0, 200)}`,
    )
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content ?? ''
  return { content, raw: data }
}

export async function isLocalGemmaAvailable(
  client: LocalGemmaClient,
  probeTimeoutMs = 2000,
): Promise<boolean> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve('timeout')
    }, probeTimeoutMs)
  })
  try {
    const result = await Promise.race([
      fetch(`${client.baseURL}/models`, { method: 'GET', signal: controller.signal }),
      timeoutPromise,
    ])
    if (result === 'timeout') return false
    return result.status === 200
  } catch {
    return false
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
