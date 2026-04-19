import type {
  VaultRetrievalProvider,
  VaultRetrievalRequest,
  VaultRetrievalResult,
} from '../types.js'

export interface RRFFusionProviderOptions {
  /**
   * Fusion inputs. Each provider is queried in parallel with the shared
   * manifest and then its ranking contributes to the RRF score.
   * Must be non-empty.
   */
  providers: VaultRetrievalProvider[]
  /**
   * RRF constant. Lower k weights top-ranked docs more aggressively;
   * higher k smooths across deeper ranks.
   *
   * Default 10 (not the classical Cormack 2009 default of 60). Rationale:
   * a 2026 ablation on hybrid BM25+dense retrieval with small corpora
   * found Recall@5 of 0.716 at k=10 vs 0.695 at k=60, with larger
   * margins when top-1 is the priority metric. For our 200-entry manifest
   * and top-1-focused benchmark, k=10 is the empirically better pick
   * until we Phase-5 sweep {5, 10, 20, 30, 60}.
   *
   * Raise towards 60 for recall-heavy use cases (e.g. retrieval feeding
   * an LLM that reranks top-50).
   */
  k?: number
  /**
   * Pool size passed as `topK` to each child provider. Default 50 —
   * matches the default used throughout the hybrid pipeline so the
   * fusion stage-1 has the same discovery budget as stage-2's rerank
   * input.
   */
  stagePoolTopK?: number
  /** Provider name in result. Default `rrf:<child-names-joined-by-+>`. */
  providerName?: string
}

/**
 * Reciprocal Rank Fusion stage-1 provider.
 *
 * Queries N upstream providers in parallel, collects each one's ranking,
 * and fuses them into a single ranking by summing `1 / (k + rank_i + 1)`
 * for each document across providers that ranked it. 1-indexed rank
 * conventional (rank 0 in an array becomes rank 1 in the formula).
 *
 * A document ranked by only one provider still gets a partial score —
 * this matches the standard RRF semantics and guarantees that a strong
 * hit from one signal isn't entirely lost when the other signal misses.
 *
 * Wave 3+H Phase 2 role: fuse BM25 (lexical) + BGE-M3 (dense semantic)
 * into a unified stage-1 ranking that feeds stage-2 LLM rerank (hybrid)
 * or adaptive gating (adaptiveHybridProvider). Covers BM25's lexical
 * gaps on concept queries (Q13 "extended mind") without losing BM25's
 * precision on specific named entities.
 *
 * Provider failures are tolerated (Promise.allSettled): if one child
 * throws, the others still contribute. `available()` returns true iff
 * at least one child is available.
 */
export function createRRFFusionProvider(
  options: RRFFusionProviderOptions,
): VaultRetrievalProvider {
  const providers = options.providers
  if (providers.length === 0) {
    throw new Error('createRRFFusionProvider: providers array must be non-empty')
  }
  const k = options.k ?? 10
  const stagePoolTopK = options.stagePoolTopK ?? 50
  const providerName =
    options.providerName ?? `rrf:${providers.map((p) => p.name).join('+')}`

  return {
    name: providerName,
    available: async () => {
      const results = await Promise.all(
        providers.map((p) => p.available().catch(() => false)),
      )
      return results.some(Boolean)
    },
    retrieve: async (req: VaultRetrievalRequest): Promise<VaultRetrievalResult> => {
      const start = performance.now()

      const stageReq: VaultRetrievalRequest = {
        query: req.query,
        manifest: req.manifest,
        topK: stagePoolTopK,
      }
      const stageResults = await Promise.allSettled(
        providers.map((p) => p.retrieve(stageReq)),
      )

      // Accumulate RRF scores + remember the first rank each path appeared at
      // (tiebreaker: doc that first hit at a better rank wins a tie).
      const scoresByPath = new Map<string, number>()
      const firstSeenRank = new Map<string, number>()
      let discoveryOrder = 0
      const discoveryIdx = new Map<string, number>()

      for (const settled of stageResults) {
        if (settled.status !== 'fulfilled') continue
        const paths = settled.value.rankedPaths
        for (let rank0 = 0; rank0 < paths.length; rank0++) {
          const path = paths[rank0]!
          const rank1 = rank0 + 1 // 1-indexed for RRF formula
          const contribution = 1 / (k + rank1)
          scoresByPath.set(path, (scoresByPath.get(path) ?? 0) + contribution)
          const prevMin = firstSeenRank.get(path)
          if (prevMin === undefined || rank1 < prevMin) {
            firstSeenRank.set(path, rank1)
          }
          if (!discoveryIdx.has(path)) discoveryIdx.set(path, discoveryOrder++)
        }
      }

      // Sort desc by RRF; tie-break by best rank across providers; then by
      // discovery order (stable-ish reproducibility).
      const ranked = Array.from(scoresByPath.entries())
        .map(([path, score]) => ({
          path,
          score,
          bestRank: firstSeenRank.get(path)!,
          idx: discoveryIdx.get(path)!,
        }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank
          return a.idx - b.idx
        })

      const topK = req.topK ?? ranked.length
      const sliced = ranked.slice(0, topK)

      return {
        rankedPaths: sliced.map((r) => r.path),
        scores: sliced.map((r) => r.score),
        provider: providerName,
        latencyMs: Math.round(performance.now() - start),
      }
    },
  }
}
