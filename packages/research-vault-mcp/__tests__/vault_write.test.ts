import { describe, test, expect, beforeEach } from 'bun:test'
import { mkdirSync, rmSync } from 'fs'
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