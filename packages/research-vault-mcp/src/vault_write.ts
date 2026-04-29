import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, unlinkSync, realpathSync, readdirSync } from 'fs'
import { join, dirname, basename, resolve as pathResolve } from 'path'
import { homedir } from 'os'
import { IngestJobStore, computeChecksum } from './vault_jobs.js'
import { parseArxivId, fetchArxivMetadata } from './ingest/arxiv.js'
import { fetchHtml } from './ingest/html.js'
import type { VaultEntry, RawIngestInput, NoteSaveInput, VaultGetInput, VaultDeleteInput, DecayScore } from './types.js'

const VAULT_ROOT = process.env.VAULT_ROOT ?? `${homedir()}/Documents/Evensong/research-vault`
const KNOWLEDGE_DIR = join(VAULT_ROOT, 'knowledge')
const RAW_DIR = join(VAULT_ROOT, 'raw')
const DECAY_PATH = join(VAULT_ROOT, '.meta', 'decay-scores.json')
const CHECKSUMS_PATH = join(VAULT_ROOT, '.meta', 'checksums.json')

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

function safePath(root: string, target: string): string {
  const joined = join(root, target)
  let resolved: string
  try {
    resolved = realpathSync(joined)
  } catch {
    // Path doesn't exist yet (new file). Use resolve to normalize .. components
    // and verify the final path stays within root.
    resolved = pathResolve(joined)
  }
  // Normalize both to remove trailing slashes for prefix comparison
  const rootNorm = root.replace(/\\/g, '/').replace(/\/$/, '')
  const resolvedNorm = resolved.replace(/\\/g, '/').replace(/\/$/, '')
  if (!resolvedNorm.startsWith(rootNorm + '/') && resolvedNorm !== rootNorm) {
    throw new Error('Path traversal detected: target outside vault root')
  }
  return resolved
}

export function normalizeId(raw: string): string {
  return raw
    .replace(/^\d{8}--?\d{4}-/, '')
    .replace(/^(\d{10,})--?/, '')
    .replace(/\.md$/, '')
}

function loadDecayScores(): Record<string, DecayScore> {
  try { return JSON.parse(readFileSync(DECAY_PATH, 'utf-8')) } catch { return {} }
}

function saveDecayScores(scores: Record<string, DecayScore>) {
  ensureDir(dirname(DECAY_PATH))
  writeFileSync(DECAY_PATH, JSON.stringify(scores, null, 2), 'utf-8')
}

function loadChecksums(): Record<string, { sha256: string; writtenAt: string }> {
  try { return JSON.parse(readFileSync(CHECKSUMS_PATH, 'utf-8')) } catch { return {} }
}

