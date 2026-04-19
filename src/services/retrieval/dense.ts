/**
 * Dense vector similarity utilities for retrieval.
 *
 * Consumed by bgeEmbeddingProvider.ts and (Wave 3+H Phase 2) by RRF
 * fusion. Kept free of HTTP / model concerns so it's trivially unit-
 * testable and reusable across providers (local MLX dense, droplet
 * BGE-M3, CF Workers fallback, etc.).
 *
 * BGE-M3 embeddings are typically L2-normalized at source, so a plain
 * dot product equals cosine similarity. We still compute the full
 * cosine formula to stay correct when the upstream skips normalization
 * (observed with some MLX exports).
 */

/**
 * Cosine similarity ∈ [-1, 1] for two equal-length vectors.
 * Returns 0 when either input has zero magnitude (guard against NaN).
 * Throws on length mismatch — silent misalignment is a class of bug
 * we refuse to paper over.
 */
export function cosineSim(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSim length mismatch: ${a.length} vs ${b.length}`)
  }
  if (a.length === 0) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    dot += ai * bi
    magA += ai * ai
    magB += bi * bi
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export interface DenseDoc {
  id: string
  embed: readonly number[]
}

export interface DenseHit {
  id: string
  score: number
}

export interface RankByDenseOptions {
  /** Cap the returned list. Default: all docs. */
  topK?: number
}

/**
 * Score a query embedding against a set of doc embeddings, return
 * the ranked list descending by cosine similarity.
 *
 * Stable order: on score ties, preserves the original `docs` order
 * (important for reproducibility of benchmark runs).
 */
export function rankByDense(
  queryEmbed: readonly number[],
  docs: readonly DenseDoc[],
  options: RankByDenseOptions = {},
): DenseHit[] {
  const scored: Array<DenseHit & { __idx: number }> = []
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]!
    scored.push({ id: d.id, score: cosineSim(queryEmbed, d.embed), __idx: i })
  }
  // Descending score; on tie, lower __idx first (stable).
  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score
    return x.__idx - y.__idx
  })
  const topK = options.topK ?? scored.length
  return scored.slice(0, topK).map(({ id, score }) => ({ id, score }))
}
