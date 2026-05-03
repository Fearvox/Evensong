# Evensong Post-Publish Product Polish Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Finish the six post-publish cleanup and product-polish items: root identity, runtime positioning, public-site install CTA, git release tag, changelog, and CI publish-readiness gate.

**Architecture:** Treat this as a product-surface hardening pass, not a feature rewrite. Keep changes narrow: docs, package metadata, static site CTA blocks, release bookkeeping, and CI. Do not change benchmark claims unless tests/docs prove a mismatch.

**Tech Stack:** Bun 1.3+, npm package `@syndash/research-vault-mcp`, GitHub Actions, static HTML under `benchmarks/evensong/`, Markdown docs, Git tags.

---

## Current baseline

- Repo: `/Users/0xvox/claude-code-reimagine-for-learning`
- Branch at plan creation: `main`
- Latest commits:
  - `06214660 chore(mcp): normalize npm package metadata`
  - `d03d2550 chore(mcp): harden research vault package onboarding`
- npm latest: `@syndash/research-vault-mcp@1.1.2`
- Known intentional runtime contract today: npm package is Bun-native; `npx` installs/launches a shim, but Bun must be installed.

## Acceptance criteria

- Root repo no longer presents itself as `claude-code` in public metadata.
- Research Vault MCP runtime requirement is impossible to miss.
- Public Evensong site has a clear “Install Research Vault MCP” CTA with copyable install and MCP config.
- Git has a pushed release tag for npm `1.1.2`.
- Package has a changelog entry for `1.1.2`.
- CI checks package tests, package build, root build, npm pack dry-run, and a stdio smoke test.
- All changes are verified and committed with narrow commit boundaries.

---

## Task 1: Rename root package identity without changing publish behavior

**Objective:** Replace the stale root package name `claude-code` with Evensong identity while keeping the root package private.

**Files:**
- Modify: `package.json`
- Verify: `README.md`, `README-zh.md`

**Step 1: Inspect current package identity**

Run:

```bash
python3 - <<'PY'
import json
p=json.load(open('package.json'))
print(p['name'], p.get('private'))
PY
```

Expected before change:

```text
claude-code True
```

**Step 2: Update root package name**

In `package.json`, change:

```json
"name": "claude-code"
```

to:

```json
"name": "evensong"
```

Keep:

```json
"private": true
```

Do not rename workspace packages in this task.

**Step 3: Verify no stale root package naming remains in key surfaces**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
for f in ['package.json','README.md','README-zh.md']:
    s=Path(f).read_text(errors='ignore')
    print(f, 'claude-code package-name hits:', s.count('"claude-code"'))
PY
```

Expected:

```text
package.json claude-code package-name hits: 0
README.md claude-code package-name hits: 0
README-zh.md claude-code package-name hits: 0
```

Note: prose references to Claude Code as upstream/reverse-engineered source are allowed. Only package identity should be removed.

**Step 4: Verify build still works**

Run:

```bash
bun run build
```

Expected:

```text
cli.js ... (entry point)
```

**Step 5: Commit**

```bash
git add package.json
git commit -m "chore(repo): rename root package to evensong"
```

---

## Task 2: Make Research Vault runtime positioning explicit everywhere

**Objective:** Avoid the false expectation that `npx` means Node-only runtime support.

**Files:**
- Modify: `packages/research-vault-mcp/README.md`
- Modify: `README.md`
- Modify: `README-zh.md`
- Modify: `packages/research-vault-mcp/__tests__/packageShape.test.ts`

**Step 1: Add explicit runtime note to package README**

In `packages/research-vault-mcp/README.md`, under `## Install`, ensure this paragraph exists immediately after the install block:

```md
Runtime note: `@syndash/research-vault-mcp` is Bun-native. `npx` is supported as an install/launch shim, but the target machine must have `bun` available on `PATH`. If you need a pure Node runtime, treat that as a separate compatibility track rather than assuming this package already provides it.
```

**Step 2: Add a “Node compatibility status” section**

Add after the transport section:

```md
## Node compatibility status

The package is intentionally Bun-native today because the server uses Bun APIs and the parent Evensong repo is Bun-only. The npm bin is Node-compatible only as a launcher: it locates `dist/server.js` or `src/server.ts`, then delegates execution to `bun`.

This keeps package installation convenient while avoiding a misleading claim that the MCP server itself runs under plain Node.js.
```

**Step 3: Add root README runtime note**

