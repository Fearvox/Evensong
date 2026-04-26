# research-vault-mcp Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vault read/write tools, amplify dual-mode streaming, and stdio transport fallback to `packages/research-vault-mcp`.

**Architecture:**
- 4 new files for write pipeline: `vault_write.ts`, `vault_jobs.ts`, `ingest/arxiv.ts`, `ingest/html.ts`, `ingest/pdf.ts`
- 1 new `types.ts` consolidating shared interfaces
- `server.ts` enhanced with stdio transport option (CLI flag `--transport stdio`)
- `amplify.ts` enhanced with `stream: true` dual-mode via MCP SDK `onProgress`
- Existing tests unchanged; new tests per feature

**Tech Stack:** Bun runtime, TypeScript, MCP SDK `@anthropic-ai/sdk`, built-in `bun test`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | **CREATE** | All shared interfaces: `VaultEntry`, `IngestJob`, `IngestStatus`, `RawIngestInput`, `NoteSaveInput`, `VaultGetInput`, `VaultDeleteInput` |
| `src/vault_jobs.ts` | **CREATE** | `IngestJobStore` class: read/write `.meta/ingest-jobs.json`, job lifecycle (queued→fetching→parsing→done), `checksum` compute + verify |
| `src/ingest/arxiv.ts` | **CREATE** | `fetchArxivMetadata(id)`: parse ID from 3 URL forms, call ArXiv API, extract title/authors/abstract/categories |
| `src/ingest/html.ts` | **CREATE** | `fetchHtml(url)`: fetch + sanitize, strip scripts/styles, return plain text markdown |
| `src/ingest/pdf.ts` | **CREATE** | `convertPdfToMarkdown(filePath)`: try `markitdown` first, fallback `pandoc --to markdown` using `Bun.spawn` |
| `src/vault_write.ts` | **CREATE** | Tools: `vault_raw_ingest`, `vault_note_save`, `vault_get`, `vault_delete` |
| `src/vault.ts` | **MODIFY** | Export `VaultEntry`, `DecayScore`, `normalizeId` for use by `vault_write.ts` |
| `src/amplify.ts` | **MODIFY** | Add `stream?: boolean` param to `amplify_chat`; `stream: true` path yields partial chunks via callback |
| `src/server.ts` | **MODIFY** | Add `MCP_TRANSPORT` env-based transport switch; stdio mode reads stdin/stdout JSON-RPC; wire `vaultWriteTools` |
| `bin/research-vault-mcp.mjs` | **MODIFY** | Parse `--transport stdio` / `--transport tailscale` and pass via env var `MCP_TRANSPORT` to server |
| `package.json` | **MODIFY** | Version: `1.0.0` → `1.1.0`; add `markitdown` dep |
| `__tests__/vault_write.test.ts` | **CREATE** | Round-trip tests: raw_ingest → get → delete |
| `__tests__/ingest.test.ts` | **CREATE** | ArXiv ID parsing, mock ArXiv API response |
| `__tests__/vault_jobs.test.ts` | **CREATE** | Job store create/update/get, checksum compute/verify |

---

## Task 1: `src/types.ts` — Shared Types

