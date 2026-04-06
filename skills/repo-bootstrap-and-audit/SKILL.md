---
name: repo-bootstrap-and-audit
description: "Bootstrap a new repo with skills/commands/plugins ecosystem, audit its architecture, plan infrastructure from first principles, and verify build stability. Use when onboarding to a new codebase or setting up a project for Claude Code development."
when_to_use: "When starting work on a new repository, setting up development infrastructure, or onboarding a codebase for AI-assisted development."
argument-hint: "[repo-url-or-path] [--skip-skills] [--skip-audit] [--skip-plan]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - WebFetch
  - AskUserQuestion
  - TodoWrite
user-invocable: true
---

# Repo Bootstrap & Audit Skill

A complete workflow for onboarding a codebase: install skills ecosystem, audit architecture, verify builds, plan infrastructure, and export session for portability.

## Arguments

`$ARGUMENTS`

---

## Phase 1: Reconnaissance

Understand the repo before touching anything.

### 1.1 Read Project Identity

```
- Read README.md, CLAUDE.md, package.json (or equivalent manifest)
- Identify: runtime, language, build system, test framework, linter
- Note what exists vs what's missing
```

### 1.2 Check Existing .claude/ Setup

```bash
ls -la .claude/ 2>/dev/null
ls -la .claude/skills/ .claude/commands/ .claude/hooks/ 2>/dev/null
```

If `.claude/` already has skills/commands, catalog them. Don't overwrite without asking.

### 1.3 Verify Build

```bash
# Detect and run the build command
# npm/bun/yarn → check package.json "build" script
# cargo/go/make → detect from manifest files
```

If build fails due to missing deps, install them first. Record the build status.

---

## Phase 2: Skills Ecosystem Installation

### 2.1 Install everything-claude-code

Clone and copy the community skills collection:

```bash
cd /tmp && git clone --depth 1 https://github.com/affaan-m/everything-claude-code.git

# Skills (into .claude/skills/everything-claude-code/)
mkdir -p .claude/skills/everything-claude-code
cp -r /tmp/everything-claude-code/skills/* .claude/skills/everything-claude-code/

# Commands (into .claude/commands/)
mkdir -p .claude/commands
cp -r /tmp/everything-claude-code/commands/* .claude/commands/

# Config files
cp -n /tmp/everything-claude-code/.claude/*.json .claude/ 2>/dev/null

rm -rf /tmp/everything-claude-code
```

### 2.2 Install Codex Plugin (Optional)

If the user wants Codex integration:

```bash
cd /tmp && git clone --depth 1 https://github.com/openai/codex-plugin-cc.git

# Commands (prefixed with codex-)
for f in /tmp/codex-plugin-cc/plugins/codex/commands/*.md; do
  cp "$f" ".claude/commands/codex-$(basename "$f")"
done

# Scripts + prompts + schemas
mkdir -p .claude/codex-plugin
cp -r /tmp/codex-plugin-cc/plugins/codex/scripts/* .claude/codex-plugin/
cp -r /tmp/codex-plugin-cc/plugins/codex/prompts .claude/codex-plugin/
cp -r /tmp/codex-plugin-cc/plugins/codex/schemas .claude/codex-plugin/

# Skills + agents
cp -r /tmp/codex-plugin-cc/plugins/codex/skills/* .claude/skills/everything-claude-code/
mkdir -p .claude/agents
cp /tmp/codex-plugin-cc/plugins/codex/agents/*.md .claude/agents/

# Fix CLAUDE_PLUGIN_ROOT paths to local absolute path
PLUGIN_DIR="$(pwd)/.claude/codex-plugin"
for f in .claude/commands/codex-*.md; do
  sed -i "s|\${CLAUDE_PLUGIN_ROOT}/scripts/|${PLUGIN_DIR}/|g" "$f"
done

rm -rf /tmp/codex-plugin-cc
```

### 2.3 Copy Global User Skills

Check for user's global skills and offer to include them:

```bash
ls ~/.claude/skills/ 2>/dev/null
ls ~/.claude/commands/ 2>/dev/null
```

If found, ask user which ones to copy into the project.

---

## Phase 3: Architecture Audit

