#!/usr/bin/env bun
/**
 * Privacy-safe local event envelope for Evensong conductor/control-plane use.
 *
 * This module intentionally only appends local JSONL. It does not push, call a
 * webhook, inspect auth files, or ingest anything into Research Vault.
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, relative } from 'node:path'
import { parseArgs } from 'node:util'
import type { OperatorHealthResult } from './operator-health-snapshot'

export type ConductorEventKind = 'health' | 'benchmark-run' | 'benchmark-batch' | 'memory-preflight' | 'handoff'
export type ConductorEventSeverity = 'info' | 'warn' | 'blocker'

export interface ConductorEventEvidence {
  keys?: string[]
  artifacts?: string[]
  failures?: number
  warnings?: number
  labels?: Record<string, string | number | boolean | null>
}

export interface ConductorEvent {
  schemaVersion: 'evensong-conductor-event-v1'
  ts: string
  source: 'hermes' | 'mimo' | 'codex' | 'operator-health' | 'evensong-harness' | 'research-vault' | 'manual'
  kind: ConductorEventKind
  severity: ConductorEventSeverity
  status: string
  summary: string
  runId?: string
  evidence: ConductorEventEvidence
}

export interface AppendConductorEventResult {
  ok: boolean
  skipped: boolean
  path?: string
  violations: string[]
  error?: string
}

const SECRET_PATTERNS: RegExp[] = [
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /bearer\s+\S+/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
  /token\s*[:=]\s*\S+/gi,
  /authorization\s*[:=]\s*\S+/gi,
  /[a-z0-9-]+\.ts\.net/gi,
]

const PRIVATE_PATH_PATTERN = /(?:\/Users|\/home|\/root)\/[^\s"']+/g

function sanitizeText(text: string): { value: string; violations: string[] } {
  let value = text
  const violations: string[] = []

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      violations.push(`secret-pattern:${pattern.source}`)
      value = value.replace(pattern, '[REDACTED]')
    }
    pattern.lastIndex = 0
  }

  if (PRIVATE_PATH_PATTERN.test(value)) {
    violations.push('private-path')
    value = value.replace(PRIVATE_PATH_PATTERN, '[REDACTED-PATH]')
  }
  PRIVATE_PATH_PATTERN.lastIndex = 0

  return { value, violations }
}

function sanitizeLabel(value: string | number | boolean | null): { value: string | number | boolean | null; violations: string[] } {
  if (typeof value !== 'string') return { value, violations: [] }
  return sanitizeText(value)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function normalizeArtifactPath(path: string, repoRoot: string): { value: string; violations: string[] } {
  const candidate = isAbsolute(path) ? relative(repoRoot, path) : path
  if (isAbsolute(path) && (!candidate || candidate.startsWith('..'))) {
    return { value: '[external-artifact]', violations: ['external-artifact-path'] }
  }

  return sanitizeText(candidate)
}

export function sanitizeConductorEvent(event: ConductorEvent, repoRoot = process.cwd()): { event: ConductorEvent; violations: string[] } {
  const violations: string[] = []
  const summary = sanitizeText(event.summary)
  violations.push(...summary.violations)

  const evidence: ConductorEventEvidence = {}

  if (event.evidence.keys) {
    evidence.keys = event.evidence.keys.map(key => {
      const sanitizedKey = sanitizeText(key)
      violations.push(...sanitizedKey.violations)
      return sanitizedKey.value
    })
  }

  if (event.evidence.artifacts) {
    evidence.artifacts = event.evidence.artifacts.map(path => {
      const normalized = normalizeArtifactPath(path, repoRoot)
      violations.push(...normalized.violations)
      return normalized.value
    })
  }

  if (typeof event.evidence.failures === 'number') evidence.failures = event.evidence.failures
  if (typeof event.evidence.warnings === 'number') evidence.warnings = event.evidence.warnings

  if (event.evidence.labels) {
    evidence.labels = {}
    for (const [key, value] of Object.entries(event.evidence.labels)) {
      const sanitizedKey = sanitizeText(key)
      const sanitizedValue = sanitizeLabel(value)
      violations.push(...sanitizedKey.violations, ...sanitizedValue.violations)
      evidence.labels[sanitizedKey.value] = sanitizedValue.value
    }
  }

  const runId = event.runId ? sanitizeText(event.runId) : null
  if (runId) violations.push(...runId.violations)

  return {
    event: {
      ...event,
      ...(runId ? { runId: runId.value } : {}),
      summary: summary.value,
      evidence,
    },
    violations: unique(violations),
  }
}

export function appendConductorEvent(path: string | undefined, event: ConductorEvent, repoRoot = process.cwd()): AppendConductorEventResult {
  if (!path) return { ok: true, skipped: true, violations: [] }

  const sanitized = sanitizeConductorEvent(event, repoRoot)
  if (sanitized.violations.length > 0) {
    return { ok: false, skipped: true, path, violations: sanitized.violations }
  }

  try {
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify(sanitized.event)}\n`, 'utf8')
    return { ok: true, skipped: false, path, violations: [] }
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      path,
      violations: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function createOperatorHealthEvent(result: OperatorHealthResult, ts = new Date().toISOString()): ConductorEvent {
  const severity: ConductorEventSeverity = result.failures.length > 0 ? 'blocker' : result.warnings.length > 0 ? 'warn' : 'info'
  return {
    schemaVersion: 'evensong-conductor-event-v1',
    ts,
    source: 'operator-health',
    kind: 'health',
    severity,
    status: result.status,
    summary: `operator health ${result.status} (fail=${result.failures.length} warn=${result.warnings.length})`,
    evidence: {
      keys: Object.keys(result.evidence).sort(),
      failures: result.failures.length,
      warnings: result.warnings.length,
    },
  }
}

export interface BenchmarkRunEventInput {
  run: string
  codename?: string
  model: string
  mode: string
  tests: number
  failures: number
  time_min: number
  invalid?: boolean
  invalid_reason?: string
  metric_source?: string
  harness_status?: string
  transcript_path?: string
}

export function createBenchmarkRunEvent(
  result: BenchmarkRunEventInput,
  artifacts: string[] = [],
  ts = new Date().toISOString(),
): ConductorEvent {
  const invalid = result.invalid === true || result.harness_status === 'invalid'
  return {
    schemaVersion: 'evensong-conductor-event-v1',
    ts,
    source: 'evensong-harness',
    kind: 'benchmark-run',
    severity: invalid || result.failures > 0 ? 'warn' : 'info',
    status: invalid ? 'invalid' : 'complete',
    runId: result.run,
    summary: invalid
      ? `benchmark ${result.run} invalid: ${result.invalid_reason ?? 'unspecified'}`
      : `benchmark ${result.run} complete: ${result.tests} tests, ${result.failures} failures`,
    evidence: {
      artifacts: result.transcript_path ? [...artifacts, result.transcript_path] : artifacts,
      labels: {
        codename: result.codename ?? null,
        model: result.model,
        mode: result.mode,
        tests: result.tests,
        failures: result.failures,
        time_min: result.time_min,
        metric_source: result.metric_source ?? null,
        harness_status: result.harness_status ?? null,
      },
    },
  }
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? '').split(',').map(item => item.trim()).filter(Boolean)
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      file: { type: 'string' },
      source: { type: 'string', default: 'manual' },
      kind: { type: 'string', default: 'handoff' },
      severity: { type: 'string', default: 'info' },
      status: { type: 'string', default: 'note' },
      summary: { type: 'string' },
      run: { type: 'string' },
      artifact: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  })

  if (values.help || !values.file || !values.summary) {
    console.log([
      'Usage:',
      '  bun run scripts/conductor-event.ts --file /tmp/evensong-events.jsonl --summary "handoff written"',
      '',
      'Options:',
      '  --source hermes|mimo|codex|manual',
      '  --kind health|benchmark-run|benchmark-batch|memory-preflight|handoff',
      '  --severity info|warn|blocker',
      '  --status <status>',
      '  --run <run-id>',
      '  --artifact <comma-separated repo-relative paths>',
    ].join('\n'))
    process.exit(values.help ? 0 : 2)
  }

  const event: ConductorEvent = {
    schemaVersion: 'evensong-conductor-event-v1',
    ts: new Date().toISOString(),
    source: values.source as ConductorEvent['source'],
    kind: values.kind as ConductorEventKind,
    severity: values.severity as ConductorEventSeverity,
    status: values.status ?? 'note',
    summary: values.summary,
    ...(values.run ? { runId: values.run } : {}),
    evidence: {
      artifacts: splitCsv(values.artifact),
    },
  }

  const appended = appendConductorEvent(values.file, event)
  if (!appended.ok) {
    console.error(`conductor-event: blocked (${[...appended.violations, appended.error].filter(Boolean).join(', ')})`)
    process.exit(1)
  }

  console.log(JSON.stringify(sanitizeConductorEvent(event).event))
}

if (import.meta.main) main()
