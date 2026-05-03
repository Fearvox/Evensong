import { execFileSync } from 'node:child_process'
import { describe, expect, test } from 'bun:test'

function gitLsFiles(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

describe('git tracked paths', () => {
  test('do not collide on case-insensitive filesystems', () => {
    const paths = gitLsFiles()
    const seen = new Map<string, string>()
    const collisions: string[] = []

    for (const path of paths) {
      const key = path.toLowerCase()
      const existing = seen.get(key)

      if (existing && existing !== path) {
        collisions.push(`${existing} <-> ${path}`)
        continue
      }

      seen.set(key, path)
    }

    expect(collisions).toEqual([])
  })

  test('keeps Shell implementation and shellQuote helper distinct', () => {
    const paths = gitLsFiles()

    expect(paths).toContain('src/utils/Shell.ts')
    expect(paths).toContain('src/utils/shellQuote.ts')
    expect(paths).not.toContain('src/utils/shell.ts')
  })
})
