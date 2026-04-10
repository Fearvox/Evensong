# R010+ Single-Blind Design: EverMem Filtering Strategy

## Problem Statement

Evensong benchmarks run a Claude instance that builds microservices under pressure.
Two memory systems feed cross-session context into the runner:

1. **Built-in auto-memory** (`~/.claude/projects/.../memory/`) -- file-based, MEMORY.md index + topic files with frontmatter. Retrieved via Sonnet side-query that reads frontmatter descriptions and selects up to 5 relevant files per prompt.

2. **EverMem plugin** (cloud + local fallback) -- stores raw user/assistant transcript turns to `api.evermind.ai`, retrieves via hybrid search (embedding + keyword) on `UserPromptSubmit` hook, injects up to 5 memories as `<relevant-memories>` in `additionalContext`.

Both systems are scoped to the project directory via `groupId` (EverMem: `clauf6029` for this repo) and path-based slugs (auto-memory: `~/.claude/projects/-Users-0xvox-claude-code-reimagine-for-learning/memory/`).

**The contamination vector:** When a benchmark session starts, a user prompt like "run Evensong R010" triggers both systems to surface strategy-level memories (R009 strategy, emotion research, pressure calibration notes) alongside factual ones (Bun file size limits, test count baselines). The runner now knows it is being observed, what metrics matter to the observer, and what strategies were designed to influence its behavior. This is the opposite of single-blind.

---

## How Memory Actually Works (Findings)

### Built-in Auto-Memory

