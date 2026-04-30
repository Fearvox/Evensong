import { describe, expect, test } from 'bun:test'
import { assessSnapshot, parseDfPk, parseMeminfo, renderCompact, runHealthCommand, type HealthSnapshot } from '../operator-health-snapshot'

function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    generatedAt: '2026-04-30T00:00:00.000Z',
    level: 'ok',
    load1: 1,
    cpuCount: 2,
    loadPerCpu: 0.5,
    memAvailPct: 50,
    swapUsedPct: 0,
    diskUsedPct: 40,
    tmux: { total: 1, required: {} },
    units: {},
    endpoints: [],
    notes: [],
    ...overrides,
  }
}

describe('operator health snapshot', () => {
  test('parses /proc/meminfo values needed for thresholds', () => {
    const parsed = parseMeminfo('MemTotal:       4000 kB\nMemAvailable:   1000 kB\nSwapTotal:      8000 kB\nSwapFree:       6000 kB\n')

    expect(parsed).toEqual({ totalKb: 4000, availableKb: 1000, swapTotalKb: 8000, swapFreeKb: 6000 })
  })

  test('parses df -Pk root usage without depending on host disk size', () => {
    const parsed = parseDfPk('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 100 83 17 83% /\n')

    expect(parsed).toEqual({ usedPct: 83, mount: '/' })
  })

  test('assesses warning and blocking health gates', () => {
    expect(assessSnapshot(snapshot({ memAvailPct: 15 }))).toBe('warn')
    expect(assessSnapshot(snapshot({ memAvailPct: 8 }))).toBe('block')
    expect(assessSnapshot(snapshot({ tmux: { total: 2, required: { 'hermes-sixpack': false } } }))).toBe('block')
  })


  test('command runner degrades when optional command is missing', async () => {
    const result = await runHealthCommand('__evensong_missing_health_command__', [])

    expect(result.ok).toBe(false)
    expect(result.stdout).toBe('')
    expect(result.stderr.length).toBeGreaterThan(0)
  })

  test('compact output omits raw endpoint URLs and pane text', () => {
    const text = renderCompact(
      snapshot({
        level: 'warn',
        tmux: { total: 8, required: { 'hermes-sixpack': true } },
        endpoints: [{ index: 0, ok: false, error: 'request-failed' }],
      }),
    )

    expect(text).toContain('operator-health level=warn')
    expect(text).toContain('required_tmux=hermes-sixpack:ok')
    expect(text).toContain('endpoints=0/1')
    expect(text).not.toContain('http://')
    expect(text).not.toContain('pane')
  })
})
