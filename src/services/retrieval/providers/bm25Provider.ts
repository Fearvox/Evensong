import { rankByBM25, type Doc } from '../bm25.js'
import type { VaultRetrievalProvider, VaultRetrievalRequest, VaultRetrievalResult } from '../types.js'

export interface BM25ProviderOptions {
  /** Provider name surfaced in VaultRetrievalResult.provider. Defaults to 'bm25'. */
  providerName?: string
}

/**
 * Convert a manifest entry to a BM25 indexing document.
 * Indexed surface: title + excerpt. Path is not indexed to avoid the judge
 * gaming the match via filenames (especially paths like
 * `20260411-msa-memory-sparse-attention.md` which would be a perfect hit
 * for almost any query about that paper).
 */
function manifestEntryToDoc(entry: VaultRetrievalRequest['manifest'][number]): Doc {
  // Indexed surface: title + excerpt + (optional) body.
  // Path is intentionally NOT indexed to avoid the judge gaming the match
  // via filenames like `20260411-msa-memory-sparse-attention.md`.
  const parts: string[] = [entry.title]
  if (entry.excerpt) parts.push(entry.excerpt)
  if (entry.body) parts.push(entry.body)
  return { id: entry.path, text: parts.join(' ') }
}

/**
 * Stand-alone BM25 provider. Use directly for airgap / zero-cost retrieval,
 * or compose via createHybridProvider as Stage 1 before an LLM rerank.
 *
 * Zero network, zero API key, millisecond latency even at 1000+ manifest
 * entries. Quality floor for retrieval when LLM providers are unreachable.
 */
export function createBM25Provider(options: BM25ProviderOptions = {}): VaultRetrievalProvider {
  const providerName = options.providerName ?? 'bm25'
  return {
    name: providerName,
    available: async () => true,
    retrieve: async (req: VaultRetrievalRequest): Promise<VaultRetrievalResult> => {
      const start = performance.now()
      const docs = req.manifest.map(manifestEntryToDoc)
      const topK = req.topK ?? 10
      const hits = rankByBM25(req.query, docs, { topK })
      const latencyMs = Math.round(performance.now() - start)
      return {
        rankedPaths: hits.map((h) => h.id),
        scores: hits.map((h) => h.score),
        provider: providerName,
        latencyMs,
      }
    },
  }
}