function saveChecksums(store: Record<string, { sha256: string; writtenAt: string }>) {
  ensureDir(dirname(CHECKSUMS_PATH))
  writeFileSync(CHECKSUMS_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

// ─── ingest helpers ──────────────────────────────────────────────────────────────

const jobStore = new IngestJobStore(VAULT_ROOT)

async function ingestArxiv(value: string, category: string) {
  const id = parseArxivId(value)
  if (!id) throw new Error(`Invalid ArXiv ID: ${value}`)

  const job = await jobStore.createJob({ source: 'arxiv', value: id, category })
  await jobStore.updateJob(job.jobId, { status: 'fetching' })

  const metadata = await fetchArxivMetadata(id)
  metadata.arxivId = id

  const metaPath = join(RAW_DIR, category, `arxiv-${id}.meta.json`)
  ensureDir(dirname(metaPath))
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8')

  const hash = await computeChecksum(metaPath)
  const checksums = loadChecksums()
  checksums[metaPath] = { sha256: hash, writtenAt: new Date().toISOString() }
  saveChecksums(checksums)

  await jobStore.updateJob(job.jobId, { status: 'queued', rawPath: metaPath, metadata })
  return job
}

async function ingestUrl(value: string, category: string) {
  const job = await jobStore.createJob({ source: 'url', value, category })
  await jobStore.updateJob(job.jobId, { status: 'fetching' })

  ;(async () => {
    try {
      const text = await fetchHtml(value)
      const safeName = value.replace(/[^a-z0-9]/gi, '_').slice(0, 64)
      const rawPath = join(RAW_DIR, category, `${Date.now()}--${safeName}.html`)
      ensureDir(dirname(rawPath))
      writeFileSync(rawPath, text, 'utf-8')

      const hash = await computeChecksum(rawPath)
      const checksums = loadChecksums()
      checksums[rawPath] = { sha256: hash, writtenAt: new Date().toISOString() }
      saveChecksums(checksums)

      await jobStore.updateJob(job.jobId, { status: 'queued', rawPath })
    } catch (e: unknown) {
      await jobStore.updateJob(job.jobId, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
    }
  })()

  return job
}

async function ingestFile(value: string, category: string) {
  if (!existsSync(value)) throw new Error(`File not found: ${value}`)
  const job = await jobStore.createJob({ source: 'file', value, category })
  const destDir = join(RAW_DIR, category)
  ensureDir(destDir)
  const destPath = join(destDir, `${Date.now()}--${basename(value)}`)
  const content = readFileSync(value)
  writeFileSync(destPath, content)

  const hash = await computeChecksum(destPath)
  const checksums = loadChecksums()
  checksums[destPath] = { sha256: hash, writtenAt: new Date().toISOString() }
  saveChecksums(checksums)

  await jobStore.updateJob(job.jobId, { status: 'queued', rawPath: destPath })
  return job
}

// ─── vault_note_save ──────────────────────────────────────────────────────────

async function saveNote(input: NoteSaveInput) {
  const safeTitle = input.title.replace(/[^a-z0-9]/gi, '-').slice(0, 32)
  const id = `${Date.now()}--${safeTitle}`
  const filePath = safePath(KNOWLEDGE_DIR, join(input.category, `${id}.md`))
  ensureDir(dirname(filePath))
  const content = `# ${input.title}\n\n${input.content}\n`
  writeFileSync(filePath, content, 'utf-8')

  const scores = loadDecayScores()
  scores[id] = {
    itemId: id, score: 0.5, lastAccess: new Date().toISOString(),
    accessCount: 0, summaryLevel: input.summaryLevel ?? 'none',
    nextReviewAt: new Date().toISOString(), difficulty: 0.5
  }
  saveDecayScores(scores)

  const hash = await computeChecksum(filePath)
  const checksums = loadChecksums()
  checksums[filePath] = { sha256: hash, writtenAt: new Date().toISOString() }
  saveChecksums(checksums)

  return { id, path: filePath, writtenAt: new Date().toISOString() }
}

// ─── vault_get ────────────────────────────────────────────────────────────────

function getEntry(input: VaultGetInput) {
  let filePath: string

  if (input.path) {
    filePath = safePath(VAULT_ROOT, input.path)
  } else if (input.id) {
    const entry = scanKnowledge().find(e => normalizeId(e.id) === normalizeId(input.id!))
    if (!entry) throw new Error(`Entry not found: ${input.id}`)
    filePath = entry.path
  } else {
    throw new Error('id or path required')
  }

  const content = readFileSync(filePath, 'utf-8')
  const s = statSync(filePath)
  const relPath = filePath.replace(VAULT_ROOT + '/', '')

  return {
    id: normalizeId(basename(filePath)),
    title: (content.match(/^#\s+(.+)/m)?.[1]) ?? normalizeId(basename(filePath)),
    category: relPath.includes('/') ? relPath.split('/').slice(0, -1).join('/') : '',
    content,
    modified: s.mtime.toISOString(),
    size: s.size
  }
}

// ─── vault_delete ─────────────────────────────────────────────────────────────

function deleteEntry(input: VaultDeleteInput) {
  let filePath: string

  if (input.path) {
    filePath = safePath(VAULT_ROOT, input.path)
  } else if (input.id) {
    const entry = scanKnowledge().find(e => normalizeId(e.id) === normalizeId(input.id!))
    if (!entry) throw new Error(`Entry not found: ${input.id}`)
    filePath = entry.path
  } else {
    throw new Error('id or path required')
  }

  unlinkSync(filePath)

  const id = normalizeId(basename(filePath))
  const scores = loadDecayScores()
  delete scores[id]
  saveDecayScores(scores)

  const checksums = loadChecksums()
  delete checksums[filePath]
  saveChecksums(checksums)

  return { deleted: true, path: filePath }
}

// ─── scanKnowledge ───────────────────────────────────────────────────────────

function scanKnowledge(): VaultEntry[] {
  const entries: VaultEntry[] = []
  if (!existsSync(KNOWLEDGE_DIR)) return entries
  try {
    const categories = readdirSync(KNOWLEDGE_DIR)
    for (const cat of categories) {
      if (cat.startsWith('_')) continue
      const catPath = join(KNOWLEDGE_DIR, cat)
      if (!existsSync(catPath) || !statSync(catPath).isDirectory()) continue
      try {
        const files = readdirSync(catPath).filter((f: string) => f.endsWith('.md'))
        for (const file of files) {
          const fp = join(catPath, file)
          const s = statSync(fp)
          entries.push({
            id: normalizeId(file),
            title: normalizeId(file),
            category: cat,
            path: fp,
            modified: s.mtime.toISOString(),
            size: s.size
          })
        }
      } catch {}
    }
  } catch {}
  return entries
}

// ─── Tool Definitions ──────────────────────────────────────────────────────────

export const vaultWriteTools = [
  {
    name: 'vault_raw_ingest',
    description: 'Fire-and-forget ingest of URL/file/ArXiv to raw vault layer. Returns jobId for async progress polling.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['url', 'file', 'arxiv'] },
        value: { type: 'string', description: 'URL / absolute file path / ArXiv ID or URL' },
        category: { type: 'string', description: 'raw/ subdirectory, default "_inbox"' },
        priority: { type: 'string', enum: ['high', 'low'], default: 'low' },
        arxivMetadata: { type: 'boolean', description: 'ArXiv: fetch metadata before storing, default true' }
      },
      required: ['source', 'value']
    },
    call: async (args: RawIngestInput) => {
      try {
        const category = args.category ?? '_inbox'
        let job
        if (args.source === 'arxiv') {
          job = await ingestArxiv(args.value, category)
        } else if (args.source === 'url') {
          job = await ingestUrl(args.value, category)
        } else {
          job = await ingestFile(args.value, category)
        }
        return { content: [{ type: 'text', text: JSON.stringify(job) }] }
      } catch (e: unknown) {
        return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }
      }
    }
  },

  {
    name: 'vault_note_save',
    description: 'Write a structured note to the knowledge layer.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        summaryLevel: { type: 'string', enum: ['deep', 'shallow', 'none'] }
      },
      required: ['title', 'content', 'category']
    },
    call: async (args: NoteSaveInput) => {
      try {
        const result = await saveNote(args)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (e: unknown) {
        return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }
      }
    }
  },

  {
    name: 'vault_get',
    description: 'Read full content of a vault entry by id or path.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        path: { type: 'string' }
      }
    },
    call: async (args: VaultGetInput) => {
      try {
        const result = getEntry(args)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (e: unknown) {
        return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }
      }
    }
  },

  {
    name: 'vault_delete',
    description: 'Delete a vault entry (raw or knowledge).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        path: { type: 'string' }
      }
    },
    call: async (args: VaultDeleteInput) => {
      try {
        const result = deleteEntry(args)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (e: unknown) {
        return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }
      }
    }
  }
]
