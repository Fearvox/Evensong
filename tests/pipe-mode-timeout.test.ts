import { describe, test, expect } from 'bun:test'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const CLI = join(ROOT, 'dist', 'cli.js')

// Phase 10 silent-swallow regression. The UDS_INBOX feature flag was enabled in
// the user's ~/.claude/feature-flags.json, and the udsMessaging.ts stub was
// missing setOnEnqueue (+ getUdsMessagingSocketPath). runHeadlessStreaming
// would synchronously throw TypeError, the parent `void runHeadless(...)` in
// main.tsx would swallow the rejection, and pipe/-p mode would hang until idle
// timeout (2-3 min). The fix: add noop exports to the stub + defensive
// try/catch around the require in print.ts.
describe('pipe mode does not silently hang on startup', () => {
  test('`-p "say OK"` exits within 15s even without auth', async () => {
    // Force UDS_INBOX=true for this process so the regression path is exercised
    // regardless of the user's local feature-flags.json state. The old bug
    // surfaced only when this flag was enabled; locking it on for the test
    // guarantees the check cannot regress silently once someone disables their
    // local flag.
    const proc = Bun.spawn(
      [
        'bun',
        'run',
        CLI,
        '-p',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
        '--output-format',
        'text',
      ],
      {
        cwd: ROOT,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          CLAUDE_FEATURE_UDS_INBOX: 'true',
          CLAUDE_CODE_DISABLE_ATTACHMENTS: '1',
          ENABLE_CLAUDEAI_MCP_SERVERS: '0',
          CLAUDE_CODE_SIMPLE: '1',
          // Scrub any ambient token so we don't accidentally burn quota.
          ANTHROPIC_API_KEY: '',
          ANTHROPIC_AUTH_TOKEN: '',
        },
      },
    )

    proc.stdin!.write('say OK\n')
    await proc.stdin!.end()

    // 15s budget. Pre-fix: process would run for minutes. Post-fix: ~1s on a
    // cold machine, even when it ultimately errors out on auth.
    const timeout = new Promise<'timeout'>(resolve => {
      setTimeout(() => resolve('timeout'), 15_000)
    })
    const exit = proc.exited.then(code => ({ code }) as const)
    const result = await Promise.race([exit, timeout])

    if (result === 'timeout') {
      proc.kill('SIGKILL')
      throw new Error(
        'pipe mode hung past 15s — silent-swallow regression in runHeadlessStreaming',
      )
    }

    // Any exit is fine; the point is that the process actually *exits*.
    // Auth failure returns a non-zero code; that's the expected outcome in a
    // clean test env without credentials. We only care that silent hang is
    // gone.
    expect(typeof result.code).toBe('number')
  }, 20_000)
})
