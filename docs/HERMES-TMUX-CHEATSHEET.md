# Hermes / tmux Operator Runbook

Last updated: 2026-04-26

这份是本地和远端 Hermes 的常用命令、监控面板、tmux 操作备忘。目标是让下一次不用靠记忆恢复现场。

## Golden Rules

- 离开 tmux 用 `Ctrl-b d`，不要用 `exit`。
- 如果 Hermes 是直接作为 tmux session 主命令启动的，Hermes 退出后 session 会消失。
- 长期 session 应该先开 shell，再在 shell 里启动 Hermes；或者至少加一个 `keepalive` shell window。
- 退出 Hermes 前，先确认 session 里还有一个 shell window。
- 不要打印或复制 `~/.hermes/.env`、auth json、API key、raw secrets。

## Local Machine

Repo:

```bash
cd <REPO_ROOT>
```

Current local autoresearch session:

```bash
tmux attach -t hermes-autoresearch-20260426
```

Known local sessions:

```bash
tmux attach -t hermes-autoresearch-20260426
tmux attach -t hermes-hudui-local
tmux attach -t battle
```

Recreate local autoresearch session as a persistent shell-backed tmux session:

```bash
tmux new-session -d -s hermes-autoresearch-20260426 -c <REPO_ROOT>
tmux send-keys -t hermes-autoresearch-20260426 'hermes' Enter
tmux attach -t hermes-autoresearch-20260426
```

Useful local prompt file:

```bash
<LOCAL_PROMPT_FILE>
```

Local Hermes checks:

```bash
hermes --version
hermes mcp list
hermes mcp test research_vault
```

Local research vault currently appears as:

```text
research_vault (stdio)
vault=<RESEARCH_VAULT_ROOT>
```

## Remote Droplet

SSH:

```bash
ssh user@<PRIVATE_REMOTE_HOST>
```

Remote repo:

```bash
cd <REMOTE_REPO>
```

Main remote self-evolution session:

```bash
tmux attach -t hermes-evo-rv-20260426-mcp
```

This session has a keepalive window:

```text
0:python3     Hermes
1:keepalive   shell
```

So if Hermes exits, the tmux session should remain alive because `keepalive` is still running.

Remote benchmark harness:

```bash
tmux attach -t hermes-harness
```

Expected harness windows:

```text
0:ops
1:main
2:research
3:verify
4:bench
5:phase15-fresh-0919
```

Remote operator panel:

```bash
tmux attach -t hermes-operator
```

Remote HUD/UI panel:

```bash
tmux attach -t hermes-hudui-zonic
```

Remote research-vault task prompt:

```bash
<REMOTE_PROMPT_FILE>
```

Remote Research Vault MCP wrapper:

```bash
<REMOTE_MCP_WRAPPER>
```

Important wrapper detail:

```bash
exec /usr/local/bin/bunx --bun @syndash/research-vault-mcp --transport stdio
```

The `--bun` flag matters. Without it, the npm package may be launched through Node and fail on TypeScript source inside `node_modules`.

Remote MCP checks:

```bash
hermes mcp list
hermes mcp test research_vault
grep -n "bunx" <REMOTE_MCP_WRAPPER>
```

Remote logs:

```bash
tail -120 <REMOTE_HERMES_LOG_DIR>/mcp-stderr.log
tail -160 <REMOTE_HERMES_LOG_DIR>/errors.log
tail -120 <REMOTE_HERMES_LOG_DIR>/agent.log
```

Remote service/process checks:

```bash
tmux list-sessions
tmux list-windows -t hermes-evo-rv-20260426-mcp
ps -eo pid,ppid,stat,etime,args | grep -E 'hermes|research-vault|bunx' | grep -v grep
ss -ltnp '( sport = :8765 or sport = :18765 or sport = :18766 )'
```

## tmux Basics

Default prefix:

```text
Ctrl-b
```

All tmux shortcuts below mean: press `Ctrl-b`, release, then press the second key.

Detach and leave work running:

```text
Ctrl-b d
```

Window list:

```text
Ctrl-b w
```

Next / previous window:

```text
Ctrl-b n
Ctrl-b p
```

Jump to window number:

```text
Ctrl-b 0
Ctrl-b 1
Ctrl-b 2
```

Create new window:

```text
Ctrl-b c
```

Rename current window:

```text
Ctrl-b ,
```

Split panes:

```text
Ctrl-b %
Ctrl-b "
```

Switch pane:

```text
Ctrl-b o
```

Show pane numbers:

```text
Ctrl-b q
```

Zoom current pane:

```text
Ctrl-b z
```

Copy/scroll mode:

```text
Ctrl-b [
```

Exit copy mode:

```text
q
```

## tmux Inspection Commands

List sessions:

```bash
tmux list-sessions
tmux ls
```

List windows in a session:

```bash
tmux list-windows -t hermes-evo-rv-20260426-mcp
```

