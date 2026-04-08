---
name: repo-bootstrap
description: >-
  Full onboarding workflow for any codebase: explore structure, install skills
  ecosystem (ECC + Codex), verify build, audit infrastructure (tests, lint, CI,
  feature flags), generate first-principles infrastructure plan, and export
  session for cross-environment portability. Use when starting work on a new
  repo or setting up AI-assisted development.
license: Apache-2.0
compatibility: Requires git, bash, and internet access. Works with Claude Code on any OS.
metadata:
  author: fearvox
  version: "1.0"
allowed-tools: Read Write Edit Bash Glob Grep Agent WebFetch AskUserQuestion
---

# Repo Bootstrap

A complete, opinionated workflow for onboarding any codebase into an AI-assisted
development environment. Extracted from real-world usage patterns.

## Arguments

`$ARGUMENTS`

Parse optional flags from arguments:
- `--skip-skills` — Skip Phase 2
- `--skip-audit` — Skip Phase 3
- `--skip-plan` — Skip Phase 4
- `--skip-codex` — Skip Codex plugin in Phase 2
- `--skip-export` — Skip Phase 5
- `--only-export` — Jump straight to Phase 5
- `--only-restore` — Jump straight to Phase 6

---

## Phase 1: Reconnaissance

Understand the repo before touching anything. Read, don't write.

### 1.1 Project Identity

