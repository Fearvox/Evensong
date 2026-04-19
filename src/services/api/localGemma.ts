export const LOCAL_GEMMA_DEFAULT_BASE_URL = 'http://127.0.0.1:1337/v1'
// Actual model ID served by Atomic Chat as of 2026-04-19 dogfood verification.
// Wave 2B plan erroneously wrote the short name `Gemma-4-E4B-Uncensored-Q4_K_M`
// which would 400 on /chat/completions. Override via options.model when Atomic
// switches model or when pointing at a different endpoint.
export const LOCAL_GEMMA_DEFAULT_MODEL = 'Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M'

/**
 * Atomic Chat (local multi-backend gateway at LOCAL_GEMMA_DEFAULT_BASE_URL)
 * routes a mix of local llama.cpp + proxied cloud models. IDs recorded here
 * are verified-reachable as of 2026-04-19 probe.
 *
 * NOT RECORDED (intentionally):
 *   - `MiniMax-M2.{5,7}-highspeed` — requires higher-tier MiniMax token plan,
 *     server returns 500 "your current token plan not support".
 *   - `deepseek/deepseek-r1:free`, `qwen/qwen3-30b-a3b:free` — Atomic returns
 *     404 "No endpoints found" (OpenRouter free-route mapping has drifted).
 *     Re-add once the user refreshes OR endpoints on Atomic side.
 *   - `grok-2-vision-1212`, `grok-imagine-image` — non-text workloads.
 *
 * Pick primary by workload:
 *   - Interactive retrieval judge: FAST (sub-second, no thinking stage)
 *   - Deep reasoning / agentic: FAST_REASONING
 *   - Long-context QA backup: MINIMAX_M27 or MINIMAX_M25
 *   - Offline/airgap only: LOCAL_GEMMA (slow CPU inference, judge noise)
 */
export const ATOMIC_MODELS = {
  // ── Primary retrieval-judge candidates (all 3/3 top-1 on dogfood reference manifest) ──
  /** deepseek/deepseek-v3.2 — 729ms judge avg, 3/3 correct. Current primary. */
  DEEPSEEK_V32: 'deepseek/deepseek-v3.2',
  /** grok-3 — 886ms judge avg, 3/3 correct. Secondary (xAI paid). */
  GROK_3: 'grok-3',
  /** openrouter/auto:free — 2325ms judge avg, 3/3 correct. Free tier fallback. */
  OR_AUTO_FREE: 'openrouter/auto:free',

  // ── Fast-reasoning tier (use only when thinking trace is actually wanted) ──
  /** grok-4-fast-reasoning — 445ms probe, but 1/3 on judge (reasoning hurts listwise rank). */
  FAST: 'grok-4-fast-reasoning',
  /** grok-4-1-fast-reasoning — 985ms probe, 2/3 on judge. */
  FAST_REASONING: 'grok-4-1-fast-reasoning',

  // ── MiniMax tier (multilingual + long-context) ──
  /** MiniMax-M2.7 — 1.9s probe, Chinese and long-context capable. */
  MINIMAX_M27: 'MiniMax-M2.7',
  /** MiniMax-M2.5 — 1.1s probe, faster sibling of M2.7. */
  MINIMAX_M25: 'MiniMax-M2.5',

  // ── OR paid backup ──
  /** qwen/qwen3.6-plus — 24s judge on dogfood (too slow for interactive) but 3/3 correct. */
  QWEN_36_PLUS: 'qwen/qwen3.6-plus',

  // ── Offline tier ──
  /** Local Gemma via llama.cpp — offline-only (26s judge, 3/3 correct). */
  LOCAL_GEMMA: LOCAL_GEMMA_DEFAULT_MODEL,
} as const

export type AtomicModelId = (typeof ATOMIC_MODELS)[keyof typeof ATOMIC_MODELS]

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
