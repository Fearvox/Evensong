/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handler intentionally exits */

import { enableConfigs } from '../../utils/config.js'

type AuthFastPathParsedArgs =
  | { subcommand: 'status'; opts: { json?: boolean; text?: boolean } }
  | { subcommand: 'logout' }
  | {
      subcommand: 'login'
      opts: {
        email?: string
        sso?: boolean
        console?: boolean
        claudeai?: boolean
      }
    }
  | { subcommand: 'help' }
  | { subcommand: 'unknown' }

function parseAuthFastPathArgs(argv: string[]): AuthFastPathParsedArgs {
  const subcommand = argv[0]
  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    return { subcommand: 'help' }
  }

  if (subcommand === 'status') {
    let json: boolean | undefined
    let text: boolean | undefined

    for (const arg of argv.slice(1)) {
      if (arg === '--json') json = true
      else if (arg === '--text') text = true
      else if (arg === '-h' || arg === '--help') return { subcommand: 'help' }
      else return { subcommand: 'unknown' }
    }

    return { subcommand: 'status', opts: { json, text } }
  }

  if (subcommand === 'logout') {
    for (const arg of argv.slice(1)) {
      if (arg === '-h' || arg === '--help') return { subcommand: 'help' }
      return { subcommand: 'unknown' }
    }
    return { subcommand: 'logout' }
  }

  if (subcommand === 'login') {
    let email: string | undefined
    let sso: boolean | undefined
    let console: boolean | undefined
    let claudeai: boolean | undefined

    const args = argv.slice(1)
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!
      if (arg === '--email') {
        email = args[i + 1]
        if (!email) return { subcommand: 'unknown' }
        i++
      } else if (arg.startsWith('--email=')) {
        email = arg.slice('--email='.length)
      } else if (arg === '--sso') {
        sso = true
      } else if (arg === '--console') {
        console = true
      } else if (arg === '--claudeai') {
        claudeai = true
      } else if (arg === '-h' || arg === '--help') {
        return { subcommand: 'help' }
      } else {
        return { subcommand: 'unknown' }
      }
    }

    return { subcommand: 'login', opts: { email, sso, console, claudeai } }
  }

  return { subcommand: 'unknown' }
}

function printAuthFastPathHelp(): void {
  process.stdout.write(
    [
      'Usage: claude auth <command> [options]',
      '',
      'Commands:',
      '  login   Sign in to your Anthropic account',
      '  status  Show authentication status',
      '  logout  Log out from your Anthropic account',
      '',
      'Run `claude auth <command> --help` for command-specific help.',
      '',
    ].join('\n'),
  )
}

export async function authFastPathMain(argv: string[]): Promise<boolean> {
  const parsed = parseAuthFastPathArgs(argv)
  if (parsed.subcommand === 'help') {
    printAuthFastPathHelp()
    process.exit(0)
  }
  if (parsed.subcommand === 'unknown') {
    return false
  }

  enableConfigs()

  const { authLogin, authLogout, authStatus } = await import('./auth.js')

  if (parsed.subcommand === 'status') {
    await authStatus(parsed.opts)
    return true
  }
  if (parsed.subcommand === 'logout') {
    await authLogout()
    return true
  }
  await authLogin(parsed.opts)
  return true
}

