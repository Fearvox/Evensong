# Claude Code Session Storage Reference

Technical reference for how Claude Code stores session data locally.

## Directory Structure

```
~/.claude/
├── settings.json              # Global settings (hooks, permissions)
├── sessions/
│   └── <pid>.json             # Active session metadata (PID, session ID, CWD)
├── projects/
│   └── <project-key>/        # Per-project session data
│       ├── <uuid>.jsonl       # Session transcript (one JSON object per line)
│       └── <uuid>/           # Session artifacts
│           ├── subagents/     # Forked agent transcripts
│           │   ├── agent-<id>.jsonl
│           │   └── agent-<id>.meta.json
│           └── tool-results/  # Large tool outputs stored separately
│               └── <tool-use-id>.txt
├── skills/                    # Global user skills
│   └── <skill-name>/
│       └── SKILL.md
├── commands/                  # Global user commands (legacy)
│   └── <command-name>.md
├── backups/                   # Settings backups
└── shell-snapshots/           # Shell state snapshots
```

## Project Key Format

Claude Code converts the absolute project path into a directory name:

```
/Users/alice/my-project  →  -Users-alice-my-project
/home/user/code/app      →  -home-user-code-app
/root/work               →  -root-work
```

Rules:
- Every `/` is replaced with `-`
- A leading `-` is prepended
- The result is used as a directory name under `~/.claude/projects/`

## Session Transcript Format (.jsonl)

Each line is a JSON object representing one conversation turn:

```json
{"type": "human", "message": {"role": "user", "content": "..."}, "timestamp": 1234567890}
{"type": "assistant", "message": {"role": "assistant", "content": "..."}, "timestamp": 1234567891}
```

Key fields:
- `type`: `human` | `assistant` | `system` | `tool_use` | `tool_result`
- `message`: The full message object (role + content blocks)
- `timestamp`: Unix timestamp in milliseconds

## Session Metadata (.json)

Active sessions write a metadata file to `~/.claude/sessions/<pid>.json`:

```json
{
  "pid": 12345,
  "sessionId": "uuid-here",
  "cwd": "/path/to/project",
  "startedAt": 1234567890000,
  "kind": "interactive",
  "entrypoint": "cli"
}
```

Fields:
- `pid`: Process ID of the Claude Code instance
- `sessionId`: UUID matching the transcript filename
- `cwd`: Working directory
- `kind`: `interactive` | `pipe` | `print`
- `entrypoint`: `cli` | `remote_mobile` | `sdk`

## Subagent Data

When Claude forks a subagent (via AgentTool), its transcript is stored in:

```
<uuid>/subagents/agent-<agent-id>.jsonl      # Subagent transcript
<uuid>/subagents/agent-<agent-id>.meta.json   # Subagent metadata
```

## Tool Results

Large tool outputs (>threshold) are stored as separate files:

```
<uuid>/tool-results/<tool-use-id>.txt
```

The transcript references these via the tool-use ID.

## Cross-Environment Portability

Session transcripts are self-contained. To move a session between environments:

1. Copy the `.jsonl` file (and its `<uuid>/` directory if it exists)
2. Place it in `~/.claude/projects/<correct-project-key>/`
3. The project key must match the local project path

The `session-export.sh` and `session-restore.sh` scripts automate this process,
handling path detection and project key computation.

## Known Locations by Platform

| Platform | Claude Dir | Notes |
|----------|-----------|-------|
| macOS | `~/.claude/` | Standard |
| Linux | `~/.claude/` | Standard |
| Claude Code Web | `/root/.claude/` | Runs as root in container |
| Claude Code Web (sandbox) | `/home/user/.claude/` | Some sandbox configs |
| Windows (WSL) | `~/.claude/` | Inside WSL filesystem |

## Resume Mechanism

`claude --resume` or `/resume`:

1. Reads all `.jsonl` files from the current project's session directory
2. Sorts by modification time (newest first)
3. Presents a selection list with session previews
4. Loads the selected transcript and rebuilds conversation state
5. Continues from where the session left off
