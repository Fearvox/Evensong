import { describe, test, expect } from 'bun:test'
import { getPreset, listPresets, resolveMemory, EXPERIMENT_PRESETS } from '../configs.js'

describe('configs', () => {
  test('listPresets returns all preset names', () => {
    const names = listPresets()
    expect(names).toContain('r011-a')
    expect(names).toContain('r011-b')
    expect(names).toContain('r011-c')
    expect(names).toContain('r011-d')
    expect(names).toContain('grok-l0')
    expect(names).toContain('r012')
    expect(names).toContain('r016-injection-t1')
    expect(names).toContain('r016-injection-t2')
    expect(names).toContain('validate-cheap')
  })

  test('getPreset returns correct config for r011-b', () => {
    const preset = getPreset('r011-b')!
    expect(preset.config.model).toBe('native-opus')
    expect(preset.config.pressure).toBe('L0')
    expect(preset.config.memory).toBe('full')
    expect(preset.config.services).toBe(8)
  })

  test('getPreset returns null for unknown', () => {
    expect(getPreset('nonexistent')).toBeNull()
  })

  test('2x2 matrix has correct pressure/memory combinations', () => {
    const a = getPreset('r011-a')!
    const b = getPreset('r011-b')!
    const c = getPreset('r011-c')!
    const d = getPreset('r011-d')!

    // A: no memory, no pressure
    expect(a.config.memory).toBe('clean')
    expect(a.config.pressure).toBe('L0')

    // B: evolved, no pressure
    expect(b.config.memory).toBe('full')
    expect(b.config.pressure).toBe('L0')

    // C: no memory, pressure
    expect(c.config.memory).toBe('clean')
    expect(c.config.pressure).toBe('L2')

    // D: evolved, pressure
    expect(d.config.memory).toBe('full')
    expect(d.config.pressure).toBe('L2')
  })

  test('all presets have required fields', () => {
    for (const [name, preset] of Object.entries(EXPERIMENT_PRESETS)) {
      expect(preset.name).toBeTruthy()
      expect(preset.description.length).toBeGreaterThan(20)
      expect(preset.config.model).toBeTruthy()
      expect(['L0', 'L1', 'L2', 'L3']).toContain(preset.config.pressure)
      expect(['full', 'blind', 'clean']).toContain(preset.config.memory)
      expect(preset.config.services).toBeGreaterThan(0)
    }
  })
})

describe('resolveMemory', () => {
  test('maps paper aliases to harness values', () => {
    expect(resolveMemory('void')).toBe('clean')
    expect(resolveMemory('evolved')).toBe('full')
  })

  test('passes through native values', () => {
    expect(resolveMemory('full')).toBe('full')
    expect(resolveMemory('blind')).toBe('blind')
    expect(resolveMemory('clean')).toBe('clean')
  })

  test('throws on unknown memory mode', () => {
    expect(() => resolveMemory('banana')).toThrow('Unknown memory mode')
  })
})
