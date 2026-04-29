import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getOriginalCwd, setOriginalCwd } from '../../bootstrap/state.js'
import {
  getMemoryFiles,
  isMemoryFilePath,
  resetGetMemoryFilesCache,
} from '../claudemd.js'

describe('AGENTS.md discovery', () => {
  let tmp: string
  let originalCwd: string

  beforeEach(() => {
    originalCwd = getOriginalCwd()
    tmp = mkdtempSync(join(tmpdir(), 'agents-md-'))
    setOriginalCwd(tmp)
    resetGetMemoryFilesCache()
  })

  afterEach(() => {
    setOriginalCwd(originalCwd)
    resetGetMemoryFilesCache()
    rmSync(tmp, { recursive: true, force: true })
  })

  test('loads AGENTS.md beside CLAUDE.md as project instructions', async () => {
    writeFileSync(join(tmp, 'CLAUDE.md'), '# Claude instructions\n')
    writeFileSync(join(tmp, 'AGENTS.md'), '# Agents instructions\n')

    const files = await getMemoryFiles(true)
    const projectPaths = files
      .filter(file => file.type === 'Project' && file.path.startsWith(tmp))
      .map(file => file.path)

    expect(projectPaths).toContain(join(tmp, 'CLAUDE.md'))
    expect(projectPaths).toContain(join(tmp, 'AGENTS.md'))
  })

  test('treats AGENTS.md as a memory file path', () => {
    expect(isMemoryFilePath(join(tmp, 'AGENTS.md'))).toBe(true)
  })
})
