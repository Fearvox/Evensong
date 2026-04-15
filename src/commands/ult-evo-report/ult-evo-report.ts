/**
 * ult-evo-report command implementation.
 * Combines changelog generation (EVOL-02) and metrics tracking (EVOL-03)
 * into a single evolution pipeline report.
 */

import type { LocalCommandCall } from '../../types/command.js'
import { buildChangelog, formatChangelog } from './changelog.js'
import {
  collectMetrics,
  formatMetrics,
  getPreviousSnapshot,
  saveMetricsSnapshot,
} from './metrics.js'
import type { EvolutionReport } from './types.js'

export const call: LocalCommandCall = async (_args, context) => {
  const cwd = context.options.cwd

  const lines: string[] = []
  lines.push('# Evolution Report')
  lines.push(`Generated: ${new Date().toISOString()}\n`)

  // Build changelog
  let changelogText: string
  try {
    const changelog = await buildChangelog()
    changelogText = formatChangelog(changelog)
  } catch (err) {
    changelogText = `## Changelog\n_Error generating changelog: ${err}_`
  }
  lines.push(changelogText)
  lines.push('')

  // Collect and save metrics
  let metricsText: string
  try {
    const previous = await getPreviousSnapshot()
    const metrics = await collectMetrics(cwd)
    await saveMetricsSnapshot(metrics)
    metricsText = formatMetrics(metrics, previous)
  } catch (err) {
    metricsText = `## Metrics\n_Error collecting metrics: ${err}_`
  }
  lines.push(metricsText)
  lines.push('')

  // Evolution protocol status
  lines.push('## Evolution Protocol')
  lines.push(
    'Cycle: Evaluate -> Analyze -> Update -> Test -> Release -> Publish -> Monitor',
  )
  lines.push(
    'Run `/ult-evo-report` again after changes to track metric deltas.\n',
  )

  return { type: 'text', value: lines.join('\n') }
}
