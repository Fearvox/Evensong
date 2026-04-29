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
}

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

export function assessDenseRarArtifactTrust(
  meta: any,
  rows: DenseRarRow[],
  options: ArtifactTrustOptions = {},
): ArtifactTrustResult {
  const blockers: string[] = []
  const warnings: string[] = []
  const requirePreflight = options.requirePreflight ?? false
  const requirePublishableEvidence = options.requirePublishableEvidence ?? false

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
    throw new Error('Usage: bun run scripts/validate-dense-rar-artifact.ts --meta <run.meta.json> --jsonl <run.jsonl> [--require-preflight] [--require-publishable]')
  }
  return {
    meta,
    jsonl,
    requirePreflight: flags.get('require-preflight') === true || flags.get('require-preflight') === 'true',
    requirePublishableEvidence: flags.get('require-publishable') === true || flags.get('require-publishable') === 'true',
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
    })
    console.log(JSON.stringify(result, null, 2))
    if (!result.formalEligible) process.exit(1)
  } catch (error) {
    console.error(`validate-dense-rar-artifact: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  }
}
