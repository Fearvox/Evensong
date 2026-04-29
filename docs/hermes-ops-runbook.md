# Hermes Ops Runbook

Purpose: make long-running Hermes, Codex, and MiMo operations recoverable without guessing from stale tmux panes or leaking operator secrets into handoffs.

This runbook does not start, stop, restart, enable, or disable systemd services. If a service change is explicitly approved, record the unit, command, timestamp, and reason in the private operator handoff.

## Canonical Session Names

Use one tmux session per live lane. Keep the name role-oriented so the next operator can attach without reading pane history.

Default Evensong ops lane:

```bash
bun run scripts/hermes-ops-runbook.ts --print-name
```

Run-specific lane:

```bash
bun run scripts/hermes-ops-runbook.ts --print-name --run R066 --lane ops
```

Launch the harness with that name:

```bash
session="$(bun run scripts/hermes-ops-runbook.ts --print-name --run R066 --lane ops)"
HERMES_HARNESS_SESSION="$session" ./scripts/open-hermes-evo-harness.sh
```

Use these lane names unless a handoff says otherwise:

| Lane | Owns | Avoid |
| --- | --- | --- |
| `ops` | health checks, handoffs, process supervision, restart decisions | benchmark edits |
| `main` | primary execution | service restarts |
| `research` | read-only exploration and notes | writes or live process changes |
| `verify` | tests, build checks, narrow smoke runs | unrelated refactors |
| `bench` | benchmark watchers and artifact comparison | changing harness code mid-run |

The helper sanitizes session names and falls back when an input looks like a token, password, auth header, or API key.

## Start

```bash
cd /root/ccr
./scripts/open-hermes-evo-harness.sh
```

With a run-specific session:

```bash
cd /root/ccr
session="$(bun run scripts/hermes-ops-runbook.ts --print-name --run R066 --lane ops)"
HERMES_HARNESS_SESSION="$session" ./scripts/open-hermes-evo-harness.sh
```

The launcher prints a compact `operator-health` line before creating a new tmux session. A blocked health line is triage evidence; it does not mean the launcher failed.

## Resume

First attach to the existing session. Do not create a replacement until the old session has been checked.

```bash
tmux ls
tmux attach -t hermes-harness
```

Inside the repo:

```bash
bun run scripts/operator-health-snapshot.ts --compact
git status --short
```

For a named lane:

```bash
OPERATOR_HEALTH_REQUIRED_TMUX=hermes-r066-ops \
bun run scripts/operator-health-snapshot.ts --compact
```

Resume handoff minimum:

```text
session=<tmux session>
repo=<repo path>
branch=<git branch>
health=<compact operator-health line>
latest_artifact=<path or none>
next_action=<one concrete command or decision>
```

## Restart

Prefer recovery that preserves evidence.

1. Attach to the existing session and check current time, repo path, health, and git status.
2. If one shell is wedged, open a new window in the same session with `Ctrl-b c`; leave the old pane intact.
3. If a CLI process is wedged but tmux is healthy, start a replacement CLI in a new window and name it by role.
4. If the whole tmux session is wedged, create a replacement session with a new suffix, for example `hermes-r066-ops-recover`.
5. Kill old sessions only after evidence has been reviewed and the operator has explicitly decided they are no longer needed.

Do not run `systemctl restart`, `systemctl stop`, `systemctl disable`, or timer changes from this runbook. Use `systemctl status` and `journalctl` for observation only.

## Health Checks

Primary compact check:

```bash
bun run scripts/operator-health-snapshot.ts --compact
```

Full JSON for local diagnosis:

```bash
bun run scripts/operator-health-snapshot.ts
```

Health config rules:

- `OPERATOR_HEALTH_UNITS` lists required systemd units by name.
- `OPERATOR_HEALTH_REQUIRED_TMUX` lists tmux sessions that must exist.
- `OPERATOR_HEALTH_ENDPOINTS` accepts only loopback HTTP(S) health URLs.
- Endpoint response bodies are never printed.
- Raw endpoint URLs should stay in private env files, not public docs or handoffs.

## Context Window Pitfalls

- Tmux pane text is not current state. It may include output from an earlier run, a detached shell, or a different branch.
- Long-running agents can compact context and lose active branch, session name, last command, or latest artifact path. Put those values in the handoff stub.
- A line like `done`, `passed`, or `complete` is not enough after reconnect. Require current health, current git status, or a freshly written artifact.
- Do not let a research lane mutate files because the main lane lost context. Move the task to `main` or `verify` explicitly.
- If Hermes, Codex, and MiMo are all active, name windows by ownership rather than model identity. Role names survive model swaps.

## No-Secret Logging

Safe to include in public or repo handoff notes:

- compact `operator-health` line
- tmux session and window names
- systemd unit names and active/sub states
- git branch and `git status --short` summary
- artifact paths, mtimes, and checksums
- command names without secret-bearing arguments

Do not include:

- API keys, bearer tokens, cookies, passwords, signed URLs, auth headers
- raw endpoint response bodies
- private env file paths or contents
- raw tmux pane dumps
- screenshots, OCR, or local desktop/window text
- remote hostnames beyond documented loopback examples

If pane output must be preserved, redact it manually in a private handoff. Keep public notes to command names, status evidence, and artifact paths.

## Generated Checklist

The helper can print a ready-to-paste checklist for the current lane:

```bash
bun run scripts/hermes-ops-runbook.ts --run R066 --lane ops
```

JSON shape for tooling:

```bash
bun run scripts/hermes-ops-runbook.ts --run R066 --lane ops --json
```

Related docs:

- `docs/HERMES-TMUX-CHEATSHEET.md`
- `docs/operator-health-snapshot.md`
- `docs/memory-layer-workflow.md`
