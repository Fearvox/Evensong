# Wave 2A — Fearvox GitHub Repo Cleanup Runbook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute destructive Fearvox GitHub repo operations (2 delete / 2 archive / 1 rename) from `_vault/infra/CLEANUP-DECISIONS.md` with per-item user approval, and collect Category-E decisions.

**Architecture:** Sequential `gh` CLI ops with user approval gate per item. No source code touch. Each action is one commit to `_vault` for traceability. TDD N/A (ops, not code).

**Tech Stack:** `gh` CLI, git, bash.

**Parent spec:** `docs/superpowers/specs/2026-04-19-vault-foundation-and-preamble-design.md` §7 Wave 2
**Input governance file:** `_vault/infra/CLEANUP-DECISIONS.md` (commit 1b5a462)
**Output:** 5 destructive gh ops + 4 E-class decisions + 1 meta-doc update commit

---

## File Map

| File | Role | Changes |
|---|---|---|
| `_vault/infra/CLEANUP-DECISIONS.md` | Governance doc | Update checkboxes + add "executed at" timestamps per item |

No src/ or packages/ code touched.

---

### Task 1: Pre-flight sanity check

**Files:** (read-only probes)

- [ ] **Step 1: Confirm CCR local dir → Evensong remote (not待删 repo)**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
git remote -v | grep -E "origin.*Evensong"
```

Expected output:
```
origin	https://github.com/Fearvox/Evensong.git (fetch)
origin	https://github.com/Fearvox/Evensong.git (push)
```

If NOT Evensong, STOP — do not proceed (local remote points somewhere else, deleting claude-code-reimagine-for-learning remote could affect it).

- [ ] **Step 2: Confirm `dash-shatter-vault` 部署无硬编码引用**

```bash
grep -rn "dash-shatter-vault" /Users/0xvox/claude-code-reimagine-for-learning --include="*.json" --include="*.yml" --include="*.yaml" --include="*.md" 2>/dev/null | grep -v ".planning/" | head -10
```

Expected: 0 matches in CI/config files. If matches exist, capture them — rename in Task 6 may need consequential updates.

- [ ] **Step 3: Confirm local gh auth works**

```bash
gh auth status 2>&1 | head -5
```

Expected: shows Logged in as Fearvox (or similar).

---

### Task 2: Category B.1 — Delete `Fearvox/claude-code-reimagine-for-learning`

**Files:**
- Read: `_vault/infra/CLEANUP-DECISIONS.md`
- Action: `gh repo delete`

- [ ] **Step 1: User approval gate**

Ask user: "Category B.1 — delete `Fearvox/claude-code-reimagine-for-learning` (private, 55.7MB, Evensong pre-rename 旧副本). Pre-flight Task 1.1 确认 local remote 指向 Evensong 不受影响。批准删除？(y/n)"

If `n`, skip to Task 3. If `y`, proceed.

- [ ] **Step 2: Final probe — check last-modified**

```bash
gh repo view Fearvox/claude-code-reimagine-for-learning --json updatedAt,pushedAt,description
```

Capture output for audit trail.

- [ ] **Step 3: Delete**

```bash
gh repo delete Fearvox/claude-code-reimagine-for-learning --yes
```

Expected: "Deleted repository Fearvox/claude-code-reimagine-for-learning"

- [ ] **Step 4: Verify deletion**

```bash
gh repo view Fearvox/claude-code-reimagine-for-learning 2>&1 | head -3
```

Expected: "GraphQL: Could not resolve to a Repository" or 404.

- [ ] **Step 5: Update CLEANUP-DECISIONS.md**

Change line:
```
- [ ] `Fearvox/claude-code-reimagine-for-learning` (PRIVATE, 55.7 MB)
```
To:
```
- [x] ~~`Fearvox/claude-code-reimagine-for-learning`~~ (PRIVATE, 55.7 MB) — DELETED 2026-04-19
```

Use Edit tool with exact match.

---

### Task 3: Category B.2 — Delete `Fearvox/ds-internal-beta-run`

- [ ] **Step 1: User approval gate**

"Category B.2 — delete `Fearvox/ds-internal-beta-run` (private, 5KB, 只含 LICENSE 空 repo). 批准？(y/n)"

- [ ] **Step 2: Delete**

```bash
gh repo delete Fearvox/ds-internal-beta-run --yes
```

- [ ] **Step 3: Verify**

```bash
gh repo view Fearvox/ds-internal-beta-run 2>&1 | head -3
```

Expected: 404.

- [ ] **Step 4: Update CLEANUP-DECISIONS.md** (same pattern as Task 2.5)

---

### Task 4: Category C.1 — Archive `Fearvox/Spice-DS-EverOS-RR`

- [ ] **Step 1: User approval gate**

"Category C.1 — archive `Fearvox/Spice-DS-EverOS-RR` (public fork, 5.2MB, fork of Dyalwayshappy/Spice, 命名误导). 批准？(y/n)"

- [ ] **Step 2: Archive**

```bash
gh repo archive Fearvox/Spice-DS-EverOS-RR --yes
```

Expected: "Archived repository Fearvox/Spice-DS-EverOS-RR"

- [ ] **Step 3: Verify archived**

```bash
gh repo view Fearvox/Spice-DS-EverOS-RR --json isArchived --jq .isArchived
```

Expected: `true`

- [ ] **Step 4: Update CLEANUP-DECISIONS.md** (mark executed)

---

### Task 5: Category C.2 — Archive `Fearvox/dash-persona-hybrid`

- [ ] **Step 1: User approval gate**

"Category C.2 — archive `Fearvox/dash-persona-hybrid` (private fork, 148KB, Yuze 的 app fork). 批准？(y/n)"

- [ ] **Step 2: Archive**

```bash
gh repo archive Fearvox/dash-persona-hybrid --yes
```

- [ ] **Step 3: Verify** + **Step 4: Update CLEANUP-DECISIONS.md**

---

### Task 6: Category D.1 — Rename `dash-shatter-vault` → `dash-shatter-landing`

- [ ] **Step 1: User approval gate**

"Category D.1 — rename `Fearvox/dash-shatter-vault` → `Fearvox/dash-shatter-landing`. 实际是 Next.js 产品站前端，vault 误导名。Task 1.2 pre-flight 显示 CI/config 引用数。批准？(y/n)"

- [ ] **Step 2: Check local clone existence**

```bash
ls -d /Users/0xvox/dash-shatter-vault 2>/dev/null
ls -d ~/workspace/dash-shatter-vault 2>/dev/null
# per CLAUDE.md: ~/workspace/dash-shatter-vault 是不碰的 sibling，不在 CCR session 管辖
```

Capture which paths exist (if any).

- [ ] **Step 3: Rename via gh**

```bash
gh repo rename Fearvox/dash-shatter-vault dash-shatter-landing --yes
```

Expected: "Renamed repository from Fearvox/dash-shatter-vault to Fearvox/dash-shatter-landing"

- [ ] **Step 4: Update local clone remote (if exists, and NOT ~/workspace/)**

If Task 6.2 found a local clone **outside** `~/workspace/` (user's 别碰 list), update it. Otherwise skip.

```bash
# Example for /Users/0xvox/dash-shatter-vault:
# cd /Users/0xvox/dash-shatter-vault
# git remote set-url origin https://github.com/Fearvox/dash-shatter-landing.git
# git remote -v  # verify
```

If clone is in `~/workspace/dash-shatter-vault` — **do NOT touch**. Per user CLAUDE.md: `~/workspace/dash-shatter-vault` is separate project, do not modify from CCR sessions. Note in CLEANUP-DECISIONS that user must manually update that clone.

- [ ] **Step 5: Verify rename**

```bash
gh repo view Fearvox/dash-shatter-landing --json name --jq .name
gh repo view Fearvox/dash-shatter-vault 2>&1 | head -3  # should 404 or redirect
```

Expected: `"dash-shatter-landing"` + old name 404 or auto-redirect.

- [ ] **Step 6: Update CLEANUP-DECISIONS.md**

```
- [x] ~~`Fearvox/dash-shatter-vault`~~ → `Fearvox/dash-shatter-landing` — RENAMED 2026-04-19
  - 本地 clone remote 更新：(根据 Task 6.2 结果填写，workspace/ 路径提示用户手动更新)
