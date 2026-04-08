# repo-bootstrap

An [Agent Skill](https://agentskills.io) that onboards any codebase into an
AI-assisted development environment. One command to go from "new repo" to
"fully equipped workspace."

## What It Does

1. **Reconnaissance** - Reads project identity, verifies build, counts code
2. **Skills Installation** - Installs 181 skills + 79 commands + Codex plugin
3. **Infrastructure Audit** - Scores test/lint/CI/types/build/flags maturity
4. **First-Principles Plan** - Generates layered infrastructure improvement plan
5. **Session Export** - Packages cloud session data for cross-environment portability
6. **Session Restore** - Restores sessions on a different machine via one script

## Quick Start

### As a Claude Code Skill (Agent Use)

```bash
# Install into any project
cp -r repo-bootstrap/ <your-project>/.claude/skills/repo-bootstrap/

# Or install globally
cp -r repo-bootstrap/ ~/.claude/skills/repo-bootstrap/

# Then in Claude Code, just say:
# "bootstrap this repo" or invoke the skill directly
```

### Scripts (Human Use)

Each phase can be run independently:

```bash
# Install skills ecosystem
bash repo-bootstrap/scripts/install-skills.sh

# Audit infrastructure
bash repo-bootstrap/scripts/audit-infra.sh

# Export sessions (on cloud/remote)
bash repo-bootstrap/scripts/session-export.sh --all

# Restore sessions (on local machine)
bash repo-bootstrap/scripts/session-restore.sh
```

## Directory Structure

```
repo-bootstrap/
├── SKILL.md                    # Agent instructions (6 phases)
├── scripts/
│   ├── install-skills.sh       # Install ECC + Codex ecosystem
│   ├── audit-infra.sh          # Infrastructure maturity audit
│   ├── session-export.sh       # Export session data to repo
│   └── session-restore.sh      # Restore session data locally
├── references/
│   ├── REFERENCE.md            # Session storage internals
│   └── SKILLS-CATALOG.md       # Post-install capability index
├── LICENSE
└── README.md
```

## Script Reference

### install-skills.sh

```
Usage: install-skills.sh [--skip-codex] [--skip-global] [--dry-run]

  --skip-codex   Don't install OpenAI Codex plugin
  --skip-global  Don't copy global ~/.claude/skills/
  --dry-run      Show what would be installed without doing it
```

### audit-infra.sh

```
Usage: audit-infra.sh [--json] [--flags]

  --json    Output results as JSON
  --flags   Force feature flag scanning
```

Checks 6 dimensions: Test Framework, Linter, CI/CD, Type Checking, Build System, Feature Flags.

### session-export.sh

```
Usage: session-export.sh [--all] [--output DIR]

  --all     Export all sessions (default: latest only)
  --output  Custom output directory (default: .claude/cloud-sessions)
```

### session-restore.sh

```
Usage: session-restore.sh [--source DIR] [--force]

  --source  Directory with exported sessions (default: .claude/cloud-sessions)
  --force   Overwrite existing session files
```

## Requirements

- **git** and **bash** (all platforms)
- **Internet access** (for cloning skill repos during install)
- **Claude Code** (for agent-driven usage)
- **OpenAI API key** (optional, only for Codex plugin features)

## Compatibility

Works with Claude Code on macOS, Linux, and WSL. Tested with Claude Code CLI
and Claude Code on the web.

## License

Apache-2.0. See [LICENSE](LICENSE).
