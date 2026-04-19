---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Agent Intelligence Enhancement
status: executing
stopped_at: Completed Phase 6 (MEM-01/02/03)
last_updated: "2026-04-18T22:00:00.000Z"
last_activity: 2026-04-18
progress:
  total_phases: 14
  completed_phases: 6
  total_plans: 7
  completed_plans: 7
  percent: 78
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-08). xAI-fast key integrated as default fastest LLM.

**Core value:** A working, modifiable Claude Code CLI that developers can study, extend, and customize
**Current focus:** Milestone v2.0 -- Phase 6 complete, entering Phase 7 (Deliberation Checkpoint). P9 subagent-driven execution with dual-review gates.

## Current Position

Phase: 6/14 complete
Plan: 7 of 7 complete (Phase 6 MEM-01/02/03 done)
Status: Phase 6 complete, Phase 7 (Deliberation Checkpoint) next
Last activity: 2026-04-14

Progress: [████░░░░░░] 43% (Phase 6/14)

## Performance Metrics

**Velocity:**

- Total plans completed: 12 (v1.0)
- Average duration: ~3.5 min
- Total execution time: ~42 min

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 1 | 2 | 10min | 5min |
| Phase 2 | 3 | ~12min | ~4min |
| Phase 3 | 3 | ~8min | ~3min |
| Phase 4 | 4 | ~18min | ~4min |

**Recent Trend:**

- Last 5 plans: 170s, 148s, 4min, 2min, 95s
- Trend: Stable

| Phase 05 P01 | 232 | 2 tasks | 199 files |
| Phase 05 P02 | 301 | 3 tasks | 3 files |
| Phase 05 P03 | 559 | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.0 Roadmap]: 8-phase structure derived from 29 requirements across 8 categories
- [v2.0 Roadmap]: Safety infra (Phases 7-8) ordered before stress features (Phases 10-11)
- [v2.0 Roadmap]: GrowthBook gate override (Phase 5) is hard prerequisite for all gated features
- [v2.0 Roadmap]: UI cleanup + integration testing combined in Phase 12 as final pass
- [Phase 05]: Added _reloadFlagsForTesting() to featureFlag.ts for test isolation (Bun lacks query-param cache busting)
- [Phase 05]: cli.tsx uses named import (not bare side-effect) for featureFlag since feature() is called in module scope
- [Phase 05]: Used MCP SDK McpServer as stdio test fixture for proper JSON-RPC framing under Bun
- [Phase 05]: SSEClientTransport used despite v1.29.0 deprecation -- still exported and used by codebase
- [Phase 05]: Local override at priority 3 (after env/config, before isGrowthBookEnabled) preserves eval harness determinism
- [Phase 05]: Extended local override to all 5 gate functions (not just planned 3) for consistency

### Pending Todos

None yet.

### Blockers/Concerns

- ~1341 tsc errors from decompilation -- incremental approach per phase only
- React Compiler `_c()` boilerplate throughout components -- addressed in Phase 12
- KAIROS cloud API replacement needs validation during Phase 11 planning
- Forked agent Bun compatibility unverified -- smoke test needed in Phase 6

## Session Continuity

Last session: 2026-04-14T17:50:00.000Z
Stopped at: Phase 6 complete + language baseline hook + Grok CLI merge + Karpathy plugin installed
Resume file: None

## Today's Work (2026-04-14)

- 5830db4..e27c38d: Phase 6 MEM-01/02/03 (108 new tests, secret scanner, extraction pipeline)
- 5f66087: evensong toggle z-index, locale restore, hero reveal fixes
- daaff5b: planning docs + CLAUDE.md sync
- language-baseline.js hook: SubagentStart + PreToolUse(Agent) 中文强制基线
- Karpathy Guidelines plugin installed (andrej-karpathy-skills@karpathy-skills)
- Grok CLI consolidated: grok-dev (3 copies) → @vibe-kit/grok-cli (1 copy)
- PR #6 assessed: 48 conflicts, recommend cherry-pick over full merge
- Grok claims verified: 516 tests ✅, xai-fast default ✅, 92% progress ❌ (actual 43%)

## Off-milestone Work (2026-04-18)

Not part of v2.0 phases — cross-cutting hook/docs work.

