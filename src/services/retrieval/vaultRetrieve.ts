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
      return await provider.retrieve(request)
    } catch (err) {
      attempts.push({ provider: provider.name, error: err instanceof Error ? err.message : String(err) })
      continue
    }
  }
  throw new AllProvidersFailedError(attempts)
}
