import { describe, test, expect } from 'bun:test'
import { twoWayAnova } from '../anova.js'

describe('twoWayAnova', () => {
  test('computes correct SS for known balanced design', () => {
    const data = {
      cells: [
        { a: 0, b: 0, values: [10, 12, 11] },
        { a: 0, b: 1, values: [15, 14, 16] },
        { a: 1, b: 0, values: [100, 95, 105] },
        { a: 1, b: 1, values: [200, 190, 210] },
      ],
      factorAName: 'Memory',
      factorBName: 'Pressure',
      factorALevels: ['clean', 'full'],
      factorBLevels: ['L0', 'L2'],
    }

    const result = twoWayAnova(data)

    expect(result.grandMean).toBeCloseTo(81.5, 1)
    expect(result.factorA.f).toBeGreaterThan(10)
    expect(result.factorA.p).toBeLessThan(0.05)
    expect(result.factorB.f).toBeGreaterThan(1)
    expect(result.interaction).toBeDefined()
    expect(result.factorA.df).toBe(1)
    expect(result.factorB.df).toBe(1)
    expect(result.interaction.df).toBe(1)
    expect(result.error.df).toBe(8)
  })

  test('handles unbalanced design gracefully', () => {
    const data = {
      cells: [
        { a: 0, b: 0, values: [10, 12] },
        { a: 0, b: 1, values: [15, 14, 16] },
        { a: 1, b: 0, values: [100, 95, 105] },
        { a: 1, b: 1, values: [200] },
      ],
      factorAName: 'Memory',
      factorBName: 'Pressure',
      factorALevels: ['clean', 'full'],
      factorBLevels: ['L0', 'L2'],
    }

    const result = twoWayAnova(data)
    expect(result.grandMean).toBeGreaterThan(0)
    expect(result.n).toBe(9)
  })

  test('p-value is < 0.05 for highly significant factor A', () => {
    const data = {
      cells: [
        { a: 0, b: 0, values: [1, 2, 1, 2] },
        { a: 0, b: 1, values: [1, 2, 1, 2] },
        { a: 1, b: 0, values: [98, 99, 100, 101] },
        { a: 1, b: 1, values: [98, 99, 100, 101] },
      ],
      factorAName: 'Memory',
      factorBName: 'Pressure',
      factorALevels: ['clean', 'full'],
      factorBLevels: ['L0', 'L2'],
    }

    const result = twoWayAnova(data)
    expect(result.factorA.significant).toBe(true)
    expect(result.factorA.p).toBeLessThan(0.001)
    expect(result.factorA.eta2).toBeGreaterThan(0.9)
  })

  test('cellMeans keys include all cells', () => {
    const data = {
      cells: [
        { a: 0, b: 0, values: [10, 12, 11] },
        { a: 0, b: 1, values: [15, 14, 16] },
        { a: 1, b: 0, values: [100, 95, 105] },
        { a: 1, b: 1, values: [200, 190, 210] },
      ],
      factorAName: 'Memory',
      factorBName: 'Pressure',
      factorALevels: ['clean', 'full'],
      factorBLevels: ['L0', 'L2'],
    }

    const result = twoWayAnova(data)
    expect(Object.keys(result.cellMeans)).toHaveLength(4)
    expect(result.cellMeans['clean×L0']).toBeDefined()
    expect(result.cellMeans['full×L2']).toBeDefined()
    expect(result.cellMeans['clean×L0'].mean).toBeCloseTo(11, 1)
  })

  test('SS components sum to SS_total', () => {
    const data = {
      cells: [
        { a: 0, b: 0, values: [10, 12, 11] },
        { a: 0, b: 1, values: [15, 14, 16] },
        { a: 1, b: 0, values: [100, 95, 105] },
        { a: 1, b: 1, values: [200, 190, 210] },
      ],
      factorAName: 'Memory',
      factorBName: 'Pressure',
      factorALevels: ['clean', 'full'],
      factorBLevels: ['L0', 'L2'],
    }

    const result = twoWayAnova(data)
    const ssSum = result.factorA.ss + result.factorB.ss + result.interaction.ss + result.error.ss
    expect(ssSum).toBeCloseTo(result.total.ss, 4)
  })
})
