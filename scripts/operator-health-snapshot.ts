#!/usr/bin/env bun
/**
 * Side-effect-free operator health snapshot for Hermes/tmux lanes.
 *
 * Observes local load, memory, swap, root disk, required tmux sessions,
 * optional systemd units, and loopback-only health endpoints. It never prints
 * endpoint bodies or raw endpoint URLs.
 */

export type HealthLevel = 'ok' | 'warn' | 'block'

export interface Thresholds {
  loadPerCpuWarn: number
  loadPerCpuBlock: number
  memAvailWarnPct: number
  memAvailBlockPct: number
  swapUsedWarnPct: number
  swapUsedBlockPct: number
  diskUsedWarnPct: number
  diskUsedBlockPct: number
}

export interface HealthSnapshot {
  generatedAt: string
  level: HealthLevel
  load1: number
  cpuCount: number
  loadPerCpu: number
  memAvailPct: number
  swapUsedPct: number
  diskUsedPct: number
  tmux: { total: number; required: Record<string, boolean> }
  units: Record<string, string>
  endpoints: Array<{ index: number; ok: boolean; status?: number; error?: string }>
  notes: string[]
}

export interface OperatorHealthResult {
  ok: boolean
  status: string
  failures: string[]
  warnings: string[]
  evidence: Record<string, string>
}

const DEFAULT_THRESHOLDS: Thresholds = {
  loadPerCpuWarn: 1.5,
  loadPerCpuBlock: 2.5,
  memAvailWarnPct: 20,
  memAvailBlockPct: 10,
  swapUsedWarnPct: 40,
  swapUsedBlockPct: 70,
  diskUsedWarnPct: 80,
  diskUsedBlockPct: 90,
}

function splitList(value: string | undefined): string[] {
  return (value || '')
    .split(/[\s,]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function pct(used: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.round((used / total) * 1000) / 10
}

export function parseMeminfo(text: string): { totalKb: number; availableKb: number; swapTotalKb: number; swapFreeKb: number } {
  const values = new Map<string, number>()
  for (const line of text.split('\n')) {
    const match = /^(\w+):\s+(\d+)/.exec(line)
    if (match) values.set(match[1], Number(match[2]))
  }
  return {
    totalKb: values.get('MemTotal') || 0,
    availableKb: values.get('MemAvailable') || 0,
    swapTotalKb: values.get('SwapTotal') || 0,
    swapFreeKb: values.get('SwapFree') || 0,
  }
}

export function parseDfPk(text: string): { usedPct: number; mount: string } {
  const lines = text.trim().split('\n')
  const parts = lines.at(-1)?.trim().split(/\s+/) || []
  const usedPct = Number((parts[4] || '0').replace('%', ''))
  return { usedPct: Number.isFinite(usedPct) ? usedPct : 0, mount: parts[5] || '/' }
}

function worst(a: HealthLevel, b: HealthLevel): HealthLevel {
  const order: Record<HealthLevel, number> = { ok: 0, warn: 1, block: 2 }
  return order[b] > order[a] ? b : a
}

export function assessSnapshot(snapshot: Omit<HealthSnapshot, 'level'>, thresholds: Thresholds = DEFAULT_THRESHOLDS): HealthLevel {
  let level: HealthLevel = 'ok'
  if (snapshot.loadPerCpu >= thresholds.loadPerCpuBlock) level = worst(level, 'block')
  else if (snapshot.loadPerCpu >= thresholds.loadPerCpuWarn) level = worst(level, 'warn')

  if (snapshot.memAvailPct <= thresholds.memAvailBlockPct) level = worst(level, 'block')
  else if (snapshot.memAvailPct <= thresholds.memAvailWarnPct) level = worst(level, 'warn')

  if (snapshot.swapUsedPct >= thresholds.swapUsedBlockPct) level = worst(level, 'block')
  else if (snapshot.swapUsedPct >= thresholds.swapUsedWarnPct) level = worst(level, 'warn')

  if (snapshot.diskUsedPct >= thresholds.diskUsedBlockPct) level = worst(level, 'block')
  else if (snapshot.diskUsedPct >= thresholds.diskUsedWarnPct) level = worst(level, 'warn')

  if (Object.values(snapshot.tmux.required).some(exists => !exists)) level = worst(level, 'block')
  if (Object.values(snapshot.units).some(state => state !== 'active')) level = worst(level, 'block')
  if (snapshot.endpoints.some(endpoint => !endpoint.ok)) level = worst(level, 'warn')
  return level
}

export async function runHealthCommand(command: string, args: string[], timeoutMs = 1500): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  let proc
  try {
    proc = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'pipe' })
  } catch (err) {
    return { ok: false, stdout: '', stderr: err instanceof Error ? err.message : String(err) }
  }
  const timer = setTimeout(() => proc.kill(), timeoutMs)
  try {
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    return { ok: exitCode === 0, stdout, stderr }
  } finally {
    clearTimeout(timer)
  }
}

