import { describe, test, expect } from 'bun:test'
import {
  buildVaultManifest,
  extractExcerpt,
  joinRegistryWithDecay,
  type RegistryEntry,
  type DecayEntry,
} from '../manifestBuilder.js'

describe('extractExcerpt', () => {
  test('skips H1 + metadata blockquote and returns first real paragraph', () => {
    const md = `# MSA Paper Title

> Source: local | Ingested: 2026-04-11 | ID: foo
> Authors: A, B, C

## Core Thesis

稀疏注意力 + Document-wise RoPE 实现端到端记忆。

## Key Findings

- first bullet
`
    expect(extractExcerpt(md)).toBe('稀疏注意力 + Document-wise RoPE 实现端到端记忆。')
  })

  test('returns empty string for md with only headings + lists', () => {
    const md = `# Title\n\n## Sec\n\n- item1\n- item2\n`
    expect(extractExcerpt(md)).toBe('')
  })

  test('truncates to 200 chars', () => {
    const long = 'a'.repeat(500)
    const md = `# T\n\n${long}\n`
    const result = extractExcerpt(md)
    expect(result.length).toBeLessThanOrEqual(200)
  })
})

describe('joinRegistryWithDecay', () => {
  const reg: RegistryEntry[] = [
    {
      id: 'a',
      title: 'A',
      rawPath: 'raw/a.md',
      knowledgePath: 'knowledge/a.md',
      status: 'analyzed',
      tags: [],
      ingestedAt: '2026-01-01',
      source: 'local',
    },
    {
      id: 'b',
      title: 'B',
      rawPath: 'raw/b.md',
      knowledgePath: 'knowledge/b.md',
      status: 'analyzed',
      tags: [],
      ingestedAt: '2026-01-02',
      source: 'local',
    },
  ]
  const decay: DecayEntry[] = [
    { itemId: 'a', score: 0.9, accessCount: 3, lastAccess: '2026-04-01', summaryLevel: 'deep', nextReviewAt: '', difficulty: 1 },
    // b is missing on purpose (fresh entry, never accessed)
  ]

  test('joins entries by id; missing decay gets defaults', () => {
    const joined = joinRegistryWithDecay(reg, decay)
    expect(joined.length).toBe(2)
    const a = joined.find((x) => x.id === 'a')!
    expect(a.retentionScore).toBe(0.9)
    expect(a.summaryLevel).toBe('deep')
    const b = joined.find((x) => x.id === 'b')!
    expect(b.retentionScore).toBe(1) // fresh default
    expect(b.accessCount).toBe(0)
    expect(b.summaryLevel).toBe('deep')
  })

  test('joins decay metadata when registry ids carry ingest timestamp prefixes', () => {
    const joined = joinRegistryWithDecay([
      {
        id: '20260429-0744-memory-layer',
        title: 'Memory Layer',
        rawPath: 'raw/memory-layer.md',
        knowledgePath: 'knowledge/memory-layer.md',
        status: 'analyzed',
        tags: [],
        ingestedAt: '2026-04-29',
        source: 'local',
      },
    ], [
      { itemId: 'memory-layer', score: 0.37, accessCount: 5, lastAccess: '2026-04-29', summaryLevel: 'shallow', nextReviewAt: '', difficulty: 1 },
    ])

    expect(joined).toHaveLength(1)
    expect(joined[0]).toMatchObject({
      id: '20260429-0744-memory-layer',
      retentionScore: 0.37,
      accessCount: 5,
      summaryLevel: 'shallow',
    })
  })

  test('filters entries below minRetention', () => {
    const joined = joinRegistryWithDecay(reg, decay, { minRetention: 0.95 })
    // a has 0.9 → dropped, b has default 1 → kept
    expect(joined.length).toBe(1)
    expect(joined[0]?.id).toBe('b')
  })
})

