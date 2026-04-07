# Fix Vendored Skills & Commands Hygiene

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all broken path references, remove committed secrets/transcripts, add proper vendored file attribution, and ensure all imported ECC/Codex commands actually work.

**Architecture:** The `.claude/` directory contains vendored third-party skills/commands from two sources: `affaan-m/everything-claude-code` (ECC) and `openai/codex-plugin-cc`. Many files reference `${CLAUDE_PLUGIN_ROOT}` which doesn't resolve in our setup. The hooks.json references 30+ scripts that don't exist in our repo. A session transcript was accidentally committed.

**Tech Stack:** Bash, git, markdown

---

### Task 1: Remove Accidentally Committed Session Transcript

**Files:**
- Delete: `.claude/session-transcript.jsonl`
- Create: `.gitignore` entry

The session transcript (214 lines) contains conversation history from the web session and was committed by mistake. It should never be tracked.

- [ ] **Step 1: Remove from git tracking**

```bash
git rm --cached .claude/session-transcript.jsonl
```

- [ ] **Step 2: Add to .gitignore**

Open the root `.gitignore` and append:

```
# Session transcripts (private conversation data)
.claude/session-transcript.jsonl
.claude/session-data/
```

If no `.gitignore` exists at the project root, check if there's one already and append to it.

- [ ] **Step 3: Verify file is untracked**

Run: `git status`
Expected: `.claude/session-transcript.jsonl` shows as deleted from index, `.gitignore` shows as modified/added

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "fix: remove accidentally committed session transcript, add to .gitignore"
```

---

### Task 2: Delete Non-Functional hooks.json

**Files:**
- Delete: `.claude/hooks/hooks.json`
- Delete: `.claude/hooks/README.md`

The `hooks.json` references 30 scripts via `${CLAUDE_PLUGIN_ROOT}/scripts/hooks/...` — none of these scripts exist in our repo. The ECC hooks system requires the full ECC plugin runtime installed via the marketplace, which we don't have. These hooks will cause errors if the Claude Code harness tries to load them.

- [ ] **Step 1: Verify scripts don't exist**

```bash
ls .claude/scripts/hooks/ 2>/dev/null || echo "Confirmed: no scripts/hooks/ directory"
```

Expected: "Confirmed: no scripts/hooks/ directory"

- [ ] **Step 2: Remove hooks.json and README**

```bash
git rm .claude/hooks/hooks.json .claude/hooks/README.md
rmdir .claude/hooks 2>/dev/null || true
```

- [ ] **Step 3: Verify removal**

Run: `git status`
Expected: Both files show as deleted

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: remove non-functional ECC hooks.json (scripts not vendored)"
```

---

### Task 3: Fix CLAUDE_PLUGIN_ROOT in ECC Commands

**Files:**
- Modify: `.claude/commands/evolve.md`
- Modify: `.claude/commands/instinct-import.md`
- Modify: `.claude/commands/instinct-status.md`
- Modify: `.claude/commands/projects.md`
- Modify: `.claude/commands/promote.md`
- Modify: `.claude/commands/prune.md`
- Modify: `.claude/commands/sessions.md`
- Modify: `.claude/commands/skill-health.md`

These 8 commands reference `${CLAUDE_PLUGIN_ROOT}` for Python/Node scripts that don't exist in our vendored copy. The commands that reference `instinct-cli.py` (evolve, instinct-import, instinct-status, projects, promote, prune) need the path updated to our actual location. The `sessions.md` and `skill-health.md` also reference CLAUDE_PLUGIN_ROOT for Node scripts.

Strategy: The `continuous-learning-v2` skill DOES have its scripts at `.claude/skills/everything-claude-code/continuous-learning-v2/scripts/`. So for the instinct commands, replace `${CLAUDE_PLUGIN_ROOT}/skills/` with a relative path. For sessions.md and skill-health.md which reference `scripts/lib/utils.js` (not vendored), add a note that they require the full ECC plugin.

- [ ] **Step 1: Fix instinct-related commands (6 files)**

