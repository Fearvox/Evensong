import { describe, expect, test } from 'bun:test'
import {
  buildHermesOpsRunbook,
  buildHermesSessionName,
  isSecretLike,
  renderHermesOpsRunbook,
  runbookInputFromArgs,
  slugSessionPart,
} from '../hermes-ops-runbook'

describe('hermes ops runbook', () => {
  test('builds deterministic session names for default and run-specific lanes', () => {
    expect(buildHermesSessionName()).toBe('hermes-evensong-ops')
    expect(buildHermesSessionName({ runId: 'R066', lane: 'verify' })).toBe('hermes-r066-verify')
    expect(buildHermesSessionName({ scope: 'MiMo Memory Layer', lane: 'AGENT OPS' })).toBe('hermes-mimo-memory-layer-agent-ops')
  })

  test('normalizes explicit session names without preserving unsafe text', () => {
    expect(buildHermesSessionName({ sessionName: 'Hermes_Harness.OPS' })).toBe('hermes_harness.ops')
    expect(buildHermesSessionName({ sessionName: 'token=abc123' })).toBe('hermes-harness')
    expect(slugSessionPart('api_key=abc123', 'fallback')).toBe('fallback')
    expect(isSecretLike('sk-1234567890abcdef')).toBe(true)
  })

  test('renders commands for the same scoped session name', () => {
    const runbook = buildHermesOpsRunbook({ runId: 'R070', lane: 'bench', repoRoot: '/root/ccr' })

    expect(runbook.sessionName).toBe('hermes-r070-bench')
    expect(runbook.commands.launch).toBe('HERMES_HARNESS_SESSION=hermes-r070-bench ./scripts/open-hermes-evo-harness.sh')
    expect(runbook.commands.health).toBe('OPERATOR_HEALTH_REQUIRED_TMUX=hermes-r070-bench bun run scripts/operator-health-snapshot.ts --compact')
  })

  test('rendered runbook avoids secret-like input values', () => {
    const text = renderHermesOpsRunbook({
      sessionName: 'secret-session',
      runId: 'api_key=abc123',
      lane: 'token-lane',
      repoRoot: '/root/ccr',
    })

    expect(text).toContain('Session: `hermes-harness`')
    expect(text).not.toContain('abc123')
    expect(text).not.toContain('secret-session')
    expect(text).not.toContain('token-lane')
  })

  test('rendered shell commands quote repo paths with spaces', () => {
    const text = renderHermesOpsRunbook({ repoRoot: '/root/ccr ops' })

    expect(text).toContain("cd '/root/ccr ops'")
  })

  test('parses CLI args before environment defaults', () => {
    expect(
      runbookInputFromArgs(['--run', 'R071', '--lane=verify', '--session', 'hermes-explicit'], {
        HERMES_OPS_RUN_ID: 'R000',
        HERMES_OPS_LANE: 'ops',
      }),
    ).toEqual({
      scope: undefined,
      lane: 'verify',
      runId: 'R071',
      sessionName: 'hermes-explicit',
      repoRoot: undefined,
    })
  })
})
