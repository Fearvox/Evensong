# Wave 2D — Submodule Cleanup + MCP Package Prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Clean CCR `.gitmodules` stale `research-vault` declaration (local `research-vault/` only has 1 stub file, submodule never fully init'd); (2) Prep `packages/research-vault-mcp/` for future `npx @fearvox/research-vault-mcp` publish — package.json metadata + bin entry + README. **No actual npm publish tonight.**

**Architecture:** Two independent units:
1. **Submodule cleanup** — user decides: remove declaration + add to .gitignore, OR init submodule properly pointing at private `Fearvox/ds-research-vault`
2. **MCP package prep** — add `name` (scoped), `bin`, `description`, `repository`, `publishConfig` to existing `packages/research-vault-mcp/package.json`; add `bin/research-vault-mcp.mjs` shim; add minimal README

**Tech Stack:** git submodule, bun workspace, TypeScript (existing package), npm pack for verify.

**Parent spec:** `docs/superpowers/specs/2026-04-19-vault-foundation-and-preamble-design.md` §7 Wave 2 + Wave 3
**Prerequisite:** Wave 1 commits shipped
**Output:** `.gitmodules` fix (per user decision) + package.json updated + bin scaffold + README + 2-3 commits

---

## File Map

| File | Role | Changes |
|---|---|---|
| `.gitmodules` | CCR submodule manifest | Remove or update `research-vault` entry |
| `.gitignore` | CCR ignore list | Add `research-vault/` if declaration removed |
| `research-vault/` (dir) | Current 1-file stub | Delete entirely if declaration removed |
| `packages/research-vault-mcp/package.json` | MCP package manifest | Add bin/name/description/repository/publishConfig |
| `packages/research-vault-mcp/bin/research-vault-mcp.mjs` | **NEW** — CLI entry point shim | Create |
| `packages/research-vault-mcp/README.md` | **NEW** — npx install docs | Create |

Existing `src/` untouched. `packages/research-vault-mcp/src/*.ts` not modified (already implemented: amplify.ts, server.ts, vault.ts).

---

### Task 1: Probe current state

**Files:** (read-only)

- [ ] **Step 1: Probe `.gitmodules` content**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
cat .gitmodules
```

Expected (from earlier probe):
```
[submodule "research-vault"]
	path = research-vault
	url = https://github.com/Fearvox/ds-research-vault.git
[submodule "benchmarks/data"]
	path = benchmarks/data
	url = https://github.com/Fearvox/ds-benchmark-data.git
	update = none
```

- [ ] **Step 2: Probe current `research-vault/` local state**

```bash
ls -la research-vault/ 2>/dev/null
git submodule status research-vault 2>&1
```

Expected: 1 file `Evensong-HF-ModelCard.md` (per earlier probe).

- [ ] **Step 3: Confirm `_vault/` (real vault) is the live working location**

```bash
ls _vault/.git 2>/dev/null | head -3
cd _vault && git remote -v && cd ..
```

Expected: `_vault/` has its own `.git/` pointing at `Fearvox/ds-research-vault.git` — so `research-vault/` submodule declaration is redundant (we already have a working clone at `_vault/`).

- [ ] **Step 4: Probe existing MCP package state**

```bash
cat packages/research-vault-mcp/package.json
ls packages/research-vault-mcp/
```

Capture current package.json for Step 2.5 to extend (not overwrite).

---

### Task 2: Submodule decision — remove or init

**Files:**
- Modify: `.gitmodules` (either path)
- Modify: `.gitignore` (Option A only)
- Delete: `research-vault/` dir contents (Option A only)

- [ ] **Step 1: Present options to user**

Ask user: "Task 1 探测确认：
- CCR `.gitmodules` declares `research-vault` → `Fearvox/ds-research-vault.git` (private)
- 但本地 `research-vault/` 只有 1 个 stub，submodule 没真正 init
- 同时 `_vault/` 是真实的 working clone 指向同一个 private remote

选哪条：
- **(A) 清理**: 删 `.gitmodules` 里的 `research-vault` declaration + 删本地 1-file stub + `research-vault/` 加进 `.gitignore`。理由：vault 工作 dir 应该是 untracked `_vault/`（per Wave 1 spec 设计）；CCR git 不追 vault 内容。
- **(B) 真 init**: `git submodule update --init research-vault`，把 18MB private vault 作为 CCR 的 submodule 管理。理由：commit-level atomic w/ CCR main repo。
- **(C) 指 public**: 改 `.gitmodules` url 指向 `Fearvox/dash-research-vault` (public, 2.8MB) 作为 public subset demo 引用。理由：公开展示 vault public 子集。"

Capture choice → use in Step 2/3.

- [ ] **Step 2A: If option A (remove submodule)**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
git rm -r --cached research-vault 2>/dev/null  # unstage if tracked
rm -rf research-vault  # delete local stub dir
```

