/**
 * Atomic Chat BGE-M3 embedding HTTP client.
 *
 * Atomic Chat (v1.1.44, Jan.ai fork) exposes an OpenAI-compatible
 * `/v1/embeddings` endpoint at http://127.0.0.1:1337. Its bundled
 * llama-server (turboquant-macos-arm64 build) natively supports
 * `--embedding` flag and loads any BGE-family gguf placed in
 *   ~/Library/Application Support/Atomic Chat/data/llamacpp/models/
 *
 * Wave 3+H Phase 1 (2026-04-19): unify the entire retrieval stack on the
 * 1337 gateway — chat AND embedding through the same port. This removes
 * the Wave 2C droplet dependency for embed and keeps CCR as a pure 1337
 * consumer.
 *
 * Model: `bge-m3` (1024-dim, multilingual, 100+ languages including 中英).
 *        BGE-M3 is MIT-licensed base + Apache llama.cpp runtime.
 *
 * See _vault/infra/retrieval-endpoints.md for droplet fallback (not used
 * under this client; kept as a separate infra lane for disaster-recovery).
 */

/**
 * Default "future unified gateway" — Atomic Chat on 1337. When v1.1.44's
 * `embedding: true` model.yml field translates to the `--embedding` CLI
 * flag in llama-server spawn, this target will work directly.
 *
 * 2026-04-19 reality: Atomic Chat v1.1.44 spawns llama-server without
 * `--embedding`, so this endpoint returns HTTP 501 for /v1/embeddings
 * even though the model is loaded. Temporary workaround: use
 * BGE_EMBEDDING_DROPLET_BASE_URL instead.
 */
export const BGE_EMBEDDING_DEFAULT_BASE_URL = 'http://127.0.0.1:1337/v1'

/**
 * Working BGE-M3 endpoint via Tailscale to ccr-droplet (Wave 2C shipped
 * 2026-04-19). llama-server launched with `--embedding` so
 * /v1/embeddings returns real 1024-dim vectors. 508ms cold round-trip
 * including Tailscale transit (~180ms base). See
 * `_vault/infra/retrieval-endpoints.md` for systemd/monitor details.
 */
export const BGE_EMBEDDING_DROPLET_BASE_URL = 'http://100.65.234.77:8080/v1'

/**
 * Model alias accepted by BOTH droplet and atomic-chat-future.
 * - Droplet llama-server accepts `bge-m3` short name (loose matching).
 * - Atomic Chat requires the exact id `gpustack/bge-m3-Q4_K_M` — use
 *   BGE_EMBEDDING_ATOMIC_MODEL when pointing at 1337.
 */
export const BGE_EMBEDDING_DEFAULT_MODEL = 'bge-m3'
export const BGE_EMBEDDING_ATOMIC_MODEL = 'gpustack/bge-m3-Q4_K_M'
export const BGE_EMBEDDING_DEFAULT_DIMS = 1024

export interface BgeEmbeddingClientOptions {
  baseURL?: string
  model?: string
  timeoutMs?: number
}

export interface BgeEmbeddingClient {
  baseURL: string
  model: string
  timeoutMs: number
}

export function createBgeEmbeddingClient(
  options: BgeEmbeddingClientOptions = {},
): BgeEmbeddingClient {
  return {
    baseURL: options.baseURL ?? BGE_EMBEDDING_DEFAULT_BASE_URL,
    model: options.model ?? BGE_EMBEDDING_DEFAULT_MODEL,
    // Per-call timeout. Single-input warm embed is ~500-700ms (droplet CPU
    // BGE-M3 Q4 via Tailscale). Batch of 18-200 items on `--parallel 1`
    // llama-server means sequential processing: 18 × ~600ms = ~11s cold,
    // 200 × ~600ms = ~2min. Default 60s covers the typical benchmark
    // manifest (18-200 entries); raise via options.timeoutMs for larger
    // one-shot batches.
    timeoutMs: options.timeoutMs ?? 60000,
  }
}

export class BgeEmbeddingConnectionError extends Error {
  readonly cause?: unknown
  readonly status?: number
  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message)
    this.name = 'BgeEmbeddingConnectionError'
    this.cause = options?.cause
    this.status = options?.status
  }
}

/**
 * Batch-embed N texts in a single OpenAI-compat `/v1/embeddings` POST.
 *
 * Returns an array of N Float-array embeddings aligned with the input
 * order. Throws BgeEmbeddingConnectionError on transport / HTTP / shape
 * mismatch — callers should surface the error up so the caller can decide
 * whether to fall back (e.g. to BM25-only retrieval).
 */
export async function embedBge(
  client: BgeEmbeddingClient,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return []

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), client.timeoutMs)
  let response: Response
  try {
    response = await fetch(`${client.baseURL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: client.model,
        input: texts,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    throw new BgeEmbeddingConnectionError(
      `BGE embedding connection failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    )
  } finally {
    clearTimeout(timer)
  }

  if (response.status !== 200) {
    const body = await response.text().catch(() => '')
    throw new BgeEmbeddingConnectionError(
      `BGE embedding returned HTTP ${response.status}: ${body.slice(0, 200)}`,
      { status: response.status },
    )
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>
  }
  if (!data.data || !Array.isArray(data.data)) {
    throw new BgeEmbeddingConnectionError(
      `BGE embedding response missing 'data' array`,
    )
  }
  if (data.data.length !== texts.length) {
    throw new BgeEmbeddingConnectionError(
      `BGE embedding returned ${data.data.length} vectors for ${texts.length} inputs`,
    )
  }

  // Preserve input order: OpenAI spec guarantees data[i].index === i, but
  // we sort defensively in case a server proxy reorders.
  const sorted = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const out: number[][] = []
  for (let i = 0; i < sorted.length; i++) {
    const embed = sorted[i]?.embedding
    if (!embed || !Array.isArray(embed) || embed.length === 0) {
      throw new BgeEmbeddingConnectionError(
        `BGE embedding entry ${i} has no embedding vector`,
      )
    }
    out.push(embed)
  }
  return out
}

/**
 * Liveness probe: check /v1/models returns 200 and contains at least one
 * model whose id includes "bge" (loose match — droplet exposes
 * `bge-m3-Q4_K_M.gguf`, atomic chat exposes `gpustack/bge-m3-Q4_K_M`,
 * both are valid embedding backends and both accept the short `bge-m3`
 * alias on the /embeddings call). Strict exact-id match was too
 * brittle — droplet llama-server would fail this even though
 * /embeddings works fine with the short alias.
 *
 * Returns false on any failure (network, HTTP, shape, no BGE model).
 * Does NOT throw.
 */
export async function isBgeEmbeddingAvailable(
  client: BgeEmbeddingClient,
  probeTimeoutMs = 3000,
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
    if (result.status !== 200) return false
    const body = (await result.json()) as { data?: Array<{ id?: string }> }
    const modelIds = (body.data ?? []).map((m) => m.id).filter((x): x is string => !!x)
    // Loose: any model id containing "bge" (case-insensitive) counts as an
    // embedding backend. Callers that need strict id match should check
    // client.model against the response themselves.
    return modelIds.some((id) => id.toLowerCase().includes('bge'))
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}
