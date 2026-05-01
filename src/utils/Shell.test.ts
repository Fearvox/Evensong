import { describe, expect, test } from 'bun:test'
import { shellSingleQuote } from './Shell.js'

describe('Shell utilities', () => {
  test('shellSingleQuote escapes POSIX single quotes', () => {
    expect(shellSingleQuote("a'b c")).toBe("'a'\\''b c'")
  })
})
