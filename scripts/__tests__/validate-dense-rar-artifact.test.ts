import { describe, expect, test } from 'bun:test'
import { assessDenseRarArtifactTrust, parseJsonlRows } from '../validate-dense-rar-artifact'

const baseMeta = {
  schemaVersion: 'dense-rar-v3',
  runId: 'dense-rar-test',
  runMode: 'formal',
  liveAllowed: true,
  git: { commit: 'abc123', dirty: false, dirtyFiles: [] },
  preflight: { status: 'pass', checkedAt: '2026-04-26T10:00:00.000Z', evidence: { git: 'abc123 clean' } },
}

const okRows = [
  { pipeline: 'dense-rar', queryId: 1, resultStatus: 'ok', top1Hit: true, top5Hit: true },
  { pipeline: 'dense-adaptive', queryId: 1, resultStatus: 'ok', top1Hit: true, top5Hit: true },
]
const PRIVATE_BGE_URL = `http://${['10', '0', '0', '5'].join('.')}:8080/v1`
const PRIVATE_VAULT_ROOT = ['', 'home', 'operator', 'research-vault'].join('/')

describe('dense RAR artifact trust validator', () => {
  test('accepts a formal clean live run with passing preflight and no row errors', () => {
    const result = assessDenseRarArtifactTrust(baseMeta, okRows, { requirePreflight: true })

    expect(result.formalEligible).toBe(true)
    expect(result.status).toBe('formal-eligible')
    expect(result.blockers).toEqual([])
  })

  test('rejects probe, dirty, live-unverified, failed-preflight, and row-error artifacts', () => {
    const result = assessDenseRarArtifactTrust({
      ...baseMeta,
      runMode: 'probe',
      liveAllowed: false,
      git: { commit: 'abc123', dirty: true, dirtyFiles: ['M file.ts'] },
      preflight: { status: 'warn', checkedAt: '2026-04-26T10:00:00.000Z', evidence: {} },
    }, [
      ...okRows,
      { pipeline: 'dense-rar', queryId: 2, resultStatus: 'error', error: 'provider failed' },
    ], { requirePreflight: true })

    expect(result.formalEligible).toBe(false)
    expect(result.status).toBe('not-formal')
    expect(result.blockers).toContain('runMode is probe, not formal')
    expect(result.blockers).toContain('git dirty: M file.ts')
    expect(result.blockers).toContain('live providers were not explicitly allowed')
    expect(result.blockers).toContain('preflight status is warn, not pass')
    expect(result.blockers).toContain('jsonl has 1 error row(s)')
  })

  test('allows legacy formal artifacts without preflight only when strict preflight is disabled', () => {
    const { preflight: _preflight, ...legacyMeta } = baseMeta

    const relaxed = assessDenseRarArtifactTrust(legacyMeta, okRows, { requirePreflight: false })
    expect(relaxed.formalEligible).toBe(true)
    expect(relaxed.warnings).toContain('preflight evidence missing (legacy artifact)')

    const strict = assessDenseRarArtifactTrust(legacyMeta, okRows, { requirePreflight: true })
    expect(strict.formalEligible).toBe(false)
    expect(strict.blockers).toContain('preflight evidence missing')
  })

  test('compacts long dirty file lists in blocker output', () => {
    const result = assessDenseRarArtifactTrust({
      ...baseMeta,
      git: { commit: 'abc123', dirty: true, dirtyFiles: Array.from({ length: 12 }, (_, i) => `file-${i}.ts`) },
    }, okRows)

    expect(result.blockers.find(blocker => blocker.startsWith('git dirty:'))).toContain('+4 more')
  })

  test('parses JSONL rows and preserves parse failures as error rows', () => {
    const rows = parseJsonlRows('{"resultStatus":"ok"}\nnot-json\n')

    expect(rows).toHaveLength(2)
    expect(rows[0].resultStatus).toBe('ok')
    expect(rows[1].resultStatus).toBe('error')
    expect(rows[1].error).toContain('JSONL parse error')
  })

  test('rejects publishable artifacts with private paths or IPs when required', () => {
    const result = assessDenseRarArtifactTrust({
      ...baseMeta,
      inputs: { vaultRoot: PRIVATE_VAULT_ROOT },
      providers: { bgeBaseURL: PRIVATE_BGE_URL },
    }, okRows, { requirePublishableEvidence: true })

    expect(result.formalEligible).toBe(false)
    expect(result.blockers.find(blocker => blocker.includes('publishable privacy leak'))).toBeTruthy()
  })
})