For each of these files, replace:
```
python3 "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/scripts/instinct-cli.py"
```
with:
```
python3 "${CLAUDE_PROJECT_DIR}/.claude/skills/everything-claude-code/continuous-learning-v2/scripts/instinct-cli.py"
```

Files to fix:
1. `.claude/commands/evolve.md` (line 14)
2. `.claude/commands/instinct-import.md` (line 14)
3. `.claude/commands/instinct-status.md` (line 16)
4. `.claude/commands/projects.md` (line 16)
5. `.claude/commands/promote.md` (line 16)
6. `.claude/commands/prune.md` (line 16)

- [ ] **Step 2: Fix sessions.md**

The `sessions.md` command references `${CLAUDE_PLUGIN_ROOT}/scripts/lib/session-manager.mjs` which is NOT vendored. Add a comment at the top of the file noting this dependency:

Add after the frontmatter:
```markdown
> **Note:** This command requires the full ECC plugin runtime. When running standalone, session management commands that call `session-manager.mjs` will not work. Basic session listing via `claude --resume` still works natively.
```

Replace all `${CLAUDE_PLUGIN_ROOT}/scripts/` with `${CLAUDE_PROJECT_DIR}/.claude/scripts/` so the path is at least consistent, even if the scripts aren't present.

- [ ] **Step 3: Fix skill-health.md**

The `skill-health.md` already has a fallback mechanism that tries to auto-detect ECC root. The `CLAUDE_PLUGIN_ROOT` references in this file are inside the fallback expression itself, so they're functioning as intended (checking if plugin root is set, falling back to detection). Leave the logic as-is but add a note:

Add after the frontmatter:
```markdown
> **Note:** This command auto-detects the ECC installation path. It works with both plugin-managed and vendored installations.
```

- [ ] **Step 4: Verify no remaining unresolved CLAUDE_PLUGIN_ROOT in commands**

```bash
grep -l 'CLAUDE_PLUGIN_ROOT' .claude/commands/*.md
```

