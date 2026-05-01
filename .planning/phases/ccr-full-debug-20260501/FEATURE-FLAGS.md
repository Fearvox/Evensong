# CCR Full Debug 2026-05-01 — Feature Flag and Stub Inventory

Branch/worktree: `codex/ccr-full-debug-20260501` at `<operator-worktree>/ccr-full-debug-20260501/worktree`
Baseline: `origin/main` d2e07c3
Evidence: `git grep -n "feature(" -- '*.ts' '*.tsx'`; `<operator-evidence-dir>/ccr-full-debug-20260501/evidence/static-inventory.txt`

Important baseline:
- `src/entrypoints/cli.tsx` polyfills `feature()` to false in this reverse-engineered build, so all feature-gated code is effectively disabled unless separately wired.
- 993 `feature(...)` call sites were found across TypeScript/TSX.
- 72 unique flag strings were found, including test-only sentinels (`GOOD`, `BAD`, `ALSO_BAD`, `ANYTHING`, `NONEXISTENT`).

## Flag groups

| flags | owner modules | current risk | safe to restore now? | acceptance test needed |
| --- | --- | --- | --- | --- |
| `BASH_CLASSIFIER`, `TRANSCRIPT_CLASSIFIER`, `POWERSHELL_AUTO_MODE`, `TREE_SITTER_BASH`, `TREE_SITTER_BASH_SHADOW`, `DYNAMIC_PERMISSION_ESCALATION`, `OVERFLOW_TEST_TOOL` | permissions/classifier, BashTool, PowerShellTool, CLI structured IO | High: directly changes command approval and safety; current docs call auto mode research preview | No, not before permission parity tests | Classifier fixtures, denial precedence, destructive-command circuit breakers, PowerShell/Bash parse cases |
| `KAIROS`, `KAIROS_CHANNELS`, `KAIROS_BRIEF`, `KAIROS_PUSH_NOTIFICATION`, `KAIROS_GITHUB_WEBHOOKS`, `PROACTIVE`, `AGENT_TRIGGERS`, `UDS_INBOX`, `BG_SESSIONS`, `DAEMON` | proactive/Kairos, bridge, CLI print, scheduling/inbox/session modules | High: background/remote/proactive execution can surprise operators | No, except read-only status/reporting with explicit opt-in | No-network scheduling tests, inbox temp-socket tests, kill/cleanup tests, no-secret output scan |
| `BRIDGE_MODE`, `CCR_AUTO_CONNECT`, `CCR_MIRROR`, `CCR_REMOTE_SETUP` | `src/bridge/**`, remote bridge commands/footer | High: remote-control/network/session mirroring surface | No | Localhost-only server smoke, auth boundary tests, URL/private endpoint redaction |
| `COORDINATOR_MODE`, `FORK_SUBAGENT`, `VERIFICATION_AGENT`, `BUILTIN_EXPLORE_PLAN_AGENTS`, `AGENT_MEMORY_SNAPSHOT` | AgentTool, coordinator, task/todo tools | Medium/high: spawns agents and changes workflow | Defer; maybe enable `FORK_SUBAGENT` only after isolated process tests | Subagent spawn tests, permission propagation, dynamic tool restrictions |
| `VOICE_MODE`, `NATIVE_CLIPBOARD_IMAGE`, `CHICAGO_MCP`, `BUDDY`, `TERMINAL_PANEL`, `TORCH` | voice/audio UI, image paste, computer use, companion UI | Medium/high: platform-specific native deps and optional UX | No for voice/computer; maybe UI-only flags after component tests | Native package availability tests, no-crash render tests |
| `HISTORY_SNIP`, `HISTORY_PICKER`, `REACTIVE_COMPACT`, `CONTEXT_COLLAPSE`, `COMPACTION_REMINDERS`, `PROMPT_CACHE_BREAK_DETECTION`, `TOKEN_BUDGET` | QueryEngine, compact/context, PromptInput, attachments | Medium: affects conversation correctness and context retention | Only after context/compaction parity tests | Token threshold tests, transcript roundtrip, compaction snapshot tests |
| `EXTRACT_MEMORIES`, `TEAMMEM`, `MEMORY_SHAPE_TELEMETRY`, `LODESTONE`, `SKILL_IMPROVEMENT`, `EXPERIMENTAL_SKILL_SEARCH`, `MCP_SKILLS`, `WORKFLOW_SCRIPTS` | memory/skills/workflows/background housekeeping | Medium: can read/write memory/skill surfaces | Defer writes; read-only search can be restored with tests | Temp HOME memory/skills tests, no operator path leakage |
| `DOWNLOAD_USER_SETTINGS`, `FILE_PERSISTENCE`, `COMMIT_ATTRIBUTION`, `ENHANCED_TELEMETRY_BETA`, `PERFETTO_TRACING`, `SHOT_STATS`, `SLOW_OPERATION_LOGGING`, `HARD_FAIL` | settings sync, persistence, attribution, telemetry/stats/logging | Medium: privacy and persistence risk | Attribution/persistence only after privacy scan; telemetry no | Telemetry disabled-by-default tests, no-secret logs, file persistence temp-dir tests |
| `MCP_RICH_OUTPUT`, `CONNECTOR_TEXT`, `AUTO_THEME`, `STREAMLINED_OUTPUT`, `SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED`, `NEW_INIT`, `ULTRAPLAN`, `ULTRATHINK`, `TEMPLATES` | UI, config, init, model prompting | Low/medium depending side effects | Some low-risk UI/config flags may be restored later | Component snapshots, CLI snapshots, no-network init tests |
| `ALLOW_TEST_VERSIONS`, `IS_LIBC_GLIBC`, `IS_LIBC_MUSL` | native installer/env detection | Low/medium; installer can download/replace binaries | Not automatically; only dry-run/test seams | Installer target parsing and platform detection tests |
| `GOOD`, `BAD`, `ALSO_BAD`, `ANYTHING`, `NONEXISTENT` | feature flag tests | Test sentinels only | N/A | Existing feature flag unit tests |