In `README.md`, in Quick start after the direct MCP install snippet, add:

```md
The MCP package still requires Bun at runtime. `npx` is a convenient launcher, not a Node-only runtime guarantee.
```

In `README-zh.md`, add the equivalent:

```md
MCP package 运行时仍需要 Bun。`npx` 只是方便安装/启动，不代表 server 已经是纯 Node runtime。
```

**Step 4: Add package-shape test for runtime warning**

In `packages/research-vault-mcp/__tests__/packageShape.test.ts`, add inside the existing `describe` block:

```ts
test('README documents Bun-native runtime contract', () => {
  const readme = readFileSync(join(PKG_ROOT, 'README.md'), 'utf8')
  expect(readme).toContain('Bun-native')
  expect(readme).toContain('npx is supported as an install/launch shim')
  expect(readme).toContain('must have `bun` available on `PATH`')
})
```

**Step 5: Run focused tests**

```bash
bun --filter @syndash/research-vault-mcp test
```

Expected:

```text
pass ... packageShape.test.ts
0 fail
```

**Step 6: Commit**

```bash
git add README.md README-zh.md packages/research-vault-mcp/README.md packages/research-vault-mcp/__tests__/packageShape.test.ts
git commit -m "docs(mcp): clarify bun-native runtime contract"
```

---

## Task 3: Add public-site “Install Research Vault MCP” CTA

**Objective:** Make the live Evensong public hub convert a visitor into a package user without digging through GitHub.

**Files:**
- Modify: `benchmarks/evensong/index.html`

**Step 1: Locate the hero/action area**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
s=Path('benchmarks/evensong/index.html').read_text()
for needle in ['@syndash/research-vault-mcp','handoff','promo','button','npm']:
    print(needle, s.find(needle))
PY
```

Use this to place the install CTA near the existing module/package content, not buried in the footer.

**Step 2: Add install CTA markup**

Add a section near the first Research Vault / module explanation block:

```html
<section class="install-panel" aria-labelledby="install-rv-mcp">
  <div>
    <p class="eyebrow">Installable module</p>
    <h2 id="install-rv-mcp">Use Research Vault MCP without cloning Evensong.</h2>
    <p>
      Evensong is the hub. Research Vault MCP is the package: a stdio MCP server
      for search, note persistence, and markdown knowledge-base tools.
    </p>
  </div>
  <div class="install-card">
    <span class="code-label">Install / launch</span>
    <code>npx @syndash/research-vault-mcp --transport=stdio</code>
    <span class="code-label">Claude config</span>
    <code>{ "command": "npx", "args": ["-y", "@syndash/research-vault-mcp", "--transport=stdio"] }</code>
    <p class="install-note">Bun must be installed; npx is the launcher, not a Node-only runtime.</p>
  </div>
</section>
```

Adjust class names only if the page already has an equivalent design system. Do not introduce a generic SaaS card pile.

**Step 3: Add CSS matching existing visual direction**

In the same file’s `<style>` block, add:

```css
.install-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.85fr);
  gap: clamp(1rem, 3vw, 2rem);
  align-items: stretch;
  margin: clamp(2rem, 6vw, 5rem) 0;
  padding: clamp(1rem, 3vw, 2rem);
  border: 1px solid color-mix(in oklch, var(--ink) 14%, transparent);
  background: color-mix(in oklch, var(--paper-base) 88%, white);
  box-shadow: 0 24px 80px color-mix(in oklch, var(--ink) 10%, transparent);
}

.install-card {
  display: grid;
  gap: 0.65rem;
  padding: 1rem;
  background: color-mix(in oklch, var(--ink) 92%, black);
  color: var(--paper-base);
}

.install-card code {
  display: block;
  overflow-x: auto;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: clamp(0.78rem, 1.4vw, 0.92rem);
}