**Files:**
- Create: `packages/research-vault-mcp/src/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// packages/research-vault-mcp/src/types.ts

export interface VaultEntry {
  id: string
  title: string
  category: string
  path: string
  modified: string
  size: number
}

export interface DecayScore {
  itemId: string
  score: number
  lastAccess: string
  accessCount: number
  summaryLevel: 'deep' | 'shallow' | 'none'
  nextReviewAt: string
  difficulty: number
}

// ─── Ingest Job Types ───────────────────────────────────────────

export type IngestStatus = 'queued' | 'fetching' | 'parsing' | 'done' | 'failed'

export interface IngestJob {
  jobId: string
  source: 'url' | 'file' | 'arxiv'
  value: string
  category: string
  status: IngestStatus
  rawPath: string | null
  metadata: ArxivMetadata | null
  error?: string
  createdAt: string
  updatedAt: string
}

export interface ArxivMetadata {
  title: string | null
  authors: string[] | null
  abstract: string | null
  arxivId: string | null
  categories: string[] | null
}

// ─── Tool Input/Output Types ───────────────────────────────────

export interface RawIngestInput {
  source: 'url' | 'file' | 'arxiv'
  value: string
  category?: string   // defaults to "inbox"
  priority?: 'high' | 'low'
  arxivMetadata?: boolean  // ArXiv only: prefetch metadata before storing, default true
}

export interface NoteSaveInput {
  title: string
  content: string
  category: string
  tags?: string[]
  summaryLevel?: 'deep' | 'shallow' | 'none'
}

export interface VaultGetInput {
  id?: string
  path?: string
}

export interface VaultDeleteInput {
  id?: string
  path?: string
}

// ─── Checksum Types ────────────────────────────────────────────

export type ChecksumStore = Record<string, { sha256: string; writtenAt: string }>
```

- [ ] **Step 2: Commit**

```bash
cd <REPO_ROOT>
git add packages/research-vault-mcp/src/types.ts
git commit -m "feat(mcp): add shared types for vault tools"
```

---

## Task 2: `src/vault_jobs.ts` — Ingest Job Store

**Files:**
- Create: `packages/research-vault-mcp/src/vault_jobs.ts`
- Test: `packages/research-vault-mcp/__tests__/vault_jobs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/research-vault-mcp/__tests__/vault_jobs.test.ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const TMP = join(tmpdir(), 'vault_jobs_test')

beforeEach(() => {
  try { rmSync(TMP, { recursive: true }) } catch {}
  mkdirSync(join(TMP, '.meta'), { recursive: true })
})

describe('IngestJobStore', () => {
  test('createJob returns a job with queued status', async () => {
    const { IngestJobStore } = await import('../src/vault_jobs.ts')
    const store = new IngestJobStore(TMP)
    const job = await store.createJob({ source: 'url', value: 'https://example.com', category: 'inbox' })
    expect(job.status).toBe('queued')
    expect(job.jobId).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('updateJob transitions status', async () => {
    const { IngestJobStore } = await import('../src/vault_jobs.ts')
    const store = new IngestJobStore(TMP)
    const job = await store.createJob({ source: 'arxiv', value: '2501.00001', category: 'inbox' })
    await store.updateJob(job.jobId, { status: 'fetching', rawPath: '/tmp/test.pdf' })
    const updated = await store.getJob(job.jobId)
    expect(updated!.status).toBe('fetching')
    expect(updated!.rawPath).toBe('/tmp/test.pdf')
  })

  test('computeChecksum returns a sha256 string', async () => {
    const { computeChecksum } = await import('../src/vault_jobs.ts')
    const { writeFileSync } = await import('fs')
    writeFileSync(join(TMP, 'test.txt'), 'hello world')
    const hash = await computeChecksum(join(TMP, 'test.txt'))
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  test('verifyChecksum returns true for matching hash', async () => {
    const { computeChecksum, verifyChecksum } = await import('../src/vault_jobs.ts')
    const { writeFileSync } = await import('fs')
    writeFileSync(join(TMP, 'verify.txt'), 'test')
    const hash = await computeChecksum(join(TMP, 'verify.txt'))
    const ok = await verifyChecksum(join(TMP, 'verify.txt'), hash)
    expect(ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd <REPO_ROOT>/packages/research-vault-mcp
bun test __tests__/vault_jobs.test.ts
# Expected: FAIL — file does not exist
```

- [ ] **Step 3: Write the implementation**

