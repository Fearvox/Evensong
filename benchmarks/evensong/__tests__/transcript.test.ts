import { describe, test, expect, afterEach } from 'bun:test'
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { TranscriptLogger } from '../transcript.js'

const TEST_DIR = `/tmp/evensong-test-${Date.now()}`
let cleanupPaths: string[] = []

afterEach(() => {
  for (const p of cleanupPaths) {
    try {
      rmSync(p, { recursive: true, force: true })
    } catch {}
  }
  cleanupPaths = []
})

function tempPath(name: string): string {
  const dir = join(TEST_DIR, name)
  cleanupPaths.push(dir)
  return join(dir, 'transcript.jsonl')
}

describe('TranscriptLogger', () => {
  test('creates parent directory on construction', () => {
    const path = tempPath('create-dir')
    const dirPath = join(TEST_DIR, 'create-dir')
    expect(existsSync(dirPath)).toBe(false)
    new TranscriptLogger(path)
    expect(existsSync(dirPath)).toBe(true)
  })

  test('creates file on first log call', () => {
    const path = tempPath('first-log')
    const logger = new TranscriptLogger(path)
    expect(existsSync(path)).toBe(false)
    logger.log('system', 'hello')
    expect(existsSync(path)).toBe(true)
  })

  test('entries are valid JSONL (each line parses as JSON)', () => {
    const path = tempPath('valid-jsonl')
    const logger = new TranscriptLogger(path)

    logger.log('system', 'first entry')
    logger.log('prompt', 'second entry')
    logger.log('response', 'third entry')

    const lines = readFileSync(path, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(3)

    for (const line of lines) {
      const parsed = JSON.parse(line)
      expect(parsed).toHaveProperty('ts')
      expect(parsed).toHaveProperty('elapsed_s')
      expect(parsed).toHaveProperty('type')
      expect(parsed).toHaveProperty('content')
    }
  })

  test('each entry has correct type field', () => {
    const path = tempPath('entry-types')
    const logger = new TranscriptLogger(path)

    logger.log('system', 'sys')
    logger.log('prompt', 'prm')
    logger.log('error', 'err')
    logger.log('metric', 'met')

    const lines = readFileSync(path, 'utf-8').trim().split('\n')
    const types = lines.map(l => JSON.parse(l).type)
    expect(types).toEqual(['system', 'prompt', 'error', 'metric'])
  })

  test('elapsed_s is non-negative and non-decreasing across entries', () => {
    const path = tempPath('elapsed-time')
    const logger = new TranscriptLogger(path)

    logger.log('system', 'a')
    logger.log('system', 'b')
    logger.log('system', 'c')

    const lines = readFileSync(path, 'utf-8').trim().split('\n')
    const elapsed = lines.map(l => JSON.parse(l).elapsed_s)

    for (let i = 0; i < elapsed.length; i++) {
      expect(elapsed[i]).toBeGreaterThanOrEqual(0)
      if (i > 0) {
        expect(elapsed[i]).toBeGreaterThanOrEqual(elapsed[i - 1])
      }
    }
  })

  test('long content (>50000 chars) is truncated with marker', () => {
    const path = tempPath('truncation')
    const logger = new TranscriptLogger(path)

    const longContent = 'x'.repeat(60000)
    logger.log('response', longContent)

    const line = readFileSync(path, 'utf-8').trim()
    const entry = JSON.parse(line)

    // Should be truncated to 50000 + the truncation marker
    expect(entry.content.length).toBeLessThan(60000)
    expect(entry.content).toContain('...[truncated]')
    expect(entry.content.length).toBe(50000 + '...[truncated]'.length)
  })

  test('content under 50000 chars is NOT truncated', () => {
    const path = tempPath('no-truncation')
    const logger = new TranscriptLogger(path)

    const shortContent = 'y'.repeat(1000)
    logger.log('response', shortContent)

    const line = readFileSync(path, 'utf-8').trim()
    const entry = JSON.parse(line)

    expect(entry.content).toBe(shortContent)
    expect(entry.content).not.toContain('...[truncated]')
  })

  test('content at exactly 50000 chars is NOT truncated', () => {
    const path = tempPath('boundary')
    const logger = new TranscriptLogger(path)

    const exactContent = 'z'.repeat(50000)
    logger.log('response', exactContent)

    const line = readFileSync(path, 'utf-8').trim()
    const entry = JSON.parse(line)

    expect(entry.content).toBe(exactContent)
    expect(entry.content).not.toContain('...[truncated]')
  })

  test('count property tracks number of entries', () => {
    const path = tempPath('count')
    const logger = new TranscriptLogger(path)

    expect(logger.count).toBe(0)
    logger.log('system', 'one')
    expect(logger.count).toBe(1)
    logger.log('system', 'two')
    expect(logger.count).toBe(2)
    logger.log('system', 'three')
    expect(logger.count).toBe(3)
  })

  test('elapsedMin returns a non-negative number', () => {
    const path = tempPath('elapsed-min')
    const logger = new TranscriptLogger(path)

    const elapsed = logger.elapsedMin
    expect(typeof elapsed).toBe('number')
    expect(elapsed).toBeGreaterThanOrEqual(0)
    // Should be very small since we just created it
    expect(elapsed).toBeLessThan(1)
  })

  test('metadata is included when provided', () => {
    const path = tempPath('metadata')
    const logger = new TranscriptLogger(path)

    logger.log('system', 'with meta', { key: 'value', count: 42 })

    const line = readFileSync(path, 'utf-8').trim()
    const entry = JSON.parse(line)

    expect(entry.metadata).toBeDefined()
    expect(entry.metadata.key).toBe('value')
    expect(entry.metadata.count).toBe(42)
  })

  test('metadata is omitted when not provided', () => {
    const path = tempPath('no-metadata')
    const logger = new TranscriptLogger(path)

    logger.log('system', 'no meta')

    const line = readFileSync(path, 'utf-8').trim()
    const entry = JSON.parse(line)

    expect(entry.metadata).toBeUndefined()
  })

  test('path property returns the configured file path', () => {
    const path = tempPath('path-prop')
    const logger = new TranscriptLogger(path)
    expect(logger.path).toBe(path)
  })

  test('ts field is a valid unix millisecond timestamp', () => {
    const path = tempPath('timestamp')
    const before = Date.now()
    const logger = new TranscriptLogger(path)
    logger.log('system', 'test')
    const after = Date.now()

    const line = readFileSync(path, 'utf-8').trim()
    const entry = JSON.parse(line)

    expect(entry.ts).toBeGreaterThanOrEqual(before)
    expect(entry.ts).toBeLessThanOrEqual(after)
  })
})
