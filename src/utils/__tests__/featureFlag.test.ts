import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { feature, getAllFlags, _reloadFlagsForTesting } from '../featureFlag.js'

describe('featureFlag', () => {
  let savedEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    savedEnv = { ...process.env }
    // Clear all CLAUDE_FEATURE_ env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CLAUDE_FEATURE_')) {
        delete process.env[key]
      }
    }
  })

  afterEach(() => {
    process.env = savedEnv
    // Restore flags from original HOME
    _reloadFlagsForTesting()
  })

  // Test 1: feature('NONEXISTENT') returns false when no config file and no env vars
  test('returns false for unknown flag with no config and no env vars', () => {
    process.env.HOME = mkdtempSync(join(tmpdir(), 'ff-test-'))
    _reloadFlagsForTesting()
    expect(feature('NONEXISTENT')).toBe(false)
  })

  // Test 2: feature('KAIROS') returns true when CLAUDE_FEATURE_KAIROS=true
  test('returns true when env var CLAUDE_FEATURE_KAIROS=true', () => {
    process.env.CLAUDE_FEATURE_KAIROS = 'true'
    expect(feature('KAIROS')).toBe(true)
  })

  // Test 3: feature('KAIROS') returns true when CLAUDE_FEATURE_KAIROS=1
  test('returns true when env var CLAUDE_FEATURE_KAIROS=1', () => {
    process.env.CLAUDE_FEATURE_KAIROS = '1'
    expect(feature('KAIROS')).toBe(true)
  })

  // Test 4: feature('KAIROS') returns false when CLAUDE_FEATURE_KAIROS=false
  test('returns false when env var CLAUDE_FEATURE_KAIROS=false', () => {
    process.env.CLAUDE_FEATURE_KAIROS = 'false'
    expect(feature('KAIROS')).toBe(false)
  })

  // Test 5: CLAUDE_FEATURE_ALL=true makes feature() return true for any flag name
  test('CLAUDE_FEATURE_ALL=true enables all flags', () => {
    process.env.CLAUDE_FEATURE_ALL = 'true'
    expect(feature('ANYTHING')).toBe(true)
    expect(feature('KAIROS')).toBe(true)
    expect(feature('NONEXISTENT')).toBe(true)
  })

  // Test 6: feature() reads from JSON config file
  test('reads flags from ~/.claude/feature-flags.json', () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'ff-test-'))
    const claudeDir = join(tmpHome, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(claudeDir, 'feature-flags.json'), JSON.stringify({ KAIROS: true }))
    process.env.HOME = tmpHome
    _reloadFlagsForTesting()
    expect(feature('KAIROS')).toBe(true)
  })

  // Test 7: feature() ignores non-boolean values in config file
  test('ignores non-boolean values in config file', () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'ff-test-'))
    const claudeDir = join(tmpHome, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(
      join(claudeDir, 'feature-flags.json'),
      JSON.stringify({ BAD: 'string', ALSO_BAD: 42, GOOD: true }),
    )
    process.env.HOME = tmpHome
    _reloadFlagsForTesting()
    expect(feature('BAD')).toBe(false)
    expect(feature('ALSO_BAD')).toBe(false)
    expect(feature('GOOD')).toBe(true)
  })

  // Test 8: getAllFlags() returns the loaded flag cache as a plain object copy
  test('getAllFlags() returns a copy of the flag cache', () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'ff-test-'))
    const claudeDir = join(tmpHome, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(claudeDir, 'feature-flags.json'), JSON.stringify({ A: true, B: false }))
    process.env.HOME = tmpHome
    _reloadFlagsForTesting()
    const flags = getAllFlags()
    expect(flags).toEqual({ A: true, B: false })
    // Verify it's a copy, not the original
    flags.A = false
    expect(getAllFlags().A).toBe(true)
  })

  // Test 9: env var takes precedence over config file value
  test('env var overrides config file value', () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'ff-test-'))
    const claudeDir = join(tmpHome, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(claudeDir, 'feature-flags.json'), JSON.stringify({ KAIROS: false }))
    process.env.HOME = tmpHome
    _reloadFlagsForTesting()
    process.env.CLAUDE_FEATURE_KAIROS = 'true'
    expect(feature('KAIROS')).toBe(true)
  })
})
