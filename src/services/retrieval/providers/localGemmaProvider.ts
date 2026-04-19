import type { LocalGemmaClient } from '../../api/localGemma.js'
import type { VaultRetrievalProvider } from '../types.js'
import { createAtomicProvider } from './atomicProvider.js'

/**
 * Backward-compatible thin wrapper over `createAtomicProvider`.
 * Pins provider name to `'local-gemma'` for the offline-fallback tier.
 * New code should prefer `createAtomicProvider(client, { providerName })`
 * to make the model choice explicit (e.g. atomic:grok-3 for production).
 */
export function createLocalGemmaProvider(client: LocalGemmaClient): VaultRetrievalProvider {
  return createAtomicProvider(client, { providerName: 'local-gemma' })
}
