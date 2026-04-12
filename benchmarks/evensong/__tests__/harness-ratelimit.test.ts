import { describe, test, expect } from 'bun:test'
import { detectRateLimit } from '../harness.js'

describe('detectRateLimit', () => {
  test('detects Claude OAuth rate limit message', () => {
    const output = "Some setup output\nYou've hit your limit · resets 12am (America/New_York)\n"
    expect(detectRateLimit(output)).toBe(true)
  })

  test('detects generic rate limit patterns', () => {
    expect(detectRateLimit('Rate limit exceeded')).toBe(true)
    expect(detectRateLimit('429 Too Many Requests')).toBe(true)
    expect(detectRateLimit('Error: rate_limit_error')).toBe(true)
  })

  test('returns false for normal output', () => {
    const output = '787 pass\n0 fail\n2192 expect() calls\nRan 787 tests across 32 files. [114.00ms]'
    expect(detectRateLimit(output)).toBe(false)
  })

  test('returns false for empty output', () => {
    expect(detectRateLimit('')).toBe(false)
  })
})
