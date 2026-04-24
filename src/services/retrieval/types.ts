export interface VaultManifestEntry {
  path: string
  title: string
  retentionScore: number
  accessCount: number
  lastAccess: string
  summaryLevel: 'deep' | 'shallow' | 'none'
  excerpt?: string
  /**
   * Optional full body content (capped). When present, consumers like the
   * BM25 provider can index it in addition to title + excerpt for stronger
   * recall on queries whose terms appear only in the body (e.g. specific
   * acronyms, method names, numeric constants). Populated by
   * buildVaultManifest({ withBody: true }).
   */
  body?: string
}

export interface VaultRetrievalRequest {
  query: string
  manifest: VaultManifestEntry[]
  topK?: number
}

export interface VaultRetrievalResult {
  rankedPaths: string[]
  provider: string
  latencyMs: number
  /**
   * Optional parallel array of relevance scores aligned with rankedPaths.
   * Populated by providers that have access to a numeric relevance signal
   * (e.g. BM25 score, dense-vector cosine, RRF fused score). Consumers
   * like adaptiveHybridProvider use `scores[0] / scores[1]` as a gap
   * ratio to decide whether the stage-1 result is confident enough to
   * skip stage-2 LLM rerank. Providers without a numeric score (pure
   * LLM rerankers) may omit this field.
   */
  scores?: number[]
  /**
   * Optional provider-specific audit data. Benchmark callers use this to
   * distinguish a real structured ranking from parser fallback, skipped stage
   * decisions, or other infrastructure behavior without changing the primary
   * retrieval contract.
   */
  diagnostics?: Record<string, unknown>
}

export interface VaultRetrievalProvider {
  name: string
  available: () => Promise<boolean>
  retrieve: (request: VaultRetrievalRequest) => Promise<VaultRetrievalResult>
}
