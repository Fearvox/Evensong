import type { VaultRetrievalProvider, VaultRetrievalRequest, VaultRetrievalResult } from './types.js'

export interface VaultRetrieveOptions {
  providers: VaultRetrievalProvider[]
}

export class AllProvidersFailedError extends Error {
  readonly attempts: Array<{ provider: string; error: string }>
  constructor(attempts: Array<{ provider: string; error: string }>) {
    super(`All vault retrieval providers failed: ${attempts.map(a => `${a.provider}(${a.error})`).join(', ')}`)
    this.name = 'AllProvidersFailedError'
    this.attempts = attempts
  }
}

function normalizeTopK(topK: number | undefined): number {
  if (topK === undefined || !Number.isFinite(topK)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor(topK))
}

function sanitizeResult(
  result: VaultRetrievalResult,
  request: VaultRetrievalRequest,
): VaultRetrievalResult {
  const knownPaths = new Set(request.manifest.map(entry => entry.path))
  const limit = normalizeTopK(request.topK)
  const rankedPaths: string[] = []
  const scores: number[] | undefined = result.scores ? [] : undefined
  const droppedPaths: string[] = []

  for (const [index, path] of result.rankedPaths.entries()) {
    if (!knownPaths.has(path) || rankedPaths.includes(path)) {
      droppedPaths.push(path)
      continue
    }
    if (rankedPaths.length < limit) {
      rankedPaths.push(path)
      if (scores && result.scores?.[index] !== undefined) scores.push(result.scores[index]!)
    }
  }

  if (result.rankedPaths.length > 0 && rankedPaths.length === 0) {
    throw new Error(`provider returned only stale or duplicate paths (${droppedPaths.length} dropped)`)
  }

  return {
    ...result,
    rankedPaths,
    scores,
    diagnostics: droppedPaths.length > 0
      ? { ...result.diagnostics, droppedPaths }
      : result.diagnostics,
  }
}

export async function vaultRetrieve(
  request: VaultRetrievalRequest,
  options: VaultRetrieveOptions,
): Promise<VaultRetrievalResult> {
  const attempts: Array<{ provider: string; error: string }> = []
  for (const provider of options.providers) {
    let available: boolean
    try {
      available = await provider.available()
    } catch (err) {
      attempts.push({ provider: provider.name, error: `available() threw: ${err instanceof Error ? err.message : String(err)}` })
      continue
    }
    if (!available) {
      attempts.push({ provider: provider.name, error: 'available()=false' })
      continue
    }
    try {
      return sanitizeResult(await provider.retrieve(request), request)
    } catch (err) {
      attempts.push({ provider: provider.name, error: err instanceof Error ? err.message : String(err) })
      continue
    }
  }
  throw new AllProvidersFailedError(attempts)
}