async function getTmux(required: string[]): Promise<{ total: number; required: Record<string, boolean> }> {
  const result = await runHealthCommand('tmux', ['list-sessions', '-F', '#S'])
  const sessions = result.ok ? result.stdout.split('\n').filter(Boolean) : []
  return { total: sessions.length, required: Object.fromEntries(required.map(name => [name, sessions.includes(name)])) }
}

async function getUnits(units: string[]): Promise<Record<string, string>> {
  const entries: Array<[string, string]> = []
  for (const unit of units) {
    const result = await runHealthCommand('systemctl', ['is-active', unit])
    entries.push([unit, result.ok ? result.stdout.trim() || 'active' : result.stdout.trim() || 'inactive'])
  }
  return Object.fromEntries(entries)
}

function isLoopbackEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

async function checkEndpoints(endpoints: string[]): Promise<HealthSnapshot['endpoints']> {
  const checks: HealthSnapshot['endpoints'] = []
  for (const [index, endpoint] of endpoints.entries()) {
    if (!isLoopbackEndpoint(endpoint)) {
      checks.push({ index, ok: false, error: 'non-loopback-skipped' })
      continue
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    try {
      const response = await fetch(endpoint, { signal: controller.signal })
      checks.push({ index, ok: response.ok, status: response.status })
    } catch {
      checks.push({ index, ok: false, error: 'request-failed' })
    } finally {
      clearTimeout(timer)
    }
  }
  return checks
}

export async function collectHealthSnapshot(env: NodeJS.ProcessEnv = process.env): Promise<HealthSnapshot> {
  const meminfo = parseMeminfo(await Bun.file('/proc/meminfo').text())
  const loadRaw = (await Bun.file('/proc/loadavg').text()).trim().split(/\s+/)[0]
  const load1 = Number(loadRaw) || 0
  const cpuCount = navigator.hardwareConcurrency || 1
  const dfResult = await runHealthCommand('df', ['-Pk', '/'])
  const df = dfResult.ok ? parseDfPk(dfResult.stdout) : { usedPct: 100, mount: '/' }
  const requiredTmux = splitList(env.OPERATOR_HEALTH_REQUIRED_TMUX)
  const units = splitList(env.OPERATOR_HEALTH_UNITS)
  const endpoints = splitList(env.OPERATOR_HEALTH_ENDPOINTS)

  const partial: Omit<HealthSnapshot, 'level'> = {
    generatedAt: new Date().toISOString(),
    load1,
    cpuCount,
    loadPerCpu: Math.round((load1 / cpuCount) * 100) / 100,
    memAvailPct: pct(meminfo.availableKb, meminfo.totalKb),
    swapUsedPct: pct(meminfo.swapTotalKb - meminfo.swapFreeKb, meminfo.swapTotalKb),
    diskUsedPct: df.usedPct,
    tmux: await getTmux(requiredTmux),
    units: await getUnits(units),
    endpoints: await checkEndpoints(endpoints),
    notes: [
      'thresholds: load/cpu warn>=1.5 block>=2.5; mem_avail warn<=20% block<=10%; swap warn>=40% block>=70%; disk warn>=80% block>=90%',
      'observation-only: no services restarted, no pane text captured, endpoint bodies and raw URLs omitted',
      ...(!dfResult.ok ? [`df-unavailable: ${dfResult.stderr || 'command failed'}`] : []),
    ],
  }
  return { ...partial, level: assessSnapshot(partial) }
}

export function renderCompact(snapshot: HealthSnapshot): string {
  const required = Object.entries(snapshot.tmux.required)
    .map(([name, exists]) => `${name}:${exists ? 'ok' : 'missing'}`)
    .join(',') || 'none'
  const unitSummary = Object.entries(snapshot.units)
    .map(([name, state]) => `${name}:${state}`)
    .join(',') || 'none'
  const endpointsOk = snapshot.endpoints.filter(endpoint => endpoint.ok).length
  return `operator-health level=${snapshot.level} load1=${snapshot.load1.toFixed(2)} load_per_cpu=${snapshot.loadPerCpu.toFixed(2)} mem_avail=${snapshot.memAvailPct}% swap_used=${snapshot.swapUsedPct}% disk_used=${snapshot.diskUsedPct}% tmux_total=${snapshot.tmux.total} required_tmux=${required} units=${unitSummary} endpoints=${endpointsOk}/${snapshot.endpoints.length}`
}

async function main(): Promise<void> {
  const compact = process.argv.includes('--compact')
  const snapshot = await collectHealthSnapshot()
  console.log(compact ? renderCompact(snapshot) : JSON.stringify(snapshot, null, 2))
}

if (import.meta.main) main()
