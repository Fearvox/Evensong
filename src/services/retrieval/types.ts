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
}

export interface VaultRetrievalProvider {
  name: string
  available: () => Promise<boolean>
  retrieve: (request: VaultRetrievalRequest) => Promise<VaultRetrievalResult>
}
