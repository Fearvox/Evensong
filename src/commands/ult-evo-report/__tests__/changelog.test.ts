/**
 * Tests for the changelog parser (EVOL-02).
 *
 * Tests cover:
 * - Conventional commit parsing (type, scope, subject)
 * - Category mapping (feat, fix, test, docs, etc.)
 * - Non-conventional commit handling
 * - Section grouping and ordering
 * - Edge cases: empty input, malformed lines, pipe in subject
 */

import { describe, test, expect } from 'bun:test'
import { parseCommitLine, parseGitLog, formatChangelog } from '../changelog.js'

describe('parseCommitLine', () => {
  test('parses conventional commit with scope', () => {
    const result = parseCommitLine('abc1234|2026-04-15|feat(AgentTool): add hermes subprocess')
    expect(result).toEqual({
      hash: 'abc1234',
      date: '2026-04-15',
      category: 'feat',
      scope: 'AgentTool',
      subject: 'add hermes subprocess',
    })
  })

  test('parses conventional commit without scope', () => {
    const result = parseCommitLine('def5678|2026-04-14|fix: close secret scanner bypass')
    expect(result).toEqual({
      hash: 'def5678',
      date: '2026-04-14',
      category: 'fix',
      scope: null,
      subject: 'close secret scanner bypass',
    })
  })

  test('parses test commit', () => {
    const result = parseCommitLine('111aaaa|2026-04-13|test: add extraction pipeline unit tests')
    expect(result).toEqual({
      hash: '111aaaa',
      date: '2026-04-13',
      category: 'test',
      scope: null,
      subject: 'add extraction pipeline unit tests',
    })
  })

  test('parses docs commit', () => {
    const result = parseCommitLine('222bbbb|2026-04-12|docs: update README')
    expect(result).toEqual({
      hash: '222bbbb',
      date: '2026-04-12',
      category: 'docs',
      scope: null,
      subject: 'update README',
    })
  })

  test('parses chore commit', () => {
    const result = parseCommitLine('333cccc|2026-04-11|chore: update planning docs')
    expect(result).toEqual({
      hash: '333cccc',
      date: '2026-04-11',
      category: 'chore',
      scope: null,
      subject: 'update planning docs',
    })
  })

  test('maps security type correctly', () => {
    const result = parseCommitLine('444dddd|2026-04-10|security(A): block /dev/tcp')
    expect(result).toEqual({
      hash: '444dddd',
      date: '2026-04-10',
      category: 'security',
      scope: 'A',
      subject: 'block /dev/tcp',
    })
  })

  test('maps benchmark type to benchmark category', () => {
    const result = parseCommitLine('555eeee|2026-04-09|benchmark: sync R060-R064')
    expect(result).toEqual({
      hash: '555eeee',
      date: '2026-04-09',
      category: 'benchmark',
      scope: null,
      subject: 'sync R060-R064',
    })
  })

  test('maps paper type to docs category', () => {
    const result = parseCommitLine('666ffff|2026-04-08|paper(en): revise per peer review')
    expect(result).toEqual({
      hash: '666ffff',
      date: '2026-04-08',
      category: 'docs',
      scope: 'en',
      subject: 'revise per peer review',
    })
  })

  test('maps branding type to chore category', () => {
    const result = parseCommitLine('777gggg|2026-04-07|branding: replace Claude Code with DASH SHATTER')
    expect(result).toEqual({
      hash: '777gggg',
      date: '2026-04-07',
      category: 'chore',
      scope: null,
      subject: 'replace Claude Code with DASH SHATTER',
    })
  })

  test('handles non-conventional commits as other', () => {
    const result = parseCommitLine('888hhhh|2026-04-06|Initial: Tencent Meeting MCP Skill v1.0.6')
    expect(result).not.toBeNull()
    expect(result!.category).toBe('other')
    expect(result!.subject).toBe('Initial: Tencent Meeting MCP Skill v1.0.6')
  })

  test('handles breaking change marker (!)', () => {
    const result = parseCommitLine('999iiii|2026-04-05|feat!: redesign API surface')
    expect(result).toEqual({
      hash: '999iiii',
      date: '2026-04-05',
      category: 'feat',
      scope: null,
      subject: 'redesign API surface',
    })
  })

  test('handles pipe character in subject', () => {
    const result = parseCommitLine('aaabbb1|2026-04-04|fix: handle a|b edge case')
    expect(result).toEqual({
      hash: 'aaabbb1',
      date: '2026-04-04',
      category: 'fix',
      scope: null,
      subject: 'handle a|b edge case',
    })
  })

  test('returns null for empty line', () => {
    expect(parseCommitLine('')).toBeNull()
  })

  test('returns null for malformed line without enough parts', () => {
    expect(parseCommitLine('abc1234')).toBeNull()
    expect(parseCommitLine('abc1234|2026-04-15')).toBeNull()
  })
})

describe('parseGitLog', () => {
  test('parses multi-line git log into sections', () => {
    const raw = [
      'aaa1111|2026-04-15|feat(UI): add dashboard',
      'bbb2222|2026-04-14|fix: correct typo',
      'ccc3333|2026-04-13|test: add unit tests',
      'ddd4444|2026-04-12|feat: new CLI flag',
      'eee5555|2026-04-11|docs: update README',
    ].join('\n')

    const changelog = parseGitLog(raw, 'v1.0.0')
    expect(changelog.sinceRef).toBe('v1.0.0')
    expect(changelog.totalCommits).toBe(5)
    expect(changelog.sections.length).toBeGreaterThan(0)

    // Features section should have 2 entries
    const featSection = changelog.sections.find(s => s.category === 'feat')
    expect(featSection).toBeDefined()
    expect(featSection!.entries.length).toBe(2)

    // Fix section should have 1 entry
    const fixSection = changelog.sections.find(s => s.category === 'fix')
    expect(fixSection).toBeDefined()
    expect(fixSection!.entries.length).toBe(1)
  })

  test('handles empty input', () => {
    const changelog = parseGitLog('', null)
    expect(changelog.totalCommits).toBe(0)
    expect(changelog.sections.length).toBe(0)
    expect(changelog.sinceRef).toBeNull()
  })

  test('sections are ordered correctly', () => {
    const raw = [
      'a1|2026-04-15|docs: readme',
      'b2|2026-04-14|feat: feature',
      'c3|2026-04-13|test: test',
      'd4|2026-04-12|fix: bugfix',
    ].join('\n')

    const changelog = parseGitLog(raw, null)
    const order = changelog.sections.map(s => s.category)
    // Expected: feat, fix, test, docs (per CATEGORY_ORDER)
    expect(order).toEqual(['feat', 'fix', 'test', 'docs'])
  })
})

describe('formatChangelog', () => {
  test('formats changelog as markdown', () => {
    const raw = [
      'aaa1111|2026-04-15|feat(UI): add dashboard',
      'bbb2222|2026-04-14|fix: correct typo',
    ].join('\n')

    const changelog = parseGitLog(raw, 'v1.0.0')
    const formatted = formatChangelog(changelog)

    expect(formatted).toContain('## Changelog (since v1.0.0)')
    expect(formatted).toContain('2 commits')
    expect(formatted).toContain('### Features')
    expect(formatted).toContain('**UI**: add dashboard')
    expect(formatted).toContain('### Bug Fixes')
    expect(formatted).toContain('correct typo')
    expect(formatted).toContain('`aaa1111`')
  })

  test('formats changelog without tag as all commits', () => {
    const changelog = parseGitLog('a1|2026-04-15|feat: test', null)
    const formatted = formatChangelog(changelog)
    expect(formatted).toContain('## Changelog (all commits)')
  })
})
