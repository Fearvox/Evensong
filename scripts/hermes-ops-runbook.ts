#!/usr/bin/env bun
/**
 * Side-effect-free Hermes/Evensong operator runbook generator.
 *
 * It keeps session naming deterministic and avoids echoing endpoint configs,
 * env files, tokens, or raw pane logs into handoff notes.
 */

export interface HermesOpsRunbookInput {
  scope?: string
  lane?: string
  runId?: string
  sessionName?: string
  repoRoot?: string
}

export interface HermesOpsRunbook {
  sessionName: string
  repoRoot: string
  windows: string[]
  commands: {
    launch: string
    attach: string
    health: string
    monitor: string
    runbook: string
  }
}

const DEFAULT_SCOPE = 'evensong'
const DEFAULT_LANE = 'ops'
const DEFAULT_REPO_ROOT = '.'
const DEFAULT_WINDOWS = ['ops', 'main', 'research', 'verify', 'bench']
const SECRET_TEXT = /(?:\b(?:access[_-]?token|api[_-]?key|auth(?:orization)?|client[_-]?secret|credential|jwt|password|passwd|secret)\b(?:\s*[:=]\s*\S+)?|bearer\s+\S+|sk-[a-z0-9._-]{8,}|\btoken\s*[:=]\s*\S+)/i
const PRIVATE_REPO_ROOT = /^(?:\/Users|\/home|\/root)\//

function trimSessionSeparators(value: string): string {
  return value.replace(/^[._-]+|[._-]+$/g, '')
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(value)) return value
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function isSecretLike(value: string | undefined): boolean {
  return Boolean(value && SECRET_TEXT.test(value))
}

export function slugSessionPart(value: string | undefined, fallback: string, maxLength = 40): string {
  const raw = (value || '').trim()
  if (!raw || isSecretLike(raw)) return fallback

  const slug = trimSessionSeparators(
    raw
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .slice(0, maxLength),
  )

  if (!slug || isSecretLike(slug)) return fallback
  return slug
}

export function buildHermesSessionName(input: HermesOpsRunbookInput = {}): string {
  if (input.sessionName) {
    return slugSessionPart(input.sessionName, 'hermes-harness', 80)
  }

  const scope = slugSessionPart(input.scope, DEFAULT_SCOPE)
  const lane = slugSessionPart(input.lane, DEFAULT_LANE)
  const run = input.runId ? slugSessionPart(input.runId, '', 32) : ''
  const middle = run || scope

  return ['hermes', middle, lane].filter(Boolean).join('-').slice(0, 80)
}

function isPrivateRepoRoot(value: string): boolean {
  return PRIVATE_REPO_ROOT.test(value) || isSecretLike(value)
}

function publicRepoRoot(value: string): string {
  return isPrivateRepoRoot(value) ? '<operator-local-repo-root>' : value
}

function publicCommandRoot(value: string): string {
  return isPrivateRepoRoot(value) ? '$EVENSONG_REPO_ROOT' : shellQuote(value)
}

export function buildHermesOpsRunbook(input: HermesOpsRunbookInput = {}): HermesOpsRunbook {
  const sessionName = buildHermesSessionName(input)
  const repoRoot = input.repoRoot?.trim() || DEFAULT_REPO_ROOT

  return {
    sessionName,
    repoRoot,
    windows: DEFAULT_WINDOWS,
    commands: {
      launch: `HERMES_HARNESS_SESSION=${sessionName} ./scripts/open-hermes-evo-harness.sh`,
      attach: `tmux attach -t ${sessionName}`,
      health: `OPERATOR_HEALTH_REQUIRED_TMUX=${sessionName} bun run scripts/operator-health-snapshot.ts --compact`,
      monitor: `tmux list-windows -t ${sessionName} && tmux list-panes -a -F "#{session_name}:#{window_index}.#{pane_index} #{pane_current_command} #{pane_active}"`,
      runbook: `bun run scripts/hermes-ops-runbook.ts --session ${sessionName}`,
    },
  }
}