- **EverMem hook ranking fix** (target: `~/.claude/hooks/evermem-multi-inject.mjs`, outside repo): 5 logical changes via subagent-driven execution — memory_types expand (`agent_memory`), MIN_SCORE 0.05→0.35, remove fallback bypass, add matchedGroup+weighted_score, add [agent]/[project] badges. Regression Prompt B (minecraft) injected=0 proves MIN_SCORE works.
- **Stop hook補丁** (settings.json): plugin store-memories.js silent-exited because EVERMEM_API_KEY env var not injected; added evermem-with-key.sh wrapper in `.hooks.Stop` array. Hot-loaded without restart.
- **PR #8 merged** (1625ecd): spec + plan docs committed. Side-effect: squash also absorbed 19 accumulated local commits (or-elephant-alpha, R065/R066-R070, seed v1-v3, phase 15 handoff) — origin/main now includes all of it.
- **Docs drift discovery**: `/memories/search` enum is `{agent_memory, episodic_memory, profile, raw_message}`, NOT the `{agent_case, agent_skill}` that llms.txt shows for `/memories/get`. Wrong enum caused 400, corrected live during Task 1.
- **Data-loss window**: today 07:00–21:15 all session transcripts missing from EverMem server (store silent-exit). Future sessions fixed; manual flush is optional.

## Off-milestone Work (2026-04-19)

Vault Foundation rebuild (Wave 1 ship + Wave 2A/2B/2C/2D execute — full Wave 2 complete).

- **Wave 1 SHIPPED** (4 commits): `_vault` L1 canonical protocol push + infra/ baseline inventory + MASTER-PREAMBLE-INDEX v0.1 + CCR spec `docs/superpowers/specs/2026-04-19-vault-foundation-and-preamble-design.md`. See `memory/projects/project_vault_foundation_wave1_shipped.md`.
- **Wave 2 plans** (4 plans, 1 commit): Wave 2A/2B/2C/2D in `docs/superpowers/plans/2026-04-19-wave2*.md`.
- **Wave 2A SHIPPED** (1 commit to _vault): 3 archives + 1 rename + 2 keeps (DS-EverOS-RR, dash-persona SF EverMind 得奖里程碑); 4 deferred (delete×3 auth scope + merge×1 src scope). See `_vault/infra/CLEANUP-DECISIONS.md` Wave 2A execution record.
- **Wave 2D SHIPPED** (2 commits to CCR): submodule `research-vault` declaration removed + `.gitignore` updated + `packages/research-vault-mcp/` npx-ready as `@syndash/research-vault-mcp` (scoped under `SynDASH` GitHub org; bin shim + 13-test shape validation + npm pack dry-run verified 6 files / 9 KB / clean allowlist).
- **Wave 2B SHIPPED** (7 commits to CCR main): Local Gemma provider + vault retrieval chain per plan `2026-04-19-wave2b-provider-fallback-chain.md`. 3 new src modules (~160 LOC total: api/localGemma.ts + retrieval/types.ts + retrieval/vaultRetrieve.ts + retrieval/providers/localGemmaProvider.ts) + 3 new test files (18/18 pass). Zero modifications to existing withRetry.ts (main Anthropic-compat chain untouched). Spec §3.4 Wave 1 primary provider (Atomic Gemma at `http://127.0.0.1:1337/v1`) now wired for retrieval path with LLM listwise judge + JSON/heuristic parse + AllProvidersFailedError fallback. Full regression green (2000 pass / 1 pre-existing fail + 1 pre-existing error unchanged). Build clean (27.26 MB bundle).
- **Wave 2C SHIPPED** (pivoted from Atomic MLX to DO droplet, 1 commit to _vault): Atomic 不支持 embeddings flag (501) → 升级 ccr-droplet 到 $12/mo 2GB → 装 llama.cpp b8840 + BGE-M3 Q4_K_M (417MB, 1024-dim multilingual) → Tailscale mesh only (`http://100.65.234.77:8080/v1/embeddings`) → systemd `bge-m3-embed.service` → 350-650ms end-to-end latency。endpoint 合约 doc 在 `_vault/infra/retrieval-endpoints.md`。
- **EverMem Stop hook retry wrapper shipped** (`~/.claude/hooks/evermem-with-key.sh`): 3-attempt exponential backoff for `RemoteDisconnected`/5xx; 4-scenario test pass. Backup at `.bak-20260419-pre-retry`.