### 3.1 Codebase Stats

```bash
# Line counts by file type
find src -name "*.ts" -o -name "*.tsx" -o -name "*.js" | head -500 | xargs wc -l | tail -1
# Directory structure (2 levels deep)
ls -d src/*/
# Key file sizes
wc -l src/**/*.ts 2>/dev/null | sort -rn | head -20
```

### 3.2 Infrastructure Checklist

Evaluate and report status of each:

| Component | Check |
|-----------|-------|
| **Test framework** | Look for jest/vitest/bun test config, test files |
| **Linter** | Look for eslint/biome/prettier config |
| **CI/CD** | Look for .github/workflows/, .gitlab-ci.yml |
| **Type checking** | tsconfig.json strictness, tsc --noEmit result |
| **Build system** | Build command, output, bundle size |
| **Feature flags** | Any feature toggle system, env-based configs |

### 3.3 Feature Flag Inventory (if applicable)

If the project uses feature flags:

```bash
# Search for feature flag patterns
grep -r "feature(" src/ --include="*.ts" --include="*.tsx" -l
grep -r "process.env\." src/ --include="*.ts" -l | head -20
```

For each flag, document: name, what it gates, implementation status (stub/partial/complete).

---

## Phase 4: First-Principles Infrastructure Plan

Based on the audit, create a layered plan:

### Layer 0: Foundation (must-have before anything else)
- Test framework setup
- Linter configuration
- CI pipeline
- Feature flag mechanism (if needed)

### Layer 1: Core Improvements
- Missing infrastructure from audit
- Quick wins (mostly-implemented features to enable)

### Layer 2+: Feature Roadmap
- Group features by dependency and complexity
- Assign priorities (P0/P1/P2)
- Estimate effort (LOW/MEDIUM/HIGH)

Present the plan and **WAIT FOR CONFIRMATION** before proceeding.

---

## Phase 5: Session Portability

### 5.1 Export Session Transcript

```bash
# Find current session transcript
TRANSCRIPT=$(ls -t ~/.claude/projects/$(pwd | sed 's|/|-|g' | sed 's|^|/|' | sed 's|^/|-|')/*.jsonl 2>/dev/null | head -1)

if [ -n "$TRANSCRIPT" ]; then
  cp "$TRANSCRIPT" .claude/session-transcript.jsonl
  echo "Session exported to .claude/session-transcript.jsonl"
fi
```

### 5.2 Commit Everything

```bash
git add .claude/
git commit -m "feat: bootstrap repo with skills ecosystem and infrastructure audit"
git push
```

### 5.3 Local Resume Instructions

Tell the user:

```
To resume this session locally:

1. git pull
2. Find your local project path:
   ls ~/.claude/projects/ | grep <repo-name>
3. Copy the transcript:
   cp .claude/session-transcript.jsonl ~/.claude/projects/<path>/<uuid>.jsonl
4. claude --resume
```

---

## Phase 6: Summary Report

Output a structured summary:

```
## Bootstrap Complete

### Installed
- X skills, Y commands, Z agents
- Plugins: [list]

### Build Status
- Build: PASS/FAIL
- Tests: configured/not configured
- Lint: configured/not configured
- CI: configured/not configured

### Architecture Audit
- Codebase: X files, Y lines
- Key findings: [list]

### Infrastructure Plan
- Layer 0: [items] (foundation)
- Layer 1: [items] (core improvements)
- Layer 2+: [items] (feature roadmap)

### Session Portability
- Transcript: .claude/session-transcript.jsonl
- Resume: claude --resume
```

---

## Customization

Skip phases with flags:
- `--skip-skills` — Skip Phase 2 (skills installation)
- `--skip-audit` — Skip Phase 3-4 (architecture audit and plan)
- `--skip-plan` — Skip Phase 4 only (still do audit)
- `--skip-codex` — Skip Codex plugin installation
- `--skip-export` — Skip session export

## Related Skills

- `/plan` — Detailed implementation planning
- `/build-fix` — Fix build errors
- `/verify` — Run build + lint + test verification
- `/tdd` — Test-driven development workflow
- `/feature-dev` — Guided feature development
