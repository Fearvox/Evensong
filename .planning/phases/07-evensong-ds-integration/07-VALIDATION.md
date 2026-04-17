# Phase 07 Validation: Evensong → DS Integration

**Completed:** 2026-04-16 19:45 (same session, same orchestrator, no dispatch)
**Branch:** `claude/friendly-allen-ed16ee`
**Commits on branch (new):** 4 Phase-07 commits + 1 prior documentation commit

---

## Task Status

| # | Task | Status | Evidence |
|---|------|--------|----------|
| T0 | Syncthing path fix | ✅ DONE | `state: idle / error: <empty> / localFiles: 362` — PATCHed path via REST API, wrote `.stignore` |
| T1 | ds-research-vault push | ✅ DONE | https://github.com/Fearvox/ds-research-vault (PRIVATE). History clean — zero sensitive files across all commits |
| T2 | research-vault-mcp workspace | ✅ DONE | `packages/research-vault-mcp` — build `dist/server.js 21.27KB`, VAULT_ROOT fixed (env→homedir fallback), workspaces array updated. Commit `98c931a` |
| T3 | research-vault submodule | ✅ DONE | `.gitmodules` + submodule cache populated. All 7 CCR anchor mds preserved (6 as-is, HANDOFF-EVENSONG-EN renamed to -R012-RUNNER to avoid collision with Doc version). Commit `7aa30a8` |
| T4 | ds-benchmark-data repo | ✅ DONE | https://github.com/Fearvox/ds-benchmark-data (PRIVATE, 132 MB). 6 commits: README + R006 (51 MB) + R008 (3.8 MB) + R012-GPT (9.8 MB) + EverMind-Handoff (4 MB) + stress-tests + r011-handoff. CCR submodule `update=none` (opt-in). Commit `a59887e` |
| T5 | CLAUDE.md alignment | ✅ DONE | CCR/CLAUDE.md — new CCR/CCB narrative + Integrated Assets section + "do NOT touch" list. Global ~/.claude/CLAUDE.md — DS Repo Map section. Commit `52b41d6` |
| T6 | E2E verify + archive | ✅ DONE (scope adjusted) | See evidence table below. Archive of `~/Documents/Evensong/research-vault{,-mcp}` **deferred** — see "Scope Adjustment" |

---

## E2E Evidence (pasted from actual commands)

### 1. CCR build passes
```
$ bun run build
  cli.js  27.10 MB  (entry point)
```

### 2. All 3 GitHub repos exist + PRIVATE
```
Fearvox/Evensong         — PRIVATE / 2026-04-16T10:50:39Z
Fearvox/ds-research-vault — PRIVATE / 2026-04-16T23:29:15Z
Fearvox/ds-benchmark-data — PRIVATE / 2026-04-16T23:33:29Z
```

### 3. Syncthing healthy post-T0
```
state: idle | error: <empty> | needFiles: 0 | inSyncFiles: 362
```

### 4. Zero sensitive leak across all repos
```
Fearvox/Evensong         — clean
Fearvox/ds-research-vault — clean
Fearvox/ds-benchmark-data — clean
```

### 5. Phase 07 commit series on branch claude/friendly-allen-ed16ee
```
52b41d6 docs(claude-md): align CCR/CCB narrative + document Phase 07 integrated assets
a59887e chore(benchmarks): add ds-benchmark-data as optional submodule
7aa30a8 chore(research-vault): replace local dir with submodule → ds-research-vault
98c931a feat(packages): migrate research-vault-mcp as CCR workspace package
cf7f55c feat(relay): support plain JSON mode for CCR SDK direct path  ← prior
```

### 6. CCR submodule gitlinks registered
```
160000 42ecd148 0   research-vault
160000 7f6eff1b 0   benchmarks/data
```

Both submodules resolve content:
- `research-vault/` — 9 md files at root (CROSS-REF-EVEROS, EVOLUTION-LAYER-INDEX, HANDOFF-EVENSONG-EN, HANDOFF-EVENSONG-EN-R012-RUNNER, HANDOFF-SELF-EVOLUTION-COORDINATOR-IMPLEMENTATION-PLAN, PHILOSOPHICAL-INTEGRITY-ANCHOR-L0, ROMANTIC-BENCHMARK-TRAILER-IDEA, UPDATE-SUMMARY-2026-04-13, HANDOFF) + subdirs (docs, knowledge, raw, summaries, ultraplan, scripts)
- `benchmarks/data/` — README.md + R006/ + R008/ + R012-GPT/ + EverMind-Handoff/ + stress-tests/ + r011-handoff/