```typescript
// packages/research-vault-mcp/src/vault_jobs.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { randomUUID } from 'crypto'
import type { IngestJob, IngestStatus, RawIngestInput, ChecksumStore } from './types.js'

const JOBS_FILE = '.meta/ingest-jobs.json'
const CHECKSUMS_FILE = '.meta/checksums.json'

export class IngestJobStore {
  private metaDir: string

  constructor(private vaultRoot: string) {
    this.metaDir = join(this.vaultRoot, '.meta')
    if (!existsSync(this.metaDir)) mkdirSync(this.metaDir, { recursive: true })
  }

  private jobsPath() { return join(this.metaDir, 'ingest-jobs.json') }
  private checksumsPath() { return join(this.metaDir, 'checksums.json') }

  private loadJobs(): Record<string, IngestJob> {
    try {
      return JSON.parse(readFileSync(this.jobsPath(), 'utf-8'))
    } catch { return {} }
  }

  private saveJobs(jobs: Record<string, IngestJob>) {
    writeFileSync(this.jobsPath(), JSON.stringify(jobs, null, 2), 'utf-8')
  }

  private loadChecksums(): ChecksumStore {
    try {
      return JSON.parse(readFileSync(this.checksumsPath(), 'utf-8'))
    } catch { return {} }
  }

  private saveChecksums(store: ChecksumStore) {
    writeFileSync(this.checksumsPath(), JSON.stringify(store, null, 2), 'utf-8')
  }

  async createJob(input: RawIngestInput): Promise<IngestJob> {
    const jobs = this.loadJobs()
    const now = new Date().toISOString()
    const job: IngestJob = {
      jobId: randomUUID(),
      source: input.source,
      value: input.value,
      category: input.category ?? 'inbox',
      status: 'queued',
      rawPath: null,
      metadata: null,
      createdAt: now,
      updatedAt: now
    }
    jobs[job.jobId] = job
    this.saveJobs(jobs)
    return job
  }

  async getJob(jobId: string): Promise<IngestJob | null> {
    return this.loadJobs()[jobId] ?? null
  }

  async updateJob(jobId: string, updates: Partial<IngestJob>): Promise<IngestJob | null> {
    const jobs = this.loadJobs()
    const job = jobs[jobId]
    if (!job) return null
    jobs[jobId] = { ...job, ...updates, updatedAt: new Date().toISOString() }
    this.saveJobs(jobs)
    return jobs[jobId]
  }

  async getAllJobs(): Promise<IngestJob[]> {
    return Object.values(this.loadJobs())
  }
}

export async function computeChecksum(filePath: string): Promise<string> {
  const file = Bun.file(filePath)
  const buffer = await file.arrayBuffer()
  const hash = createHash('sha256')
  hash.update(Buffer.from(buffer))
  return hash.digest('hex')
}

export async function verifyChecksum(filePath: string, expected: string): Promise<boolean> {
  const actual = await computeChecksum(filePath)
  return actual === expected
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd <REPO_ROOT>/packages/research-vault-mcp
bun test __tests__/vault_jobs.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add packages/research-vault-mcp/src/vault_jobs.ts packages/research-vault-mcp/__tests__/vault_jobs.test.ts
git commit -m "feat(mcp): add IngestJobStore and checksum utilities"
```

---

## Task 3: `src/ingest/arxiv.ts` — ArXiv API + ID Parsing

**Files:**
- Create: `packages/research-vault-mcp/src/ingest/arxiv.ts`
- Test: `packages/research-vault-mcp/__tests__/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/research-vault-mcp/__tests__/ingest.test.ts
import { describe, test, expect } from 'bun:test'
import { parseArxivId } from '../src/ingest/arxiv.ts'

describe('parseArxivId', () => {
  test('parses full URL with abs path', () => {
    expect(parseArxivId('https://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('parses abs/ URL shorthand', () => {
    expect(parseArxivId('abs/2501.00001')).toBe('2501.00001')
  })
  test('parses bare ID', () => {
    expect(parseArxivId('2501.00001')).toBe('2501.00001')
  })
  test('parses arxiv.org/abs/ URL without https', () => {
    expect(parseArxivId('http://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('returns null for non-arxiv URL', () => {
    expect(parseArxivId('https://example.com/paper')).toBeNull()
  })
  test('handles versioned IDs like 2501.00001v2', () => {
    expect(parseArxivId('2501.00001v2')).toBe('2501.00001v2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd <REPO_ROOT>/packages/research-vault-mcp
bun test __tests__/ingest.test.ts
# Expected: FAIL — file does not exist
```

