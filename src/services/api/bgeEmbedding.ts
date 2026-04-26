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
 * Local OpenAI-compatible embedding gateway. Public repo defaults must not
 * encode private operator infrastructure; live/non-local endpoints should be
 * supplied explicitly via options or environment-specific runner scripts.
 */
export const BGE_EMBEDDING_ATOMIC_BASE_URL = 'http://127.0.0.1:1337/v1'

/**
 * Optional private/remote BGE-M3 endpoint. Keep the value outside source
 * control; set BGE_EMBEDDING_DROPLET_BASE_URL in the operator environment
 * when a dedicated embedding server is available.
 */
export const BGE_EMBEDDING_DROPLET_BASE_URL =
  process.env.BGE_EMBEDDING_DROPLET_BASE_URL ?? BGE_EMBEDDING_ATOMIC_BASE_URL

/**
 * Default base URL. Prefer an explicit BGE_EMBEDDING_BASE_URL for benchmark
 * runs; otherwise use the local gateway so the public source stays portable.
 */
export const BGE_EMBEDDING_DEFAULT_BASE_URL =
  process.env.BGE_EMBEDDING_BASE_URL ?? BGE_EMBEDDING_ATOMIC_BASE_URL

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
    // Per-call timeout. Single-input warm embed is ~500-700ms on a CPU
    // BGE-M3 Q4 backend. Batch of 18-200 items on `--parallel 1`
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
 * Liveness probe at the actual trust boundary: send a one-token
 * embedding POST and verify it returns a non-empty vector. This is
 * strictly stronger than the older `/v1/models`-only check — Atomic
 * Chat v1.1.44 happily lists bge-m3 in /models but returns HTTP 501 on
 * /embeddings because its internal llama-server was spawned without
 * `--embedding`. A models-only probe would green-light that broken
 * backend. Codex adversarial review flagged this 2026-04-19 as a
 * high-severity false-positive at the availability boundary.
 *
 * Returns false on any failure (network, HTTP non-200, empty vector,
 * timeout). Does NOT throw — callers treat it as a boolean gate.
 */
export async function isBgeEmbeddingAvailable(
  client: BgeEmbeddingClient,
  probeTimeoutMs = 5000,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), probeTimeoutMs)
  try {
    const response = await fetch(`${client.baseURL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: client.model, input: 'ping' }),
      signal: controller.signal,
    })
    if (response.status !== 200) return false
    const body = (await response.json().catch(() => null)) as
      | { data?: Array<{ embedding?: number[] }> }
      | null
    const first = body?.data?.[0]?.embedding
    return Array.isArray(first) && first.length > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