Edit `.gitmodules` to remove the `[submodule "research-vault"]` block (keep `benchmarks/data` block).

New `.gitmodules`:
```
[submodule "benchmarks/data"]
	path = benchmarks/data
	url = https://github.com/Fearvox/ds-benchmark-data.git
	update = none
```

Edit `.gitignore` to add:
```
# Real vault working dir (per 2026-04-19 vault-foundation spec Wave 1)
# Lives as standalone working clone, not tracked in CCR.
research-vault/
_vault/
```

Proceed to Task 2 Step 4 for verification.

- [ ] **Step 2B: If option B (init submodule properly)**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
git submodule update --init research-vault
cd research-vault && git status && cd ..
```

Expected: `research-vault/` now contains full 18MB vault content (matches `_vault/` content).

Consequence: `_vault/` becomes redundant (same content). User needs to decide later whether to delete `_vault/` or keep as untracked working dir.

Proceed to Task 2 Step 4 for verification.

- [ ] **Step 2C: If option C (point to public)**

Edit `.gitmodules`:
```
[submodule "research-vault"]
	path = research-vault
	url = https://github.com/Fearvox/dash-research-vault.git
```

Then:
```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
git submodule sync research-vault
rm -rf research-vault
git submodule update --init research-vault
```

Expected: `research-vault/` populated with public 2.8MB content.

Proceed to Task 2 Step 4.

- [ ] **Step 3: Verify chosen action**

```bash
cat .gitmodules
git status research-vault 2>&1 | head -10
ls research-vault/ 2>/dev/null | wc -l
```

For A: `.gitmodules` has only benchmarks/data; `research-vault/` absent; `git status` ignores it.
For B: `.gitmodules` unchanged; `research-vault/` ~145 files.
For C: `.gitmodules` url updated to dash-research-vault; `research-vault/` 26 files.

- [ ] **Step 4: Commit**

Based on option:

```bash
# Option A
git add .gitmodules .gitignore
git commit -m "chore(infra): remove research-vault submodule — _vault/ is real working clone (Wave 2D)"

# Option B
git add .gitmodules
git commit -m "chore(infra): init research-vault submodule → Fearvox/ds-research-vault (Wave 2D)"

# Option C
git add .gitmodules
git commit -m "chore(infra): point research-vault submodule → Fearvox/dash-research-vault public (Wave 2D)"
```

---

### Task 3: Extend MCP package.json — name, bin, metadata

**Files:**
- Modify: `packages/research-vault-mcp/package.json`

- [ ] **Step 1: Read current package.json**

```bash
cat packages/research-vault-mcp/package.json
```

Capture current fields (name, version, scripts, dependencies). Don't overwrite them — extend only.

- [ ] **Step 2: Write failing test for bin existence**

Create `packages/research-vault-mcp/__tests__/packageShape.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const PKG_ROOT = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))

