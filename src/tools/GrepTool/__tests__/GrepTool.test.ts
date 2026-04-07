/**
 * GrepTool integration tests.
 *
 * Tests exercise GrepTool.call() with real ripgrep execution against temp
 * directories containing fixture files. Only the ToolUseContext boundary
 * is mocked (via createTestToolUseContext).
 *
 * USE_BUILTIN_RIPGREP=false must be set to force system ripgrep (rg on PATH).
 *
 * Key behaviors verified:
 * - Happy path: pattern matches returned from text files
 * - Binary file skipping: ripgrep skips binary files by default
 * - head_limit truncation: large result sets are bounded
 * - No matches: graceful empty result (not a crash)
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTestToolUseContext } from '../../__tests__/createTestToolUseContext.js'

// Force system ripgrep before any tool imports (module-level side effects)
process.env.USE_BUILTIN_RIPGREP = 'false'
// Test mode for deterministic sort order
process.env.NODE_ENV = 'test'

// Lazy import to avoid circular dependency (GlobTool.UI references GrepTool at load time)
async function getGrepTool() {
  const mod = await import('../GrepTool.js')
  return mod.GrepTool
}

// Mock canUseTool: always allow
const mockCanUseTool = async () => ({ result: 'allow' as const })

// Mock parent assistant message
const mockParentMessage = {
  type: 'assistant' as const,
  content: [
    { type: 'tool_use', id: 'test-grep-id', name: 'Grep', input: {} },
  ],
  message: { role: 'assistant' as const, content: [] },
  costUSD: 0,
  durationMs: 0,
  uuid: 'test-grep-uuid',
}

let testDir: string

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'ccb-grep-test-'))
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('GrepTool', () => {
  test('happy path: finds pattern in text files', async () => {
    const GrepTool = await getGrepTool()
    // Create text files with known content
    writeFileSync(join(testDir, 'alpha.txt'), 'Hello World\nFoo Bar\n')
    writeFileSync(join(testDir, 'beta.txt'), 'Goodbye World\nBaz Qux\n')

    const ctx = createTestToolUseContext()

    const result = await GrepTool.call(
      {
        pattern: 'World',
        path: testDir,
        output_mode: 'files_with_matches',
      },
      ctx as any,
      mockCanUseTool as any,
      mockParentMessage as any,
    )

    expect(result.data.numFiles).toBe(2)
    // Both files contain "World"
    const filenames = result.data.filenames.join('\n')
    expect(filenames).toContain('alpha.txt')
    expect(filenames).toContain('beta.txt')
  })

  test('happy path: content mode returns matching lines', async () => {
    const GrepTool = await getGrepTool()
    writeFileSync(join(testDir, 'sample.txt'), 'line one\nMATCH here\nline three\nMATCH again\n')

    const ctx = createTestToolUseContext()

    const result = await GrepTool.call(
      {
        pattern: 'MATCH',
        path: testDir,
        output_mode: 'content',
        '-n': true,
      },
      ctx as any,
      mockCanUseTool as any,
      mockParentMessage as any,
    )

    expect(result.data.mode).toBe('content')
    expect(result.data.content).toContain('MATCH here')
    expect(result.data.content).toContain('MATCH again')
    expect(result.data.numLines).toBeGreaterThanOrEqual(2)
  })

  test('binary file skip: ripgrep skips binary files by default', async () => {
    const GrepTool = await getGrepTool()
    // Create a text file with the pattern
    writeFileSync(join(testDir, 'text.txt'), 'SearchPattern in text\n')

    // Create a binary file with null bytes (ripgrep classifies as binary)
    const binaryContent = Buffer.from([
      0x00, 0x01, 0x02, 0xff,
      // "SearchPattern" in ASCII, but preceded by null bytes
      0x53, 0x65, 0x61, 0x72, 0x63, 0x68,
      0x50, 0x61, 0x74, 0x74, 0x65, 0x72, 0x6e,
      0x00, 0x00,
    ])
    writeFileSync(join(testDir, 'binary.bin'), binaryContent)

    const ctx = createTestToolUseContext()

    const result = await GrepTool.call(
      {
        pattern: 'SearchPattern',
        path: testDir,
        output_mode: 'files_with_matches',
      },
      ctx as any,
      mockCanUseTool as any,
      mockParentMessage as any,
    )

    // Only the text file should match, binary should be skipped
    expect(result.data.numFiles).toBe(1)
    expect(result.data.filenames[0]).toContain('text.txt')
    // Binary file should NOT appear in results
    const allFilenames = result.data.filenames.join('\n')
    expect(allFilenames).not.toContain('binary.bin')
  })

  test('head_limit truncation: limits number of results', async () => {
    const GrepTool = await getGrepTool()
    // Create 20 text files each containing the match pattern
    for (let i = 0; i < 20; i++) {
      const name = `file_${String(i).padStart(3, '0')}.txt`
      writeFileSync(join(testDir, name), `MATCHME content in file ${i}\n`)
    }

    const ctx = createTestToolUseContext()

    const result = await GrepTool.call(
      {
        pattern: 'MATCHME',
        path: testDir,
        output_mode: 'files_with_matches',
        head_limit: 5,
      },
      ctx as any,
      mockCanUseTool as any,
      mockParentMessage as any,
    )

    // Should have at most 5 results despite 20 files matching
    expect(result.data.numFiles).toBe(5)
    expect(result.data.filenames).toHaveLength(5)
    // appliedLimit should be set since truncation occurred
    expect(result.data.appliedLimit).toBe(5)
  })

  test('no matches: returns empty result gracefully', async () => {
    const GrepTool = await getGrepTool()
    writeFileSync(join(testDir, 'content.txt'), 'Nothing relevant here\n')

    const ctx = createTestToolUseContext()

    const result = await GrepTool.call(
      {
        pattern: 'ZZZZNONEXISTENT',
        path: testDir,
        output_mode: 'files_with_matches',
      },
      ctx as any,
      mockCanUseTool as any,
      mockParentMessage as any,
    )

    expect(result.data.numFiles).toBe(0)
    expect(result.data.filenames).toHaveLength(0)
  })
})
