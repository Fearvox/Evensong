import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

type LocalGateModule = typeof import('../localGateProvider.js')
type GrowthBookModule = typeof import('../../analytics/growthbook.js')

async function loadLocalGateModule(): Promise<LocalGateModule> {
  mock.restore()
  return import(`../localGateProvider.js?isolation=${Date.now()}-${Math.random()}`)
}

// Helper: create a temp HOME with .claude/feature-flags.json
function setupTempHome(flags: Record<string, unknown>): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'lgp-test-'))
  const claudeDir = join(tempDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  writeFileSync(join(claudeDir, 'feature-flags.json'), JSON.stringify(flags))
  return tempDir
}

describe('localGateProvider', () => {
  let savedEnv: Record<string, string | undefined>
  let tempDir: string | null = null

  beforeEach(async () => {
    mock.restore()
    // Save env state
    savedEnv = {
      HOME: process.env.HOME,
      USER_TYPE: process.env.USER_TYPE,
      CLAUDE_INTERNAL_FC_OVERRIDES: process.env.CLAUDE_INTERNAL_FC_OVERRIDES,
    }

    // Reset growthbook module cache so getLocalFlagOverrides re-reads from new HOME
    const gbMod = await import('../../analytics/growthbook.js')
    gbMod.resetGrowthBook()
    gbMod._resetLocalFlagOverridesForTesting()
  })

  afterEach(async () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key]
      }
    }
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
      tempDir = null
    }
    // Reset growthbook cache after test
    const gbMod = await import('../../analytics/growthbook.js')
    gbMod.resetGrowthBook()
    gbMod._resetLocalFlagOverridesForTesting()
  })

  describe('isLocalGate', () => {
    test('returns true for tengu_ prefixed gates', async () => {
      const mod = await loadLocalGateModule()
      expect(mod.isLocalGate('tengu_test_gate')).toBe(true)
      expect(mod.isLocalGate('tengu_model_override')).toBe(true)
      expect(mod.isLocalGate('tengu_1p_event_batch_config')).toBe(true)
    })

    test('returns false for non-tengu_ gates', async () => {
      const mod = await loadLocalGateModule()
      expect(mod.isLocalGate('KAIROS')).toBe(false)
      expect(mod.isLocalGate('PROACTIVE')).toBe(false)
      expect(mod.isLocalGate('some_feature_gate')).toBe(false)
      expect(mod.isLocalGate('normal_gate')).toBe(false)
    })
  })

  describe('getLocalGateValue', () => {
    test('returns value for tengu_key present in feature-flags.json', async () => {
      tempDir = setupTempHome({ tengu_test_gate: true })
      process.env.HOME = tempDir
      delete process.env.USER_TYPE

      const mod = await loadLocalGateModule()
      const result = mod.getLocalGateValue('tengu_test_gate')
      expect(result).toBe(true)
    })

    test('returns null for non-tengu_key (not a local gate)', async () => {
      tempDir = setupTempHome({ tengu_test_gate: true })
      process.env.HOME = tempDir
      delete process.env.USER_TYPE

      const mod = await loadLocalGateModule()
      const result = mod.getLocalGateValue('KAIROS')
      expect(result).toBeNull()
    })

    test('returns null when feature-flags.json does not exist', async () => {
      tempDir = mkdtempSync(join(tmpdir(), 'lgp-empty-test-'))
      process.env.HOME = tempDir
      delete process.env.USER_TYPE

      const mod = await loadLocalGateModule()
      const result = mod.getLocalGateValue('tengu_test_gate')
      expect(result).toBeNull()
    })

    test('returns null when feature-flags.json has no tengu_* keys', async () => {
      tempDir = setupTempHome({ KAIROS: true, PROACTIVE: false })
      process.env.HOME = tempDir
      delete process.env.USER_TYPE

      const mod = await loadLocalGateModule()
      const result = mod.getLocalGateValue('tengu_test_gate')
      expect(result).toBeNull()
    })

    test('returns non-boolean values as-is (objects, numbers, strings)', async () => {
      tempDir = setupTempHome({
        tengu_config: { key: 'val', nested: true },
        tengu_number: 42,
        tengu_string: 'hello',
      })
      process.env.HOME = tempDir
      delete process.env.USER_TYPE

      const mod = await loadLocalGateModule()
      expect(mod.getLocalGateValue('tengu_config')).toEqual({ key: 'val', nested: true })
      expect(mod.getLocalGateValue('tengu_number')).toBe(42)
      expect(mod.getLocalGateValue('tengu_string')).toBe('hello')
    })
  })

  describe('resolveGate (local-first priority)', () => {
    test('tengu_* gates resolve from local flags, not remote cache', async () => {
      tempDir = setupTempHome({ tengu_local_gate: true })
      process.env.HOME = tempDir
      delete process.env.USER_TYPE

      const mod = await loadLocalGateModule()
      const result = mod.resolveGate('tengu_local_gate')
      expect(result).toEqual({ source: 'local', value: true })
    })

    test('non-tengu_* gates return null (not a local gate)', async () => {
      tempDir = setupTempHome({ tengu_test: true })
      process.env.HOME = tempDir
      delete process.env.USER_TYPE

      const mod = await loadLocalGateModule()
      const result = mod.resolveGate('KAIROS')
      expect(result).toBeNull()
    })

    test('resolveGate logs gate resolution with source', async () => {
      tempDir = setupTempHome({ tengu_logged_gate: true })
      process.env.HOME = tempDir
      delete process.env.USER_TYPE

      const mod = await loadLocalGateModule()
      const result = mod.resolveGate('tengu_logged_gate')
      expect(result).not.toBeNull()
      expect(result!.source).toBe('local')
      expect(result!.value).toBe(true)
    })
  })
})