Expected: Only `sessions.md` and `skill-health.md` should remain (they have fallback mechanisms).

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/evolve.md .claude/commands/instinct-import.md .claude/commands/instinct-status.md .claude/commands/projects.md .claude/commands/promote.md .claude/commands/prune.md .claude/commands/sessions.md .claude/commands/skill-health.md
git commit -m "fix: resolve CLAUDE_PLUGIN_ROOT paths in ECC commands to vendored locations"
```

---

### Task 4: Fix CLAUDE_PLUGIN_ROOT in Codex Agent

**Files:**
- Modify: `.claude/agents/codex-rescue.md`

The codex-rescue agent references `${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs`. We already have the codex companion at `.claude/codex-plugin/codex-companion.mjs`.

- [ ] **Step 1: Fix the path**

Replace:
```
`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task ...`
```
with:
```
`node "${CLAUDE_PROJECT_DIR}/.claude/codex-plugin/codex-companion.mjs" task ...`
```

- [ ] **Step 2: Also fix the codex-cli-runtime skill**

File: `.claude/skills/everything-claude-code/codex-cli-runtime/SKILL.md`

Replace:
```
`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs"`
```
with:
```
`node "${CLAUDE_PROJECT_DIR}/.claude/codex-plugin/codex-companion.mjs"`
```

- [ ] **Step 3: Verify**

```bash
grep 'CLAUDE_PLUGIN_ROOT' .claude/agents/codex-rescue.md .claude/skills/everything-claude-code/codex-cli-runtime/SKILL.md
```

Expected: No matches

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/codex-rescue.md .claude/skills/everything-claude-code/codex-cli-runtime/SKILL.md
git commit -m "fix: resolve codex agent and skill paths to vendored codex-plugin location"
```

---

### Task 5: Fix ck Skill Path References

**Files:**
- Modify: `.claude/skills/everything-claude-code/ck/SKILL.md`

Copilot correctly identified that this file references `~/.claude/skills/ck/` but the actual path is `.claude/skills/everything-claude-code/ck/`.

- [ ] **Step 1: Fix all 3 path references**

In `.claude/skills/everything-claude-code/ck/SKILL.md`:

Replace line 14:
```
Scripts live at: `~/.claude/skills/ck/commands/` (expand `~` with `$HOME`).
```
with:
```
Scripts live at: `.claude/skills/everything-claude-code/ck/commands/` (relative to project root).
```

Replace line 124:
```
The hook at `~/.claude/skills/ck/hooks/session-start.mjs` must be registered in
```
with:
```
The hook at `.claude/skills/everything-claude-code/ck/hooks/session-start.mjs` must be registered in
```

Replace line 131:
```
{ "hooks": [{ "type": "command", "command": "node \"~/.claude/skills/ck/hooks/session-start.mjs\"" }] }
```
with:
```
{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/skills/everything-claude-code/ck/hooks/session-start.mjs\"" }] }
```

- [ ] **Step 2: Verify**

```bash
grep '~/.claude/skills/ck' .claude/skills/everything-claude-code/ck/SKILL.md
```

Expected: No matches

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/everything-claude-code/ck/SKILL.md
git commit -m "fix: update ck skill paths from ~/.claude/skills/ck to vendored location"
```

---

### Task 6: Add .gitattributes for Vendored Files

**Files:**
- Create: `.gitattributes`

Without this, GitHub counts 75K lines of vendored markdown as project code, polluting language stats and diffs.

- [ ] **Step 1: Create .gitattributes**

```gitattributes
# Vendored third-party skills and commands (ECC + Codex plugin)
.claude/skills/everything-claude-code/** linguist-vendored
.claude/commands/** linguist-vendored
.claude/codex-plugin/** linguist-vendored
.claude/hooks/** linguist-vendored
.claude/agents/** linguist-vendored

# Session data (should not be committed but mark just in case)
.claude/session-transcript.jsonl linguist-generated
.claude/session-data/** linguist-generated
```

- [ ] **Step 2: Verify**

```bash
cat .gitattributes
```

Expected: File contents match above

- [ ] **Step 3: Commit**

```bash
git add .gitattributes
git commit -m "chore: add .gitattributes to mark vendored ECC/Codex files"
```

---

### Task 7: Fix continuous-learning-v2 Skill Internal Paths

**Files:**
- Modify: `.claude/skills/everything-claude-code/continuous-learning-v2/SKILL.md`

This skill references `${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/hooks/observe.sh` in its hook configuration example. Since the hooks are actually at `.claude/skills/everything-claude-code/continuous-learning-v2/hooks/`, fix it.

- [ ] **Step 1: Fix hook paths in SKILL.md**

Replace (2 occurrences):
```
"command": "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/hooks/observe.sh"
```
with:
```
"command": "${CLAUDE_PROJECT_DIR}/.claude/skills/everything-claude-code/continuous-learning-v2/hooks/observe.sh"
```

- [ ] **Step 2: Verify**

```bash
grep 'CLAUDE_PLUGIN_ROOT' .claude/skills/everything-claude-code/continuous-learning-v2/SKILL.md
```

Expected: No matches

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/everything-claude-code/continuous-learning-v2/SKILL.md
git commit -m "fix: resolve continuous-learning-v2 hook paths to vendored location"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Full CLAUDE_PLUGIN_ROOT audit**

```bash
grep -rl 'CLAUDE_PLUGIN_ROOT' .claude/ --include="*.md" --include="*.json" | grep -v session-transcript | sort
```

Expected: Only `sessions.md`, `skill-health.md`, and `SKILL.md` (ECC root changelog) should remain — all with documented fallback mechanisms.

- [ ] **Step 2: Build verification**

```bash
bun run build 2>&1 | tail -5
```

Expected: Build succeeds (these changes are all in `.claude/` markdown/json, not source code)

- [ ] **Step 3: Git status clean**

```bash
git status
```

Expected: Clean working tree

- [ ] **Step 4: Push all fixes**

```bash
git push origin claude/explore-repo-NRiut
```
