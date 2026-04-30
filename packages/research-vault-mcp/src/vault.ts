// Research Vault MCP Tools
// Resolves vault root via env override, else defaults to the actual data location.
// After Phase 07 T3, CCR/research-vault is a submodule of ds-research-vault.

import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'

const DEFAULT_VAULT_ROOT = `${homedir()}/Documents/Evensong/research-vault`

function getVaultRoot(): string {
  return process.env.VAULT_ROOT ?? DEFAULT_VAULT_ROOT
}

function getKnowledgeDir(): string {
  return join(getVaultRoot(), 'knowledge')
}

function getRawDir(): string {
  return join(getVaultRoot(), 'raw')
}

function getDecayPath(): string {
  return join(getVaultRoot(), '.meta', 'decay-scores.json')
}

function getTaxonomyPath(): string {
  return join(getVaultRoot(), 'knowledge', '_taxonomy.md')
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface VaultEntry {
  id: string
  title: string
  category: string
  path: string
  modified: string
  size: number
}

interface DecayScore {
  itemId: string
  score: number
  lastAccess: string
  accessCount: number
  summaryLevel: 'deep' | 'shallow' | 'none'
  nextReviewAt: string
  difficulty: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeId(raw: string): string {
  return raw
    .replace(/^\d{8}--?\d{4}-/, '')
    .replace(/^(\d{10,})--?/, '')
    .replace(/\.md$/, '')
}

export function normalizeDecayScoresStore(parsed: unknown): DecayScore[] {
  if (Array.isArray(parsed)) return parsed as DecayScore[]
  if (parsed && typeof parsed === 'object') return Object.values(parsed) as DecayScore[]
  return []
}

function loadDecayScores(): DecayScore[] {
  try {
    const parsed = JSON.parse(readFileSync(getDecayPath(), 'utf-8'))
    return normalizeDecayScoresStore(parsed)
  } catch {
    return []
  }
}

function loadTaxonomy(): string {
  try {
    return readFileSync(getTaxonomyPath(), 'utf-8')
  } catch {
    return ''
  }
}

const QUERY_STOPWORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'or', 'the', 'to', 'with'])

function tokenizeQueryText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !QUERY_STOPWORDS.has(token))
}

export function matchesVaultQuery(
  item: Pick<VaultEntry, 'title' | 'id' | 'category'>,
  query: string,
): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true

  const haystack = `${item.title} ${item.id} ${item.category}`.toLowerCase()
  if (haystack.includes(q)) return true

  const haystackTokens = new Set(tokenizeQueryText(haystack))
  const queryTokens = tokenizeQueryText(query)
  if (queryTokens.length === 0) return true
  return queryTokens.every(token => haystackTokens.has(token))
}

function loadFileMeta(filePath: string): { title: string; modified: string; size: number } {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    let title = ''
    for (const line of lines.slice(0, 30)) {
      const m = line.match(/^#\s+(.+)/)
      if (m) { title = m[1]; break }
    }
    const s = statSync(filePath)
    return {
      title: title || normalizeId(basename(filePath)),
      modified: s.mtime.toISOString(),
      size: s.size
    }
  } catch {
    return { title: normalizeId(basename(filePath)), modified: '', size: 0 }
  }
}

function scanKnowledge(): VaultEntry[] {
  const entries: VaultEntry[] = []
  const knowledgeDir = getKnowledgeDir()
  if (!existsSync(knowledgeDir)) return entries

  const categories = readdirSync(knowledgeDir)
  for (const cat of categories) {
    if (cat.startsWith('_')) continue
    const catPath = join(knowledgeDir, cat)
    if (!existsSync(catPath) || !statSync(catPath).isDirectory()) continue

    const subEntries = readdirSync(catPath)
    for (const sub of subEntries) {
      const subPath = join(catPath, sub)
      const subStat = statSync(subPath)

      if (subStat.isDirectory()) {
        const files = readdirSync(subPath).filter(f => f.endsWith('.md'))
        for (const file of files) {
          const fp = join(subPath, file)
          const meta = loadFileMeta(fp)
          entries.push({
            id: normalizeId(file),
            title: meta.title,
            category: `${cat}/${sub}`,
            path: fp,
            modified: meta.modified,
            size: meta.size
          })
        }
      } else if (sub.endsWith('.md')) {
        const meta = loadFileMeta(subPath)
        entries.push({
          id: normalizeId(sub),
          title: meta.title,
          category: cat,
          path: subPath,
          modified: meta.modified,
          size: meta.size
        })
      }
    }
  }
  return entries
}

function scanRaw(): string[] {
  const pending: string[] = []
  const rawDir = getRawDir()
  if (!existsSync(rawDir)) return pending

  try {
    const entries = readdirSync(rawDir)
    for (const entry of entries) {
      if (entry === '_inbox') {
        const inbox = join(rawDir, entry)
        if (existsSync(inbox)) {
          pending.push(...readdirSync(inbox).filter(f => /\.(md|pdf|txt)$/.test(f)))
        }
      } else if (/^\d{4}-\d{2}$/.test(entry)) {
        const monthDir = join(rawDir, entry)
        if (existsSync(monthDir)) {
          pending.push(
            ...readdirSync(monthDir)
              .filter(f => /\.(md|pdf|txt)$/.test(f))
              .map(f => `${entry}/${f}`)
          )
        }
      }
    }
  } catch {}

  return pending
}