```

---

### Task 7: Category E — Per-repo decision elicitation

**Files:**
- Modify: `_vault/infra/CLEANUP-DECISIONS.md` — replace E-class ❓ with user decisions

- [ ] **Step 1: Ask user about `Fearvox/DS-EverOS-RR`**

"Cat E.1: `Fearvox/DS-EverOS-RR` (public, 5.7MB) — Phase 10 silent-swallow sanitized repro repo，bug 已 fix (PR #6)。选：
- **keep** (历史 artifact，可引) / **archive** (只读保留) / **delete** (完全清) / **skip** (今晚不决定)?"

Capture user response.

- [ ] **Step 2: Ask user about `Fearvox/dash-shatter-benchmarks`**

"Cat E.2: `Fearvox/dash-shatter-benchmarks` (public, 1.6MB) — 跟 `dash-research-vault` / `dash-shatter` benchmark 展示可能重叠。选：
- **keep separate** / **merge into dash-research-vault** / **merge into dash-shatter** / **archive** / **delete** / **skip**?"

Capture response.

- [ ] **Step 3: Ask user about `Fearvox/evermemos-pretext`**

"Cat E.3: `Fearvox/evermemos-pretext` (public, 340KB) — EverMemOS Hub + Pretext text layout。还 active? 选：
- **keep** / **archive** (不 active) / **merge into dash-research-vault 05-rules/** (Wave 3 目标) / **skip**?"

Capture response.

- [ ] **Step 4: Ask user about `Fearvox/dash-persona`**

"Cat E.4: `Fearvox/dash-persona` (public, 2.5MB) — Data-Agnostic Creator Intelligence Engine。独立产品 keep? 跟 dash-shatter 什么关系？选：
- **keep independent** / **rebrand** (给新 description) / **merge under dash umbrella** / **archive** / **skip**?"

Capture response.

- [ ] **Step 5: Execute any immediate actions from E-class decisions**

For decisions that are `archive` or `delete`:
```bash
gh repo archive Fearvox/<repo> --yes  # or
gh repo delete Fearvox/<repo> --yes
```

For `merge` or `rebrand`: these need separate implementation, note in CLEANUP-DECISIONS.md as "Wave 2A follow-up: <action> — not executed tonight"。

- [ ] **Step 6: Update CLEANUP-DECISIONS.md with all E-class resolutions**

For each E item, replace `❓` status with `✅ <action> 2026-04-19` or `⏳ deferred: <action description>`.

---

### Task 8: Finalize CLEANUP-DECISIONS.md + commit

**Files:**
- Modify: `_vault/infra/CLEANUP-DECISIONS.md`

- [ ] **Step 1: Add execution summary section to CLEANUP-DECISIONS.md**

Append to end of file:

```markdown

