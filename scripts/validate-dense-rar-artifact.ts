#!/usr/bin/env bun
/**
 * Dense RAR artifact trust validator.
 *
 * Machine-checks whether a Dense RAR run can be treated as formal evidence.
 * It intentionally separates legacy formal eligibility from stricter new
 * preflight-backed eligibility so canonical older artifacts are not overclaimed
 * or accidentally invalidated without an explicit strict mode.
 */

import { readFileSync } from 'node:fs'
import { findPublishableLeaks } from './dense-rar-privacy'

export interface ArtifactTrustOptions {
  requirePreflight?: boolean
  requirePublishableEvidence?: boolean
  requireWave3HardSuite?: boolean
}

const WAVE3_HARD_SUITE_PIPELINES = ['dense', 'dense-rar', 'dense-adaptive'] as const
const WAVE3_HARD_SUITE_QUERY_COUNT = 24

export interface ArtifactTrustResult {
  formalEligible: boolean
  status: 'formal-eligible' | 'not-formal'
  blockers: string[]
  warnings: string[]
  evidence: Record<string, unknown>
}

export interface DenseRarRow {
  resultStatus?: string
  error?: string
  [key: string]: unknown
}

function compactDirtyFiles(files: unknown): string {
  if (!Array.isArray(files) || files.length === 0) return 'unknown dirty files'
  const normalized = files.map(String)
  const shown = normalized.slice(0, 8).join(', ')
  const remaining = normalized.length - 8
  return remaining > 0 ? `${shown}, ... +${remaining} more` : shown
}

