export interface VaultManifestEntry {
  path: string
  title: string
  retentionScore: number
  accessCount: number
  lastAccess: string
  summaryLevel: 'deep' | 'shallow' | 'none'
  excerpt?: string
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
