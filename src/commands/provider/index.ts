import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'provider',
  description: 'Switch AI provider (anthropic, minimax, codex, gemini)',
  argumentHint: '[provider]',
  isEnabled: true,
  isHidden: false,
  load: () => import('./provider.js'),
} satisfies Command