.code-label,
.install-note {
  color: color-mix(in oklch, var(--paper-base) 72%, transparent);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.install-note {
  margin: 0.25rem 0 0;
  text-transform: none;
  letter-spacing: 0;
}

@media (max-width: 760px) {
  .install-panel {
    grid-template-columns: 1fr;
  }
}
```

If variables differ in the file, adapt to existing tokens rather than creating broken CSS.

**Step 4: Static sanity check**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
s=Path('benchmarks/evensong/index.html').read_text()
for needle in ['install-panel','npx @syndash/research-vault-mcp --transport=stdio','Bun must be installed']:
    assert needle in s, needle
print('install CTA present')
PY
```

Expected:

```text
install CTA present
```

**Step 5: Browser/mobile visual check**

Serve the static site:

```bash
cd benchmarks/evensong
python3 -m http.server 4173
```

Then verify desktop and mobile for:

- CTA visible above or near module explanation.
- No horizontal overflow on 375px width.
- Code block scrolls horizontally if needed.
- Existing hero and nav still render.

If using Hermes browser tools, visit:

```text
http://127.0.0.1:4173/
```

**Step 6: Commit**

```bash
git add benchmarks/evensong/index.html
git commit -m "feat(site): add research vault install CTA"
```

---

## Task 4: Add package changelog for 1.1.2

**Objective:** Give npm and repo users a durable release note for what changed after publishing.

**Files:**
- Create: `packages/research-vault-mcp/CHANGELOG.md`
- Modify: `packages/research-vault-mcp/package.json`
- Modify: `packages/research-vault-mcp/README.md`
- Modify: `packages/research-vault-mcp/__tests__/packageShape.test.ts`

**Step 1: Create changelog**

Create `packages/research-vault-mcp/CHANGELOG.md`:

```md
# Changelog

## 1.1.2 — 2026-04-26

### Changed

- Default MCP transport is now `stdio`, matching command-launched MCP clients.
- The npm bin is a Node-compatible launcher that delegates server execution to Bun.
- Published package includes `dist/server.js` via `prepack` build and `files` allowlist.
- README now documents Evensong hub vs Research Vault module, install commands, Claude config, Bun runtime requirement, and explicit SSE mode.
- Package metadata now uses Evensong module wording and Apache-2.0 package license.

### Verified

- `bun --filter @syndash/research-vault-mcp test`
- `bun --filter @syndash/research-vault-mcp build`
- `npm pack --dry-run --json`
- stdio smoke returning 13 MCP tools
```

**Step 2: Include changelog in package files**

In `packages/research-vault-mcp/package.json`, add to `files`:

```json
"CHANGELOG.md"
```

Expected files array includes:

```json
"README.md",
"CHANGELOG.md",
"package.json"
```

**Step 3: Link changelog from README**

In `packages/research-vault-mcp/README.md`, add near the License or Package mechanics section:

```md
## Releases

See [CHANGELOG.md](./CHANGELOG.md). Current npm release: `1.1.2`.
```

**Step 4: Add test**

In `packages/research-vault-mcp/__tests__/packageShape.test.ts`, add:

```ts
test('CHANGELOG is packaged and documents current version', () => {
  expect(pkg.files).toContain('CHANGELOG.md')
  const changelog = readFileSync(join(PKG_ROOT, 'CHANGELOG.md'), 'utf8')
  expect(changelog).toContain(`## ${pkg.version}`)
})
```

**Step 5: Verify package shape**

```bash
bun --filter @syndash/research-vault-mcp test
cd packages/research-vault-mcp && npm pack --dry-run --json
```

Expected:

- Tests pass.
- Pack dry-run includes `CHANGELOG.md`.

**Step 6: Commit**

```bash
git add packages/research-vault-mcp/CHANGELOG.md packages/research-vault-mcp/package.json packages/research-vault-mcp/README.md packages/research-vault-mcp/__tests__/packageShape.test.ts
git commit -m "docs(mcp): add changelog for 1.1.2"
```

---

## Task 5: Add CI for package publish readiness

**Objective:** Prevent future changes from breaking the npm package silently.

**Files:**
- Create: `.github/workflows/research-vault-mcp.yml`

**Step 1: Create GitHub Actions workflow**

Create `.github/workflows/research-vault-mcp.yml`:

```yaml
name: Research Vault MCP

on:
  pull_request:
    paths:
      - 'packages/research-vault-mcp/**'
      - 'package.json'
      - 'bun.lock'
      - '.github/workflows/research-vault-mcp.yml'
  push:
    branches: [main]
    paths:
      - 'packages/research-vault-mcp/**'
      - 'package.json'
      - 'bun.lock'
      - '.github/workflows/research-vault-mcp.yml'