## Stubbed/deleted/simplified surfaces

| surface | evidence | safe restore now? | risk / owner module | acceptance test needed |
| --- | --- | --- | --- | --- |
| Computer Use (`@ant/*`) | AGENTS.md says stubs in `packages/@ant/`; code references `src/utils/computerUse/**` and `CHICAGO_MCP` | No | Native/platform and privacy-heavy | Stub contract tests; no-op behavior documented; platform gated integration tests |
| `*-napi` native packages except `color-diff-napi` | AGENTS.md; package stubs | No broad restore | Native binary supply chain and Bun compatibility | Per-package smoke, checksums, optional dependency fallback |
| Analytics / GrowthBook / Sentry | AGENTS.md says empty implementations; `src/services/analytics/growthbook.ts` present but de-risked | No telemetry restore without explicit operator approval | Privacy/secrets | Assert default no outbound telemetry; redacted debug logs |
| Magic Docs / Voice Mode / LSP Server | AGENTS.md says removed; `VOICE_MODE` remnants still exist | No | Missing modules/native deps | Help hides unsupported commands; component no-crash tests |
| Plugins / Marketplace | AGENTS.md says removed, but help exposes `plugin|plugins` | High priority audit, not blind restore | User-facing exposed command may fail | `claude plugin --help`/list tests with temp HOME; hide or implement minimal stable behavior |
| MCP OAuth | AGENTS.md says simplified | Defer until MCP parity map is expanded | Auth/token safety | OAuth disabled messaging tests; no token logging |
| Remote control / bridge / mirror | many `BRIDGE_MODE`/`CCR_MIRROR` gates | No | remote server/session control | localhost-only smoke, auth, redaction |
| Proactive/Kairos scheduling | many `KAIROS`/`PROACTIVE`/`AGENT_TRIGGERS` gates | No | autonomous background actions | opt-in, dry-run scheduler tests, no network by default |

## Immediate restoration decision

Do not restore feature-flagged capabilities in this pass until core CLI parity failures and baseline tests are stable. The only implemented code change in this branch is a low-risk Linux build fix for an already-used utility export (`shellSingleQuote`) with a regression test.
