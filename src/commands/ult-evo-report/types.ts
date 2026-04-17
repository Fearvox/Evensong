/**
 * Types for the ult-evo-report command.
 * Covers changelog parsing (EVOL-02) and metrics tracking (EVOL-03).
 */

export type CommitCategory =
  | 'feat'
  | 'fix'
  | 'test'
  | 'docs'
  | 'chore'
  | 'refactor'
  | 'perf'
  | 'security'
  | 'benchmark'
  | 'other'

export type ChangelogEntry = {
  hash: string
  category: CommitCategory
  scope: string | null
  subject: string
  date: string
}

export type ChangelogSection = {
  category: CommitCategory
  label: string
  entries: ChangelogEntry[]
}

export type Changelog = {
  sinceRef: string | null // tag or commit hash, null = all commits
  sections: ChangelogSection[]
  totalCommits: number
}

export type MetricsSnapshot = {
  timestamp: string
  ref: string // git ref (tag or HEAD short hash)
  testCount: number
  passCount: number
  failCount: number
  passRate: number // 0-100
  featureFlagCount: number
  featureFlagsActive: number
  destructiveActionRate: number // 0-100, percentage of commits touching security-sensitive paths
}

export type MetricsHistory = {
  snapshots: MetricsSnapshot[]
}

export type EvolutionReport = {
  changelog: Changelog
  metrics: MetricsSnapshot
  previousMetrics: MetricsSnapshot | null
}