jobs:
  package-readiness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.3.11'

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Test package
        run: bun --filter @syndash/research-vault-mcp test

      - name: Build package
        run: bun --filter @syndash/research-vault-mcp build

      - name: Verify stdio bin smoke
        run: |
          printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' \
            | timeout 10s node packages/research-vault-mcp/bin/research-vault-mcp.mjs --transport=stdio \
            | tee /tmp/rv-mcp-stdio.json
          node -e "const fs=require('fs'); const line=fs.readFileSync('/tmp/rv-mcp-stdio.json','utf8').trim().split('\n').pop(); const msg=JSON.parse(line); if (!msg.result || !Array.isArray(msg.result.tools) || msg.result.tools.length < 1) process.exit(1); console.log('tools', msg.result.tools.length)"

      - name: npm pack dry-run
        working-directory: packages/research-vault-mcp
        run: npm pack --dry-run --json
```

**Step 2: Verify YAML exists and contains required commands**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
s=Path('.github/workflows/research-vault-mcp.yml').read_text()
for needle in [
  'oven-sh/setup-bun@v2',
  'bun --filter @syndash/research-vault-mcp test',
  'bun --filter @syndash/research-vault-mcp build',
  'npm pack --dry-run --json',
  '--transport=stdio',
]:
    assert needle in s, needle
print('workflow contains required gates')
PY
```

Expected:

```text
workflow contains required gates
```

**Step 3: Run local equivalent**

```bash
bun install --frozen-lockfile
bun --filter @syndash/research-vault-mcp test
bun --filter @syndash/research-vault-mcp build
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' | timeout 10s node packages/research-vault-mcp/bin/research-vault-mcp.mjs --transport=stdio
cd packages/research-vault-mcp && npm pack --dry-run --json
```

Expected:

- Install does not mutate lockfile.
- Tests pass.
- Build passes.
- Stdio command returns JSON-RPC tools list.
- Pack dry-run succeeds.

**Step 4: Commit**

```bash
git add .github/workflows/research-vault-mcp.yml
git commit -m "ci(mcp): add research vault package readiness workflow"
```

---

## Task 6: Create and push npm release tag

**Objective:** Tie npm `@syndash/research-vault-mcp@1.1.2` to an immutable Git reference.

**Files:**
- No file changes unless changelog task has not been committed yet.

**Step 1: Confirm main contains the release**

Run:

```bash
git checkout main
git pull --ff-only origin main
python3 - <<'PY'
import json
p=json.load(open('packages/research-vault-mcp/package.json'))
assert p['version'] == '1.1.2', p['version']
print(p['name'], p['version'])
PY
npm view @syndash/research-vault-mcp version --json
```

Expected:

```text
@syndash/research-vault-mcp 1.1.2
"1.1.2"
```

**Step 2: Create annotated tag**

Use this tag name:

```bash
git tag -a research-vault-mcp-v1.1.2 -m "@syndash/research-vault-mcp v1.1.2

- stdio default for MCP clients
- Bun-native npm launcher shim
- dist/server.js included in npm package
- package README and metadata hardened
- npm latest verified at 1.1.2"
```

**Step 3: Push tag**

```bash
git push origin research-vault-mcp-v1.1.2
```

**Step 4: Verify tag on remote**

```bash
git ls-remote --tags origin research-vault-mcp-v1.1.2
```

Expected:

```text
<sha> refs/tags/research-vault-mcp-v1.1.2
```

**Step 5: Commit?**

No commit is needed for tag-only work. If Task 4/5 changed files first, commit those before tagging.

---

## Final integration verification

Run after all six tasks:

```bash
git status --short
bun --filter @syndash/research-vault-mcp test
bun --filter @syndash/research-vault-mcp build
bun run build
cd packages/research-vault-mcp && npm pack --dry-run --json
npm view @syndash/research-vault-mcp version dist-tags --json
git ls-remote --tags origin research-vault-mcp-v1.1.2
```

Expected:

- Working tree clean.
- Tests pass.
- Builds pass.
- Pack dry-run includes `dist/server.js` and `CHANGELOG.md`.
- npm latest is `1.1.2`.
- Git tag exists on origin.

## Suggested commit sequence

1. `chore(repo): rename root package to evensong`
2. `docs(mcp): clarify bun-native runtime contract`
3. `feat(site): add research vault install CTA`
4. `docs(mcp): add changelog for 1.1.2`
5. `ci(mcp): add research vault package readiness workflow`
6. Tag only: `research-vault-mcp-v1.1.2`

## Execution note

Do not publish another npm version unless code/package contents change beyond docs/CI/tagging. The already-published `1.1.2` is the target release for this cleanup.