---

## Wave 2A 执行记录 (2026-04-19)

**Executed at**: 2026-04-19 EDT by Claude Opus 4.7 (1M) session per `docs/superpowers/plans/2026-04-19-wave2a-github-repo-cleanup.md`

| Category | Action | Status |
|---|---|---|
| B.1 | delete claude-code-reimagine-for-learning | (填写 executed/skipped/blocked) |
| B.2 | delete ds-internal-beta-run | (填写) |
| C.1 | archive Spice-DS-EverOS-RR | (填写) |
| C.2 | archive dash-persona-hybrid | (填写) |
| D.1 | rename dash-shatter-vault → dash-shatter-landing | (填写) |
| E.1 | DS-EverOS-RR decision | (填写) |
| E.2 | dash-shatter-benchmarks decision | (填写) |
| E.3 | evermemos-pretext decision | (填写) |
| E.4 | dash-persona decision | (填写) |

**Follow-ups (not executed tonight)**: (列任何 E 类的 merge/rebrand deferred action)
```

Fill in actual statuses based on Task 2-7 execution.

- [ ] **Step 2: Commit to _vault**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning/_vault
git add infra/CLEANUP-DECISIONS.md
git commit -m "chore(infra): Wave 2A execution record — repo cleanup $(date +%Y-%m-%d)"
git push origin main
```

- [ ] **Step 3: Verify push**

```bash
git log origin/main..HEAD --oneline  # should be empty
```

---

## Post-execution Verification

```bash
# Verify deletes
gh repo view Fearvox/claude-code-reimagine-for-learning 2>&1 | grep -qi "could not resolve" && echo "✅ B.1 deleted"
gh repo view Fearvox/ds-internal-beta-run 2>&1 | grep -qi "could not resolve" && echo "✅ B.2 deleted"

# Verify archives
gh repo view Fearvox/Spice-DS-EverOS-RR --json isArchived --jq .isArchived  # expect true
gh repo view Fearvox/dash-persona-hybrid --json isArchived --jq .isArchived  # expect true

# Verify rename
gh repo view Fearvox/dash-shatter-landing --json name --jq .name  # expect "dash-shatter-landing"

# Verify _vault record
cd /Users/0xvox/claude-code-reimagine-for-learning/_vault
git log --oneline -1  # expect "chore(infra): Wave 2A execution record"
```

All checks pass = Wave 2A DONE.

---

## Rollback Plan

**Rename** (D.1): `gh repo rename Fearvox/dash-shatter-landing dash-shatter-vault --yes`

**Archive** (C.1/C.2): `gh repo unarchive Fearvox/<name>` (if gh supports; otherwise GitHub UI → Settings → Unarchive)

**Delete** (B.1/B.2): **IRREVERSIBLE**. GitHub keeps deleted private repos for limited time (24-48h) via support ticket only. Recommend only delete after Task 2.2 manual inspection.

**CLEANUP-DECISIONS.md update**: `git revert <commit>` in _vault.