export function parseJsonlRows(text: string): DenseRarRow[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as DenseRarRow
      } catch (error) {
        return {
          resultStatus: 'error',
          error: `JSONL parse error on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    })
}

function pushWave3HardSuiteBlockers(meta: any, rows: DenseRarRow[], blockers: string[]) {
  if (meta?.inputs?.querySuite?.name !== 'wave3-adversarial-retrieval') {
    blockers.push(`querySuite is ${meta?.inputs?.querySuite?.name ?? 'missing'}, not wave3-adversarial-retrieval`)
  }

  const expectedRows = WAVE3_HARD_SUITE_PIPELINES.length * WAVE3_HARD_SUITE_QUERY_COUNT
  if (rows.length !== expectedRows) {
    blockers.push(`wave3 hard-suite row count is ${rows.length}, not ${expectedRows}`)
  }

  for (const pipeline of WAVE3_HARD_SUITE_PIPELINES) {
    const scoped = rows.filter(row => row.pipeline === pipeline)
    const queryIds = new Set(scoped.map(row => row.queryId).filter(value => typeof value === 'number'))
    if (scoped.length !== WAVE3_HARD_SUITE_QUERY_COUNT) {
      blockers.push(`${pipeline} row count is ${scoped.length}, not ${WAVE3_HARD_SUITE_QUERY_COUNT}`)
    }
    if (queryIds.size !== WAVE3_HARD_SUITE_QUERY_COUNT) {
      blockers.push(`${pipeline} unique numeric queryId count is ${queryIds.size}, not ${WAVE3_HARD_SUITE_QUERY_COUNT}`)
    }
    const missingEssentials = scoped.filter(row =>
      typeof row.queryId !== 'number' ||
      typeof row.category !== 'string' || row.category.length === 0 ||
      typeof row.query !== 'string' || row.query.length === 0 ||
      typeof row.ideal !== 'string' || row.ideal.length === 0 ||
      row.resultStatus !== 'ok',
    ).length
    if (missingEssentials > 0) {
      blockers.push(`${pipeline} has ${missingEssentials} row(s) with missing essentials or non-ok status`)
    }
  }

  const unexpectedPipelines = Array.from(new Set(rows.map(row => String(row.pipeline)))).filter(
    pipeline => !WAVE3_HARD_SUITE_PIPELINES.includes(pipeline as any),
  )
  if (unexpectedPipelines.length > 0) {
    blockers.push(`unexpected pipeline(s): ${unexpectedPipelines.join(', ')}`)
  }
}

export function assessDenseRarArtifactTrust(
  meta: any,
  rows: DenseRarRow[],
  options: ArtifactTrustOptions = {},
): ArtifactTrustResult {
  const blockers: string[] = []
  const warnings: string[] = []
  const requirePreflight = options.requirePreflight ?? false
  const requirePublishableEvidence = options.requirePublishableEvidence ?? false
  const requireWave3HardSuite = options.requireWave3HardSuite ?? false

  if (meta?.schemaVersion !== 'dense-rar-v3') {
    blockers.push(`schemaVersion is ${meta?.schemaVersion ?? 'missing'}, not dense-rar-v3`)
  }
  if (meta?.runMode !== 'formal') {
    blockers.push(`runMode is ${meta?.runMode ?? 'missing'}, not formal`)
  }
  if (meta?.git?.dirty) {
    blockers.push(`git dirty: ${compactDirtyFiles(meta.git.dirtyFiles)}`)
  }
  if (meta?.liveAllowed !== true) {
    blockers.push('live providers were not explicitly allowed')
  }

  const preflight = meta?.preflight
  if (!preflight) {
    if (requirePreflight) blockers.push('preflight evidence missing')
    else warnings.push('preflight evidence missing (legacy artifact)')
  } else if (preflight.status !== 'pass') {
    blockers.push(`preflight status is ${preflight.status}, not pass`)
  }

  const errorRows = rows.filter(row => row.resultStatus === 'error' || Boolean(row.error))
  if (errorRows.length > 0) {
    blockers.push(`jsonl has ${errorRows.length} error row(s)`)
  }
  if (rows.length === 0) {
    blockers.push('jsonl has 0 rows')
  }
  if (requireWave3HardSuite) {
    pushWave3HardSuiteBlockers(meta, rows, blockers)
  }
  if (requirePublishableEvidence) {
    const leaks = [
      ...findPublishableLeaks(JSON.stringify(meta)).map(leak => `metadata ${leak}`),
      ...findPublishableLeaks(JSON.stringify(rows)).map(leak => `jsonl ${leak}`),
    ]
    if (leaks.length > 0) {
      blockers.push(`publishable privacy leak(s): ${leaks.join('; ')}`)
    }
  }

  return {
    formalEligible: blockers.length === 0,
    status: blockers.length === 0 ? 'formal-eligible' : 'not-formal',
    blockers,
    warnings,
    evidence: {
      runId: meta?.runId ?? null,
      schemaVersion: meta?.schemaVersion ?? null,
      runMode: meta?.runMode ?? null,
      gitCommit: meta?.git?.commit ?? null,
      gitDirty: Boolean(meta?.git?.dirty),
      liveAllowed: meta?.liveAllowed === true,
      preflightStatus: preflight?.status ?? null,
      rowCount: rows.length,
      errorRows: errorRows.length,
      publishablePrivacyChecked: requirePublishableEvidence,
      wave3HardSuiteChecked: requireWave3HardSuite,
    },
  }
}

function parseArgs(argv: string[]) {
  const flags = new Map<string, string | true>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      flags.set(key, next)
      i++
    } else {
      flags.set(key, true)
    }
  }
  const meta = flags.get('meta')
  const jsonl = flags.get('jsonl')
  if (typeof meta !== 'string' || typeof jsonl !== 'string') {
    throw new Error('Usage: bun run scripts/validate-dense-rar-artifact.ts --meta <run.meta.json> --jsonl <run.jsonl> [--require-preflight] [--require-publishable] [--require-wave3-hard-suite]')
  }
  return {
    meta,
    jsonl,
    requirePreflight: flags.get('require-preflight') === true || flags.get('require-preflight') === 'true',
    requirePublishableEvidence: flags.get('require-publishable') === true || flags.get('require-publishable') === 'true',
    requireWave3HardSuite: flags.get('require-wave3-hard-suite') === true || flags.get('require-wave3-hard-suite') === 'true',
  }
}

if (import.meta.main) {
  try {
    const args = parseArgs(Bun.argv.slice(2))
    const meta = JSON.parse(readFileSync(args.meta, 'utf-8'))
    const rows = parseJsonlRows(readFileSync(args.jsonl, 'utf-8'))
    const result = assessDenseRarArtifactTrust(meta, rows, {
      requirePreflight: args.requirePreflight,
      requirePublishableEvidence: args.requirePublishableEvidence,
      requireWave3HardSuite: args.requireWave3HardSuite,
    })
    console.log(JSON.stringify(result, null, 2))
    if (!result.formalEligible) process.exit(1)
  } catch (error) {
    console.error(`validate-dense-rar-artifact: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}
