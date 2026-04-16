# Phase 07: Evensong → DS Integration - Context

**Gathered:** 2026-04-16
**Status:** Ready for task dispatch (user is orchestration controller)
**Source:** Interactive discovery + user directive "把 DS 完善为我们所有改动的 ultimate productive CLI"
**Orchestrator:** Claude (this session) — **writes spec only, does not Edit code**
**Executors:** User-assigned across claude / codex / gemini / grok CLI sessions

<domain>
## Phase Boundary

Consolidate three layers of Evensong assets (code / MCP / research-vault / data / paper) that are currently scattered across `~/Documents/Evensong/` (non-git, 162 MB / 1956 files) and `~/claude-code-reimagine-for-learning/` (active CCR fork) into a single integrated DS productive CLI, with clear ownership boundaries, git-native version control, and no sensitive data leakage.

**Terminal state:**

```
~/claude-code-reimagine-for-learning/          ← CCR / DS active main (GitHub: Fearvox/Evensong)
├── packages/research-vault-mcp/                ← NEW (migrated from Documents)
├── research-vault/                             ← submodule → Fearvox/ds-research-vault (private)
├── benchmarks/evensong/                        ← harness code (unchanged)
└── benchmarks/data/ (optional submodule)       → Fearvox/ds-benchmark-data (private)

~/Documents/Evensong/                           ← ARCHIVE ONLY (read-only local reference)
└── .sensitive/                                 ← api key.md, 飙马野人/, .docx — never in any repo

~/.claude/CLAUDE.md (global)                    ← NEW "DS Repo Map" section
```

**Out of scope for this phase:**
- Desensitization of research-vault for public release (deferred to separate milestone)
- Removing CCB (`~/dash-shatter/`) — it stays as frozen paper snapshot
- Modifying active CCR source code (`src/**/*.ts`) — this phase is asset reorg only
- `~/dash-verse/`, `~/.dashpersona/` — user-declared "do not touch"

</domain>

<discovery>
## Discovery Findings (2026-04-16, pre-spec verified)

### Git topology — CCR ≠ CCB at git level
| Repo | Local | GitHub | HEAD age | Size |
|---|---|---|---|---|
| **CCR (active)** | `~/claude-code-reimagine-for-learning` | `Fearvox/Evensong.git` | 14 min ago | 1.1 GB |
| **CCB (frozen)** | `~/dash-shatter` | `Fearvox/dash-shatter.git` | 4 days ago | 450 MB |

First commits differ (`f90eee8...` vs `44eced8...`) — **not** a fork relationship. Same product identity (DS), two separate git histories. CCR is the main line per user.

### Evensong asset distribution
| Asset | Path | Size | Files | Nature |
|---|---|---|---|---|
| Harness code | `CCR/benchmarks/evensong/` | 1.7 MB | 50 | ts/sh/png — already in CCR ✅ |
| research-vault main | `Documents/Evensong/research-vault/` | 82 MB | 361 | docs + knowledge + raw + scripts |
| research-vault-mcp | `Documents/Evensong/research-vault-mcp/` | 7.7 MB | — | **complete Node project** (package.json + src + bun.lock) |
| R006 data | `Documents/Evensong/R006-PUA-EXTREME-FULL/` | 51 MB | — | benchmark runs |
| R012-GPT data | `Documents/Evensong/R012-GPT/` | 9.8 MB | — | benchmark runs |
| R008 data | `Documents/Evensong/R008 Final/` | 3.8 MB | — | benchmark runs |
| EverMind handoff | `Documents/Evensong/Evensong-EverMind-Handoff/` | 4 MB | — | handoff docs |
| EverOS log | `Documents/Evensong/EverOS Collab Research Log/` | 3.8 MB | — | research logs |
| LaTeX paper | `Documents/Evensong/LaTeX/evensong-panopticon.{tex,pdf}` | 28 KB | 2 | final paper source |
| neurips | `Documents/Evensong/evensong-neurips/` | 48 KB | — | NeurIPS submission |
| stress-tests | `Documents/Evensong/stress-tests/` | 44 KB | — | reproduction fixtures |