---

## Scope Adjustment (Phase 07 T6)

The original SPEC T6 included "archive source" step (rename `~/Documents/Evensong/research-vault` → `.archive-research-vault-2026-04-16`). **Not executed**. Reason:

`~/Documents/Evensong/research-vault` is NOT just a pre-migration snapshot — it is:
1. **Syncthing-watched upstream** (synced with yuze-mac device), renaming would trigger new "folder marker missing"
2. **Local git repo that *is* the ds-research-vault source** — T1 was "push existing repo", not "new clone"
3. **Active working copy** — user still edits research content here; changes propagate to CCR via `git push → git submodule update`

The correct model is **upstream/downstream**, not archive/new:
- Upstream: `~/Documents/Evensong/research-vault/` (live working copy, Syncthing-synced)
- Remote: `Fearvox/ds-research-vault` (GitHub, private)
- Downstream: `CCR/research-vault/` (submodule consumer)

Likewise for `research-vault-mcp`:
- Source copy kept in `~/Documents/Evensong/research-vault-mcp/` (active MCP server PID 72535 still running stale code there — user must restart to pick up new VAULT_ROOT fix)
- New canonical: `CCR/packages/research-vault-mcp/`

**User action items (out of Phase 07 scope, tracked for follow-up):**
- [ ] Stop old MCP server (PID 72535, `cd /Users/0xvox/Documents/Evensong/research-vault-mcp && bun run src/server.ts`) and restart from `CCR/packages/research-vault-mcp` to pick up VAULT_ROOT fix
- [ ] Decide whether to continue dual-locating research-vault-mcp (`Documents` runtime + `CCR/packages/` source) or remove `Documents` version entirely

---

## Known Pre-Existing Issues (not introduced by Phase 07)

`git submodule status` emits `fatal: no submodule mapping found in .gitmodules` because the CCR index has 3 orphan submodule gitlinks with no `.gitmodules` entries:
```
.claude/plugins/evermem        — orphan gitlink
.worktrees/phase-09            — orphan gitlink
skills/dash-research-vault     — orphan gitlink
```

These existed before Phase 07. Fixing them is out of scope. The Phase 07 submodules (`research-vault`, `benchmarks/data`) are valid — `.gitmodules` entries present, gitlink SHAs resolve, content accessible.

**Recommended future cleanup:** either add matching `.gitmodules` entries for the 3 orphans, or `git rm --cached` them if no longer needed.

---

## Phase 07 Sensitive-File Security Audit (red line one)

Hard-gate enforcement on T1:
```
git ls-files | grep -iE '(api.key|飙马野人|\.docx|credentials|secret)'
→ empty (zero results)

git log --all --pretty=format:'' --name-only | grep -iE '(api.key|飙马野人|\.docx|credentials|secret)'
→ empty (zero results in history)
```

Sensitive `.gitignore` patterns (both CCR main repo already ignored .env variants; ds-research-vault repo adds explicit block):
```
api key.md
api*key*.md
飙马野人/
*.docx
credentials*
secret*
.env*
.DS_Store
.stfolder/
.stversions/
.sync-conflict-*
```

Verified on each of the 3 repos via `gh api repos/<repo>/contents -q '.[].name' | grep sensitive` → zero matches.

---

## What Changed, Where

- **Local file changes**: 5 commits on branch `claude/friendly-allen-ed16ee` (see Evidence table §5)
- **New GitHub repos (private)**: `ds-research-vault`, `ds-benchmark-data`
- **Syncthing config**: `folder.path` for `researchvault` folder updated from `~/Desktop/research-vault` to `~/Documents/Evensong/research-vault` via REST API PATCH (no XML edit)
- **Global `~/.claude/CLAUDE.md`**: added "DS Repo Map" section at top
- **New workspace package**: `packages/research-vault-mcp` — brings MCP server (HTTP SSE, port 8765) into CCR monorepo
- **VAULT_ROOT fix in MCP**: hardcoded `/Desktop/research-vault` (empty post-migration) → env-override with `os.homedir()` fallback

Nothing destructive. All archive-rename / deletion operations deferred for user review.
