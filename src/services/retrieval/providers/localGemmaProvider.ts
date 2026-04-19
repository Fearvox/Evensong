import { chatCompletionLocalGemma, isLocalGemmaAvailable, type LocalGemmaClient } from '../../api/localGemma.js'
import type { VaultRetrievalProvider, VaultRetrievalRequest, VaultRetrievalResult } from '../types.js'

const SYSTEM_PROMPT = `You are a document retrieval judge. Given a query and a manifest of vault files (each with path, title, retention, access count, summary level), return a JSON array of the file paths most relevant to the query, ordered by relevance.

Rules:
- Output ONLY a valid JSON array of strings. No prose, no code fence.
- Return at most topK paths if provided, else up to 10.
- Use retention score + summary level as prior; use title and excerpt for relevance.
- Return [] if no files are relevant (do not fabricate).`

function buildUserPrompt(req: VaultRetrievalRequest): string {
  const topK = req.topK ?? 10
  const manifestJson = req.manifest.map(e => ({
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

function parseRankedPaths(content: string, manifest: VaultRetrievalRequest['manifest']): string[] {
  const trimmed = content.trim()
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) return parsed
  } catch {
    // fall through to heuristic parse
  }
  const knownPaths = new Set(manifest.map(m => m.path))
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

export function createLocalGemmaProvider(client: LocalGemmaClient): VaultRetrievalProvider {
  return {
    name: 'local-gemma',
    available: () => isLocalGemmaAvailable(client),
    retrieve: async (req: VaultRetrievalRequest): Promise<VaultRetrievalResult> => {
      const start = Date.now()
      const response = await chatCompletionLocalGemma(client, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(req) },
        ],
        temperature: 0.1,
        maxTokens: 1024,
      })
      const rankedPaths = parseRankedPaths(response.content, req.manifest)
      return { rankedPaths, provider: 'local-gemma', latencyMs: Date.now() - start }
    },
  }
}