- [ ] **Step 3: Write the implementation**

```typescript
// packages/research-vault-mcp/src/ingest/arxiv.ts
import type { ArxivMetadata } from '../types.js'

const ARXIV_API = 'https://export.arxiv.org/api/query'

/**
 * Parse an ArXiv ID from various URL formats.
 * Handles:
 *   https://arxiv.org/abs/2501.00001
 *   http://arxiv.org/abs/2501.00001v2
 *   abs/2501.00001
 *   2501.00001v2
 */
export function parseArxivId(value: string): string | null {
  // Bare versioned ID: 2501.00001v2
  if (/^\d{4}\.\d{4,}(v\d+)?$/.test(value.trim())) {
    return value.trim()
  }
  // URL or abs/ shorthand
  const m = value.match(/(?:arxiv\.org\/abs\/|abs\/?)(\d{4}\.\d{4,}(?:v\d+)?)/i)
  return m ? m[1] : null
}

export async function fetchArxivMetadata(id: string): Promise<ArxivMetadata> {
  const url = `${ARXIV_API}?id_list=${id}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ArXiv API error: ${res.status}`)
  const xml = await res.text()
  return parseArxivXml(xml)
}

function parseArxivXml(xml: string): ArxivMetadata {
  // Extract title (first <title> is the paper title, not author names)
  const titleMatch = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch
    ? titleMatch[1].replace(/\s+/g, ' ').trim()
    : null

  // Extract abstract/summary
  const summaryMatch = xml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)
  const abstract = summaryMatch
    ? summaryMatch[1].replace(/\s+/g, ' ').trim()
    : null

  // Extract all authors
  const authors: string[] = []
  const authorRe = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi
  let m
  while ((m = authorRe.exec(xml)) !== null) {
    authors.push(m[1].replace(/\s+/g, ' ').trim())
  }

  // Extract categories
  const categories: string[] = []
  const catRe = /<category[^>]*term="([^"]+)"/gi
  while ((m = catRe.exec(xml)) !== null) categories.push(m[1])

  return {
    title,
    authors: authors.length ? authors : null,
    abstract,
    arxivId: null,  // set by caller
    categories: categories.length ? categories : null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd <REPO_ROOT>/packages/research-vault-mcp
bun test __tests__/ingest.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add packages/research-vault-mcp/src/ingest/arxiv.ts packages/research-vault-mcp/__tests__/ingest.test.ts
git commit -m "feat(mcp): add ArXiv metadata fetch and ID parsing"
```

---

## Task 4: `src/ingest/html.ts` and `src/ingest/pdf.ts`

**Files:**
- Create: `packages/research-vault-mcp/src/ingest/html.ts`
- Create: `packages/research-vault-mcp/src/ingest/pdf.ts`

- [ ] **Step 1: Write html.ts**

```typescript
// packages/research-vault-mcp/src/ingest/html.ts

/**
 * Fetch a URL and convert HTML to plain markdown-like text.
 * Strips scripts, styles, nav, footer, header, aside elements.
 * Uses Bun's native fetch — no external dependencies.
 */
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 research-vault-mcp/1.1.0',
      'Accept': 'text/html'
    }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  const html = await res.text()

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Block elements → newlines
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, '\n')

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Collapse whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  return text
}
```

- [ ] **Step 2: Write pdf.ts using `Bun.spawn`** (no `child_process`)