Capture recent pane output:

```bash
tmux capture-pane -pt hermes-evo-rv-20260426-mcp -S -120
```

Capture a specific window:

```bash
tmux capture-pane -pt hermes-harness:ops -S -120
tmux capture-pane -pt hermes-harness:bench -S -120
```

Add a keepalive shell to an existing session:

```bash
tmux new-window -d -t hermes-evo-rv-20260426-mcp -n keepalive 'cd <REMOTE_REPO> && exec bash -l'
```

Kill a session only when you are sure:

```bash
tmux kill-session -t hermes-evo-rv-20260426-mcp
```

## Harness Launchers

Remote CCR has helper scripts:

```bash
cd <REMOTE_REPO>
./scripts/open-hermes-evo-harness.sh
./scripts/open-hermes-operator-view.sh
```

If the target session already exists, these scripts should attach or show the existing panel.

## Common Recovery Patterns

Hermes exits and tmux disappears:

```bash
tmux list-sessions
tmux new-session -d -s hermes-autoresearch-20260426 -c <REPO_ROOT>
tmux send-keys -t hermes-autoresearch-20260426 'hermes' Enter
```

Remote Hermes session exists but you are unsure whether it is safe to exit Hermes:

```bash
tmux list-windows -t hermes-evo-rv-20260426-mcp
```

If there is no `keepalive` window, add one before exiting Hermes:

```bash
tmux new-window -d -t hermes-evo-rv-20260426-mcp -n keepalive 'cd <REMOTE_REPO> && exec bash -l'
```

Delegation subagents fail with endpoint errors:

```text
Record the exact endpoint error once, avoid repeated delegate_task retries, and continue with direct tools, research_vault MCP, file inspection, focused scripts, and compact reports.
```

Research Vault MCP fails in Hermes:

```bash
hermes mcp test research_vault
tail -120 <REMOTE_HERMES_LOG_DIR>/mcp-stderr.log
grep -n "bunx" <REMOTE_MCP_WRAPPER>
ss -ltnp '( sport = :18765 or sport = :18766 )'
```

Expected fix if Node tries to execute package TypeScript:

```bash
exec /usr/local/bin/bunx --bun @syndash/research-vault-mcp --transport stdio
```

If multiple Hermes sessions are open, a fixed `MCP_PORT=18765` can also make new sessions show `research_vault (stdio) — failed`. In that case an older Hermes MCP child process is probably already listening on `18765`. The durable wrapper should choose a free fallback port instead of assuming one static port.

## 1M Context Window Discipline

`model.context_length=1000000` does not guarantee every single turn will be accepted by the backend. A session can still be forced down to `128K` if Hermes sends a payload the provider rejects.

Observed failure mode:

```text
Error: Your input exceeds the context window of this model.
Context length exceeded — stepping down: 1,000,000 → 128,000 tokens
Context too large (...) — compressing
```

What caused it:

- The agent printed long diffs into the conversation.
- The agent printed long test output and repeated error summaries.
- A `Response truncated due to output length limit` loop created more history.
- The next request included history, tools, MCP schema, diffs, and errors; the backend rejected it even though the local UI still looked below `1M`.

Prevention rules for long Hermes sessions:

- Do not let Hermes print full diffs. Use `git diff --stat` or write detailed diffs to files.
- Do not let Hermes print long logs. Use `tail -80` maximum, or write logs to report files.
- Keep final answers under 8 short lines for autonomous loops.
- Put detailed reports under `.planning/phases/.../report.md`.
- After a phase commit, prefer a new clean session instead of continuing the same huge history.
- If `Response truncated` appears once, immediately switch to hard output cap mode.
- If `Context length exceeded` appears, treat that session as degraded; let it finish the current small task, then start a new clean session.

Recommended hard-cap prompt:

```text
HARD OUTPUT CAP MODE. Do not print code, diffs, command output, or long explanations. Continue from current repo state. Write detailed notes to a report file. Final terminal response must be <= 8 short Chinese lines: changed files, tests, commit/hash if any, remaining risk.
```

Clean-session rule:

```text
One phase, one clean Hermes session when possible. Commit, record report, then start fresh.
```

Remote Hermes runtime fix applied on 2026-04-26:

```text
<REMOTE_HERMES_AGENT> commit 34618069
fix: preserve high context on vague overflow
```

Behavior after this fix:

- If the provider returns a numeric context limit, Hermes still honors that limit.
- If `openai-codex` / Codex OAuth returns a vague context overflow with no numeric limit, Hermes compresses history but preserves the configured high context window.
- This prevents the bad `1,000,000 -> 128,000` drop when the user explicitly configured a 1M context window.
- Existing already-running Hermes processes need a restart/new session to load the patch.

## Five Keys To Memorize

```text
Ctrl-b d   detach
Ctrl-b w   list windows
Ctrl-b n   next window
Ctrl-b z   zoom pane
Ctrl-b c   create window
```
