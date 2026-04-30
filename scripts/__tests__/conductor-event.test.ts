import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendConductorEvent,
  createBenchmarkRunEvent,
  createOperatorHealthEvent,
  sanitizeConductorEvent,
} from '../conductor-event'

describe('conductor event envelope', () => {
  test('creates compact operator health event with evidence keys only', () => {
    const event = createOperatorHealthEvent({
      ok: false,
      status: 'blocked',
      failures: ['required endpoint gateway failed: error=TypeError'],
      warnings: ['optional unit dense-rar-benchmark.service is inactive/dead'],
      evidence: {
        'endpoint:gateway': 'error=TypeError',
        'unit:dense-rar-benchmark.service': 'loaded inactive/dead',
        tmux: 'hermes-harness',
      },
    }, '2026-04-29T00:00:00.000Z')

    expect(event.schemaVersion).toBe('evensong-conductor-event-v1')
    expect(event.source).toBe('operator-health')
    expect(event.kind).toBe('health')
    expect(event.severity).toBe('blocker')
    expect(event.evidence.keys).toEqual(['endpoint:gateway', 'tmux', 'unit:dense-rar-benchmark.service'])
    expect(JSON.stringify(event)).not.toContain('TypeError')
  })

  test('normalizes benchmark artifact paths to repo-relative paths', () => {
    const repoRoot = '/root/codex-sixpack-20260429/worktrees/conductor'
    const event = createBenchmarkRunEvent({
      run: 'R100',
      codename: 'or-gpt5-L2',
      model: 'GPT-5.4',
      mode: 'L2 / Clean',
      tests: 48,
      failures: 0,
      time_min: 12.5,
      metric_source: 'bun-test',
      harness_status: 'ok',
      transcript_path: `${repoRoot}/benchmarks/runs/R100/transcript.jsonl`,
    }, [`${repoRoot}/benchmarks/runs/R100/result.json`], '2026-04-29T00:00:00.000Z')

    const sanitized = sanitizeConductorEvent(event, repoRoot)

    expect(sanitized.violations).toEqual([])
    expect(sanitized.event.evidence.artifacts).toEqual([
      'benchmarks/runs/R100/result.json',
      'benchmarks/runs/R100/transcript.jsonl',
    ])
    expect(sanitized.event.status).toBe('complete')
  })

  test('blocks appending events that would leak secrets or private paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conductor-event-'))
    const file = join(dir, 'events.jsonl')
    const event = createBenchmarkRunEvent({
      run: 'R101',
      model: 'GPT-5.4',
      mode: 'L2 / Clean',
      tests: 0,
      failures: 0,
      time_min: 0,
      invalid: true,
      invalid_reason: 'token=abc123 leaked from /root/private/session',
      transcript_path: '/repo/benchmarks/runs/R101/transcript.jsonl',
    }, [], '2026-04-29T00:00:00.000Z')

    const result = appendConductorEvent(file, event, '/repo')

    expect(result.ok).toBe(false)
    expect(result.skipped).toBe(true)
    expect(result.violations).toContain('secret-pattern:token\\s*[:=]\\s*\\S+')
    expect(result.violations).toContain('private-path')
  })



  test('blocks appending events when status contains secret-like text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conductor-event-'))
    const file = join(dir, 'events.jsonl')
    const event = createBenchmarkRunEvent({
      run: 'R103',
      model: 'GPT-5.4',
      mode: 'L0 / Clean',
      tests: 1,
      failures: 0,
      time_min: 1,
    }, [], '2026-04-29T00:00:00.000Z')
    event.status = 'token=abc123'

    const result = appendConductorEvent(file, event, process.cwd())

    expect(result.ok).toBe(false)
    expect(result.skipped).toBe(true)
    expect(result.violations).toContain('secret-pattern:token\\s*[:=]\\s*\\S+')
  })

  test('sanitizes private paths in status and reports violation', () => {
    const event = createBenchmarkRunEvent({
      run: 'R104',
      model: 'GPT-5.4',
      mode: 'L0 / Clean',
      tests: 1,
      failures: 0,
      time_min: 1,
    }, [], '2026-04-29T00:00:00.000Z')
    event.status = 'stored at /root/private/session'

    const sanitized = sanitizeConductorEvent(event, '/repo')

    expect(sanitized.violations).toContain('private-path')
    expect(sanitized.event.status).toBe('stored at [REDACTED-PATH]')
  })

  test('appends JSONL when event is safe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conductor-event-'))
    const file = join(dir, 'events.jsonl')
    const event = createBenchmarkRunEvent({
      run: 'R102',
      model: 'GPT-5.4',
      mode: 'L0 / Clean',
      tests: 12,
      failures: 0,
      time_min: 4.1,
    }, ['benchmarks/runs/R102/result.json'], '2026-04-29T00:00:00.000Z')

    const result = appendConductorEvent(file, event, process.cwd())
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    const parsed = JSON.parse(lines[0]!)

    expect(result.ok).toBe(true)
    expect(result.skipped).toBe(false)
    expect(lines).toHaveLength(1)
    expect(parsed.runId).toBe('R102')
    expect(parsed.evidence.artifacts).toEqual(['benchmarks/runs/R102/result.json'])
  })

  test('blocks malformed event envelopes before writing JSONL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conductor-event-'))
    const file = join(dir, 'events.jsonl')
    const event = {
      schemaVersion: 'evensong-conductor-event-v1',
      ts: '2026-04-29T00:00:00.000Z',
      source: 'unknown-source',
      kind: 'handoff',
      severity: 'info',
      status: 'note',
      summary: 'handoff ready',
      evidence: {},
    } as const

    const result = appendConductorEvent(file, event as any, process.cwd())

    expect(result.ok).toBe(false)
    expect(result.skipped).toBe(true)
    expect(result.violations).toContain('invalid-source')
  })
})