```typescript
// packages/research-vault-mcp/src/ingest/pdf.ts
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Convert PDF to markdown using markitdown (preferred) or pandoc.
 * Uses Bun.spawn for process execution — no child_process module needed.
 * Returns null if neither tool is available.
 */
export async function convertPdfToMarkdown(pdfPath: string): Promise<string | null> {
  // Try markitdown first
  try {
    const proc = Bun.spawn(['markitdown', pdfPath], { timeout: 60_000 })
    const [exited, stdout, stderr] = await proc.exited
    if (exited === 0 && stdout.trim()) return stdout
  } catch {}

  // Fallback: pandoc
  try {
    const proc = Bun.spawn(['pandoc', '--to', 'markdown', pdfPath], { timeout: 60_000 })
    const [exited, stdout, stderr] = await proc.exited
    if (exited === 0 && stdout.trim()) return stdout
  } catch {}

  return null
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/research-vault-mcp/src/ingest/html.ts packages/research-vault-mcp/src/ingest/pdf.ts
git commit -m "feat(mcp): add HTML fetcher and PDF converter (Bun.spawn, no child_process)"
```

---

## Task 5: `src/vault_write.ts` — Core Write Tools

**Files:**
- Create: `packages/research-vault-mcp/src/vault_write.ts`
- Test: `packages/research-vault-mcp/__tests__/vault_write.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/research-vault-mcp/__tests__/vault_write.test.ts
import { describe, test, expect, beforeEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const TMP = join(tmpdir(), 'vault_write_test')

beforeEach(() => {
  try { rmSync(TMP, { recursive: true }) } catch {}
  mkdirSync(join(TMP, '.meta'), { recursive: true })
  mkdirSync(join(TMP, 'knowledge', 'test'), { recursive: true })
  mkdirSync(join(TMP, 'raw', 'inbox'), { recursive: true })
  process.env.VAULT_ROOT = TMP
})

describe('vault_raw_ingest', () => {
  test('creates a job for url source', async () => {
    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const tool = vaultWriteTools.find(t => t.name === 'vault_raw_ingest')!
    const result = await tool.call({ source: 'url', value: 'https://example.com', category: 'inbox' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.jobId).toMatch(/^[0-9a-f-]{36}$/)
    expect(parsed.status).toBe('queued')
  })
})

describe('vault_note_save', () => {
  test('writes a markdown file and returns id + path', async () => {
    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const tool = vaultWriteTools.find(t => t.name === 'vault_note_save')!
    const result = await tool.call({
      title: 'Test Note',
      content: '# Test\n\nHello world',
      category: 'test'
    })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.id).toBeTruthy()
    expect(parsed.path).toContain('knowledge/test/')
    // Verify file was actually written
    const exists = await import('fs').then(fs => fs.existsSync(parsed.path))
    expect(exists).toBe(true)
  })

  test('rejects path traversal in category', async () => {
    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const tool = vaultWriteTools.find(t => t.name === 'vault_note_save')!
    const result = await tool.call({
      title: 'Bad',
      content: 'Bad content',
      category: '../../../etc/passwd'
    })
    expect(result.isError || result.content[0].text.toLowerCase()).toMatch(/traversal|invalid|outside/i)
  })
})

describe('vault_get', () => {
  test('retrieves content by id', async () => {
    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const saveTool = vaultWriteTools.find(t => t.name === 'vault_note_save')!
    const getTool = vaultWriteTools.find(t => t.name === 'vault_get')!
    const saveResult = await saveTool.call({ title: 'Get Test', content: 'Secret content', category: 'test' })
    const { id } = JSON.parse(saveResult.content[0].text)
    const getResult = await getTool.call({ id })
    const parsed = JSON.parse(getResult.content[0].text)
    expect(parsed.content).toContain('Secret content')
  })
})

describe('vault_delete', () => {
  test('deletes entry by id', async () => {
    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const saveTool = vaultWriteTools.find(t => t.name === 'vault_note_save')!
    const deleteTool = vaultWriteTools.find(t => t.name === 'vault_delete')!
    const saveResult = await saveTool.call({ title: 'Delete Me', content: 'To be deleted', category: 'test' })
    const { id } = JSON.parse(saveResult.content[0].text)
    const delResult = await deleteTool.call({ id })
    const { deleted, path } = JSON.parse(delResult.content[0].text)
    expect(deleted).toBe(true)
    const exists = await import('fs').then(fs => fs.existsSync(path))
    expect(exists).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd <REPO_ROOT>/packages/research-vault-mcp
bun test __tests__/vault_write.test.ts
# Expected: FAIL — file does not exist
```

