import { describe, test, expect } from 'bun:test'
import { BENCHMARK_MODELS } from '../types.js'
import type { ProviderPreset } from '../types.js'

describe('BENCHMARK_MODELS', () => {
  test('has at least 8 entries (flexible for new providers)', () => {
    expect(BENCHMARK_MODELS.length).toBeGreaterThanOrEqual(8)
  })

  test('each entry has required fields: name, modelId, displayName, provider', () => {
    for (const model of BENCHMARK_MODELS) {
      expect(typeof model.name).toBe('string')
      expect(model.name.length).toBeGreaterThan(0)

      expect(typeof model.modelId).toBe('string')
      expect(model.modelId.length).toBeGreaterThan(0)

      expect(typeof model.displayName).toBe('string')
      expect(model.displayName.length).toBeGreaterThan(0)

      expect(model.provider).toMatch(/^(openrouter|minimax-direct|native|grok-native)$/)
    }
  })

  test('all names are unique', () => {
    const names = BENCHMARK_MODELS.map(m => m.name)
    const uniqueNames = new Set(names)
    expect(uniqueNames.size).toBe(names.length)
  })

  test('all modelIds are unique', () => {
    const ids = BENCHMARK_MODELS.map(m => m.modelId)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  test('minimax-direct entries have baseUrl and apiKeyEnvVar', () => {
    for (const model of BENCHMARK_MODELS) {
      if (model.provider === 'minimax-direct') {
        expect(model.baseUrl).toBeTruthy()
        expect(model.apiKeyEnvVar).toBeTruthy()
      }
    }
  })

  test('known OpenRouter models are present', () => {
    const names = BENCHMARK_MODELS.map(m => m.name)
    expect(names).toContain('or-opus')
    expect(names).toContain('or-gpt5')
    expect(names).toContain('or-grok')
  })
})