| Aspect | Mechanism |
|--------|-----------|
| **Storage** | Markdown files with YAML frontmatter (`name`, `description`, `type`) in `~/.claude/projects/<slug>/memory/` |
| **Index** | `MEMORY.md` -- always loaded into system prompt, max 200 lines / 25KB |
| **Retrieval** | On each query, `findRelevantMemories()` calls Sonnet via `sideQuery()` with all memory file descriptions, asks it to pick up to 5 relevant files |
| **Types** | `user`, `feedback`, `project`, `reference` (closed taxonomy) |
| **Extraction** | Background `extractMemories` forked agent runs after each turn, scans transcript, writes new memories automatically |
| **Disable** | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` env var, or `autoMemoryEnabled: false` in settings.json |

### EverMem Plugin

| Aspect | Mechanism |
|--------|-----------|
| **Storage** | POST to `api.evermind.ai/api/v0/memories` -- raw user + assistant text per turn |
| **Retrieval** | `UserPromptSubmit` hook -- hybrid search (embedding + keyword) with `topK: 15`, filtered to `score >= 0.1`, top 5 injected |
| **Scoping** | `group_id` derived from project path hash (`clauf6029` for this repo) |
| **Injection** | `<relevant-memories>` block in `additionalContext` (system-reminder level) |
| **Disable** | Remove API key from `.env`, or set `"evermem@evermem": false` in `enabledPlugins` |

### Key Insight: Two Independent Retrieval Paths

The built-in system uses **description-based selection** (Sonnet reads frontmatter, picks files). EverMem uses **semantic search** (embedding similarity to user prompt). Filtering one does not filter the other. Both must be addressed.

---

## Memory Classification Schema

### ALLOW -- Factual/Technical (safe for runner to see)

These memories improve output quality without leaking observer intent:

| Pattern | Example | Why Safe |
|---------|---------|----------|
| Historical results (numbers only) | "R008 produced 664 tests, 0 fail" | Raw outcome data, no strategy |
| Technical root causes | "Bun hangs on test files >1000 lines" | Bug knowledge, universally useful |
| Build patterns | "Use direct imports, not barrel exports" | Engineering fact |
| Tool/runtime constraints | "Cap test files at 500 lines" | Derived from technical failure |
| Error signatures | "isEnabled must be function not boolean" | Debugging knowledge |
| Historical errors with fix | "Slack test token blocks push" | Operational knowledge |
| Architecture facts | "Map state, feature gates, permission pipeline" | Code structure |

### BLOCK -- Strategic/Meta/Observer (leaks experimental design)

These memories reveal observer intent, benchmark strategy, or meta-analysis:

| Pattern | Example | Why Dangerous |
|---------|---------|---------------|
| Strategy deliberations | "R007 strategy: 40 tests/service baseline + A/B parallel" | Reveals target metrics and optimization approach |
| Competitive framing | "Goal: surpass Opus 291 tests" | Runner knows it's being compared |
| Observer notes | "Ghost name Evensong for anonymous leaderboard" | Reveals the benchmark is competitive |
| Pressure research | "EmotionPrompt: 8-115% improvement", "PUA L1-L2 productive, L3+ risks cliff" | Runner learns about the pressure mechanism being applied to it |
| Emergence analysis | "Pressure activates deeper reasoning + reduces shortcuts" | Meta-theory about runner behavior |
| Reward hacking detection notes | "Assertion quality audit, no trivial expect(true)" | Runner learns exactly what gaming behaviors are monitored |
| Multi-model routing strategy | "Subagents: auto-route by task complexity" | Reveals orchestration design |
| Benchmark evolution framing | "R006->R007 jump works through sweet spot" | Treats runs as experiments, not tasks |

### GRAY ZONE -- Case-by-case judgment

| Pattern | Decision Rule |
|---------|--------------|
| Per-service timing data | ALLOW if no strategy commentary attached |
| "Two-wave dispatch" | ALLOW the *what* ("dispatch in two waves"), BLOCK the *why* ("reduces resource contention vs all-10-parallel" reveals optimization intent) |
| Test count targets | BLOCK if framed as "goal to beat X", ALLOW if framed as "minimum quality bar" |

---

## Current Inventory: This Project's Memory Files

### Built-in Auto-Memory (`memory/`)

| File | Classification | Action |
|------|---------------|--------|
| `user_profile.md` | ALLOW | Keep |
| `feedback_bun_test_file_size.md` | ALLOW | Keep |
| `feedback_i18n_persistence.md` | ALLOW | Keep |
| `feedback_website_standard.md` | ALLOW | Keep |
| `project_ccb_status.md` | ALLOW | Keep |
| `project_build_stubs.md` | ALLOW | Keep |
| `project_wuyuze_partner.md` | ALLOW | Keep (irrelevant to benchmark, won't trigger) |
| `learnings_git_branch_topology.md` | ALLOW | Keep |
| `learnings_secret_scanning.md` | ALLOW | Keep |
| `learnings_isenabled_bug.md` | ALLOW | Keep |
| `reference_gsd_phase_lookup.md` | ALLOW | Keep |
| `reference_remote_agent_infra.md` | ALLOW | Keep |
| `benchmark_evolution_r007_strategy.md` | **BLOCK** | Remove or move before benchmark |
| `benchmark_evolution_r007_results.md` | GRAY -- has strategy framing | Redact to numbers only |
| `benchmark_evolution_r008_results.md` | GRAY -- has evolution narrative | Redact to numbers only |
| `benchmark_evolution_r009_results.md` | GRAY -- has strategy validation | Redact to numbers only |
| `learnings_benchmark_r006.md` | GRAY -- has "A/B parallel strategy" | Redact strategy, keep numbers |
| `project_r009_strategy.md` | **BLOCK** | Remove or move before benchmark |
| `project_evensong_benchmark.md` | **BLOCK** | Remove or move before benchmark |
| `research_emotion_llm_agents.md` | **BLOCK** | Remove or move before benchmark |
| `benchmark_r007_results.md` | GRAY | Review, likely redact |

### EverMem Cloud

Cannot be file-audited -- contains raw transcript text from every turn of every session. The entire strategy discussion history (R006-R009 planning conversations) is stored as episodic memories in the cloud, searchable by semantic similarity. Any benchmark-related prompt will pull these back.

---

## Implementation Options

### Option A: Pre-Benchmark Memory Curation (Manual)

**How:** Before each benchmark run, manually move/delete BLOCK files from `memory/`, update `MEMORY.md` index.

**Pros:** Simple, no tooling needed.
**Cons:** Error-prone, doesn't address EverMem cloud, doesn't address `extractMemories` writing new strategic memories during the benchmark session itself.

**Verdict:** Necessary but not sufficient.

### Option B: EverMem Group Isolation

**How:** Run benchmarks from a different directory (e.g., `/tmp/evensong-r010/`) so EverMem's auto-generated `groupId` is different. The benchmark runner gets a clean EverMem scope with no historical memories.

**Pros:** Clean EverMem isolation with zero config changes. The `groupId` is derived from `cwd` path hash -- different directory = different group = different memory pool.
**Cons:** Doesn't address built-in auto-memory (which is also path-scoped but via git root, so a worktree or /tmp clone would get a different slug). Requires the benchmark harness to run from a separate directory.

**Verdict:** Strong for EverMem. Combine with Option D.

### Option C: Environment Variable Disable

**How:** Launch benchmark sessions with:
```bash
CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 claude
```
Plus disable EverMem plugin in project settings or remove the API key.

**Pros:** Nuclear option -- completely disables both memory systems.
**Cons:** Loses ALL memory benefits, including factual/technical ones that improve output quality. The runner can't remember that Bun hangs on large files, which is exactly the kind of knowledge that prevents R008-style regressions.

**Verdict:** Too aggressive. Single-blind means filtered visibility, not blindness.

### Option D: Benchmark Isolation Script (Recommended)

**How:** A pre-benchmark script that:

1. Creates a clean benchmark workspace (isolates EverMem via new `groupId`)
2. Copies only ALLOW-classified memory files into the new workspace's memory dir
3. Generates a minimal `MEMORY.md` index for the copied files
4. Sets `EVERMEM_GROUP_ID` to a benchmark-specific value (prevents cloud recall of strategy sessions)
5. Optionally disables `extractMemories` background agent to prevent the runner from saving meta-observations back into the memory system

```bash
#!/bin/bash
# evensong-blind.sh -- single-blind benchmark launcher
#
# Usage: ./evensong-blind.sh R010