- [ ] **Step 3: Write the implementation**

```typescript
// packages/research-vault-mcp/src/vault_write.ts
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, unlinkSync, realpathSync, readdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { homedir } from 'os'
import { IngestJobStore, computeChecksum } from './vault_jobs.js'
import { parseArxivId, fetchArxivMetadata } from './ingest/arxiv.js'
import { fetchHtml } from './ingest/html.js'
import type { VaultEntry, RawIngestInput, NoteSaveInput, VaultGetInput, VaultDeleteInput } from './types.js'

const VAULT_ROOT = process.env.VAULT_ROOT ?? `${homedir()}/Documents/Evensong/research-vault`
const KNOWLEDGE_DIR = join(VAULT_ROOT, 'knowledge')
const RAW_DIR = join(VAULT_ROOT, 'raw')
const DECAY_PATH = join(VAULT_ROOT, '.meta', 'decay-scores.json')
const CHECKSUMS_PATH = join(VAULT_ROOT, '.meta', 'checksums.json')

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

function safePath(root: string, target: string): string {
  const resolved = realpathSync(join(root, target))
  if (!resolved.startsWith(root)) throw new Error('Path traversal detected: target outside vault root')
  return resolved
}

export function normalizeId(raw: string): string {
  return raw
    .replace(/^\d{8}--?\d{4}-/, '')
    .replace(/^(\d{10,})--?/, '')
    .replace(/\.md$/, '')
}

function loadDecayScores(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(DECAY_PATH, 'utf-8')) } catch { return {} }
}

function saveDecayScores(scores: Record<string, unknown>) {
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

  // Fetch metadata (ArXiv API — no PDF download in v1)
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

  // Fire-and-forget fetch in background
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
    } catch (e: any) {
      await jobStore.updateJob(job.jobId, { status: 'failed', error: e.message })
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
  const dir = join(KNOWLEDGE_DIR, input.category)
  safePath(KNOWLEDGE_DIR, join(input.category, `${id}.md`))
  ensureDir(dir)
  const filePath = join(dir, `${id}.md`)
  const content = `# ${input.title}\n\n${input.content}\n`
  writeFileSync(filePath, content, 'utf-8')

  // Update decay scores
  const scores = loadDecayScores()
  scores[id] = {
    itemId: id, score: 0.5, lastAccess: new Date().toISOString(),
    accessCount: 0, summaryLevel: input.summaryLevel ?? 'none',
    nextReviewAt: new Date().toISOString(), difficulty: 0.5
  }
  saveDecayScores(scores)

  // Checksum
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