### research-vault dual-copy anomaly
- **Documents version**: 82 MB / 361 files — full vault (docs, knowledge, raw, scripts, summaries, ultraplan)
- **CCR version**: 48 KB / 8 files — only "anchor" markdown (HANDOFF-EVENSONG-EN, PHILOSOPHICAL-INTEGRITY-ANCHOR-L0, EVOLUTION-LAYER-INDEX, ModelCard etc.)
- CCR/research-vault is **real directory, not symlink/submodule** → bifurcation confirmed

### Sensitive content (must .gitignore on submodule)
- `Documents/Evensong/research-vault/api key.md` — actual API keys (blocker for open-sourcing)
- `Documents/Evensong/research-vault/飙马野人/` — Chinese-named subdirectory (content unknown, treat as sensitive by default)
- `Documents/Evensong/research-vault/UltraPlan_L1_Scope.docx` — Word document (likely proprietary planning)

### Code-level coupling
Evensong concept is referenced by **15 CCR src/** files including:
- `src/main.tsx`, `src/Tool.ts`, `src/commands.ts`
- `src/tools/AgentTool/{AgentTool,prompt,builtInAgents,resumeAgent,forkSubagent}.tsx`
- `src/tools/{AskUserQuestion,ExitPlanMode,EnterPlanMode,ScheduleCron,ToolSearch,PowerShell}/*`
- `src/tasks/LocalAgentTask/LocalAgentTask.tsx`

**Implication:** Evensong is already a first-class concept inside CCR code — this phase is about aligning *assets* to match, not introducing new integration.

</discovery>

<decisions>
## Orchestrator Decisions (approved by user 2026-04-16)

### Decision A: research-vault (82 MB) → private submodule
**Choice:** ②ᵃ — Create `Fearvox/ds-research-vault` (private) with internal `.gitignore` for sensitive files.

**Rationale:**
- Preserves git history + rollback + diff capability (rejected ③ symlink — non-portable)
- Defers desensitization to future milestone (rejected ① public desensitized — would block this phase on manual review of `api key.md` + `飙马野人/` + `.docx`)
- Private submodule gives future optionality: can flip to public + desensitized later without re-plumbing

**Sensitive allowlist (must be in vault-repo .gitignore):**
- `api key.md`
- `飙马野人/`
- `*.docx` (conservative default — revisit per-file)
- any `credentials*`, `secret*`, `.env*` patterns

### Decision B: research-vault-mcp → CCR workspace package
**Choice:** ① — `mv Documents/Evensong/research-vault-mcp → CCR/packages/research-vault-mcp/`

**Rationale:**
- CCR is already a Bun workspace monorepo (`CLAUDE.md`: "Monorepo — Bun workspaces")
- `packages/` is the established convention — zero architectural novelty
- User stated goal: "给全局 CLI 的 MCP记忆" requires all CCR sessions to have it by default → workspace = tightest integration
- Rejected ② independent repo (double-PR overhead on any MCP/CCR co-change)
- Rejected ③ leave-in-Documents (non-git → no version/rollback)

### Decision C: benchmark runs (~73 MB of R006/R008/R012/EverMind/stress-tests) → independent data repo
**Choice:** ① — Create `Fearvox/ds-benchmark-data` (private, flip-public after paper acceptance)

**Rationale:**
- Write-once read-many artifacts — do not pollute CCR main git history
- Rejected ② git-lfs (forces 73 MB into every CCR clone — violates "hackable fork" CCR posture)
- Rejected ③ archive-only (loses reproducibility — NeurIPS reviewers need pullable data)
- CCR integrates via **optional** submodule at `benchmarks/data/` (researchers run `git submodule update --init benchmarks/data` only when reproducing)

### Decision Carry-over: CCB stays frozen
`~/dash-shatter/` remains as-is (HEAD 4 days ago, paper benchmark snapshot). Not deleted, not merged. Its existence is a historical fact documented in global CLAUDE.md, not an active dev target.

### Decision Carry-over: sibling projects "do not touch"
Per user directive: `~/dash-verse/` and `~/.dashpersona/` are separate projects. Documented in global CLAUDE.md as "hands-off" list.

</decisions>

<canonical_refs>
## Canonical References

**Future executor CLIs MUST read these before implementing their assigned task.**

### Source asset paths (before migration)
- `~/Documents/Evensong/research-vault/` (82 MB, 361 files) — ds-research-vault seed
- `~/Documents/Evensong/research-vault-mcp/` (7.7 MB) — packages/research-vault-mcp seed
- `~/Documents/Evensong/R006-PUA-EXTREME-FULL/` + `R008 Final/` + `R012-GPT/` + `Evensong-EverMind-Handoff/` + `stress-tests/` — ds-benchmark-data seed
- `~/Documents/Evensong/LaTeX/` + `evensong-neurips/` — paper artifacts (this phase: catalog; future: decide archive vs repo)

### CCR target paths (after migration)
- `CCR/packages/research-vault-mcp/` — new workspace package
- `CCR/research-vault/` (submodule, replaces existing 48 KB real directory)
- `CCR/benchmarks/data/` (optional submodule)
- `CCR/.gitmodules` — submodule declarations
- `CCR/package.json` — workspaces array update

### Documentation targets
- `CCR/CLAUDE.md` — update "Project Overview" to correct CCR/CCB narrative
- `~/.claude/CLAUDE.md` (global) — add "DS Repo Map" section
- `ds-research-vault/README.md` — new, documents private status + sensitive allowlist
- `ds-benchmark-data/README.md` — new, documents reproducibility contract

### Existing code boundaries (do not touch this phase)
- `src/services/extractMemories/*` — Phase 06 territory
- `src/services/api/*` — relay territory (other session, elegant-tinkering-rainbow)
- All 15 src/ files that reference "evensong" — code-level integration already done

</canonical_refs>

<risk_register>
## Risk Register

| # | Risk | Severity | Mitigation (in spec) |
|---|------|----------|----------------------|
| R1 | `api key.md` accidentally committed to ds-research-vault | **critical** | Task 1 requires `git log --all -- 'api key.md'` returns empty before push; hardcoded .gitignore verification |
| R2 | research-vault-mcp has hardcoded paths into `~/Documents/Evensong/` | high | Task 2 requires grep for absolute paths before migration |
| R3 | CCR's existing 48 KB `research-vault/` has unique content missing from Documents version | high | Task 3 requires diff + merge before replacing with submodule |
| R4 | Submodule breaks existing CCR code that reads `research-vault/*.md` | medium | Task 3 requires grep `research-vault/` in src/ + docs/ + run build after submodule added |
| R5 | benchmark data repo first-push > 100 MB GitHub push limit | medium | Task 4 splits large binaries to git-lfs within data-repo only, or chunks commits |
| R6 | Global CLAUDE.md update conflicts with other session edits | low | Task 5 is last, checks git status clean before writing |
| R7 | Developer on a different machine clones CCR and can't init private submodules | low | Task 3 README documents SSH auth requirement + fallback public mirror path |

</risk_register>

<success_criteria>
## Phase Success Criteria

Phase is complete when **all** verify:

1. `ls CCR/packages/research-vault-mcp/package.json` exists and `bun --cwd CCR/packages/research-vault-mcp install` succeeds
2. `cd CCR/research-vault && git remote -v` points to `Fearvox/ds-research-vault.git`
3. `cd CCR/research-vault && git log --all -- 'api key.md'` returns empty (no sensitive leak)
4. `cd CCR && bun run build` still succeeds (no code regression)
5. `CCR/CLAUDE.md` contains corrected "CCR = DS active / CCB = frozen snapshot" narrative
6. `~/.claude/CLAUDE.md` contains "DS Repo Map" section listing all DS-related repos + "do not touch" siblings
7. `Fearvox/ds-benchmark-data` exists on GitHub + has R006/R008/R012/EverMind/stress-tests
8. `~/Documents/Evensong/research-vault/` + `research-vault-mcp/` are renamed to `.archive-post-migration-2026-04-16/` (not deleted — safety net for 30 days)

</success_criteria>
