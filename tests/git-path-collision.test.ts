import { execFileSync } from 'node:child_process'
import { describe, expect, test } from 'bun:test'

describe('git tracked paths', () => {
  test('do not collide on case-insensitive filesystems', () => {
    const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    const seen = new Map<string, string>()
    const collisions: string[] = []

    for (const path of output.split('\n').filter(Boolean)) {
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
})