// ─── scanKnowledge (file-only scan for knowledge/ dir) ────────────────────────

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
        category: { type: 'string', description: 'raw/ subdirectory, default "inbox"' },
        priority: { type: 'string', enum: ['high', 'low'], default: 'low' },
        arxivMetadata: { type: 'boolean', description: 'ArXiv: fetch metadata before storing, default true' }
      },
      required: ['source', 'value']
    },
    call: async (args: RawIngestInput) => {
      try {
        const category = args.category ?? 'inbox'
        let job
        if (args.source === 'arxiv') {
          job = await ingestArxiv(args.value, category)
        } else if (args.source === 'url') {
          job = await ingestUrl(args.value, category)
        } else {
          job = await ingestFile(args.value, category)
        }
        return { content: [{ type: 'text', text: JSON.stringify(job) }] }
      } catch (e: any) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
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
      } catch (e: any) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
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
      } catch (e: any) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
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
      } catch (e: any) {
        return { content: [{ type: 'text', text: e.message }], isError: true }
      }
    }
  }
]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd <REPO_ROOT>/packages/research-vault-mcp
bun test __tests__/vault_write.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add packages/research-vault-mcp/src/vault_write.ts packages/research-vault-mcp/__tests__/vault_write.test.ts
git commit -m "feat(mcp): add vault_raw_ingest, vault_note_save, vault_get, vault_delete tools"
```

---

## Task 6: `src/amplify.ts` — Dual-Mode Streaming

**Files:**
- Modify: `packages/research-vault-mcp/src/amplify.ts`

The changes are: (a) add `stream` to `amplify_chat` inputSchema, (b) add `stream` to call signature, (c) add an `onProgress` callback parameter, (d) add a `stream: true` branch that yields chunks via `onProgress`.

- [ ] **Step 1: Add `stream` to inputSchema (after `maxTokens`)**

In the `amplify_chat` tool definition, find the `maxTokens` property in inputSchema.properties and add after it:

```typescript
stream: { type: 'boolean', description: 'If true, yield chunks via onProgress callback instead of waiting for complete response (default false)' }
```

- [ ] **Step 2: Update call function signature**

Change:
```typescript
call: async ({ message, modelId, systemPrompt, temperature = 0.7, maxTokens = 4000 }: {
  message: string, modelId?: string, systemPrompt?: string, temperature?: number, maxTokens?: number
}) => {
```
To:
```typescript
call: async ({ message, modelId, systemPrompt, temperature = 0.7, maxTokens = 4000, stream = false }: {
  message: string, modelId?: string, systemPrompt?: string, temperature?: number, maxTokens?: number, stream?: boolean
}, onProgress?: (data: { type: string; text?: string }) => void) => {
```

- [ ] **Step 3: Add stream branch after the existing SSE reader while-loop**

After the closing `}` of `while (true) { ... }` (after line ~134 in the existing file), add:

```typescript
        // ── Stream mode: yield chunks via onProgress ─────────────────────────
        if (stream && onProgress) {
          const res2 = await fetch(`${AMPLIFY_BASE}/chat`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(body)
          })
          if (!res2.ok) throw new Error(`HTTP ${res2.status}`)
          const reader2 = res2.body?.getReader()
          if (!reader2) throw new Error('No response body')
          const decoder2 = new TextDecoder()
          let buffer2 = ''
          while (true) {
            const { done, value } = await reader2.read()
            if (done) break
            buffer2 += decoder2.decode(value, { stream: true })
            for (const line of buffer2.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.slice(6))
                  if (parsed.data?.content) {
                    onProgress({ type: 'chunk', text: parsed.data.content })
                  }
                } catch {}
              }
            }
          }
          return { content: [{ type: 'text', text: '(streamed)' }] }
        }
```

- [ ] **Step 4: Commit**

```bash
git add packages/research-vault-mcp/src/amplify.ts
git commit -m "feat(mcp): add dual-mode streaming to amplify_chat"
```

---

## Task 7: `src/server.ts` — Transport Abstraction + Wire New Tools

**Files:**
- Modify: `packages/research-vault-mcp/src/server.ts`

Changes:
1. Add `MCP_TRANSPORT` env variable read
2. Add stdio transport handler function
3. Wire `vaultWriteTools` into `allTools` array
4. Replace startup console.log with transport switch

- [ ] **Step 1: Add after `const HOST = '0.0.0.0'` (line ~14)**

```typescript
const TRANSPORT = process.env.MCP_TRANSPORT ?? 'sse'
const PORT = parseInt(process.env.MCP_PORT ?? '8765')
```

- [ ] **Step 2: Add stdio transport handler after the MCP request handlers (after line 123 `return makeResponse(...)` for method not found)**

Add this new function:

```typescript
// ─── STDIO Transport ──────────────────────────────────────────────────────────
async function handleStdioTransport() {
  const reader = Bun.stdin.getReader()
  const writer = Bun.stdout.writer()
  const decoder = new TextDecoder()
  let buffer = ''

  const send = (obj: MCPResponse) => {
    writer.write(JSON.stringify(obj) + '\n')
    writer.flush()
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const req = JSON.parse(line) as MCPRequest
        const result = await handleRequest(req)
        if (result) send(result)
      } catch (e: any) {
        send({ jsonrpc: '2.0', error: { code: -32700, message: `Parse error: ${e.message}` } })
      }
    }
  }
}
```

- [ ] **Step 3: Wire vaultWriteTools into allTools array (around line 41-44)**

Change:
```typescript
const allTools: Tool[] = [
  ...vaultTools,
  ...amplifyTools
]
```
To:
```typescript
import { vaultWriteTools } from './vault_write.js'

