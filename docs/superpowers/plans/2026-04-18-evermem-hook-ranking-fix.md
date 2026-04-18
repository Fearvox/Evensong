# EverMem Hook Ranking Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the UserPromptSubmit hook from injecting irrelevant same-day session narratives; open the learning-layer path (`agent_case` + `agent_skill`); add project-scope weighting and transparency badges.

**Architecture:** Single-file ~15 LOC diff to `~/.claude/hooks/evermem-multi-inject.mjs`. Five logical changes: (1) expand `memory_types` whitelist, (2) raise `MIN_SCORE`, (3) remove fallback filter bypass, (4) add `matchedGroup`/`weighted_score` in merge + sort by weighted score, (5) add type/project badges in formatted output. Verification is probe-based (curl + `echo | node hook.mjs`) since no test framework exists for user hooks.

**Tech Stack:** Node.js ESM (hook file), EverMem v1 REST (`https://api.evermind.ai/api/v1/memories/search`), existing bash + curl + jq for probes.

**Spec:** `docs/superpowers/specs/2026-04-18-evermem-hook-ranking-fix-design.md`
**Verify scratch:** `.claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `~/.claude/hooks/evermem-multi-inject.mjs` | Single target: 5 logical changes, ~15 LOC delta |
| Append | `.claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md` | Post-implementation notes |
| Create (temp) | `/tmp/evermem-multi-inject-pre-fix-<ts>.mjs` | Backup for non-git rollback |
| Create (temp) | `/tmp/evermem-post-fix-prompt-{A,B,C}.txt` | Probe outputs for Task 5 |

No new source files. No new dependencies.

---

## Task 0 — Baseline capture & rollback mechanism

**Files:**
- Read: `~/.claude/hooks/evermem-multi-inject.mjs`
- Create: `/tmp/evermem-multi-inject-pre-fix-<timestamp>.mjs`
- Append: `.claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md`

- [ ] **Step 1: Check if ~/.claude is a git repo**

Run:
```bash
( cd ~/.claude && git rev-parse --is-inside-work-tree 2>/dev/null ) && echo "GIT_YES" || echo "GIT_NO"
```
Expected: prints `GIT_YES` or `GIT_NO`. Remember the result — it decides Task 1-5 commit semantics.

- [ ] **Step 2: Backup the original hook**

Run:
```bash
BACKUP="/tmp/evermem-multi-inject-pre-fix-$(date +%Y%m%d-%H%M%S).mjs"
cp ~/.claude/hooks/evermem-multi-inject.mjs "$BACKUP"
ls -la "$BACKUP"
echo "BACKUP_PATH=$BACKUP"
```
Expected: one new file at the printed `BACKUP_PATH`, ~7KB.

- [ ] **Step 3: P1 probe — confirm server-side learning-layer data**

Run:
```bash
curl -s -X POST https://api.evermind.ai/api/v1/memories/search \
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/evermem-claude-v0.key)" \
  -H "Content-Type: application/json" \
  -d '{"query":"evermem hook 排序算法","method":"hybrid","top_k":8,
       "memory_types":["episodic_memory","agent_memory"],
       "filters":{"user_id":"nolan"}}' \
  | jq '.data.episodes | map({id, memory_type, score}) | .[0:10]'
```
Expected: a JSON array of up to 10 items.
- If any item has `"memory_type"` = `"agent_memory"` → **learning layer PRESENT** (badges will appear after fix).
- If all items have `"memory_type"` = `"episodic_memory"` or `null` → **learning layer EMPTY** (typeTag stays no-op until flush-agent-memories populates it; still apply fix — zero side effects).
- If HTTP non-200 with error mentioning invalid memory_types enum → **STOP**, the `/memories/search` endpoint's enum is `{agent_memory, episodic_memory, profile, raw_message}` — do NOT use `agent_case`/`agent_skill` (those are `/memories/get` only).
- If other HTTP non-200 → STOP, capture response body, check API key validity.

Append result to `.claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md` under new section `## Post-Implementation Notes — Baseline (Task 0)`.

