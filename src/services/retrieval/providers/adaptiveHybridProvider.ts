import type {
  VaultRetrievalProvider,
  VaultRetrievalRequest,
  VaultRetrievalResult,
} from '../types.js'
import { createBM25Provider } from './bm25Provider.js'

export interface AdaptiveHybridProviderOptions {
  /**
   * Stage 1 provider that returns ranked paths AND numeric scores
   * (e.g. BM25 with `scores` populated). Default: createBM25Provider().
   * If stage 1 returns without `scores`, we conservatively fall through
   * to stage 2 because we cannot measure confidence.
   */
  stage1?: VaultRetrievalProvider
  /**
   * Stage 2 LLM judge. Only invoked when stage 1 confidence is insufficient
   * (small gap between top-1 and top-2 scores).
   */
  stage2: VaultRetrievalProvider
  /** Candidate pool passed to stage 1 → and to stage 2 when invoked. Default 50. */
  stage1TopK?: number
  /**
   * Gap ratio threshold for skipping stage 2. If
   *   scores[0] / scores[1] >= gapRatioThreshold
   * we trust stage 1 alone and skip the LLM call. Default 1.5.
   *
   * Calibration basis (Wave 3+E, 2026-04-19): on our 20-query manual set,
   * BM25-correct cases had mean gap_ratio=2.41x (stddev 1.83), BM25-wrong
   * cases had mean 1.73x (stddev 0.70). A 1.5x threshold separates the
   * two populations usefully while leaving one irreducible failure mode
   * (confidently-wrong: high gap + wrong top-1, e.g. Q13 "extended mind
   * philosophy" → ratio 2.43x but top-1 still wrong). No gap threshold
   * catches that; LLM rerank cannot either.
   */
  gapRatioThreshold?: number
  /** Override provider label. Default `adaptive:<stage2.name>`. */
  providerName?: string
}

function computeGapRatio(scores: readonly number[]): number {
  if (scores.length < 2) return Infinity // single hit = trivially "confident enough"
  const [top, second] = scores
  if (second === undefined || top === undefined) return Infinity
  if (second <= 0) return Infinity
  return top / second
}

/**
 * Adaptive Retrieve-and-Rerank: BM25 stage 1 first, LLM stage 2 only when
 * stage 1 confidence is insufficient.
 *
 * Decision rule:
 *   1. Stage 1 returns rankedPaths + scores.
 *   2. If rankedPaths is empty → return empty (no pool to rerank).
 *   3. If scores absent or single-hit → return stage 1 result as-is.
 *   4. If gap_ratio = scores[0] / scores[1] >= threshold → skip stage 2.
 *   5. Else → hand narrowed manifest (stage 1 top-K, preserving BM25 order)
 *      to stage 2 LLM judge and return its rerank.
 *
 * Wave 3+G motivation: the 108-query × 3-run benchmark (Wave 3+F) shows
 * Hybrid at 79.3% top-1 / p50 1509ms. BM25-alone on the same manifest is
 * 90% top-1 on 20 handpicked queries (Wave 3+E). For the ~70% of queries
 * where BM25 is confidently correct, calling the LLM is overhead. Adaptive
 * gating keeps LLM for the ~30% that actually need disambiguation and
 * drops the expensive call on the rest. Expected avg latency ≈
 * 0.7×30ms + 0.3×1500ms ≈ 470ms, vs 1509ms for always-rerank Hybrid.
 * No EverOS / EverMemOS published design covers this pattern.
 */
export function createAdaptiveHybridProvider(
  options: AdaptiveHybridProviderOptions,
): VaultRetrievalProvider {
  const stage1 = options.stage1 ?? createBM25Provider()
  const stage2 = options.stage2
  const stage1TopK = options.stage1TopK ?? 50
  const gapRatioThreshold = options.gapRatioThreshold ?? 1.5
  const providerName = options.providerName ?? `adaptive:${stage2.name}`

  return {
    name: providerName,
    available: () => stage2.available(),
    retrieve: async (req: VaultRetrievalRequest): Promise<VaultRetrievalResult> => {
      const start = performance.now()

      const stage1Result = await stage1.retrieve({
        query: req.query,
        manifest: req.manifest,
        topK: stage1TopK,
      })

      // Nothing to rerank
      if (stage1Result.rankedPaths.length === 0) {
        return {
          rankedPaths: [],
          provider: providerName,
          latencyMs: Math.round(performance.now() - start),
        }
      }

      // Cannot measure confidence without scores → safe path: go through stage 2
      const hasScores = Array.isArray(stage1Result.scores) && stage1Result.scores.length > 0
      const gapRatio = hasScores ? computeGapRatio(stage1Result.scores!) : NaN

      // Confident enough to skip stage 2:
      //   - single hit (gapRatio === Infinity)
      //   - gap ratio >= threshold
      if (hasScores && gapRatio >= gapRatioThreshold) {
        const topN = req.topK ?? stage1Result.rankedPaths.length
        const scoresSlice = stage1Result.scores!.slice(0, topN)
        return {
          rankedPaths: stage1Result.rankedPaths.slice(0, topN),
          scores: scoresSlice,
          provider: providerName,
          latencyMs: Math.round(performance.now() - start),
        }
      }

      // Not confident → narrow manifest to stage 1 pool (preserve BM25 order as soft prior) and hand to LLM
      const entryByPath = new Map(req.manifest.map((e) => [e.path, e]))
      const narrowed: VaultRetrievalRequest['manifest'] = []
      for (const p of stage1Result.rankedPaths) {
        const entry = entryByPath.get(p)
        if (entry) narrowed.push(entry)
      }

      const stage2Result = await stage2.retrieve({
        query: req.query,
        manifest: narrowed,
        topK: req.topK,
      })

      return {
        rankedPaths: stage2Result.rankedPaths,
        provider: providerName,
        latencyMs: Math.round(performance.now() - start),
      }
    },
  }
}
