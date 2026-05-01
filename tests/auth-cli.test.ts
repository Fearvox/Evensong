import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const CLI = join(ROOT, 'src', 'entrypoints', 'cli.tsx')

async function runAuthStatus(args: string[]) {
  const home = await mkdtemp(join(tmpdir(), 'ccr-auth-cli-'))
  try {
    const proc = Bun.spawn(['bun', 'run', CLI, 'auth', 'status', ...args], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, '.config'),
        XDG_CACHE_HOME: join(home, '.cache'),
        CLAUDE_CODE_TEST_FIXTURES_ROOT: home,
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_AUTH_TOKEN: '',
        NODE_ENV: 'production',
      },
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return { exitCode, stdout, stderr }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

describe('auth status CLI parity', () => {
  test('defaults to JSON and exits non-zero when unauthenticated', async () => {
    const result = await runAuthStatus([])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      loggedIn: false,
      authMethod: 'none',
    })
  }, 15_000)

  test('--text prints an unauthenticated human message', async () => {
    const result = await runAuthStatus(['--text'])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('Not logged in')
    expect(result.stdout).toContain('auth login')
  }, 15_000)
})
