import { describe, test, expect } from 'bun:test'
import { buildPrompt, getPressureLabel, getMemoryLabel } from '../prompts.js'

describe('buildPrompt', () => {
  describe('pressure levels', () => {
    test('L0 returns prompt WITHOUT pressure modifier', () => {
      const prompt = buildPrompt('L0', 8)
      // L0 has empty modifier, so prompt starts directly with the base prompt
      expect(prompt).toMatch(/^Build a production-ready microservice suite/)
      // Should NOT contain the separator used when modifier is present
      expect(prompt).not.toContain('---\n\nBuild a production-ready')
    })

    test('L1 prepends mild encouragement', () => {
      const prompt = buildPrompt('L1', 8)
      expect(prompt).toContain('I believe in your capabilities')
      expect(prompt).toContain('Take your time')
      // Modifier should appear before the separator
      expect(prompt.indexOf('I believe')).toBeLessThan(prompt.indexOf('Build a production-ready'))
    })

    test('L2 prepends PUA moderate text containing "ROI"', () => {
      const prompt = buildPrompt('L2', 8)
      expect(prompt).toContain('ROI')
      expect(prompt).toContain('Day 1')
      // Modifier appears before main prompt
      expect(prompt.indexOf('ROI')).toBeLessThan(prompt.indexOf('Build a production-ready'))
    })

    test('L3 prepends extreme text containing "12 minutes"', () => {
      const prompt = buildPrompt('L3', 8)
      expect(prompt).toContain('12 minutes')
      expect(prompt).toContain('prove otherwise')
      // Modifier appears before main prompt
      expect(prompt.indexOf('12 minutes')).toBeLessThan(prompt.indexOf('Build a production-ready'))
    })

    test('L1/L2/L3 all include separator between modifier and base prompt', () => {
      for (const level of ['L1', 'L2', 'L3'] as const) {
        const prompt = buildPrompt(level, 8)
        expect(prompt).toContain('\n\n---\n\n')
      }
    })
  })

  describe('service count', () => {
    test('buildPrompt with 8 services lists exactly 8 services', () => {
      const prompt = buildPrompt('L0', 8)
      expect(prompt).toContain('(8 total)')
      // Check all 8 service names
      expect(prompt).toContain('**auth**')
      expect(prompt).toContain('**users**')
      expect(prompt).toContain('**products**')
      expect(prompt).toContain('**orders**')
      expect(prompt).toContain('**payments**')
      expect(prompt).toContain('**notifications**')
      expect(prompt).toContain('**analytics**')
      expect(prompt).toContain('**search**')
      // Should NOT contain the extended services
      expect(prompt).not.toContain('**inventory**')
      expect(prompt).not.toContain('**recommendations**')
    })

    test('buildPrompt with 10 services lists 10 services', () => {
      const prompt = buildPrompt('L0', 10)
      expect(prompt).toContain('(10 total)')
      // Check the extra 2 services
      expect(prompt).toContain('**inventory**')
      expect(prompt).toContain('**recommendations**')
      // Also contains the original 8
      expect(prompt).toContain('**auth**')
      expect(prompt).toContain('**search**')
    })

    test('buildPrompt with 5 services lists only 5', () => {
      const prompt = buildPrompt('L0', 5)
      expect(prompt).toContain('(5 total)')
      expect(prompt).toContain('**auth**')
      expect(prompt).toContain('**users**')
      expect(prompt).toContain('**products**')
      expect(prompt).toContain('**orders**')
      expect(prompt).toContain('**payments**')
      expect(prompt).not.toContain('**notifications**')
    })

    test('buildPrompt with 9 services includes inventory but not recommendations', () => {
      const prompt = buildPrompt('L0', 9)
      expect(prompt).toContain('(9 total)')
      expect(prompt).toContain('**inventory**')
      expect(prompt).not.toContain('**recommendations**')
    })
  })

  describe('prompt content', () => {
    test('includes technical stack requirements', () => {
      const prompt = buildPrompt('L0', 8)
      expect(prompt).toContain('Runtime: Bun')
      expect(prompt).toContain('bun:test')
      expect(prompt).toContain('in-memory stores')
    })

    test('includes quality bar', () => {
      const prompt = buildPrompt('L0', 8)
      expect(prompt).toContain('Minimum 40 tests per service')
      expect(prompt).toContain('Zero test failures')
      expect(prompt).toContain('500 lines')
    })

    test('includes numbered service list', () => {
      const prompt = buildPrompt('L0', 8)
      expect(prompt).toContain('1. **auth** service')
      expect(prompt).toContain('8. **search** service')
    })
  })
})

describe('getPressureLabel', () => {
  test('returns "No Pressure" for L0', () => {
    expect(getPressureLabel('L0')).toBe('No Pressure')
  })

  test('returns "Mild Encouragement" for L1', () => {
    expect(getPressureLabel('L1')).toBe('Mild Encouragement')
  })

  test('returns "PUA Moderate" for L2', () => {
    expect(getPressureLabel('L2')).toBe('PUA Moderate')
  })

  test('returns "PUA Extreme + Deadline" for L3', () => {
    expect(getPressureLabel('L3')).toBe('PUA Extreme + Deadline')
  })

  test('returns input string for unknown level', () => {
    expect(getPressureLabel('L9')).toBe('L9')
    expect(getPressureLabel('unknown')).toBe('unknown')
  })
})

describe('getMemoryLabel', () => {
  test('returns "Evolved Memory" for full', () => {
    expect(getMemoryLabel('full')).toBe('Evolved Memory')
  })

  test('returns "Single-Blind (filtered)" for blind', () => {
    expect(getMemoryLabel('blind')).toBe('Single-Blind (filtered)')
  })

  test('returns "Clean Room (zero memory)" for clean', () => {
    expect(getMemoryLabel('clean')).toBe('Clean Room (zero memory)')
  })

  test('returns input string for unknown state', () => {
    expect(getMemoryLabel('partial')).toBe('partial')
    expect(getMemoryLabel('')).toBe('')
  })
})