// ─── MCP Tools ───────────────────────────────────────────────────────────────

const vaultTools = [
  {
    name: 'vault_search',
    description: 'Search the Research Vault knowledge base. Returns analyzed papers with retention scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (matches title, category)' },
        category: { type: 'string', description: 'Filter by category (e.g., "ai-agents/benchmarking")' },
        limit: { type: 'number', description: 'Max results (default 10)' }
      }
    },
    call: async ({ query, category, limit = 10 }: { query?: string; category?: string; limit?: number }) => {
      let items = scanKnowledge()
      const scores = loadDecayScores()
      const scoreMap = new Map(scores.map(s => [normalizeId(s.itemId), s]))

      if (category) {
        items = items.filter(item =>
          item.category === category || item.category.startsWith(category + '/')
        )
      }

      if (query) {
        items = items.filter(item => matchesVaultQuery(item, query))
      }

      const results = items.slice(0, limit).map(item => {
        const sid = item.id.replace(/--/g, '-')
        const score = scoreMap.get(item.id) || scoreMap.get(sid)
        return {
          id: item.id,
          title: item.title,
          category: item.category,
          score: score?.score ?? null,
          summaryLevel: score?.summaryLevel ?? null,
          nextReview: score?.nextReviewAt ?? null,
          accessCount: score?.accessCount ?? 0,
          modified: item.modified
        }
      })

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ query, category, results, total: results.length }, null, 2)
        }]
      }
    }
  },

  {
    name: 'vault_status',
    description: 'Get Research Vault health — item counts by decay level, top/bottom retention.',
    inputSchema: { type: 'object', properties: {} },
    call: async () => {
      const scores = loadDecayScores()
      const entries = scanKnowledge()
      const deep = scores.filter(s => s.summaryLevel === 'deep')
      const shallow = scores.filter(s => s.summaryLevel === 'shallow')
      const none = scores.filter(s => s.summaryLevel === 'none')
      const sorted = [...scores].sort((a, b) => b.score - a.score)

      const top5 = sorted.slice(0, 5).map(s => {
        const sid = s.itemId.replace(/--/g, '-')
        const entry = entries.find(e => normalizeId(e.id) === normalizeId(s.itemId) || normalizeId(e.id) === normalizeId(sid))
        return { itemId: s.itemId, score: s.score, accesses: s.accessCount, title: entry?.title || s.itemId }
      })
      const bottom5 = sorted.slice(-5).reverse().map(s => {
        const sid = s.itemId.replace(/--/g, '-')
        const entry = entries.find(e => normalizeId(e.id) === normalizeId(s.itemId) || normalizeId(e.id) === normalizeId(sid))
        return { itemId: s.itemId, score: s.score, lastAccess: s.lastAccess.slice(0, 10), title: entry?.title || s.itemId }
      })

      const pending = scanRaw()
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            total: entries.length,
            analyzed: scores.length,
            deep: deep.length,
            shallow: shallow.length,
            dormant: none.length,
            pending_raw: pending.length,
            top5,
            bottom5
          }, null, 2)
        }]
      }
    }
  },

  {
    name: 'vault_batch_analyze',
    description: 'Check batch analyze status and pending papers in the raw queue.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Preview N papers (default 5)' }
      }
    },
    call: async ({ count = 5 }: { count?: number } = {}) => {
      const pending = scanRaw()
      const entries = scanKnowledge()
      const analyzedIds = new Set(entries.map(e => normalizeId(e.id)))
      const unanalyzed = pending.filter(p => {
        const id = normalizeId(p)
        return !analyzedIds.has(id)
      })

      if (unanalyzed.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ message: 'Queue empty — all papers analyzed', analyzed: entries.length }) }] }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `${unanalyzed.length} papers pending analysis`,
            pending: unanalyzed.length,
            preview: unanalyzed.slice(0, count),
            hint: 'cd ~/Desktop/research-vault && bun run scripts/batch-analyze.ts --count N'
          }, null, 2)
        }]
      }
    }
  },

  {
    name: 'vault_taxonomy',
    description: 'Get the Research Vault taxonomy — all categories and counts.',
    inputSchema: { type: 'object', properties: {} },
    call: async () => {
      const taxonomy = loadTaxonomy()
      const entries = scanKnowledge()
      const catCounts: Record<string, number> = {}
      for (const e of entries) catCounts[e.category] = (catCounts[e.category] || 0) + 1

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ taxonomy, categories: catCounts }, null, 2)
        }]
      }
    }
  }
]

export { vaultTools, scanKnowledge, scanRaw, loadDecayScores, normalizeId }
