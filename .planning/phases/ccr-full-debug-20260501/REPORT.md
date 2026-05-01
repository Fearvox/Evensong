# CCR Full Debug 2026-05-01 — Report

Branch/worktree: `codex/ccr-full-debug-20260501` at `<operator-worktree>/ccr-full-debug-20260501/worktree`
Base: `origin/main` d2e07c3
Current head after this report refresh: `this commit`

## Branch-safety forensics

Source checkout `<operator-main-checkout>` was not edited. Work was performed only in the isolated worktree.

- Before worktree creation: source checkout was divergent from `origin/main` and left untouched.
- Isolated worktree was created from latest `origin/main` on branch `codex/ccr-full-debug-20260501`.
- A generated `fixtures/6597bb.json` scratch VCR fixture was inspected. It contained only synthetic unauthenticated print-mode output and was removed; no ignore rule was added because no tracked source fixture set exists at that path.
- Phase B plugin CLI tests now route test fixture writes into temp HOME so they do not regenerate root-level `fixtures/` scratch files.

## Commit list on branch

- f40bb2b `fix(build): export shell quoting helper from Shell util`
- a4e8fa5 `docs(parity): record Claude Code parity and flag inventory`
- e032e04 `fix(grep): fall back to system ripgrep in source checkouts`
- d18a04e `test(compact): isolate NODE_ENV for auto compact tests`
- f8c4fc6 `fix(flags): include env overrides in flag health scans`
- 2d88fd3 `test(flag-health): isolate scans from global flag state`
- 77d094e `test(query): complete app state mock for hook checks`
- 52d07a6 `test(benchmarks): tolerate absent local dense-rar planning reports`
- 7e71856 `docs(report): refresh full-debug evidence checkpoint`
- d321118 `fix(plugin): require json for available list output`
- this commit `docs(report): record plugin parity checkpoint`

## Changed files

- `src/utils/Shell.ts` — exported `shellSingleQuote` from the capitalized Shell utility module so Linux/Bun build resolution can satisfy imports that resolve to `Shell.ts`.
- `src/utils/Shell.test.ts` — regression test proving `shellSingleQuote` exists from `./Shell.js` and escapes POSIX single quotes.
- `src/utils/ripgrep.ts` / `src/utils/ripgrep.test.ts` — system `rg` fallback for source checkouts without vendored ripgrep.
- `src/services/compact/__tests__/autoCompact.test.ts` — isolates `NODE_ENV` for compaction config tests.
- `src/utils/featureFlag.ts`, `src/utils/__tests__/featureFlag.test.ts`, `src/services/flagHealth/flagHealth.ts`, `src/services/flagHealth/__tests__/flagHealth.test.ts` — explicit feature flag scan sources and env override coverage.
- `src/query/__tests__/query.test.ts` — app state mock now includes hook state needed by query permission tests.
- `scripts/__tests__/dense-rar-evidence-boundaries.test.ts` — accepts absent local planning evidence while keeping tracked publishable surfaces mandatory.
- `src/cli/handlers/plugins.ts` — rejects `plugin list --available` unless `--json` is also requested, matching the option contract and avoiding silent no-op human output.
- `tests/plugin-cli.test.ts` — temp-HOME CLI parity coverage for `plugin list --json` and the `--available`/`--json` contract.
- `.planning/phases/ccr-full-debug-20260501/PARITY-MATRIX.md` — official/CCR parity map.
- `.planning/phases/ccr-full-debug-20260501/FEATURE-FLAGS.md` — disabled feature/stub inventory.
- `.planning/phases/ccr-full-debug-20260501/REPORT.md` — this handoff report.

## Final verification checkpoint

- RED: `bun test tests/plugin-cli.test.ts` failed before the plugin fix because `plugin list --available` exited 0 without JSON.
- GREEN focused: `bun test tests/plugin-cli.test.ts`: PASS, 2 pass, 0 fail.
- `bun run build`: PASS. Bundle output: `cli.js` about 27.15 MB.
- `bun test`: PASS. 2242 pass, 1 skip, 0 fail, 5520 expect calls, 152 files.
- `bun run src/entrypoints/cli.tsx --help >/tmp/ccr-help.txt`: PASS. 68 help lines; first line is `Usage: dash-shatter [options] [command] [prompt]`.
- `git diff --check`: PASS.
- Compact privacy scan over branch-touched public docs/reports/source: PASS. Checked for raw key-shaped strings, private endpoints, private overlay-network details, and operator-local absolute paths.
- Independent reviewer subagent attempt: blocked by provider quota (HTTP 429), so no external reviewer verdict was available. Static scan and full verification passed locally.
- `fixtures/6597bb.json`: removed as generated scratch after inspection and not regenerated after test env isolation.

## Parity status summary

Confirmed parity:
- Core `--help` works after dependencies are installed.
- `--version` works from earlier checkpoint.
- Major official CLI flags are present in CCR help: print, output format, model, permission modes, tools, settings, bare, worktree, update/install, auth, mcp, plugins, agents.
- `plugin list --json` returns machine-readable JSON with clean temp HOME/no installed plugins.

Improved in Phase B:
- `plugin list --available` now fails fast unless `--json` is present, matching its documented option contract.

Partial parity:
- Print mode reaches auth gate but cannot complete without credentials.
- Auth, MCP, plugins interactive UI, permissions UI, slash commands, settings precedence, worktree, bare mode, context loading, and tool restriction behavior need focused behavioral tests.

Not implemented or not exposed compared with current official docs:
- `claude project purge [path]`.
- `claude remote-control` / `--remote-control` / `--rc` surface.
- `claude ultrareview [target]`.
- `claude auto-mode defaults/config`.
- Full current slash-command ecosystem not yet proven.

## Feature-flag summary

- 993 `feature(...)` call sites found.
- 72 unique flag strings found.
- `feature()` is still globally false in the reverse-engineered entrypoint, so feature-gated code remains disabled.
- No broad feature restoration was done. Core CLI parity/build/test reliability took priority.
- Highest-risk disabled groups: permission classifiers/auto mode, remote bridge/control, proactive scheduling, subagent fork/coordinator, native voice/computer-use surfaces.

## Residual risks

- Official installed `claude` is unavailable on this host, so official help/version comparison relies on Anthropic docs and npm metadata.
- Live print-mode behavior is blocked by missing login/credentials; no API call was attempted with secrets.
- Plugin command is implemented enough for basic list/marketplace/install subcommands, but interactive marketplace/plugin UI remains not fully parity-smoked.
- Current feature flag posture is intentionally conservative; disabled private/native/background surfaces were documented rather than revived.
- Project purge, remote-control, ultrareview, and auto-mode subcommands remain larger parity gaps that need separate design/safety passes.

## Next action

No additional small, high-confidence runtime-breaking cleanup remains in this pass after the green plugin CLI fix. Next safe continuation: add focused temp-HOME tests for auth status text/json and settings precedence, or plan a bounded dry-run-only `project purge` parity implementation before any destructive behavior.
