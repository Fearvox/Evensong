// @ts-nocheck — integration test, dynamic dispatch through getCanonicalName
import { describe, it, expect } from 'bun:test'
import { CANONICAL_MODEL_IDS } from '../src/utils/model/configs'
import {
  CAPABILITY_REGISTRY,
  getCapability,
} from '../src/utils/model/capabilities'
import { getCanonicalName } from '../src/utils/model/model'

describe('CAPABILITY_REGISTRY — Task 1 skeleton', () => {
  it('has an entry for every canonical model ID after resolution', () => {
    for (const id of CANONICAL_MODEL_IDS) {
      const shortName = getCanonicalName(id)
      expect(CAPABILITY_REGISTRY[shortName]).toBeDefined()
    }
  })

  it('Opus 4.7 supports xhighEffort (frontier-only)', () => {
    expect(getCapability('claude-opus-4-7', 'xhighEffort')).toBe(true)
    expect(getCapability('claude-opus-4-6', 'xhighEffort')).toBe(false)
  })

  it('Opus 4.6 and 4.7 both support maxEffort', () => {
    expect(getCapability('claude-opus-4-6', 'maxEffort')).toBe(true)
    expect(getCapability('claude-opus-4-7', 'maxEffort')).toBe(true)
    expect(getCapability('claude-sonnet-4-6', 'maxEffort')).toBe(false)
  })

  it('1M context flag matches context.ts legacy', () => {
    expect(getCapability('claude-opus-4-7', 'supports1m')).toBe(true)
    expect(getCapability('claude-opus-4-6', 'supports1m')).toBe(true)
    expect(getCapability('claude-sonnet-4-5-20250929', 'supports1m')).toBe(true)
    expect(getCapability('claude-3-7-sonnet-20250219', 'supports1m')).toBe(false)
  })

  it('knowledge cutoff returns registry value', () => {
    expect(getCapability('claude-opus-4-7', 'knowledgeCutoff')).toBe('January 2026')
    expect(getCapability('claude-opus-4-6', 'knowledgeCutoff')).toBe('May 2025')
    expect(getCapability('claude-sonnet-4-6', 'knowledgeCutoff')).toBe('August 2025')
  })

  it('unknown model returns defaults (false / null)', () => {
    expect(getCapability('gpt-5-turbo', 'effort')).toBe(false)
    expect(getCapability('gpt-5-turbo', 'knowledgeCutoff')).toBe(null)
  })
})

describe('effort.ts registry migration parity — Task 2', () => {
  const {
    modelSupportsEffort,
    modelSupportsMaxEffort,
    modelSupportsXHighEffort,
  } = require('../src/utils/effort')

  const cases: Array<[string, boolean, boolean, boolean]> = [
    ['claude-opus-4-7', true, true, true],
    ['claude-opus-4-6', true, true, false],
    ['claude-sonnet-4-6', true, false, false],
    ['claude-haiku-4-5-20251001', false, false, false],
    ['claude-3-7-sonnet-20250219', false, false, false],
  ]

  for (const [model, eff, max, xh] of cases) {
    it(`${model} → effort=${eff}, max=${max}, xh=${xh}`, () => {
      expect(modelSupportsEffort(model)).toBe(eff)
      expect(modelSupportsMaxEffort(model)).toBe(max)
      expect(modelSupportsXHighEffort(model)).toBe(xh)
    })
  }
})