- [ ] **Step 4: P2 baseline dry-run — capture current buggy behavior**

Run:
```bash
echo '{"prompt":"opencli-rs YAML adapter 怎么加 LLM arena","cwd":"/Users/0xvox/claude-code-reimagine-for-learning"}' \
| node ~/.claude/hooks/evermem-multi-inject.mjs 2>&1 \
| tee /tmp/evermem-baseline.txt
```
Expected (buggy): stdout has an `additionalContext` JSON with ~5 memories (likely same-day session narratives); stderr contains a line `[evermem-multi-inject] keys=v0[,obs] ... merged=N injected=M verified=K`. Capture `N`, `M`, `K` values.

Append the full output to the scratch file under `## Post-Implementation Notes — Baseline (Task 0)`.

- [ ] **Step 5: No commit yet (setup only)**

This task is read-only + backup; no code changes. Skip commit.

---

## Task 1 — Change 1: `memory_types` whitelist expansion

**Files:**
- Modify: `~/.claude/hooks/evermem-multi-inject.mjs` (around line 78)

- [ ] **Step 1: Apply the edit**

Find this block (inside `searchOne`, `fetch(V1_SEARCH, { ... body: JSON.stringify({...` — should be near line 78):

```javascript
      body: JSON.stringify({
        query,
        method: 'hybrid',
        top_k: PER_FILTER_LIMIT,
        memory_types: ['episodic_memory'],
        filters,
      }),
```

Replace with:

```javascript
      body: JSON.stringify({
        query,
        method: 'hybrid',
        top_k: PER_FILTER_LIMIT,
        memory_types: ['episodic_memory', 'agent_memory'],
        filters,
      }),
```

**Note on enum:** `/memories/search` (this endpoint) enforces `memory_types ∈ {agent_memory, episodic_memory, profile, raw_message}`. The docs page for `/memories/get` lists different types (`agent_case`, `agent_skill`) — do NOT copy those here; they will 400. This was verified empirically in Task 0 Step 3.

- [ ] **Step 2: Syntax check**

Run:
```bash
node --check ~/.claude/hooks/evermem-multi-inject.mjs && echo "SYNTAX_OK"
```
Expected: `SYNTAX_OK`. If syntax error, restore from `/tmp/evermem-multi-inject-pre-fix-*.mjs` and retry.

- [ ] **Step 3: API acceptance check**

Re-run the Task 0 Step 3 curl probe (with corrected enum `['episodic_memory', 'agent_memory']`). Expected: HTTP 200 + non-empty `episodes`. If 400, capture the error message — likely indicates a new enum restriction; revert this task's edit and STOP.

- [ ] **Step 4: Dry-run no-regression check**