export function renderHermesOpsRunbook(input: HermesOpsRunbookInput = {}): string {
  const runbook = buildHermesOpsRunbook(input)
  const repoRoot = publicRepoRoot(runbook.repoRoot)
  const commandRoot = publicCommandRoot(runbook.repoRoot)
  const requiresLocalRepoRoot = isPrivateRepoRoot(runbook.repoRoot)

  return [
    '# Hermes Ops Runbook',
    '',
    `Session: \`${runbook.sessionName}\``,
    `Repo: \`${repoRoot}\``,
    `Windows: \`${runbook.windows.join('`, `')}\``,
    ...(requiresLocalRepoRoot ? ['', 'Set `EVENSONG_REPO_ROOT` locally before running command blocks; do not paste private absolute paths into public notes.'] : []),
    '',
    '## Start or Resume',
    '',
    '```bash',
    `cd ${commandRoot}`,
    runbook.commands.launch,
    runbook.commands.attach,
    '```',
    '',
    'Attach before creating a replacement session. A detached tmux session is the normal paused state, not a failure.',
    '',
    '## Lane Persistence Guard',
    '',
    '```bash',
    `cd ${commandRoot}`,
    "test -f .hermes-lane.txt && awk -F= '/^(lane|session)=/{print}' .hermes-lane.txt",
    'printf "worktree="; git rev-parse --show-toplevel',
    'git status --short --branch --untracked-files=all',
    '```',
    '',
    'Do not paste raw `.hermes-lane.txt` output into public notes; it may contain private run directories or prompt paths. Record only lane, session, worktree, branch, and compact status.',
    '',
    '## Termius Monitor',
    '',
    '```bash',
    runbook.commands.monitor,
    '```',
    '',
    'Use the monitor view before attaching from a small screen: confirm the session, window names, active pane, and current command without dumping pane text.',
    '',
    '## Health Gate',
    '',
    '```bash',
    `cd ${commandRoot}`,
    runbook.commands.health,
    '```',
    '',
    'Treat blocked health as triage evidence. Do not restart systemd units from this runbook; record unit, time, and reason before any explicit operator-approved restart.',
    '',
    '## Restart Procedure',
    '',
    '1. Run `tmux ls` and attach to the existing session first.',
    '2. Run the compact health gate and `git status --short` in the repo.',
    '3. If the shell is wedged, open a new tmux window in the same session and leave the old pane for evidence.',
    '4. If the whole session is wedged, create a replacement session with a new lane or suffix; do not kill the old session until evidence is reviewed.',
    '5. After recovery, write down the session name, repo path, health line, current branch, and latest artifact path.',
    '',
    '## Context Window Pitfalls',
    '',
    '- Old pane text can survive across detaches; verify current timestamps and artifact mtimes.',
    '- A compacted agent context may lose the active session name, branch, and last command; include them in handoffs.',
    '- Do not infer success from stale `done` lines. Require a current health line or a freshly written artifact.',
    '- Keep Hermes, Codex, and MiMo lanes named by role so follow-up agents know which pane owns execution, research, verification, or benchmark watching.',
    '',
    '## No-Secret Logging',
    '',
    '- Safe: compact health line, tmux session/window names, systemd unit names, git branch/status summary, artifact paths.',
    '- Unsafe: API keys, tokens, signed URLs, endpoint response bodies, private env files, raw pane dumps, screenshots, OCR, and remote hostnames beyond documented loopback examples.',
    '- If pane output must be preserved, redact it manually in a private handoff and keep the public note to command names plus status evidence.',
    '',
    '## Handoff Stub',
    '',
    '```text',
    `session=${runbook.sessionName}`,
    `repo=${repoRoot}`,
    'health=<paste compact operator-health line>',
    'branch=<git branch>',
    'latest_artifact=<path or none>',
    'next_action=<one concrete command or decision>',
    '```',
    '',
  ].join('\n')
}

function optionValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`
  const inline = args.find(arg => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = args.indexOf(name)
  if (index >= 0) return args[index + 1]
  return undefined
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

export function runbookInputFromArgs(args: string[], env: NodeJS.ProcessEnv = process.env): HermesOpsRunbookInput {
  return {
    scope: optionValue(args, '--scope') || env.HERMES_OPS_SCOPE,
    lane: optionValue(args, '--lane') || env.HERMES_OPS_LANE,
    runId: optionValue(args, '--run') || env.HERMES_OPS_RUN_ID || env.EVENSONG_RUN_ID,
    sessionName: optionValue(args, '--session') || env.HERMES_HARNESS_SESSION,
    repoRoot: optionValue(args, '--repo-root') || env.HERMES_HARNESS_REPO_ROOT,
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const input = runbookInputFromArgs(args)

  if (hasFlag(args, '--print-name')) {
    console.log(buildHermesSessionName(input))
    return
  }

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(buildHermesOpsRunbook(input), null, 2))
    return
  }

  console.log(renderHermesOpsRunbook(input))
}

if (import.meta.main) main()
