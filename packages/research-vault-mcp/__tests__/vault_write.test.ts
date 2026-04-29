import { describe, test, expect, beforeEach } from 'bun:test'
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs'
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
    const result = await tool.call({ title: 'Test Note', content: '# Test\n\nHello world', category: 'test' })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.id).toBeTruthy()
    expect(parsed.path).toContain('knowledge/test/')
    const { existsSync } = await import('fs')
    expect(existsSync(parsed.path)).toBe(true)
  })

  test('rejects path traversal in category', async () => {
    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const tool = vaultWriteTools.find(t => t.name === 'vault_note_save')!
    const result = await tool.call({ title: 'Bad', content: 'Bad content', category: '../../../etc/passwd' })
    expect(result.content[0].text.toLowerCase()).toMatch(/traversal|invalid|outside/i)
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
    const { existsSync } = await import('fs')
    expect(existsSync(path)).toBe(false)
  })
})

describe('vault_raw_ingest path traversal protection', () => {
  test('rejects traversal category for arxiv source (no network call, no orphan job)', async () => {
    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const tool = vaultWriteTools.find(t => t.name === 'vault_raw_ingest')!
    const result = await tool.call({
      source: 'arxiv',
      value: '2501.00001',
      category: '../../tmp/escape'
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text.toLowerCase()).toMatch(/traversal|outside/i)

    const jobsPath = join(TMP, '.meta', 'ingest-jobs.json')
    const { existsSync } = await import('fs')
    if (existsSync(jobsPath)) {
      const jobs = JSON.parse(readFileSync(jobsPath, 'utf-8'))
      expect(Object.keys(jobs).length).toBe(0)
    }
  })

  test('rejects traversal category for url source (no orphan job)', async () => {
    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const tool = vaultWriteTools.find(t => t.name === 'vault_raw_ingest')!
    const result = await tool.call({
      source: 'url',
      value: 'https://example.com',
      category: '../../tmp/escape'
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text.toLowerCase()).toMatch(/traversal|outside/i)

    const jobsPath = join(TMP, '.meta', 'ingest-jobs.json')
    const { existsSync } = await import('fs')
    if (existsSync(jobsPath)) {
      const jobs = JSON.parse(readFileSync(jobsPath, 'utf-8'))
      expect(Object.keys(jobs).length).toBe(0)
    }
  })

  test('rejects traversal category for file source (no orphan job)', async () => {
    const sourceFile = join(TMP, 'tmp-source.txt')
    writeFileSync(sourceFile, 'test content')

    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const tool = vaultWriteTools.find(t => t.name === 'vault_raw_ingest')!
    const result = await tool.call({
      source: 'file',
      value: sourceFile,
      category: '../../tmp/escape'
    })
    expect(result.isError).toBe(true)
    expect(result.content[0].text.toLowerCase()).toMatch(/traversal|outside/i)

    const jobsPath = join(TMP, '.meta', 'ingest-jobs.json')
    const { existsSync } = await import('fs')
    if (existsSync(jobsPath)) {
      const jobs = JSON.parse(readFileSync(jobsPath, 'utf-8'))
      expect(Object.keys(jobs).length).toBe(0)
    }
  })
})

describe('vault_note_save decay-scores persistence (regression: array format)', () => {
  test('persists new decay score as an array entry', async () => {
    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const tool = vaultWriteTools.find(t => t.name === 'vault_note_save')!
    const result = await tool.call({ title: 'Decay Test', content: 'body', category: 'test' })
    const { id } = JSON.parse(result.content[0].text)
    const decayPath = join(TMP, '.meta', 'decay-scores.json')
    const decay = JSON.parse(readFileSync(decayPath, 'utf-8'))
    expect(Array.isArray(decay)).toBe(true)
    expect(decay.find((s: { itemId: string }) => s.itemId === id)).toBeDefined()
  })

  test('preserves existing array entries when adding a new note', async () => {
    mkdirSync(join(TMP, '.meta'), { recursive: true })
    const decayPath = join(TMP, '.meta', 'decay-scores.json')
    const seed = [{
      itemId: 'pre-existing-entry', score: 0.8, lastAccess: new Date().toISOString(),
      accessCount: 3, summaryLevel: 'deep' as const,
      nextReviewAt: new Date().toISOString(), difficulty: 0.5
    }]
    writeFileSync(decayPath, JSON.stringify(seed))

    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const tool = vaultWriteTools.find(t => t.name === 'vault_note_save')!
    const result = await tool.call({ title: 'After Seed', content: 'body', category: 'test' })
    const { id } = JSON.parse(result.content[0].text)

    const decay = JSON.parse(readFileSync(decayPath, 'utf-8'))
    expect(Array.isArray(decay)).toBe(true)
    expect(decay.find((s: { itemId: string }) => s.itemId === 'pre-existing-entry')).toBeDefined()
    expect(decay.find((s: { itemId: string }) => s.itemId === id)).toBeDefined()
  })
})

describe('vault_delete decay-scores cleanup (regression: array format)', () => {
  test('removes decay entry when deleting an existing knowledge file', async () => {
    const knowledgeDir = join(TMP, 'knowledge', 'test')
    mkdirSync(knowledgeDir, { recursive: true })
    mkdirSync(join(TMP, '.meta'), { recursive: true })
    const fileName = '20260420--1234-doomed-note.md'
    const filePath = join(knowledgeDir, fileName)
    writeFileSync(filePath, '# Doomed')

    const itemId = '20260420--1234-doomed-note'
    const decayPath = join(TMP, '.meta', 'decay-scores.json')
    writeFileSync(decayPath, JSON.stringify([
      { itemId, score: 0.5, lastAccess: new Date().toISOString(),
        accessCount: 0, summaryLevel: 'none' as const,
        nextReviewAt: new Date().toISOString(), difficulty: 0.5 },
      { itemId: 'untouched-entry', score: 0.9, lastAccess: new Date().toISOString(),
        accessCount: 5, summaryLevel: 'deep' as const,
        nextReviewAt: new Date().toISOString(), difficulty: 0.5 }
    ]))

    const { vaultWriteTools } = await import('../src/vault_write.ts')
    const delTool = vaultWriteTools.find(t => t.name === 'vault_delete')!
    const result = await delTool.call({ path: 'knowledge/test/' + fileName })
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.deleted).toBe(true)

    const decay = JSON.parse(readFileSync(decayPath, 'utf-8'))
    expect(Array.isArray(decay)).toBe(true)
    expect(decay.find((s: { itemId: string }) => s.itemId === itemId)).toBeUndefined()
    expect(decay.find((s: { itemId: string }) => s.itemId === 'untouched-entry')).toBeDefined()
  })
})
