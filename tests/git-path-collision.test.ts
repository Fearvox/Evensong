import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'child_process'

function gitLsFiles(): string[] {
  const result = spawnSync('git', ['ls-files'], {
    encoding: 'utf8',
  })

  expect(result.status).toBe(0)

  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

describe('git tracked paths', () => {
  test('does not contain case-insensitive path collisions', () => {
    const paths = gitLsFiles()
    const byLowercase = new Map<string, string[]>()

    for (const path of paths) {
      const key = path.toLowerCase()
      const existing = byLowercase.get(key) ?? []
      existing.push(path)
      byLowercase.set(key, existing)
    }

    const collisions = [...byLowercase.values()].filter(
      group => new Set(group).size > 1,
    )

    expect(collisions).toEqual([])
  })

  test('keeps Shell implementation and shellQuote helper distinct', () => {
    const paths = gitLsFiles()

    expect(paths).toContain('src/utils/Shell.ts')
    expect(paths).toContain('src/utils/shellQuote.ts')
    expect(paths).not.toContain('src/utils/shell.ts')
  })
})