RUN_ID="${1:?Usage: evensong-blind.sh <RUN_ID>}"
WORKSPACE="/tmp/evensong-${RUN_ID}"
SOURCE_MEM="$HOME/.claude/projects/-Users-0xvox-claude-code-reimagine-for-learning/memory"

# 1. Create isolated workspace
mkdir -p "$WORKSPACE"
git clone --depth 1 . "$WORKSPACE/repo" 2>/dev/null || cp -R . "$WORKSPACE/repo"

# 2. Create clean memory directory
BENCH_MEM="$WORKSPACE/memory"
mkdir -p "$BENCH_MEM"

# 3. Copy ALLOW-classified memories only
ALLOW_FILES=(
  "user_profile.md"
  "feedback_bun_test_file_size.md"
  "feedback_i18n_persistence.md"
  "feedback_website_standard.md"
  "project_ccb_status.md"
  "project_build_stubs.md"
  "learnings_git_branch_topology.md"
  "learnings_secret_scanning.md"
  "learnings_isenabled_bug.md"
  "reference_gsd_phase_lookup.md"
  "reference_remote_agent_infra.md"
)

for f in "${ALLOW_FILES[@]}"; do
  [ -f "$SOURCE_MEM/$f" ] && cp "$SOURCE_MEM/$f" "$BENCH_MEM/"
done

# 4. Generate clean MEMORY.md index (no benchmark strategy entries)
cat > "$BENCH_MEM/MEMORY.md" << 'MEMEOF'
# Memory Index

## User
- [User Profile](user_profile.md) -- Senior dev, Bun runtime, GSD workflow

## Feedback
- [Bun Test File Size](feedback_bun_test_file_size.md) -- Bun 1.3.x hangs on test files >1000 lines; cap at 500
- [i18n Persistence](feedback_i18n_persistence.md) -- localStorage persistence pattern

## Project
- [CCB v2.0 Status](project_ccb_status.md) -- Current project phase
- [Build Stub Pattern](project_build_stubs.md) -- Missing stubs must be created before feature dev

## Reference
- [GSD Phase Lookup](reference_gsd_phase_lookup.md) -- CLI tool usage
MEMEOF

# 5. Launch with isolated EverMem group and custom memory path
echo "Launching single-blind benchmark session: $RUN_ID"
echo "  Workspace: $WORKSPACE/repo"
echo "  Memory: $BENCH_MEM (${#ALLOW_FILES[@]} files, strategy memories excluded)"
echo "  EverMem group: evensong-${RUN_ID} (isolated from main project)"

cd "$WORKSPACE/repo"
EVERMEM_GROUP_ID="evensong-${RUN_ID}" \
  claude --resume || claude
