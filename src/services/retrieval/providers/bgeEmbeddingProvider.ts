import {
  embedBge,
  isBgeEmbeddingAvailable,
  type BgeEmbeddingClient,
} from '../../api/bgeEmbedding.js'
import { cosineSim, type DenseHit } from '../dense.js'
import type {
  VaultManifestEntry,
  VaultRetrievalProvider,
  VaultRetrievalRequest,
  VaultRetrievalResult,
} from '../types.js'

export interface BgeEmbeddingProviderOptions {
  /** Embedding HTTP client (points at Atomic Chat 1337 by default). Required. */
  client: BgeEmbeddingClient
  /** Provider name returned in VaultRetrievalResult.provider. Default: `dense:<model>`. */
  providerName?: string
  /**
   * Whether to include `entry.body` in the indexed surface alongside title +
   * excerpt. Parallel to BM25 provider's body handling. Default: true.
   * Disable to match the pre-Wave-2C surface for A/B comparisons.
   */
  withBody?: boolean
  /**
   * Cap the per-entry text length before embedding. BGE-M3 physical
   * batch is 512 tokens on the droplet config (`-b 512`), and Chinese +
   * English mixed content tokenizes at ~0.4 tokens/char, so 1000 chars
   * ≈ 300-400 tokens stays comfortably under the batch. Increase only
   * if you've raised `-b` on the server. Default: 1000.
   *
   * Observed 2026-04-19: `maxChars: 2000` triggered llama-server 500
   * "input (1006 tokens) is too large, increase batch size (current: 512)"
   * on one long paper body; dropped to 1000 for safety margin.
   */
  maxChars?: number
  /**
   * Inject a pre-populated manifest embedding cache (mostly for tests).
   * Key format: manifestHash (see hashManifest).
   */
  cache?: Map<string, number[][]>
  /**
   * Embed the manifest corpus in chunks of this size. Default 50.
   *
   * Wave 3+I incident (2026-04-22): the benchmark manifest is 200 docs and
   * the droplet BGE endpoint times out when the full corpus is sent in a
   * single request under the default 60s client timeout. Chunking keeps each
   * POST under the observed safe envelope while preserving a single logical
   * corpus cache per manifest.
   */
  corpusBatchSize?: number
}

/**
 * Build the embeddable text surface for a manifest entry.
 * Matches BM25's logic (title + excerpt + optional body) so dense and
 * sparse scores describe the same document surface.
 */
export function manifestEntryToText(
  entry: VaultManifestEntry,
  withBody: boolean,
  maxChars: number,
): string {
  const parts: string[] = [entry.title]
  if (entry.excerpt) parts.push(entry.excerpt)
  if (withBody && entry.body) parts.push(entry.body)
  const joined = parts.join('\n\n')
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined
}

/**
 * Cheap stable hash of a manifest's *identity* (ordered paths) — NOT a
 * content hash. We use it as a cache key so repeated retrieve() calls
 * over the same manifest in a benchmark reuse embeddings. Content drift
 * inside title/excerpt/body between calls with the same path set is
 * expected to be rare in the benchmark path; invalidate manually by
 * creating a fresh provider instance if you change entries' content.
 */
export function hashManifest(manifest: readonly VaultManifestEntry[]): string {
  return manifest.map((e) => e.path).join('|')
}

/**
 * BGE-M3 dense retrieval provider.
 *
 * First call with a given manifest embeds the full corpus (N + 1 vectors
 * including the query). Subsequent calls with the same manifest hash
 * reuse the cached corpus embeddings and only embed the new query —
 * amortizing the embedding cost across a benchmark sweep.
 *
 * Stage-1 role in the Wave 3+H pipeline: feed dense ranks into RRF
 * fusion alongside BM25. Scores (cosine sim) are exposed via
 * VaultRetrievalResult.scores so adaptiveHybridProvider can gate on
 * them directly when using BGE-alone.
 */
export function createBgeEmbeddingProvider(
  options: BgeEmbeddingProviderOptions,
): VaultRetrievalProvider {
  const { client } = options
  const providerName = options.providerName ?? `dense:${client.model}`
  const withBody = options.withBody ?? true
  // 500 chars is empirically safe for mixed 中/英 content under `-b 512`
  // llama-server batch. Observed 2026-04-19 on gpustack/bge-m3-Q4_K_M:
  // maxChars 2000 → 1006 tokens (fail), 1000 → 542 tokens (fail),
  // 800 → 542 tokens (fail), 600 → still hit batch limit occasionally,
  // 500 stable. Chinese tokenizes harder than expected on BGE-M3
  // sentencepiece (~1 token per char for dense CJK paragraphs).
  // Raise only if droplet llama-server is rebuilt with `-b 8192`
  // or larger.
  const maxChars = options.maxChars ?? 500
  const cache = options.cache ?? new Map<string, number[][]>()
  const corpusBatchSize = Math.max(1, options.corpusBatchSize ?? 50)
  const cacheInFlight = new Map<string, Promise<number[][]>>()

  return {
    name: providerName,
    available: () => isBgeEmbeddingAvailable(client),
    retrieve: async (req: VaultRetrievalRequest): Promise<VaultRetrievalResult> => {
      const start = performance.now()

      if (req.manifest.length === 0) {
        return {
          rankedPaths: [],
          scores: [],
          provider: providerName,
          latencyMs: Math.round(performance.now() - start),
        }
      }

      const key = hashManifest(req.manifest)
      let corpusEmbeddings = cache.get(key)

      if (!corpusEmbeddings) {
        let pending = cacheInFlight.get(key)
        if (!pending) {
          pending = (async () => {
            const texts = req.manifest.map((e) => manifestEntryToText(e, withBody, maxChars))
            const vectors: number[][] = []
            for (let i = 0; i < texts.length; i += corpusBatchSize) {
              const chunk = texts.slice(i, i + corpusBatchSize)
              const chunkVectors = await embedBge(client, chunk)
              vectors.push(...chunkVectors)
            }
            cache.set(key, vectors)
            return vectors
          })()
          cacheInFlight.set(key, pending)
        }
        try {
          corpusEmbeddings = await pending
        } finally {
          cacheInFlight.delete(key)
        }
      }

      const [queryEmbedding] = await embedBge(client, [req.query])
      if (!queryEmbedding) {
        throw new Error('BGE embedding returned no vector for the query')
      }

      const hits: DenseHit[] = corpusEmbeddings.map((docEmbed, i) => ({
        id: req.manifest[i]!.path,
        score: cosineSim(queryEmbedding, docEmbed),
      }))

      // Stable sort: descending score, ties preserve input order.
      hits.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return 0
      })

      const topK = req.topK ?? hits.length
      const sliced = hits.slice(0, topK)

      return {
        rankedPaths: sliced.map((h) => h.id),
        scores: sliced.map((h) => h.score),
        provider: providerName,
        latencyMs: Math.round(performance.now() - start),
      }
    },
  }
}
