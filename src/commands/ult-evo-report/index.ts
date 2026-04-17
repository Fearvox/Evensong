/**
 * ult-evo-report command — Evolution pipeline reporting.
 * Generates changelog from conventional commits (EVOL-02) and
 * tracks metrics per release (EVOL-03).
 */
import type { Command } from '../../commands.js'

const ultEvoReport = {
  type: 'local',
  name: 'ult-evo-report',
  description:
    'Generate evolution report: changelog from conventional commits + metrics dashboard',
  supportsNonInteractive: true,
  load: () => import('./ult-evo-report.js'),
} satisfies Command

export default ultEvoReport
