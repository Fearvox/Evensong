import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { VaultManifestEntry } from './types.js'

/**
 * Minimal RegistryEntry shape matching the _vault/scripts/registry.jsonl rows.
 * We only depend on the fields the manifest needs; the vault-side RawItem
 * definition may have additional fields (sourceUrl, category) that we don't
 * consume here.
 */
export interface RegistryEntry {
  id: string
  title: string
  source: 'url' | 'local'
  sourceUrl?: string
  rawPath: string
  knowledgePath?: string
  status: 'raw' | 'analyzed' | 'archived'
  tags: string[]
  category?: string
  ingestedAt: string
}

/**
 * Minimal DecayEntry shape matching _vault/.meta/decay-scores.json rows.
 */
export interface DecayEntry {
  itemId: string
  score: number
  lastAccess: string
  accessCount: number
  summaryLevel: 'deep' | 'shallow' | 'none'
  nextReviewAt: string
  difficulty: number
}

export interface JoinedEntry {
  id: string
  title: string
  knowledgePath: string
  retentionScore: number
  accessCount: number
  lastAccess: string
  summaryLevel: 'deep' | 'shallow' | 'none'
}

export interface BuildManifestOptions {
  /** Vault root (absolute). Defaults to `<cwd>/_vault`. */
  vaultRoot?: string
  /** Drop entries with retentionScore below this cutoff. Defaults to 0. */
  minRetention?: number
  /** Optional cap on returned entries. */
  limit?: number
  /** Injectable file reader; defaults to node:fs readFileSync utf8. */
  readFile?: (absolutePath: string) => string
  /**
   * If true, populate `entry.body` with a capped slice of the md file's
   * full content so BM25 (or any indexer) can reach terms not present in
   * title/excerpt. Adds ~bodyCapBytes per entry to manifest memory.
   */
  withBody?: boolean
  /** Cap per-entry body content to this many UTF-8 chars. Default 8000. */
  bodyCapChars?: number
}

const DEFAULT_FRESH_DECAY: Omit<DecayEntry, 'itemId'> = {
  score: 1,
  accessCount: 0,
  lastAccess: '',
  summaryLevel: 'deep',
  nextReviewAt: '',
  difficulty: 1,
}

export interface JoinOptions {
  minRetention?: number
}

export function joinRegistryWithDecay(
  registry: RegistryEntry[],
  decay: DecayEntry[],
  options: JoinOptions = {},
): JoinedEntry[] {
  const minRetention = options.minRetention ?? 0
  const decayById = new Map(decay.map((d) => [d.itemId, d]))
  const joined: JoinedEntry[] = []
  for (const r of registry) {
    if (!r.knowledgePath) continue
    const d = decayById.get(r.id) ?? { itemId: r.id, ...DEFAULT_FRESH_DECAY }
    if (d.score < minRetention) continue
    joined.push({
      id: r.id,
      title: r.title,
      knowledgePath: r.knowledgePath,
      retentionScore: d.score,
      accessCount: d.accessCount,
      lastAccess: d.lastAccess,
      summaryLevel: d.summaryLevel,
    })
  }
  return joined
}

/**
 * Extract the first "real" paragraph of the body, skipping:
 *   - the H1 title line
 *   - the metadata blockquote that follows (> Source: ... | Ingested: ...)
 *   - any H2 heading
 *   - list/bullet lines
 *   - thematic breaks (---)
 * Truncates to 200 chars to keep manifest small.
 */
export function extractExcerpt(content: string): string {
  const lines = content.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('#')) continue // any heading
    if (line.startsWith('>')) continue // blockquote (metadata)
    if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s/.test(line)) continue // lists
    if (/^---+$/.test(line)) continue // thematic break
    const trimmed = line.length > 200 ? line.slice(0, 200) : line
    return trimmed
  }
  return ''
}

function readRegistry(jsonl: string): RegistryEntry[] {
  return jsonl
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as RegistryEntry)
}

function readDecayScores(json: string): DecayEntry[] {
  const parsed = JSON.parse(json)
  if (Array.isArray(parsed)) return parsed as DecayEntry[]
  if (parsed && typeof parsed === 'object') return Object.values(parsed) as DecayEntry[]
  return []
}

export async function buildVaultManifest(
  options: BuildManifestOptions = {},
): Promise<VaultManifestEntry[]> {
  const vaultRoot = options.vaultRoot ?? path.join(process.cwd(), '_vault')
  const read = options.readFile ?? ((p: string) => readFileSync(p, 'utf-8'))
  const bodyCapChars = options.bodyCapChars ?? 8000

  const registryPath = path.join(vaultRoot, '.meta', 'registry.jsonl')
  const decayPath = path.join(vaultRoot, '.meta', 'decay-scores.json')

  const registry = readRegistry(read(registryPath))
  const decay = readDecayScores(read(decayPath))

  const joined = joinRegistryWithDecay(registry, decay, { minRetention: options.minRetention })

  const manifest: VaultManifestEntry[] = []
  for (const entry of joined) {
    const absolute = path.join(vaultRoot, entry.knowledgePath)
    let content: string
    try {
      content = read(absolute)
    } catch {
      continue
    }
    const built: VaultManifestEntry = {
      path: entry.knowledgePath,
      title: entry.title,
      retentionScore: entry.retentionScore,
      accessCount: entry.accessCount,
      lastAccess: entry.lastAccess,
      summaryLevel: entry.summaryLevel,
      excerpt: extractExcerpt(content),
    }
    if (options.withBody) {
      built.body = content.length > bodyCapChars ? content.slice(0, bodyCapChars) : content
    }
    manifest.push(built)
    if (options.limit !== undefined && manifest.length >= options.limit) break
  }

  return manifest
}