Read the following files (skip any that don't exist):

```
README.md
CLAUDE.md
package.json / Cargo.toml / go.mod / pyproject.toml / pom.xml
tsconfig.json / biome.json / .eslintrc*
```

Extract and record:
- **Runtime**: Node / Bun / Deno / Python / Rust / Go / Java / other
- **Build command**: `npm run build` / `cargo build` / `go build` / etc.
- **Test command**: if configured
- **Lint command**: if configured

### 1.2 Existing .claude/ Setup

```bash
ls -la .claude/ 2>/dev/null
ls .claude/skills/ .claude/commands/ .claude/hooks/ 2>/dev/null
```

If skills/commands already exist, count them and report. Do NOT overwrite
without asking the user first.

### 1.3 Build Verification

Run the detected build command. If it fails due to missing dependencies,
install them first (`bun install` / `npm install` / `pip install` / etc.),
then retry.

Record: **BUILD PASS** or **BUILD FAIL** (with error summary).

### 1.4 Codebase Stats

```bash
# Top-level structure
ls -d */

# Line count by extension (top 5 types)
find . -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.py' -o -name '*.rs' -o -name '*.go' | \
  head -1000 | xargs wc -l 2>/dev/null | tail -1

# Largest files
find src -type f -name '*.ts' -o -name '*.tsx' 2>/dev/null | \
  xargs wc -l 2>/dev/null | sort -rn | head -10
```

**Output a brief summary** (runtime, build status, file count, line count).

---

## Phase 2: Skills Ecosystem Installation

### 2.1 Install everything-claude-code (181 skills + 79 commands)

Run the helper script if available, otherwise do it inline:

```bash
# Use the bundled script if present
if [ -f "$(dirname "$0")/scripts/install-skills.sh" ]; then
  bash "$(dirname "$0")/scripts/install-skills.sh"
else
  # Inline fallback
  cd /tmp && git clone --depth 1 https://github.com/affaan-m/everything-claude-code.git
  mkdir -p .claude/skills/everything-claude-code .claude/commands
  cp -r /tmp/everything-claude-code/skills/* .claude/skills/everything-claude-code/
  cp -r /tmp/everything-claude-code/commands/* .claude/commands/
  cp -n /tmp/everything-claude-code/.claude/*.json .claude/ 2>/dev/null
  rm -rf /tmp/everything-claude-code
fi
```

Report: number of skills and commands installed.

### 2.2 Install Codex Plugin (unless --skip-codex)

```bash
cd /tmp && git clone --depth 1 https://github.com/openai/codex-plugin-cc.git

# Commands (prefixed with codex-)
for f in /tmp/codex-plugin-cc/plugins/codex/commands/*.md; do
  cp "$f" ".claude/commands/codex-$(basename "$f")"
done

# Scripts + prompts + schemas
mkdir -p .claude/codex-plugin
cp -r /tmp/codex-plugin-cc/plugins/codex/scripts/* .claude/codex-plugin/
cp -r /tmp/codex-plugin-cc/plugins/codex/prompts .claude/codex-plugin/ 2>/dev/null
cp -r /tmp/codex-plugin-cc/plugins/codex/schemas .claude/codex-plugin/ 2>/dev/null

# Skills + agents
cp -r /tmp/codex-plugin-cc/plugins/codex/skills/* .claude/skills/everything-claude-code/ 2>/dev/null
mkdir -p .claude/agents
cp /tmp/codex-plugin-cc/plugins/codex/agents/*.md .claude/agents/ 2>/dev/null

# Fix CLAUDE_PLUGIN_ROOT paths
PLUGIN_DIR="$(pwd)/.claude/codex-plugin"
for f in .claude/commands/codex-*.md; do
  sed -i.bak "s|\${CLAUDE_PLUGIN_ROOT}/scripts/|${PLUGIN_DIR}/|g" "$f"
  rm -f "$f.bak"
done

rm -rf /tmp/codex-plugin-cc
```

### 2.3 Copy Global User Skills

```bash
if [ -d "$HOME/.claude/skills" ] && [ "$(ls -A "$HOME/.claude/skills" 2>/dev/null)" ]; then
  echo "Found global skills:"
  ls "$HOME/.claude/skills/"
fi
```

Ask the user if they want to copy any global skills into the project.

---

## Phase 3: Infrastructure Audit

Evaluate the project's engineering maturity across 6 dimensions.

### 3.1 Audit Checklist

| Dimension | How to Check | Record |
|-----------|-------------|--------|
| **Test Framework** | Look for test config, test files, test scripts in package.json | YES/NO + framework name |
| **Linter** | Look for eslint/biome/prettier/clippy/golangci-lint config | YES/NO + tool name |
| **CI/CD** | Look for `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile` | YES/NO + platform |
| **Type Checking** | tsconfig strictness, mypy, go vet | YES/NO + strictness level |
| **Build System** | Build command exists and passes | PASS/FAIL |
| **Feature Flags** | Search for `feature(`, `process.env.`, `FF_`, `ENABLE_` patterns | Count + list |

For feature flags specifically:

```bash
# Find feature flag patterns
grep -r "feature(" src/ --include="*.ts" --include="*.tsx" -l 2>/dev/null
grep -r "process\.env\." src/ --include="*.ts" -l 2>/dev/null | head -20
```

### 3.2 Feature Flag Deep Dive (if flags found)

For each flag discovered:
1. Name
2. What code path it gates
3. Implementation status: **stub** / **partial** / **mostly-there** / **complete**
4. Estimated effort to enable: **LOW** / **MEDIUM** / **HIGH**

Use the Agent tool with subagent_type=Explore for thorough investigation if
more than 10 flags are found.

### 3.3 Audit Report

Present a scorecard:

```
Infrastructure Audit
====================
Test Framework:  [ ] Not configured
Linter:          [x] Biome (installed, not configured)
CI/CD:           [ ] Not configured
Type Checking:   [x] TypeScript (strict: false)
Build:           [x] PASS (25.89 MB, 1.9s)
Feature Flags:   30 flags found (28 mostly-there, 2 stubs)
```

---

## Phase 4: First-Principles Infrastructure Plan

Based on the audit, generate a layered plan.

### Planning Framework

Think from first principles: what does this project need to be reliable,
maintainable, and extensible?

```
Layer 0: Foundation (blocks everything else)
  → Test framework, linter, CI, feature flag mechanism

Layer 1: Core Improvements (highest daily-use impact)
  → Quick wins from audit (enable mostly-there features, fix gaps)

Layer 2: Architecture (structural improvements)
  → Decoupling, modularization, API boundaries

Layer 3+: Feature Roadmap (new capabilities)
  → Group by dependency chain, assign priority + effort
```

### Plan Format

For each layer, list:

| Item | Current State | Action | Priority | Effort |
|------|--------------|--------|----------|--------|
| ... | ... | ... | P0/P1/P2 | LOW/MED/HIGH |

### Self-Critique

Before presenting, challenge your own plan:
1. Is any item unnecessary? Remove it.
2. Are dependencies correctly ordered? Verify.
3. Is the scope realistic? If > 20 items in Layer 0, you're over-scoping.

Present the plan and **WAIT FOR USER CONFIRMATION** before proceeding to
Phase 5.

---

## Phase 5: Session Export (Cloud → Repo)

Package the current session data so it can be committed and restored elsewhere.

### 5.1 Detect Session Data

```bash
# Find the Claude projects directory
CLAUDE_DIR="${HOME}/.claude"
if [ ! -d "$CLAUDE_DIR" ]; then
  CLAUDE_DIR="/root/.claude"
fi

# Detect project key (absolute path with / → -)
PROJECT_DIR="$(pwd)"
PROJECT_KEY=$(echo "$PROJECT_DIR" | sed 's|/|-|g')
[[ "$PROJECT_KEY" != -* ]] && PROJECT_KEY="-${PROJECT_KEY}"

SESSION_DIR="${CLAUDE_DIR}/projects/${PROJECT_KEY}"
```

### 5.2 Export

Default: export only the latest session. Use `--all` for everything.

```bash
mkdir -p .claude/cloud-sessions

if [ "$EXPORT_ALL" = true ]; then
  cp -r "$SESSION_DIR"/* .claude/cloud-sessions/
else
  LATEST=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -1)
  [ -n "$LATEST" ] && cp "$LATEST" .claude/cloud-sessions/
fi
```

### 5.3 Generate restore.sh

Create a self-contained restore script at `.claude/cloud-sessions/restore.sh`.
See [scripts/session-restore.sh](scripts/session-restore.sh) for the reference
implementation.

### 5.4 Commit and Push

```bash
git add .claude/
git commit -m "feat: bootstrap repo with skills ecosystem + session export"
git push
```

---

## Phase 6: Session Restore (Repo → Local)

Run on the local machine after pulling.

### 6.1 Restore

```bash
bash .claude/cloud-sessions/restore.sh
```

Or if the skill scripts are installed:

```bash
bash <skill-root>/scripts/session-restore.sh
```

### 6.2 Resume

```bash
claude --resume
```

Select the restored session from the list.

---

## Summary Report

After completing all phases, output:

```
Repo Bootstrap Complete
========================

Phase 1 - Reconnaissance:
  Runtime: <detected>
  Build: PASS/FAIL
  Codebase: <X> files, <Y> lines

Phase 2 - Skills Installed:
  Skills: <N>
  Commands: <N>
  Codex Plugin: YES/NO

Phase 3 - Infrastructure Audit:
  Score: <X>/6 dimensions passing
  Feature Flags: <N> found

Phase 4 - Plan:
  Layer 0: <N> items
  Layer 1: <N> items
  Status: Confirmed / Pending

Phase 5 - Session Export:
  Sessions: <N> exported
  Size: <X> MB

Next Steps:
  - <contextual suggestions based on audit>
```