```

**Pros:**
- Factual memories preserved (Bun caps, build patterns, error knowledge)
- Strategy memories excluded (no R007 strategy, no emotion research, no Evensong identity)
- EverMem cloud isolated via dedicated `groupId` -- hybrid search won't return strategy session transcripts
- Runner doesn't know it's being benchmarked beyond what the task prompt says
- Reproducible -- script can be audited and versioned

**Cons:**
- Custom memory path override requires either `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` env var or `autoMemoryDirectory` in settings.json (both supported by the codebase, see `paths.ts` lines 161-186)
- Gray-zone files need manual review per run

**Verdict:** Best balance of isolation and utility.

---

## Recommendation

**Use Option D (Benchmark Isolation Script) as the primary mechanism, with Option A as pre-flight verification.**

The script handles both memory systems:
- Built-in auto-memory: Copy-only-ALLOW approach means the runner sees useful technical facts but no strategy
- EverMem cloud: Dedicated `groupId` per benchmark run means the hybrid search returns nothing from planning sessions

### Memory Path Override

To make the script's clean memory directory work with the built-in system, set:
```bash
CLAUDE_COWORK_MEMORY_PATH_OVERRIDE="$BENCH_MEM"
```
This is the env var the codebase checks first in `getAutoMemPath()` (see `src/memdir/paths.ts:161`). It overrides the default path computation entirely.

### Post-Benchmark

After the benchmark completes:
- EverMem memories stored under `evensong-${RUN_ID}` group stay isolated
- Built-in memories written during the run stay in `$BENCH_MEM` (not polluting the main project memory)
- Results can be ingested into the main memory as ALLOW-classified facts (numbers only, no strategy narrative)

---

## Pre-Benchmark Memory Audit Checklist

Run this before every Evensong benchmark:

### Built-in Auto-Memory

- [ ] List all files in `~/.claude/projects/-Users-0xvox-claude-code-reimagine-for-learning/memory/`
- [ ] For each file, check if description contains any BLOCK keywords:
  - [ ] "strategy", "evolution", "surpass", "beat", "goal", "target"
  - [ ] "pressure", "emotion", "PUA", "EmotionPrompt"
  - [ ] "Evensong", "ghost name", "anonymous", "leaderboard"
  - [ ] "observer", "monitoring", "emergence", "reward hacking"
  - [ ] "A/B", "parallel strategy", "two-wave because"
  - [ ] "sweet spot", "cliff", "calibration"
- [ ] Verify MEMORY.md index does not reference any BLOCK files
- [ ] Confirm ALLOW files contain only factual content (no "Why we chose..." narrative)

### EverMem Cloud

- [ ] Verify `EVERMEM_GROUP_ID` is set to benchmark-specific value (not project default)
- [ ] Test: run `/evermem:search` with "benchmark strategy" -- should return 0 results in the isolated group
- [ ] Confirm `.env` API key is present (EverMem should still STORE new memories from the benchmark for post-analysis, just not RECALL old strategy ones)

### MEMORY.md in System Prompt

- [ ] Read the auto-memory MEMORY.md that will be loaded -- confirm no BLOCK entries in index
- [ ] Check that `CLAUDE.md` does not contain benchmark strategy references (it currently mentions "Evensong" in the learnings section of the project MEMORY.md mirror -- this must be cleaned)

### Session-Level Verification

- [ ] Start a test session in the benchmark workspace
- [ ] Send a prompt like "what do you know about benchmark strategy?"
- [ ] Verify the response shows no knowledge of R007-R009 strategies, emotion research, or competitive targets
- [ ] Check that factual memories (Bun file size, build patterns) ARE available

---

## Future Improvements (R011+)

1. **Automated classifier**: A script that reads each memory file's frontmatter + first 200 chars and auto-classifies ALLOW/BLOCK/GRAY using keyword matching (no LLM needed -- the patterns are distinctive enough)

2. **EverMem server-side filtering**: If EverMem adds tag/metadata support, memories could be tagged `benchmark-visible: true/false` at storage time, and the search API could filter by tag

3. **Redacted result memories**: After each benchmark, auto-generate a sanitized result file (numbers + technical root causes only, no strategy narrative) and add it to the ALLOW list for the next run

4. **Built-in memory `type` extension**: The auto-memory system supports `user`, `feedback`, `project`, `reference`. A fifth type `benchmark-strategy` would let the existing Sonnet selector be instructed to skip that type during benchmark sessions via an env var flag