Run:
```bash
echo '{"prompt":"opencli-rs YAML adapter 怎么加 LLM arena","cwd":"/Users/0xvox/claude-code-reimagine-for-learning"}' \
| node ~/.claude/hooks/evermem-multi-inject.mjs 2>&1 \
| tee /tmp/evermem-task1.txt
```
Expected: stdout still has `additionalContext`; stderr still prints the `injected=` count. Count may equal baseline (threshold hasn't changed yet) — that is fine.

- [ ] **Step 5: Commit or note**

If `GIT_YES` (from Task 0):
```bash
( cd ~/.claude && git add hooks/evermem-multi-inject.mjs \
  && git commit -m "fix(evermem-hook): expand memory_types to include agent_case and agent_skill" )
```
If `GIT_NO`: write one line to the verify scratch — `- Task 1 applied at <timestamp>, backup at $BACKUP_PATH`.

---

## Task 2 — Changes 2 + 3: MIN_SCORE bump + fallback removal

**Files:**
- Modify: `~/.claude/hooks/evermem-multi-inject.mjs` (around line 17 and line 134)

- [ ] **Step 1: Apply Change 2 (MIN_SCORE = 0.35)**

Find:
```javascript
const MIN_SCORE = 0.05;
```

Replace with:
```javascript
const MIN_SCORE = 0.35;
```

- [ ] **Step 2: Apply Change 3 (remove fallback clause in rankAndTrim)**

Find (inside `rankAndTrim`, around line 134):
```javascript
  const scored = merged.filter(m => (m.score ?? 0) >= MIN_SCORE || merged.length <= MAX_INJECT);
```

Replace with:
```javascript
  const scored = merged.filter(m => (m.score ?? 0) >= MIN_SCORE);
```

- [ ] **Step 3: Syntax check**

Run:
```bash
node --check ~/.claude/hooks/evermem-multi-inject.mjs && echo "SYNTAX_OK"
```
Expected: `SYNTAX_OK`.

- [ ] **Step 4: Dry-run — compare injected count**

Run:
```bash
echo '{"prompt":"opencli-rs YAML adapter 怎么加 LLM arena","cwd":"/Users/0xvox/claude-code-reimagine-for-learning"}' \
| node ~/.claude/hooks/evermem-multi-inject.mjs 2>&1 \
| tee /tmp/evermem-task2.txt
```
Expected: stderr shows `injected=M'` where `M' < M` from Task 0 (threshold now biting). `injected=0` is acceptable at this stage because the group weighting (which rescues project-scope matches) comes in Task 3. Record `M'`.

- [ ] **Step 5: Commit or note**

If `GIT_YES`:
```bash
( cd ~/.claude && git add hooks/evermem-multi-inject.mjs \
  && git commit -m "fix(evermem-hook): raise MIN_SCORE to 0.35 and remove fallback bypass" )
```
If `GIT_NO`: note progress in verify scratch.

---

## Task 3 — Change 4: mergeEpisodes + rankAndTrim group weighting

**Files:**
- Modify: `~/.claude/hooks/evermem-multi-inject.mjs` (two function bodies: `mergeEpisodes` ~L94-124, `rankAndTrim` ~L132-141)

- [ ] **Step 1: Replace entire `mergeEpisodes` function body**

Find (this is the full current function — if any line differs, stop and re-read the file):

```javascript
function mergeEpisodes(results) {
  const byId = new Map();
  for (const r of results) {
    for (const ep of r.episodes) {
      if (!ep.id) continue;
      const sourceTag = `${r.key}@${filterTag(r.filters)}`;
      const existing = byId.get(ep.id);
      if (!existing) {
        byId.set(ep.id, { ep, sources: new Set([sourceTag]), keys: new Set([r.key]) });
      } else {
        existing.sources.add(sourceTag);
        existing.keys.add(r.key);
        const prevScore = existing.ep.score ?? 0;
        const newScore = ep.score ?? 0;
        if (newScore > prevScore) existing.ep = ep;
      }
    }
  }
  return [...byId.values()].map(({ ep, sources, keys }) => ({
    id: ep.id,
    text: ep.episode || ep.summary || '',
    subject: ep.subject || '',
    timestamp: ep.timestamp || '',
    score: ep.score ?? 0,
    user_id: ep.user_id,
    group_id: ep.group_id,
    sources: [...sources],
    keys: [...keys],
    verified: keys.size >= 2,
  }));
}
```

Replace with:

```javascript
function mergeEpisodes(results) {
  const byId = new Map();
  for (const r of results) {
    for (const ep of r.episodes) {
      if (!ep.id) continue;
      const sourceTag = `${r.key}@${filterTag(r.filters)}`;
      const matchedGroup = Boolean(r.filters?.group_id);
      const existing = byId.get(ep.id);
      if (!existing) {
        byId.set(ep.id, { ep, sources: new Set([sourceTag]), keys: new Set([r.key]), matchedGroup });
      } else {
        existing.sources.add(sourceTag);
        existing.keys.add(r.key);
        if (matchedGroup) existing.matchedGroup = true;
        const prevScore = existing.ep.score ?? 0;
        const newScore = ep.score ?? 0;
        if (newScore > prevScore) existing.ep = ep;
      }
    }
  }
  return [...byId.values()].map(({ ep, sources, keys, matchedGroup }) => ({
    id: ep.id,
    text: ep.episode || ep.summary || '',
    subject: ep.subject || '',
    memory_type: ep.memory_type || ep.type || 'episodic_memory',
    timestamp: ep.timestamp || '',
    score: ep.score ?? 0,
    weighted_score: (ep.score ?? 0) + (matchedGroup ? 0.2 : 0),
    user_id: ep.user_id,
    group_id: ep.group_id,
    sources: [...sources],
    keys: [...keys],
    matchedGroup,
    verified: keys.size >= 2,
  }));
}
```

- [ ] **Step 2: Replace entire `rankAndTrim` function body**

Find (post-Task 2 state):

```javascript
function rankAndTrim(merged) {
  // Sort: score desc primary, timestamp desc secondary. Drop very low scores when we have enough.
  const scored = merged.filter(m => (m.score ?? 0) >= MIN_SCORE);
  scored.sort((a, b) => {
    const s = (b.score ?? 0) - (a.score ?? 0);
    if (s !== 0) return s;
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });
  return scored.slice(0, MAX_INJECT);
}
```

Replace with:

```javascript
function rankAndTrim(merged) {
  // Sort: weighted_score desc primary (score + group_id boost), timestamp desc tiebreak.
  const scored = merged.filter(m => (m.score ?? 0) >= MIN_SCORE);
  scored.sort((a, b) => {
    const ws = (b.weighted_score ?? 0) - (a.weighted_score ?? 0);
    if (ws !== 0) return ws;
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });
  return scored.slice(0, MAX_INJECT);
}
```

- [ ] **Step 3: Syntax check**

Run:
```bash
node --check ~/.claude/hooks/evermem-multi-inject.mjs && echo "SYNTAX_OK"
```
Expected: `SYNTAX_OK`.

- [ ] **Step 4: Dry-run with project-scope prompt**

Run:
```bash
echo '{"prompt":"opencli-rs YAML adapter 怎么加 LLM arena","cwd":"/Users/0xvox/claude-code-reimagine-for-learning"}' \
| node ~/.claude/hooks/evermem-multi-inject.mjs 2>&1 \
| tee /tmp/evermem-task3.txt
```
Expected: `injected=M''` where `M''` may be ≥ `M'` from Task 2 (project-scope matches rescued by +0.2 boost). Injected content should contain more CCR/opencli-related records than Task 2's output.

- [ ] **Step 5: Commit or note**

If `GIT_YES`:
```bash
( cd ~/.claude && git add hooks/evermem-multi-inject.mjs \
  && git commit -m "fix(evermem-hook): add matchedGroup flag and weighted_score ranking" )
```

---

## Task 4 — Change 5: formatContext badges

**Files:**
- Modify: `~/.claude/hooks/evermem-multi-inject.mjs` (`formatContext` ~L143-155)

- [ ] **Step 1: Replace entire `formatContext` function body**

Find:

```javascript
function formatContext(memories) {
  if (!memories.length) return null;
  const lines = ['## Relevant Memories from EverMem'];
  for (const m of memories) {
    const when = m.timestamp ? m.timestamp.slice(0, 10) : 'unknown';
    const badge = m.verified ? ' ✓' : '';
    const src = m.sources.length > 1 ? ` [${m.sources.length}src]` : '';
    lines.push(`\n**${m.subject || '(untitled)'}** — ${when}${badge}${src}`);
    const snippet = (m.text || '').slice(0, 500).replace(/\s+/g, ' ').trim();
    if (snippet) lines.push(snippet + (m.text.length > 500 ? '…' : ''));
  }
  return lines.join('\n');
}
```

Replace with:

```javascript
function formatContext(memories) {
  if (!memories.length) return null;
  const lines = ['## Relevant Memories from EverMem'];
  for (const m of memories) {
    const when = m.timestamp ? m.timestamp.slice(0, 10) : 'unknown';
    const badge = m.verified ? ' ✓' : '';
    const src = m.sources.length > 1 ? ` [${m.sources.length}src]` : '';
    const typeTag = m.memory_type === 'agent_memory' ? ' [agent]' : '';
    const groupTag = m.matchedGroup ? ' [project]' : '';
    lines.push(`\n**${m.subject || '(untitled)'}** — ${when}${badge}${src}${typeTag}${groupTag}`);
    const snippet = (m.text || '').slice(0, 500).replace(/\s+/g, ' ').trim();
    if (snippet) lines.push(snippet + (m.text.length > 500 ? '…' : ''));
  }
  return lines.join('\n');
}
```

**Enum alignment note:** `[agent]` badge matches `agent_memory` (the learning-layer type that `/memories/search` actually returns). `[skill]`/`[case]` tags from the earlier draft referenced `/memories/get` types which our endpoint doesn't emit — removed for consistency with Task 1's enum correction. Currently `memory_type` field from server is `null`, so `[agent]` badge is dormant until `flush-agent-memories` populates it.

- [ ] **Step 2: Syntax check**

Run:
```bash
node --check ~/.claude/hooks/evermem-multi-inject.mjs && echo "SYNTAX_OK"
```
Expected: `SYNTAX_OK`.

- [ ] **Step 3: Dry-run — verify badges appear**

Run:
```bash
echo '{"prompt":"opencli-rs YAML adapter 怎么加 LLM arena","cwd":"/Users/0xvox/claude-code-reimagine-for-learning"}' \
| node ~/.claude/hooks/evermem-multi-inject.mjs 2>&1 \
| tee /tmp/evermem-task4.txt
grep -oE '\[skill\]|\[case\]|\[project\]|\[2src\]| ✓' /tmp/evermem-task4.txt | sort | uniq -c
```
Expected: at least one of these tags visible (most likely `[project]` given current project cwd); `[skill]` / `[case]` present IF Task 0 Step 3 confirmed learning-layer data; absence of `[skill]`/`[case]` is acceptable if server has no agent memories yet.

- [ ] **Step 4: Commit or note**

If `GIT_YES`:
```bash
( cd ~/.claude && git add hooks/evermem-multi-inject.mjs \
  && git commit -m "fix(evermem-hook): add memory_type and project badges to injected context" )
```

---

## Task 5 — P3 regression: three-prompt verification

**Files:**
- Append: `.claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md`
- Create (temp): `/tmp/evermem-post-fix-prompt-{A,B,C}.txt`

- [ ] **Step 1: Prompt A — project-scope recall**

Run:
```bash
echo '{"prompt":"R066-R070 benchmark 下一步怎么收敛","cwd":"/Users/0xvox/claude-code-reimagine-for-learning"}' \
| node ~/.claude/hooks/evermem-multi-inject.mjs 2>&1 \
| tee /tmp/evermem-post-fix-prompt-A.txt
```
Pass criteria:
- stderr `injected=` count ≥ 1
- At least one injected record mentions Evensong / benchmark / R066-R070 / Qwen / OR / CCR
- No unrelated session narratives (e.g. dash-shatter README / EverMem hook upgrade / OR key replacement) dominate the output

- [ ] **Step 2: Prompt B — control, zero-relevance topic**

Run:
```bash
echo '{"prompt":"how to set up a minecraft server with plugins","cwd":"/Users/0xvox/claude-code-reimagine-for-learning"}' \
| node ~/.claude/hooks/evermem-multi-inject.mjs 2>&1 \
| tee /tmp/evermem-post-fix-prompt-B.txt
```
Pass criteria:
- `injected=0` is ideal
- `injected=1` tolerable if the 1 record is a legitimate `[project]` match at high score
- `injected≥2` is a FAIL signal → MIN_SCORE may need adjusting down OR noise is systemic; record for follow-up

- [ ] **Step 3: Prompt C — learning-layer target**

Run:
```bash
echo '{"prompt":"evermem hook 注入优化 ranking","cwd":"/Users/0xvox/claude-code-reimagine-for-learning"}' \
| node ~/.claude/hooks/evermem-multi-inject.mjs 2>&1 \
| tee /tmp/evermem-post-fix-prompt-C.txt
```
Pass criteria:
- At least 1 injected record
- IF Task 0 Step 3 confirmed learning-layer data: ≥1 record with `[skill]` or `[case]` badge
- IF Task 0 Step 3 showed learning layer empty: ≥1 record with `[project]` badge (fallback — still proves project weighting works)

- [ ] **Step 4: Document results in verify scratch**

Append this section verbatim to `.claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md` and fill in the values:

```markdown
## Post-Implementation Notes — Task 5 Results

**Date:** <ISO timestamp>

| Metric | Baseline (Task 0) | Post-fix |
|--------|-------------------|----------|
| injected count (Prompt: opencli-rs YAML...) | N=..., injected=M=... | injected=... |
| injected count (Prompt A: R066-R070 benchmark) | N/A | injected=... |
| injected count (Prompt B: minecraft control) | N/A | injected=... |
| injected count (Prompt C: evermem hook) | N/A | injected=... |

**Badge distribution** (from Task 4 Step 3 + Task 5):
- [skill]: ...
- [case]: ...
- [project]: ...
- [2src]: ...

**Observations:**
- <any surprises>
- <whether MIN_SCORE 0.35 felt right>
- <whether learning layer had data>

**Status:** Implementation verified — fix is working / partial / rolling back.
```

- [ ] **Step 5: Commit or note**

If `GIT_YES` — the hook file is unchanged in this task; commit only affects the CCR project's verify file:
```bash
( cd /Users/0xvox/claude-code-reimagine-for-learning \
  && git add .claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md \
  && git commit -m "docs(verify): post-impl notes for evermem hook ranking fix" )
```

---

## Task 6 — Cleanup & final status

**Files:**
- Modify: `.claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md` (flip status)
- Delete (temp): `/tmp/evermem-task{0,1,2,3,4}.txt` and `/tmp/evermem-post-fix-prompt-*.txt`

- [ ] **Step 1: Flip verify scratch final Decision section**

Edit `.claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md`: in the `## Decision` section, append one line at the end:

```markdown
**Implementation:** COMPLETED 2026-04-18 — see docs/superpowers/plans/2026-04-18-evermem-hook-ranking-fix.md and Task 5 post-impl notes above.
```

- [ ] **Step 2: Residual noise log (only if Task 5 had failures)**

If Prompt B returned ≥2 injections OR Prompt A/C missed their targets, append a `## Residual Noise Log` section listing:
- What injected that shouldn't have
- Hypothesis: threshold too loose / group weighting too strong / hybrid scoring biased
- Proposed follow-up (e.g. adjust MIN_SCORE, enable Tier C topic-lock)

If everything passed, skip this step.

- [ ] **Step 3: Cleanup temp files**

Run:
```bash
# Keep the pre-fix backup IF GIT_NO (rollback material); otherwise remove
if [ -d ~/.claude/.git ]; then
  rm -f /tmp/evermem-multi-inject-pre-fix-*.mjs
  echo "backup removed (git covers rollback)"
else
  ls -la /tmp/evermem-multi-inject-pre-fix-*.mjs
  echo "backup kept — delete manually when you're confident fix is stable"
fi
rm -f /tmp/evermem-task[0-4].txt /tmp/evermem-post-fix-prompt-*.txt /tmp/evermem-baseline.txt
echo "temp probe outputs removed"
```

- [ ] **Step 4: Commit final status (if GIT_YES for CCR repo)**

```bash
( cd /Users/0xvox/claude-code-reimagine-for-learning \
  && git add .claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md \
  && git commit -m "docs(verify): mark evermem hook fix as completed" )
```

---

## Rollback Procedure

If any task fails in a way that leaves the hook broken (syntax error that escapes Step 2 checks, or user observes runtime breakage):

**If `GIT_YES`:**
```bash
( cd ~/.claude && git log --oneline hooks/evermem-multi-inject.mjs | head -10 )
( cd ~/.claude && git checkout HEAD~N hooks/evermem-multi-inject.mjs )  # N = commits to undo
```

**If `GIT_NO`:**
```bash
cp /tmp/evermem-multi-inject-pre-fix-*.mjs ~/.claude/hooks/evermem-multi-inject.mjs
node --check ~/.claude/hooks/evermem-multi-inject.mjs && echo "RESTORED"
```

Then restart Claude Code so the next UserPromptSubmit uses the restored hook.

---

## Self-Review (inline)

**1. Spec coverage:**

| Spec section | Task |
|--------------|------|
| Problem root cause 1 (MIN_SCORE 0.05 too loose) | Task 2 Step 1 |
| Problem root cause 2 (timestamp bias at equal score) | Task 3 Step 2 (weighted_score as primary; timestamp kept as explicit tiebreak per spec "保留当前行为") |
| Problem root cause 3 (memory_types hardcoded episodic) | Task 1 |
| Problem root cause 4 (fan-out no weight) | Task 3 Step 1 (matchedGroup flag + weighted_score +0.2) |
| Change 5 (badges) | Task 4 |
| Verification P1 (API probe) | Task 0 Step 3, Task 1 Step 3 |
| Verification P2 (dry-run) | Task 0 Step 4, Tasks 1-4 Step 4 each |
| Verification P3 (three-prompt regression) | Task 5 |
| Verification P4 (baseline comparison) | Task 0 Step 4 captures baseline; Task 5 Step 4 tabulates |
| Risks: agent_case/skill empty | Task 0 Step 3 handles detection; all subsequent passes tolerate |
| Risks: MIN_SCORE 0.35 too aggressive | Task 5 Step 2 Prompt B tests; Task 6 Step 2 logs residual for tuning |
| Risks: matchedGroup sticky | Spec diff + Task 3 Step 1 sticky OR (`if (matchedGroup) existing.matchedGroup = true`) |
| Risks: unknown memory_type server-side | Task 1 Step 3 detects via HTTP 400 + STOP |
| Rollback | Dedicated Rollback Procedure section |

No spec gaps.

**2. Placeholder scan:** No TBD / TODO / "implement later". Every code step shows the full function body or diff. Every bash step has expected output.

**3. Type consistency:**
- `matchedGroup`: introduced Task 3 Step 1 (both as Map value field and as returned object field), consumed Task 3 Step 2 via `weighted_score` (derived directly in Task 3 Step 1's map), and Task 4 Step 1 (`groupTag`). Consistent.
- `weighted_score`: defined Task 3 Step 1 return mapper; used Task 3 Step 2 `rankAndTrim` sort. Consistent.
- `memory_type`: normalized Task 3 Step 1 via `ep.memory_type || ep.type || 'episodic_memory'`; consumed Task 4 Step 1 (`typeTag` branching). Consistent.
- Existing identifiers (`MIN_SCORE`, `MAX_INJECT`, `verified`, `sources`, `keys`, `PER_FILTER_LIMIT`, `TIMEOUT_MS`) unchanged.
- Task 2 pre-replaces the fallback in the Change 3 filter; Task 3 Step 2 re-replaces `rankAndTrim` body wholesale based on the post-Task-2 state. The "Find" block in Task 3 Step 2 correctly reflects post-Task-2 state.

No inconsistencies.

---

**End of plan.**
