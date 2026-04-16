# Phase 07 SPEC: Evensong → DS Integration

**Authored:** 2026-04-16 by orchestrator (Claude)
**Status:** Awaiting dispatch — user assigns tasks to specific CLI sessions
**Bound to:** [07-CONTEXT.md](./07-CONTEXT.md)

---

## Orchestration Protocol

1. Tasks are **atomic** — each can be assigned to a separate CLI without reading the others
2. Each task has **pre-conditions** (must be true to start) and **post-conditions** (must verify to close)
3. Each task has a **recommended CLI** — user override welcome
4. Each task has **verification commands** — executor must paste output as proof of close
5. **No task marks complete without showing verification output** (red line one: 闭环意识)

---

## Task Dependency Graph

```
          ┌──────────────────────────────────────┐
          │  T0: Syncthing path fix  ✅ DONE      │
          │     (orchestrator pre-flight fix)    │
          └──────────────┬───────────────────────┘
                         │
                         ▼
          ┌──────────────────────────────────────┐
          │  T1: ds-research-vault push to GitHub│
          │     (repo already git-init locally)  │
          └──────────────┬───────────────────────┘
                         │
                         ▼
          ┌──────────────────────────────────────┐
          │  T3: CCR research-vault → submodule  │
          └──────────────┬───────────────────────┘
                         │
                         ├─── parallel ───┐
                         ▼                ▼
          ┌─────────────────────┐  ┌──────────────────────┐
          │ T2: research-vault-  │  │ T4: ds-benchmark-    │
          │     mcp → packages/  │  │     data init        │
          └──────────┬──────────┘  └──────────┬───────────┘
                     │                         │
                     └────────────┬────────────┘
                                  ▼
          ┌──────────────────────────────────────┐
          │  T5: CCR + global CLAUDE.md update   │
          └──────────────┬───────────────────────┘
                         ▼
          ┌──────────────────────────────────────┐
          │  T6: archive rename + E2E verify     │
          └──────────────────────────────────────┘
```

---

## T0 — Syncthing path fix ✅ DONE (2026-04-16 19:15)

**Executor:** orchestrator (this Claude session)
**Status:** Completed — no dispatch needed
**Why this exists:** Discovery missed the Syncthing sync layer. Syncthing was configured to watch `/Users/0xvox/Desktop/research-vault` (empty), not the actual data at `/Users/0xvox/Documents/Evensong/research-vault` (82 MB). This triggered the "folder marker missing (potential data loss)" warning visible in Syncthing GUI. Fixed before any git operation touches the vault — if ignored, git submodule wiring in T1/T3 would have fought with Syncthing sync.

### What was done
1. `PATCH /rest/config/folders/researchvault` via Syncthing REST API → path updated to `/Users/0xvox/Documents/Evensong/research-vault`
2. `POST /rest/db/scan?folder=researchvault` → full rescan triggered
3. Wrote `.stignore` into the vault to exclude `.git/**` from Syncthing (keeps git and Syncthing as separate channels — git = history/remote, Syncthing = live dual-device mirror)

### Verification (pasted evidence)

```
HTTP_STATUS: 200
path: /Users/0xvox/Documents/Evensong/research-vault
state: idle
error: <empty>
localFiles: 360
localBytes: 84687868  (~81 MB)
```

### Downstream implications for T1 and T3

- `.stignore` must NOT be deleted by later tasks (Syncthing depends on it)
- `api key.md` is still present in the live vault — T1 must exclude it from git-push via the repo's own `.gitignore` (Syncthing does NOT care about git-side exclusion)
- yuze-mac is a paired device receiving the same path — any T1/T3 changes that write to the vault will propagate to yuze-mac automatically; coordinate if that device is actively being worked on

### Remaining monitoring
- User should verify in Syncthing GUI that the yellow "folder marker missing" banner is gone (GUI may need refresh)
- Syncthing might now re-index both ends (macbook-pro + yuze-mac). Expect 1-2 min bandwidth spike. Normal.

---

## T1 — ds-research-vault push to GitHub (existing git repo)