describe('research-vault-mcp package shape (for npx publish readiness)', () => {
  test('has scoped name @fearvox/research-vault-mcp', () => {
    expect(pkg.name).toBe('@fearvox/research-vault-mcp')
  })

  test('has bin entry', () => {
    expect(pkg.bin).toBeDefined()
    expect(typeof pkg.bin).toBe('object')
    const binEntry = pkg.bin['research-vault-mcp'] || pkg.bin['@fearvox/research-vault-mcp']
    expect(binEntry).toBeTruthy()
  })

  test('bin entry file exists', () => {
    const binPath = pkg.bin['research-vault-mcp']
    expect(existsSync(join(PKG_ROOT, binPath))).toBe(true)
  })

  test('has description', () => {
    expect(typeof pkg.description).toBe('string')
    expect(pkg.description.length).toBeGreaterThan(20)
  })

  test('has repository', () => {
    expect(pkg.repository).toBeDefined()
  })

  test('has publishConfig.access=public (for scoped name)', () => {
    expect(pkg.publishConfig?.access).toBe('public')
  })

  test('has files array for publish whitelist', () => {
    expect(Array.isArray(pkg.files)).toBe(true)
    expect(pkg.files.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run test to verify fail**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
bun test packages/research-vault-mcp/__tests__/packageShape.test.ts
```

Expected: several FAILs (missing bin/description/repository/publishConfig/files).

- [ ] **Step 4: Update package.json (additive)**

Add the following fields **if missing** (keep existing fields like version/scripts/dependencies):

```json
{
  "name": "@fearvox/research-vault-mcp",
  "description": "MCP server for Nolan's research vault — semantic search + memory persistence over ~200+ markdown docs via local Gemma or cloud LLM.",
  "bin": {
    "research-vault-mcp": "./bin/research-vault-mcp.mjs"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/Fearvox/Evensong.git",
    "directory": "packages/research-vault-mcp"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "src/**/*.ts",
    "bin/**/*.mjs",
    "README.md",
    "package.json"
  ],
  "keywords": ["mcp", "research-vault", "claude-code", "evermind"]
}
```

Use Edit tool to merge these into existing package.json (don't overwrite — preserve existing name if it was different; existing version; existing scripts/dependencies).

**Caveat**: if existing name differs (e.g., `research-vault-mcp` unscoped), confirm with user whether to rename to `@fearvox/research-vault-mcp` for npm scope.

---

### Task 4: Create bin entry shim

**Files:**
- Create: `packages/research-vault-mcp/bin/research-vault-mcp.mjs`

- [ ] **Step 1: Write bin entry**

Create `packages/research-vault-mcp/bin/research-vault-mcp.mjs`:

```javascript
#!/usr/bin/env node
/**
 * CLI entry point for @fearvox/research-vault-mcp.
 * Invoked via `npx @fearvox/research-vault-mcp` or `bunx @fearvox/research-vault-mcp`.
 * Delegates to src/server.ts (compiled or via bun direct).
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgRoot = join(__dirname, '..')

// Prefer compiled JS if available (post-build); fall back to bun direct execution of TS source.
const compiledServer = join(pkgRoot, 'dist', 'server.js')
const sourceServer = join(pkgRoot, 'src', 'server.ts')

async function main() {
  if (existsSync(compiledServer)) {
    await import(compiledServer)
  } else if (existsSync(sourceServer)) {
    // Direct TS execution via bun runtime
    await import(sourceServer)
  } else {
    console.error('research-vault-mcp: neither dist/server.js nor src/server.ts found')
    console.error('pkgRoot:', pkgRoot)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('research-vault-mcp fatal:', err)
  process.exit(1)
})
```

- [ ] **Step 2: chmod +x**

```bash
chmod +x packages/research-vault-mcp/bin/research-vault-mcp.mjs
```

- [ ] **Step 3: Run packageShape test — should now pass**

```bash
bun test packages/research-vault-mcp/__tests__/packageShape.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/research-vault-mcp/package.json \
        packages/research-vault-mcp/bin/research-vault-mcp.mjs \
        packages/research-vault-mcp/__tests__/packageShape.test.ts
git commit -m "feat(mcp): research-vault-mcp npx-ready — bin + scoped name + publishConfig"
```

---

### Task 5: Add minimal README for future npx users

**Files:**
- Create: `packages/research-vault-mcp/README.md`

- [ ] **Step 1: Write README**

Create `packages/research-vault-mcp/README.md`:

```markdown
# @fearvox/research-vault-mcp

MCP (Model Context Protocol) server for [Nolan's research vault](https://github.com/Fearvox/dash-research-vault) — semantic search + memory persistence over ~200+ markdown documents using either local Gemma (Atomic Chat) or cloud LLMs (xAI / MiniMax / OpenRouter).

**Status**: Wave 3+ — not yet published to npm. Plan: `docs/superpowers/plans/2026-04-19-wave2d-submodule-mcp-package-prep.md`.

## Install & Run (future, post-publish)

```bash
# Via bun (recommended)
bunx @fearvox/research-vault-mcp

# Via npm/Node
npx @fearvox/research-vault-mcp
```

## Configure Claude Code / Claude Desktop

Add to `~/.claude/settings.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "research-vault": {
      "command": "bunx",
      "args": ["@fearvox/research-vault-mcp"]
    }
  }
}
```

Or for direct local dev (from this repo):

```json
{
  "mcpServers": {
    "research-vault-dev": {
      "command": "bun",
      "args": ["run", "packages/research-vault-mcp/src/server.ts"]
    }
  }
}
```

## Tools Exposed (MCP contract)

See `src/vault.ts` and `src/amplify.ts` for current tool definitions:
- `vault_search` — hybrid search over analyzed knowledge base
- `vault_status` — decay scores + retention health
- `vault_taxonomy` — category tree + item counts
- `vault_batch_analyze` — raw queue status + preview
- `amplify_*` — remote RAG query layer (currently requires Amplify API key — see `docs.evermind.ai`; Wave 3+ will add local Gemma fallback)

## Parent Spec

Architecture and design context: [Wave 1 spec](https://github.com/Fearvox/Evensong/blob/main/docs/superpowers/specs/2026-04-19-vault-foundation-and-preamble-design.md).

## License

Same as parent CCR repo (see top-level LICENSE).
```

- [ ] **Step 2: Commit**

```bash
git add packages/research-vault-mcp/README.md
git commit -m "docs(mcp): README for @fearvox/research-vault-mcp (pre-publish)"
```

---

### Task 6: Dry-run package verification

**Files:** none

- [ ] **Step 1: Run `npm pack --dry-run` to verify publish shape**

```bash
cd packages/research-vault-mcp
npm pack --dry-run 2>&1 | tail -40
```

Expected output includes (approximately):
```
npm notice package: @fearvox/research-vault-mcp@X.Y.Z
npm notice 📦 package contents:
npm notice   src/amplify.ts
npm notice   src/server.ts
npm notice   src/vault.ts
npm notice   bin/research-vault-mcp.mjs
npm notice   README.md
npm notice   package.json
npm notice total files: 6
```

Verify:
- `bin/research-vault-mcp.mjs` included
- `README.md` included
- no `.test.ts` or `__tests__/` included (per `files` allowlist)
- no `.env`, no credentials

- [ ] **Step 2: If unwanted files included → adjust `files` array in package.json**

Edit package.json `files` array to exclude anything that shouldn't be published (tests, fixtures, etc.).

- [ ] **Step 3: Re-run pack dry-run + commit if files array changed**

```bash
npm pack --dry-run 2>&1 | tail -10
# if changed:
git add package.json
git commit -m "chore(mcp): refine files allowlist for npm publish"
```

- [ ] **Step 4: Back to repo root**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
```

---

### Task 7: Run full CCR regression + commit

**Files:** none

- [ ] **Step 1: Confirm no CCR regression**

```bash
bun test 2>&1 | tail -5
```

Expected: no change in CCR main test count from pre-Wave 2D (2B introduced +18 tests).

- [ ] **Step 2: Verify package publish is gated (no accidental push)**

```bash
cat packages/research-vault-mcp/package.json | jq '.private, .publishConfig'
```

If `private: true` is set → publish is blocked by npm (safe). If `private` is omitted AND `publishConfig.access = public` → publish would work if someone runs `npm publish` (user-triggered, not automated). This is OK — Wave 2D goal is readiness, not actual publish.

- [ ] **Step 3: Update STATE.md**

Append to `.planning/STATE.md`:

```markdown
**Wave 2D — Submodule + MCP Package Prep**:
- `.gitmodules` research-vault entry: (填 A/B/C chosen)
- `packages/research-vault-mcp/` npx-ready: name=@fearvox/research-vault-mcp, bin/, README, publishConfig
- Dry-run pack output: (填 file count)
- No publish executed tonight
- Plan: `docs/superpowers/plans/2026-04-19-wave2d-submodule-mcp-package-prep.md`
```

- [ ] **Step 4: Commit**

```bash
git add .planning/STATE.md
git commit -m "docs(planning): Wave 2D — submodule cleanup + MCP package prep shipped"
```

---

## Post-implementation Verification

```bash
# 1. .gitmodules state matches chosen option
cat .gitmodules

# 2. research-vault/ state matches chosen option (empty / 145 files / 26 files)
ls research-vault/ 2>/dev/null | wc -l

# 3. MCP package shape
cat packages/research-vault-mcp/package.json | jq '{name, bin, description, publishConfig}'
# Expected: @fearvox/research-vault-mcp, bin entry, description, publishConfig.access=public

# 4. bin is executable
test -x packages/research-vault-mcp/bin/research-vault-mcp.mjs && echo "✅ bin +x"

# 5. README present
test -f packages/research-vault-mcp/README.md && echo "✅ README"

# 6. Package shape test passes
bun test packages/research-vault-mcp/__tests__/packageShape.test.ts 2>&1 | tail -3

# 7. npm pack dry-run succeeds
(cd packages/research-vault-mcp && npm pack --dry-run 2>&1 | grep "package contents")

# 8. All Wave 2D commits on main
git log --oneline -5 | grep -E "Wave 2D|research-vault-mcp|submodule|research-vault"
```

All 8 checks pass = Wave 2D DONE.

---

## Rollback Plan

**Option A (remove submodule) rollback**:
```bash
git revert HEAD..HEAD~N  # N = number of Wave 2D commits
# Restore .gitmodules from git history
git checkout HEAD~N -- .gitmodules .gitignore
# Re-clone the stub (or accept deletion)
```

**Option B (init submodule) rollback**:
```bash
git submodule deinit -f research-vault
rm -rf research-vault
git config --remove-section submodule.research-vault  # if needed
```

**MCP package rollback**:
```bash
# No publish happened, so no npm-side rollback needed
# Git revert the package.json + bin + README commits
git revert <commit-sha> --no-edit
```

**Fully undo Wave 2D**:
```bash
git log --oneline -8
# Find first Wave 2D commit SHA
git reset --hard <sha-before-wave2d>  # if not pushed
# OR
git revert <first-sha>..HEAD
```

No data loss — package isn't published, submodule changes are recoverable via git.
