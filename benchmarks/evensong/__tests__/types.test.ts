import { describe, test, expect } from 'bun:test'
import { BENCHMARK_MODELS } from '../types.js'
import type { ProviderPreset } from '../types.js'

describe('BENCHMARK_MODELS', () => {
  test('has exactly 8 entries', () => {
    expect(BENCHMARK_MODELS).toHaveLength(8)
  })

  test('each entry has required fields: name, modelId, displayName', () => {
    for (const model of BENCHMARK_MODELS) {
      expect(typeof model.name).toBe('string')
      expect(model.name.length).toBeGreaterThan(0)

      expect(typeof model.modelId).toBe('string')
      expect(model.modelId.length).toBeGreaterThan(0)

      expect(typeof model.displayName).toBe('string')
      expect(model.displayName.length).toBeGreaterThan(0)
    }
  })

  test('all names are unique', () => {
    const names = BENCHMARK_MODELS.map(m => m.name)
    const uniqueNames = new Set(names)
    expect(uniqueNames.size).toBe(names.length)
  })

  test('all modelIds contain a slash (provider/model format)', () => {
    for (const model of BENCHMARK_MODELS) {
      expect(model.modelId).toContain('/')
    }
  })

  test('all modelIds are unique', () => {
    const ids = BENCHMARK_MODELS.map(m => m.modelId)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  test('all names start with "or-" prefix', () => {
    for (const model of BENCHMARK_MODELS) {
      expect(model.name.startsWith('or-')).toBe(true)
    }
  })

  test('each entry satisfies ProviderPreset shape', () => {
    for (const model of BENCHMARK_MODELS) {
      const keys = Object.keys(model)
      expect(keys).toContain('name')
      expect(keys).toContain('modelId')
      expect(keys).toContain('displayName')
    }
  })

  test('known models are present', () => {
    const names = BENCHMARK_MODELS.map(m => m.name)
    expect(names).toContain('or-opus')
    expect(names).toContain('or-gpt5')
    expect(names).toContain('or-grok')
    expect(names).toContain('or-gemini')
    expect(names).toContain('or-glm')
    expect(names).toContain('or-qwen-coder')
    expect(names).toContain('or-deepseek')
    expect(names).toContain('or-kimi')
  })
})
