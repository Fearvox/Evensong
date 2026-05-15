/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handler intentionally exits */

import { enableConfigs } from '../../utils/config.js'

type PluginFastPathParsed =
  | { subcommand: 'list'; opts: { json?: boolean; available?: boolean; cowork?: boolean } }
  | { subcommand: 'help' }
  | { subcommand: 'unknown' }

function parsePluginFastPathArgs(argv: string[]): PluginFastPathParsed {
  const subcommand = argv[0]
  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    return { subcommand: 'help' }
  }

  if (subcommand !== 'list') return { subcommand: 'unknown' }

  let json: boolean | undefined
  let available: boolean | undefined
  let cowork: boolean | undefined

  for (const arg of argv.slice(1)) {
    if (arg === '--json') json = true
    else if (arg === '--available') available = true
    else if (arg === '--cowork') cowork = true
    else if (arg === '-h' || arg === '--help') return { subcommand: 'help' }
    else return { subcommand: 'unknown' }
  }

  return { subcommand: 'list', opts: { json, available, cowork } }
}

function printPluginFastPathHelp(): void {
  process.stdout.write(
    [
      'Usage: claude plugin <command> [options]',
      '',
      'Commands:',
      '  list  List installed plugins',
      '',
      'Options (list):',
      '  --json        Output as JSON',
      '  --available   Include available plugins (requires --json)',
      '',
    ].join('\n'),
  )
}

export async function pluginFastPathMain(argv: string[]): Promise<boolean> {
  const parsed = parsePluginFastPathArgs(argv)
  if (parsed.subcommand === 'help') {
    printPluginFastPathHelp()
    process.exit(0)
  }
  if (parsed.subcommand === 'unknown') {
    return false
  }

  enableConfigs()
  const { pluginListHandler } = await import('./plugins.js')
  await pluginListHandler(parsed.opts)
  return true
}