describe('buildVaultManifest (integration with fake FS)', () => {
  test('produces VaultManifestEntry[] with path, title, retention, excerpt', async () => {
    const fakeFs = new Map<string, string>([
      [
        '/vault/.meta/registry.jsonl',
        JSON.stringify({
          id: 'foo',
          title: 'Foo',
          rawPath: 'raw/foo.md',
          knowledgePath: 'knowledge/foo.md',
          status: 'analyzed',
          tags: [],
          ingestedAt: '2026-01-01',
          source: 'local',
        }) + '\n',
      ],
      [
        '/vault/.meta/decay-scores.json',
        JSON.stringify([
          {
            itemId: 'foo',
            score: 0.8,
            accessCount: 2,
            lastAccess: '2026-03-01',
            summaryLevel: 'deep',
            nextReviewAt: '',
            difficulty: 1,
          },
        ]),
      ],
      ['/vault/knowledge/foo.md', '# Foo Title\n\n## Intro\n\nFoo is a concept.\n'],
    ])
    const result = await buildVaultManifest({
      vaultRoot: '/vault',
      readFile: (p: string) => {
        const v = fakeFs.get(p)
        if (v === undefined) throw new Error(`ENOENT ${p}`)
        return v
      },
    })
    expect(result.length).toBe(1)
    const entry = result[0]!
    expect(entry.path).toBe('knowledge/foo.md')
    expect(entry.title).toBe('Foo')
    expect(entry.retentionScore).toBe(0.8)
    expect(entry.accessCount).toBe(2)
    expect(entry.summaryLevel).toBe('deep')
    expect(entry.excerpt).toBe('Foo is a concept.')
  })

  test('skips entry when knowledge md is missing (raw-only)', async () => {
    const fakeFs = new Map<string, string>([
      [
        '/vault/.meta/registry.jsonl',
        JSON.stringify({
          id: 'orphan',
          title: 'Orphan',
          rawPath: 'raw/orphan.md',
          knowledgePath: 'knowledge/orphan.md',
          status: 'analyzed',
          tags: [],
          ingestedAt: '2026-01-01',
          source: 'local',
        }) + '\n',
      ],
      ['/vault/.meta/decay-scores.json', '[]'],
    ])
    const result = await buildVaultManifest({
      vaultRoot: '/vault',
      readFile: (p: string) => {
        const v = fakeFs.get(p)
        if (v === undefined) throw new Error(`ENOENT ${p}`)
        return v
      },
    })
    // orphan's knowledge file is missing; entry dropped.
    expect(result.length).toBe(0)
  })

  test('supports legacy object-shaped decay score stores', async () => {
    const fakeFs = new Map<string, string>([
      [
        '/vault/.meta/registry.jsonl',
        JSON.stringify({
          id: 'legacy-note',
          title: 'Legacy Note',
          rawPath: 'raw/legacy-note.md',
          knowledgePath: 'knowledge/legacy-note.md',
          status: 'analyzed',
          tags: [],
          ingestedAt: '2026-01-01',
          source: 'local',
        }) + '\n',
      ],
      [
        '/vault/.meta/decay-scores.json',
        JSON.stringify({
          'legacy-note': {
            itemId: 'legacy-note',
            score: 0.42,
            accessCount: 7,
            lastAccess: '2026-04-20',
            summaryLevel: 'shallow',
            nextReviewAt: '',
            difficulty: 2,
          },
        }),
      ],
      ['/vault/knowledge/legacy-note.md', '# Legacy Note\n\nObject-shaped decay metadata should still be honored.\n'],
    ])

    const result = await buildVaultManifest({
      vaultRoot: '/vault',
      readFile: (p: string) => {
        const v = fakeFs.get(p)
        if (v === undefined) throw new Error(`ENOENT ${p}`)
        return v
      },
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      path: 'knowledge/legacy-note.md',
      retentionScore: 0.42,
      accessCount: 7,
      summaryLevel: 'shallow',
    })
  })
})