const allTools: Tool[] = [
  ...vaultTools,
  ...vaultWriteTools,
  ...amplifyTools
]
```

- [ ] **Step 4: Replace startup block (lines 247-257) with transport switch**

Replace the entire startup `console.log` block with:

```typescript
// ─── Startup ─────────────────────────────────────────────────────────────────

if (TRANSPORT === 'stdio') {
  console.error('[MCP] Running in stdio mode (stdin/stdout JSON-RPC)')
  await handleStdioTransport()
  process.exit(0)
} else {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   Research Vault MCP Server — MCP SSE Transport     ║
╠══════════════════════════════════════════════════════╣
║  SSE:       http://${HOST}:${PORT}/sse                ║
║  Messages:  http://${HOST}:${PORT}/messages          ║
║  Health:    http://${HOST}:${PORT}/health            ║
╠══════════════════════════════════════════════════════╣
║  Tools:     ${String(allTools.length).padEnd(3)} (${vaultTools.length} vault, ${amplifyTools.length} amplify)     ║
╚══════════════════════════════════════════════════════╝
`)
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/research-vault-mcp/src/server.ts
git commit -m "feat(mcp): add stdio transport mode and wire vault_write tools"
```

---

## Task 8: `bin/research-vault-mcp.mjs` — Transport Flag

**Files:**
- Modify: `packages/research-vault-mcp/bin/research-vault-mcp.mjs`

- [ ] **Step 1: Parse `--transport` flag and set `MCP_TRANSPORT` env**

Replace the `main()` function body with:

```javascript
async function main() {
  const args = process.argv.slice(2)
  let transport = 'sse'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--transport' && args[i + 1]) {
      transport = args[i + 1]
    } else if (args[i].startsWith('--transport=')) {
      transport = args[i].split('=')[1]
    }
  }
  process.env.MCP_TRANSPORT = transport

  if (existsSync(compiledServer)) {
    await import(compiledServer)
  } else if (existsSync(sourceServer)) {
    await import(sourceServer)
  } else {
    console.error('research-vault-mcp: neither dist/server.js nor src/server.ts found')
    process.exit(1)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/research-vault-mcp/bin/research-vault-mcp.mjs
git commit -m "feat(mcp): add --transport stdio|sse flag to CLI"
```

---

## Task 9: `package.json` Version Bump

**Files:**
- Modify: `packages/research-vault-mcp/package.json`

- [ ] **Step 1: Update version and dependencies**

```json
"version": "1.1.0",
"dependencies": {
  "@anthropic-ai/sdk": "^0.80.0",
  "markitdown": "latest"
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/research-vault-mcp/package.json
git commit -m "chore(mcp): bump to 1.1.0, add markitdown dependency"
```

---

## Self-Review Checklist

1. **Spec coverage:** All 4 new vault tools (Task 5), amplify dual-mode (Task 6), transport abstraction (Tasks 7-8), ArXiv ingest (Task 3), HTML/PDF (Task 4). No gaps.
2. **Placeholder scan:** No "TBD", "TODO", or vague steps. All code blocks are complete.
3. **Type consistency:** `RawIngestInput`, `NoteSaveInput`, `VaultGetInput`, `VaultDeleteInput` all defined in `types.ts` and used in `vault_write.ts`. `IngestStatus` used in `IngestJob`. Consistent.
4. **Dependency ordering:** types (1) → job store (2) → ingest (3,4) → write tools (5) → amplify (6) → server (7) → bin (8) → package (9).
5. **Security:** `pdf.ts` uses `Bun.spawn`, not `child_process.spawn`. No shell injection risk.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-04-21-research-vault-mcp-enhancement-plan.md`.
