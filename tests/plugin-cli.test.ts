import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const CLI = join(ROOT, 'src', 'entrypoints', 'cli.tsx')

async function runPluginCommand(args: string[]) {
  const home = await mkdtemp(join(tmpdir(), 'ccr-plugin-cli-'))
  try {
    const proc = Bun.spawn(['bun', 'run', CLI, ...args], {
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

describe('plugin CLI parity', () => {
  test('plugin list --json is machine-readable with no installed plugins', async () => {
    const result = await runPluginCommand(['plugin', 'list', '--json'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual([])
  }, 15_000)

  test('plugin list --available requires --json', async () => {
    const result = await runPluginCommand(['plugin', 'list', '--available'])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('--available requires --json')
    expect(result.stdout).toBe('')
  }, 15_000)
})
