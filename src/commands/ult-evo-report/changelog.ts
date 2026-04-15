/**
 * Conventional commit parser for EVOL-02.
 * Parses git log into structured changelog grouped by category.
 */

import type {
  ChangelogEntry,
  ChangelogSection,
  Changelog,
  CommitCategory,
} from './types.js'

const CATEGORY_LABELS: Record<CommitCategory, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  test: 'Tests',
  docs: 'Documentation',
  chore: 'Chores',
  refactor: 'Refactoring',
  perf: 'Performance',
  security: 'Security',
  benchmark: 'Benchmarks',
  other: 'Other',
}

// Order for display
const CATEGORY_ORDER: CommitCategory[] = [
  'feat',
  'fix',
  'security',
  'test',
  'perf',
  'refactor',
  'docs',
  'benchmark',
  'chore',
  'other',
]

/**
 * Conventional commit regex:
 *   type(scope): subject
 *   type: subject
 */
const CONVENTIONAL_RE =
  /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?:!)?\s*:\s*(?<subject>.+)$/

/**
 * Map raw commit type to our category enum.
 */
function mapCategory(rawType: string): CommitCategory {
  const mapping: Record<string, CommitCategory> = {
    feat: 'feat',
    feature: 'feat',
    fix: 'fix',
    bugfix: 'fix',
    test: 'test',
    tests: 'test',
    doc: 'docs',
    docs: 'docs',
    chore: 'chore',
    build: 'chore',
    ci: 'chore',
    refactor: 'refactor',
    perf: 'perf',
    security: 'security',
    benchmark: 'benchmark',
    paper: 'docs',
    branding: 'chore',
  }
  return mapping[rawType] ?? 'other'
}

/**
 * Parse a single git log line (format: hash|date|subject) into a ChangelogEntry.
 */
export function parseCommitLine(line: string): ChangelogEntry | null {
  const parts = line.split('|')
  if (parts.length < 3) return null

  const hash = parts[0]!.trim()
  const date = parts[1]!.trim()
  const subject = parts.slice(2).join('|').trim()

  if (!hash || !subject) return null

  const match = CONVENTIONAL_RE.exec(subject)
  if (match?.groups) {
    return {
      hash,
      date,
      category: mapCategory(match.groups.type!),
      scope: match.groups.scope ?? null,
      subject: match.groups.subject!,
    }
  }

  // Non-conventional commit — categorize as 'other'
  return {
    hash,
    date,
    category: 'other',
    scope: null,
    subject,
  }
}

/**
 * Parse raw git log output into a structured Changelog.
 */
export function parseGitLog(
  raw: string,
  sinceRef: string | null,
): Changelog {
  const lines = raw.trim().split('\n').filter(Boolean)
  const entries: ChangelogEntry[] = []

  for (const line of lines) {
    const entry = parseCommitLine(line)
    if (entry) entries.push(entry)
  }

  // Group by category
  const grouped = new Map<CommitCategory, ChangelogEntry[]>()
  for (const entry of entries) {
    const existing = grouped.get(entry.category) ?? []
    existing.push(entry)
    grouped.set(entry.category, existing)
  }

  // Build sections in display order
  const sections: ChangelogSection[] = []
  for (const cat of CATEGORY_ORDER) {
    const catEntries = grouped.get(cat)
    if (catEntries && catEntries.length > 0) {
      sections.push({
        category: cat,
        label: CATEGORY_LABELS[cat],
        entries: catEntries,
      })
    }
  }

  return {
    sinceRef,
    sections,
    totalCommits: entries.length,
  }
}

/**
 * Get the most recent git tag, or null if none exist.
 */
export async function getLatestTag(): Promise<string | null> {
  try {
    const proc = Bun.spawn(['git', 'tag', '--sort=-creatordate'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited
    const firstTag = output.trim().split('\n')[0]
    return firstTag || null
  } catch {
    return null
  }
}

/**
 * Get git log as raw text since a ref (or all commits if null).
 * Format: hash|date|subject
 */
export async function getGitLog(sinceRef: string | null): Promise<string> {
  const args = [
    'git',
    'log',
    '--format=%h|%Y-%m-%d|%s',
    '--no-merges',
  ]
  if (sinceRef) {
    args.push(`${sinceRef}..HEAD`)
  }

  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const output = await new Response(proc.stdout).text()
  await proc.exited
  return output
}

/**
 * Build a full changelog from git history.
 */
export async function buildChangelog(): Promise<Changelog> {
  const latestTag = await getLatestTag()
  const raw = await getGitLog(latestTag)
  return parseGitLog(raw, latestTag)
}

/**
 * Format a Changelog into a human-readable markdown string.
 */
export function formatChangelog(changelog: Changelog): string {
  const lines: string[] = []

  const ref = changelog.sinceRef
    ? `since ${changelog.sinceRef}`
    : 'all commits'
  lines.push(`## Changelog (${ref})`)
  lines.push(`${changelog.totalCommits} commits\n`)

  for (const section of changelog.sections) {
    lines.push(`### ${section.label}`)
    for (const entry of section.entries) {
      const scope = entry.scope ? `**${entry.scope}**: ` : ''
      lines.push(`- ${scope}${entry.subject} (\`${entry.hash}\`)`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
