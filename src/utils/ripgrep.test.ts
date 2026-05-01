import { describe, expect, test } from 'bun:test'

describe('ripgrepCommand', () => {
  test('falls back to system rg in source checkouts when vendored rg is absent', async () => {
    const previous = process.env.USE_BUILTIN_RIPGREP
    delete process.env.USE_BUILTIN_RIPGREP
    try {
      const { ripgrepCommand } = await import('./ripgrep.js')
      expect(ripgrepCommand().rgPath).toBe('rg')
    } finally {
      if (previous === undefined) delete process.env.USE_BUILTIN_RIPGREP
      else process.env.USE_BUILTIN_RIPGREP = previous
    }
  })
})