**Recommended CLI:** `codex` (cleanest git-ops, good at sensitive-file handling)
**Estimated effort:** 30 min (reduced — repo is already git-init'd)
**Blocking:** T3
**Depends on:** T0 ✅ (Syncthing path must be aligned first)

### Pre-conditions
- [x] T0 complete — Syncthing now watches the real path (verified 19:15)
- [ ] `~/Documents/Evensong/research-vault/.git/` exists (**already does** — verify with `git -C ~/Documents/Evensong/research-vault log --oneline | head -3`)
- [ ] `gh auth status` confirms GitHub CLI authed as `Fearvox`
- [ ] Git email is `fearvox1015@gmail.com` (per user memory — do NOT use `nolan@0xvox.com`, Vercel-blocked)

### Action sequence (updated — operates on existing local repo, does NOT copy to /tmp)

1. Inspect existing repo state:
   ```bash
   cd ~/Documents/Evensong/research-vault
   git log --oneline | head -10
   git status
   git config user.email    # must be fearvox1015@gmail.com before any commit
   ```
2. Write / update `.gitignore` with sensitive allowlist (spec below). Note: `.stignore` (from T0) must NOT be in `.gitignore` — it's a valid committed file that documents the Syncthing boundary.
3. **HARD GATE — verify nothing sensitive is already tracked**:
   ```bash
   git ls-files | grep -iE '(api.key|飙马野人|\.docx|credentials|secret)' | head
   ```
   - If **empty**: safe, proceed.
   - If **non-empty**: `git rm --cached <file>` for each match, commit a "remove-sensitive-from-history" prep commit, then run `git filter-repo` (or BFG) to scrub history before push. Do NOT push until clean.
4. `git add .gitignore && git commit -m "chore: add gitignore for sensitive vault files"` (if any .gitignore change)
5. Create remote: `gh repo create Fearvox/ds-research-vault --private --description "DS research vault (private, pre-desensitization)" --source . --remote origin --push=false`
6. `git push -u origin main` (or current branch name — check with `git branch --show-current`)
7. Post-push verify: `gh api repos/Fearvox/ds-research-vault/contents -q '.[].name'` lists files, **does not include** `api key.md`, `飙马野人`, any `.docx`
8. Verify Syncthing is happy: Syncthing GUI shows "Up to Date" for Research Vault folder (the `.git/` changes from the push should be invisible to Syncthing thanks to T0's `.stignore`)

### .gitignore contract (top of file, must be in place before any add/push)

```gitignore
# Sensitive — never commit
api key.md
api*key*.md
飙马野人/
*.docx
credentials*
secret*
.env*
.DS_Store
node_modules/

# NOTE: .stignore IS committed — documents the Syncthing boundary (intentional)
```

### Verification (paste to close task)

```bash
cd ~/Documents/Evensong/research-vault
git ls-files | grep -iE '(api.key|飙马野人|\.docx|credentials|secret)' | head
# Expected: empty output
git log --all --pretty=format:'' --name-only | grep -iE '(api.key|飙马野人|\.docx|credentials|secret)' | head
# Expected: empty output (history clean)
gh repo view Fearvox/ds-research-vault --json visibility -q .visibility
# Expected: PRIVATE
git log --oneline | head -3
# Expected: local history visible, remote synced
```

### Risk mitigation
- **R1 mitigation**: step 3 is HARD GATE — if any sensitive filename is already tracked, history must be scrubbed BEFORE push
- **R2 (new — Syncthing coexistence)**: Operating on the live Syncthing-watched dir means yuze-mac will see the `.gitignore` change. Expected, benign.
- No /tmp copy needed — previous plan copied to isolate; since the dir is already a valid git repo, direct operation is safer (fewer moving parts)

---

## T2 — research-vault-mcp → CCR workspace package

**Recommended CLI:** `claude` (complex workspace wiring + possible path rewrites)
**Estimated effort:** 60 min
**Blocking:** T5

### Pre-conditions
- [ ] `~/Documents/Evensong/research-vault-mcp/package.json` exists
- [ ] `CCR/package.json` has `"workspaces": [...]` array
- [ ] `CCR` working tree clean (`git status` shows no pending changes on main branch)

### Action sequence
1. **Pre-flight: scan for absolute paths** in the source MCP:
   ```bash
   grep -rE "/(Users|home)/0xvox/Documents/Evensong" ~/Documents/Evensong/research-vault-mcp/ | head -20
   ```
   If any found, document them — they must be rewritten to package-relative after migration.
2. `mkdir -p CCR/packages && cp -R ~/Documents/Evensong/research-vault-mcp CCR/packages/`
3. Inspect CCR `package.json` workspaces and add `"packages/research-vault-mcp"` if not covered by glob
4. `cd CCR && bun install` — verify workspace linking
5. Rewrite any absolute paths found in step 1 to use `import.meta.dir` / `import.meta.url` relative resolution
6. If the MCP has a start script, run smoke test: `bun --cwd CCR/packages/research-vault-mcp start --help` (or equivalent)
7. Register in MCP server config — exact file depends on project convention (check `CCR/.claude/` or `~/.claude/` for existing MCP registrations before choosing target)
8. Commit to CCR as single logical change: `feat(mcp): migrate research-vault-mcp to workspace package`

### Verification (paste to close task)

```bash
cd ~/claude-code-reimagine-for-learning
ls packages/research-vault-mcp/package.json
# Expected: file exists
bun --cwd packages/research-vault-mcp run --silent 2>&1 | head -5
# Expected: start script name or help text, no ERR_MODULE_NOT_FOUND
grep -rE "/Users/0xvox/Documents/Evensong" packages/research-vault-mcp/ 2>/dev/null
# Expected: empty
bun run build 2>&1 | tail -3
# Expected: build succeeds (existing CCR build untouched)
```

### Risk mitigation
- **R2 mitigation**: step 1 is discovery, step 5 is fix. Do not skip step 1.
- If smoke test in step 6 fails, do NOT force it into `packages/` — revert the `cp` and report the blocker to orchestrator for re-scoping

---

## T3 — CCR/research-vault → submodule (replace 48 KB real dir)

**Recommended CLI:** `codex` (depends on T1, same git-ops flavor)
**Estimated effort:** 45 min
**Blocking:** T5
**Depends on:** T1 complete

### Pre-conditions
- [ ] T1 post-conditions verified
- [ ] `CCR/research-vault/` is currently 48 KB real directory with 8 md files
- [ ] `CCR` working tree clean

### Action sequence
1. **Diff + preserve CCR's unique content** (R3 mitigation):
   ```bash
   comm -23 \
     <(cd ~/claude-code-reimagine-for-learning/research-vault && find . -type f | sort) \
     <(cd ~/Documents/Evensong/research-vault && find . -type f | sort)
   ```
   Any CCR-only file must be copied into `/tmp/ds-research-vault-seed/` and pushed in a second commit before T3 proceeds.
2. Scan CCR src/ and docs/ for hardcoded `research-vault/...` path references:
   ```bash
   grep -rE "research-vault/[A-Za-z0-9_-]+\.md" ~/claude-code-reimagine-for-learning/{src,docs,skills} | head -30
   ```
   Make a list — any referenced file must exist in the submodule after T3.
3. Remove old directory: `cd CCR && git rm -r research-vault/ && git commit -m "chore: remove local research-vault in prep for submodule"`
4. Add submodule: `git submodule add git@github.com:Fearvox/ds-research-vault.git research-vault`
5. `git commit -m "chore: add research-vault as submodule from ds-research-vault repo"`
6. Verify all paths from step 2 still resolve:
   ```bash
   while read path; do [ -f "$path" ] || echo "MISSING: $path"; done < /tmp/research-vault-paths.txt
   ```
7. `bun run build` — confirm no regression
8. Push CCR changes

### Verification (paste to close task)

```bash
cd ~/claude-code-reimagine-for-learning
cat .gitmodules | grep -A2 research-vault
# Expected: url = git@github.com:Fearvox/ds-research-vault.git
cd research-vault && git log -1 --format="%h %s"
# Expected: commit hash + message from T1
cd .. && bun run build 2>&1 | tail -3
# Expected: build succeeds
grep -rE "research-vault/[A-Za-z0-9_-]+\.md" src/ docs/ | while read l; do
  p=$(echo "$l" | grep -oE "research-vault/[A-Za-z0-9_-]+\.md")
  [ -f "$p" ] || echo "BROKEN: $l"
done
# Expected: empty (no BROKEN references)
```

### Risk mitigation
- **R3 mitigation**: step 1 is critical — CCR's 48 KB is "anchor" files that may be curated, not simply redundant with Documents
- **R4 mitigation**: steps 2, 6, 7 — verify paths + build
- If step 6 finds missing files, abort submodule add and add missing to `/tmp/ds-research-vault-seed/` + re-push T1 repo first

---

## T4 — ds-benchmark-data private repo init

**Recommended CLI:** `gemini` (large-file handling, good at iteration over many dirs)
**Estimated effort:** 90 min (biggest task — 73 MB content)
**Blocking:** T6
**Depends on:** none (parallel with T2/T3)

### Pre-conditions
- [ ] `~/Documents/Evensong/{R006-PUA-EXTREME-FULL,R008 Final,R012-GPT,Evensong-EverMind-Handoff,stress-tests}/` all exist
- [ ] Total size verified ~73 MB
- [ ] `gh auth status` authed

### Action sequence
1. Create private repo: `gh repo create Fearvox/ds-benchmark-data --private --description "DS benchmark runs data (R006/R008/R012/EverMind/stress-tests)"`
2. `mkdir /tmp/ds-benchmark-data-seed && cd /tmp/ds-benchmark-data-seed && git init && git branch -m main`
3. Copy datasets in separate commits (R5 mitigation for 100 MB limit):
   - Commit 1: `cp -R ~/Documents/Evensong/R006-PUA-EXTREME-FULL ./R006 && git add . && git commit -m "data: R006 PUA-extreme runs"`
   - Commit 2: `cp -R ~/Documents/Evensong/'R008 Final' ./R008 && git add . && git commit -m "data: R008 final runs"`
   - Commit 3: R012-GPT, Commit 4: EverMind-Handoff, Commit 5: stress-tests
4. Write `README.md` documenting: repo purpose, contents per subdir, reproducibility contract (which CCR commit + which model producer generated each run), privacy status (private until paper acceptance)
5. Push: `git remote add origin git@github.com:Fearvox/ds-benchmark-data.git && git push -u origin main`
6. Configure as optional submodule in CCR (NOT initialized by default):
   - `cd CCR && git submodule add --name benchmark-data git@github.com:Fearvox/ds-benchmark-data.git benchmarks/data`
   - Edit `.gitmodules` to add `update = none` under the benchmark-data entry so `git submodule update` skips by default
   - Commit with `chore: add optional ds-benchmark-data submodule (opt-in via git submodule update --init benchmarks/data)`

### Verification (paste to close task)

```bash
gh repo view Fearvox/ds-benchmark-data --json visibility,pushedAt -q '.visibility + " / pushed " + .pushedAt'
# Expected: PRIVATE / pushed <recent>
cd ~/claude-code-reimagine-for-learning && cat .gitmodules | grep -A3 benchmark-data
# Expected: shows url + update = none
git clone --recursive git@github.com:Fearvox/Evensong.git /tmp/ccr-clone-test 2>&1 | grep -i "benchmark-data"
# Expected: skipped (not auto-cloned due to update = none)
du -sh /tmp/ccr-clone-test/benchmarks/data 2>/dev/null
# Expected: empty dir (~ KB, not 73 MB)
rm -rf /tmp/ccr-clone-test
```

### Risk mitigation
- **R5 mitigation**: split commits keeps each push under 100 MB. If any single subdir exceeds (R006 is 51 MB — safe), further split by sub-run.
- Opt-in submodule means CCR clone UX is unaffected — preserves "hackable fork" posture

---

## T5 — Documentation alignment (CCR/CLAUDE.md + global CLAUDE.md)

**Recommended CLI:** `claude` (best at long-form structured doc edits, and needs project context)
**Estimated effort:** 30 min
**Blocking:** T6
**Depends on:** T2, T3 complete (T4 can still be in progress, just note its state in the doc)

### Pre-conditions
- [ ] `CCR` working tree clean except staged doc changes
- [ ] T2 and T3 merged/committed

### Action sequence

1. **CCR/CLAUDE.md** — in the `## Project Overview` section, replace the old CCR-vs-CCB paragraph with:

   ```markdown
   **CCR** (this repo) — Active DS main line. Local: `~/claude-code-reimagine-for-learning/`. GitHub: `Fearvox/Evensong.git`. Goal: ultimate productive CLI with all hidden features (GREEN + YELLOW flags) enabled.

   **CCB** (frozen snapshot) — `~/dash-shatter/` / `Fearvox/dash-shatter.git`. Historical paper-benchmark freeze (HEAD 2026-04-13). Not active, not a fork — separate git history. Preserved for paper reproducibility.

   **Naming clarification**: Brand = "Dash Shatter / DS". GitHub repo name = "Evensong" (pre-rename artifact). Local dir = "claude-code-reimagine-for-learning". All three refer to the same active product.
   ```

2. **CCR/CLAUDE.md** — near the top, add a new subsection:

   ```markdown
   ### Integrated Assets (Phase 07 output)

   - `packages/research-vault-mcp/` — MCP server for research vault memory (workspace package)
   - `research-vault/` — Submodule → `Fearvox/ds-research-vault` (private, pre-desensitization)
   - `benchmarks/data/` — Optional submodule → `Fearvox/ds-benchmark-data` (opt-in via `git submodule update --init benchmarks/data`)

   Sibling projects — **do NOT modify from CCR sessions**:
   - `~/dash-verse/` (separate project)
   - `~/.dashpersona/` (separate project)
   - `~/workspace/dash-shatter-vault/` (separate vault instance)
   ```

3. **~/.claude/CLAUDE.md** (global) — append new section:

   ```markdown
   ## DS Repo Map (authoritative 2026-04-16)

   | Role | Local | GitHub | Status |
   |---|---|---|---|
   | CCR active | `~/claude-code-reimagine-for-learning` | `Fearvox/Evensong` | Active — main DS line |
   | CCB frozen | `~/dash-shatter` | `Fearvox/dash-shatter` | Frozen Apr 2026 — paper snapshot |
   | Research vault | via CCR submodule | `Fearvox/ds-research-vault` | Private |
   | Benchmark data | via CCR opt-in submodule | `Fearvox/ds-benchmark-data` | Private |
   | MCP package | `CCR/packages/research-vault-mcp` | inside CCR | Workspace |

   **Do not touch (separate projects):**
   - `~/dash-verse/`
   - `~/.dashpersona/`

   **Archive only (read-only reference):**
   - `~/Documents/Evensong/.archive-post-migration-2026-04-16/` (old asset location pre-T7 rename)
   ```

4. Commit each file change separately with clear messages

### Verification (paste to close task)

```bash
grep -A3 "CCR.*active DS main line" ~/claude-code-reimagine-for-learning/CLAUDE.md
# Expected: 3 lines showing the new narrative
grep "DS Repo Map" ~/.claude/CLAUDE.md
# Expected: 1 match
grep "do NOT modify from CCR sessions" ~/claude-code-reimagine-for-learning/CLAUDE.md
# Expected: 1 match
```

### Risk mitigation
- **R6 mitigation**: before editing global CLAUDE.md, run `ls -la ~/.claude/CLAUDE.md` and check `mtime` — if another session edited within last 5 min, coordinate with user first

---

## T6 — Archive + E2E verification

**Recommended CLI:** `grok` (good at verification + parallel checks)
**Estimated effort:** 30 min
**Blocking:** none (final task)
**Depends on:** T1-T5 complete

### Pre-conditions
- [ ] All T1-T5 post-conditions verified

### Action sequence

1. **Archive source** (safety net — do NOT delete):
   ```bash
   cd ~/Documents/Evensong
   mv research-vault .archive-research-vault-2026-04-16
   mv research-vault-mcp .archive-research-vault-mcp-2026-04-16
   ```
   (R006, R008, R012, EverMind, stress-tests — leave in place for now; mirror-test post-data-repo-init)

2. **Full E2E** — clone CCR fresh, verify all moving parts:
   ```bash
   rm -rf /tmp/ccr-e2e && git clone --recursive git@github.com:Fearvox/Evensong.git /tmp/ccr-e2e
   cd /tmp/ccr-e2e
   bun install
   ls packages/research-vault-mcp/package.json                      # T2
   cd research-vault && git log -1 --format="%h %s"                  # T3
   cd .. && du -sh benchmarks/data                                   # T4 (should be empty — opt-in)
   git submodule update --init benchmarks/data && du -sh benchmarks/data  # T4 (now 73 MB)
   bun run build                                                     # overall
   ```

3. **Fill out VALIDATION.md** in this phase directory — paste all step-2 output

### Verification (paste to close task)

Everything from step 2 runs without error, and all verify-commands listed in T1-T5 have output pasted into this phase's VALIDATION.md.

### Risk mitigation
- Archive rename (step 1) is reversible — user can `mv` back if anything unexpected surfaces within 30 days
- Fresh clone (step 2) reproduces a new-developer / new-machine experience — catches any "works on my machine" submodule wiring errors

---

## Cross-Task Escalation Protocol

If any executor CLI hits a blocker:

1. **Do not silently work around it** — halt and report to orchestrator
2. **Format blocker report:**
   ```
   Task: T<n>
   Step: <step number>
   Blocker: <one line>
   Evidence: <paste tool output>
   Hypothesis: <best guess at root cause>
   Options: <2-3 alternative approaches>
   ```
3. Orchestrator (this session) will re-scope if needed and update this SPEC

**Red-line reminder for all executor CLIs:**
- **红线一 (闭环):** No task marked complete without verification command output pasted
- **红线二 (事实驱动):** Do not guess — `Read` the source file + `curl`/`git log` the actual state before acting
- **红线三 (穷尽):** Before saying "can't do this", complete the 5-step methodology (闻味道 / 揪头发 / 照镜子 / 执行新方案 / 复盘)
