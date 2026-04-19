import { chatCompletionLocalGemma, isLocalGemmaAvailable, type LocalGemmaClient } from '../../api/localGemma.js'
import type { VaultRetrievalProvider, VaultRetrievalRequest, VaultRetrievalResult } from '../types.js'

const SYSTEM_PROMPT = `You are a document retrieval judge. Given a query and a manifest of vault files (each with path, title, retention, access count, summary level), return a JSON array of the file paths most relevant to the query, ordered by relevance.

Rules:
- Output ONLY a valid JSON array of strings. No prose, no code fence.
- Return at most topK paths if provided, else up to 10.
- Use retention score + summary level as prior; use title and excerpt for relevance.
- Return [] if no files are relevant (do not fabricate).`

export function buildJudgePrompt(req: VaultRetrievalRequest): string {
  const topK = req.topK ?? 10
  const manifestJson = req.manifest.map((e) => ({
    path: e.path,
    title: e.title,
    retention: e.retentionScore,
    accessCount: e.accessCount,
    lastAccess: e.lastAccess,
    summaryLevel: e.summaryLevel,
    excerpt: e.excerpt,
  }))
  return `Query: ${req.query}\n\ntopK: ${topK}\n\nManifest:\n${JSON.stringify(manifestJson, null, 2)}\n\nReturn JSON array of up to ${topK} relevant paths.`
}

export function parseJudgeOutput(content: string, manifest: VaultRetrievalRequest['manifest']): string[] {
  const knownPaths = new Set(manifest.map((m) => m.path))
  const trimmed = content.trim()
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      // Hallucination guard: even for well-formed JSON, drop any path the LLM
      // invented that isn't in the manifest. Observed 2026-04-19 E2E with
      // deepseek-v3.2 which occasionally returned a plausible-sounding path
      // that didn't exist.
      return (parsed as string[]).filter((p) => knownPaths.has(p))
    }
  } catch {
    // fall through to heuristic parse
  }
  const mdPathPattern = /[a-zA-Z0-9/_\-.]+\.md/g
  const matches = content.match(mdPathPattern) ?? []
  const found: string[] = []
  for (const candidate of matches) {
    if (knownPaths.has(candidate) && !found.includes(candidate)) {
      found.push(candidate)
    }
  }
  return found
}

export interface AtomicProviderOptions {
  /** Provider name returned in VaultRetrievalResult.provider. Defaults to `atomic:<model-id>`. */
  providerName?: string
  /** Override temperature for the judge call. Low (0.0-0.2) recommended for listwise rank. */
  temperature?: number
  /** Override max tokens for the judge output. Defaults to 1024. */
  maxTokens?: number
}

/**
 * Generic vault retrieval provider over the Atomic Chat gateway.
 * Works with any ATOMIC_MODELS id (grok-3, grok-4-fast-reasoning, MiniMax-M2.7,
 * local Gemma, etc.) via the LocalGemmaClient abstraction (which is just an
 * OpenAI-compat client configured for the Atomic base URL).
 *
 * Wave 2B dogfood 2026-04-19 found grok-3 (866ms avg, 3/3 correct top-1) to
 * be the best speed×quality tradeoff for listwise retrieval judge on the
 * 4-entry reference manifest. Reasoning variants (grok-4-*-fast-reasoning)
 * introduce a <think> pass that hurts short-decision quality.
 */
export function createAtomicProvider(
  client: LocalGemmaClient,
  options: AtomicProviderOptions = {},
): VaultRetrievalProvider {
  const providerName = options.providerName ?? `atomic:${client.model}`
  return {
    name: providerName,
    available: () => isLocalGemmaAvailable(client),
    retrieve: async (req: VaultRetrievalRequest): Promise<VaultRetrievalResult> => {
      const start = Date.now()
      const response = await chatCompletionLocalGemma(client, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildJudgePrompt(req) },
        ],
        temperature: options.temperature ?? 0.1,
        maxTokens: options.maxTokens ?? 1024,
      })
      const rankedPaths = parseJudgeOutput(response.content, req.manifest)
      return { rankedPaths, provider: providerName, latencyMs: Date.now() - start }
    },
  }
}
