import type {
  VaultRetrievalProvider,
  VaultRetrievalRequest,
  VaultRetrievalResult,
} from '../types.js'
import { createBM25Provider } from './bm25Provider.js'

export interface HybridProviderOptions {
  /**
   * Stage 1 provider. Recalls a candidate pool from the full manifest in
   * milliseconds. Default: createBM25Provider(). Can be replaced with
   * another fast signal (dense-vector recall via BGE-M3, metadata filter,
   * etc.) without touching stage 2 — the only contract is that stage 1
   * returns `rankedPaths` that are a subset of the request manifest.
   */
  stage1?: VaultRetrievalProvider
  /**
   * Stage 2 provider. Typically an LLM listwise judge (atomicProvider +
   * deepseek/grok/auto). Sees at most stage1TopK manifest entries.
   */
  stage2: VaultRetrievalProvider
  /** Candidate pool size handed from stage 1 to stage 2. Defaults to 50. */
  stage1TopK?: number
  /** Override the provider.name label in results. Defaults to `hybrid:<stage2.name>`. */
  providerName?: string
}

/**
 * Retrieve-and-Rerank (RaR) provider:
 *   Stage 1 (fast, cheap) narrows the manifest to topK candidates
 *   Stage 2 (smart, expensive) reranks those candidates with an LLM judge
 *
 * This is the EverMemOS §3.4 pattern and the core Wave 3+ upstream-PR
 * pitch — LLM-only judge does not scale past ~100 manifest entries because
 * the prompt blows the context window + cost explodes. Hybrid fixes both.
 *
 * Key optimization: if stage 1 returns zero hits (query has no overlap
 * with any manifest entry by the stage-1 signal), we skip stage 2 entirely
 * — no network call, immediate empty result. This matches the EverMemOS
 * sufficiency verifier behavior without the verifier-loop cost.
 */
export function createHybridProvider(options: HybridProviderOptions): VaultRetrievalProvider {
  const stage1 = options.stage1 ?? createBM25Provider()
  const stage2 = options.stage2
  const stage1TopK = options.stage1TopK ?? 50
  const providerName = options.providerName ?? `hybrid:${stage2.name}`

  return {
    name: providerName,
    available: () => stage2.available(),
    retrieve: async (req: VaultRetrievalRequest): Promise<VaultRetrievalResult> => {
      const start = performance.now()

      // Stage 1: BM25 (or injected alternative) on the FULL manifest.
      const stage1Result = await stage1.retrieve({
        query: req.query,
        manifest: req.manifest,
        topK: stage1TopK,
      })

      if (stage1Result.rankedPaths.length === 0) {
        return {
          rankedPaths: [],
          provider: providerName,
          latencyMs: Math.round(performance.now() - start),
        }
      }

      // Build the narrowed manifest, preserving stage-1 order as a soft prior.
      const pathSet = new Set(stage1Result.rankedPaths)
      const keptInOrder: VaultRetrievalRequest['manifest'] = []
      const entryByPath = new Map(req.manifest.map((e) => [e.path, e]))
      for (const p of stage1Result.rankedPaths) {
        const entry = entryByPath.get(p)
        if (entry) keptInOrder.push(entry)
      }
      // Defensive: drop any phantom stage-1 hits not in the original manifest
      // (should not happen with pure BM25 but is cheap insurance).
      const narrowed = keptInOrder.filter((e) => pathSet.has(e.path))

      // Stage 2: LLM judge reranks the narrowed pool.
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
