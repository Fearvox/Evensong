import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { findPublishableLeaks } from '../dense-rar-privacy'
import { assessDenseRarArtifactTrust, parseJsonlRows } from '../validate-dense-rar-artifact'

const RUN_ID = 'dense-rar-2026-04-24T0854'
const PREFIX = 'benchmarks/runs/wave3i-dense-rar-2026-04-24T0854'

function read(path: string): string {
  return readFileSync(path, 'utf-8')
}

describe('canonical Dense RAR evidence boundaries', () => {
  test('0854 artifact remains a clean formal 24-query hard-suite run only', () => {
    const meta = JSON.parse(read(`${PREFIX}.meta.json`))
    const rows = parseJsonlRows(read(`${PREFIX}.jsonl`))
    const trust = assessDenseRarArtifactTrust(meta, rows, {
      requirePublishableEvidence: true,
    })

    expect(trust.formalEligible).toBe(true)
    expect(meta.runId).toBe(RUN_ID)
    expect(meta.runMode).toBe('formal')
    expect(meta.liveAllowed).toBe(true)
    expect(meta.git.dirty).toBe(false)
    expect(meta.inputs.querySuite.name).toBe('wave3-adversarial-retrieval')
    expect(meta.inputs.stage1TopK).toBe(50)
    expect(meta.inputs.finalTopK).toBe(5)
    expect(meta.inputs.manifestReal).toBe(18)
    expect(meta.inputs.manifestJunk).toBe(182)
    expect(rows).toHaveLength(72)

    for (const pipeline of ['dense', 'dense-rar', 'dense-adaptive']) {
      const scoped = rows.filter(row => row.pipeline === pipeline)
      expect(scoped).toHaveLength(24)
      expect(scoped.every(row => row.resultStatus === 'ok' && !row.error)).toBe(true)
    }

    for (const pipeline of ['dense-rar', 'dense-adaptive']) {
      const scoped = rows.filter(row => row.pipeline === pipeline)
      expect(scoped.filter(row => row.top1Hit === true)).toHaveLength(24)
      expect(scoped.filter(row => row.top5Hit === true)).toHaveLength(24)
    }
  })

  test('publishable Dense RAR surfaces have no private paths, private IPs, or keys', () => {
    const publishableFiles = [
      'README.md',
      'README-zh.md',
      'benchmarks/BENCHMARK-REGISTRY.md',
      'benchmarks/DENSE-RAR-FORMAL-LEDGER.md',
      `${PREFIX}.md`,
      `${PREFIX}.meta.json`,
    ]

    for (const file of publishableFiles) {
      expect({ file, leaks: findPublishableLeaks(read(file)) }).toEqual({ file, leaks: [] })
    }
  })

  test('registry and ledger keep 0854 canonical without overclaiming', () => {
    const registry = read('benchmarks/BENCHMARK-REGISTRY.md')
    const ledger = read('benchmarks/DENSE-RAR-FORMAL-LEDGER.md')
    const readme = read('README.md')

    expect(registry).toContain(`Latest formal run: \`${RUN_ID}\``)
    expect(registry).toContain('Prior `dense-rar-2026-04-24T0801` remains the Stage1TopK 20 formal baseline')
    expect(registry).toContain('Prior `dense-rar-2026-04-24T0644` remains internal/probe only')
    expect(ledger).toContain(`| ${RUN_ID} | 2026-04-24 | formal, live allowed |`)
    expect(ledger).toContain('24 queries')
    expect(readme).toContain('24-query adversarial suite')
    expect(`${registry}\n${ledger}\n${readme}`).not.toMatch(/\b(universal SOTA|state-of-the-art|best in class)\b/i)
  })
})
