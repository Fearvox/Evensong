import { describe, test, expect } from 'bun:test'
import { parseArxivId } from '../src/ingest/arxiv.ts'

describe('parseArxivId', () => {
  test('parses full URL with abs path', () => {
    expect(parseArxivId('https://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('parses abs/ URL shorthand', () => {
    expect(parseArxivId('abs/2501.00001')).toBe('2501.00001')
  })
  test('parses bare ID', () => {
    expect(parseArxivId('2501.00001')).toBe('2501.00001')
  })
  test('parses arxiv.org/abs/ URL without https', () => {
    expect(parseArxivId('http://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('returns null for non-arxiv URL', () => {
    expect(parseArxivId('https://example.com/paper')).toBeNull()
  })
  test('handles versioned IDs like 2501.00001v2', () => {
    expect(parseArxivId('2501.00001v2')).toBe('2501.00001v2')
  })
})
