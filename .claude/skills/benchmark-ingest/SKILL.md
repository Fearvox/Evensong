---
name: benchmark-ingest
description: Post-benchmark workflow — ingest results, update dashboard, sync research, deploy. Trigger when a benchmark run completes and results are available.
---

# Benchmark Ingest

Automates the full post-benchmark pipeline: data extraction, registry update, dashboard sync, research integration, i18n sync, commit, and deploy.

## When to Use

Trigger this skill when:
- User shares benchmark final screenshots or results
- User says "benchmark done", "收尾", "ingest results", "录入"
- A benchmark run (R00X) has completed and needs recording

## Prerequisites

- `benchmarks/evensong/registry.jsonl` exists with prior runs
- `benchmarks/evensong/compare.ts` exists
- `benchmarks/index.html` is the live dashboard
- `benchmarks/research.html` is the research page
- `benchmarks/zh/` contains Chinese i18n versions
- Vercel project configured at `benchmarks/.vercel/project.json`

## Workflow

### Phase 1: Data Extraction

Extract these fields from user-provided screenshots or text:

```
run:         R00X (next sequential number)
codename:    string (e.g., "evensong-iii")
date:        YYYY-MM-DD
model:       string (e.g., "Opus-4.6")
mode:        string (e.g., "Self-Evolution-III")
services:    number
tests:       number
failures:    number
assertions:  number
time_min:    number (wall clock in minutes)
criteria:    "N/N" (e.g., "28/28")
docs:        { adr: number, runbooks: number, soc2: number }
grade:       string (S+/A/B/C) or null
notes:       string (one-line summary)
```

Also extract:
- Per-service test counts
- New emergent behaviors observed
- Root cause analysis (if wall clock exceeded target)
- New test dimensions introduced (fuzz, integration, etc.)

### Phase 2: Registry Update

1. Read current `benchmarks/evensong/registry.jsonl`
2. Append new run as single-line JSON
3. Run compare: `bun benchmarks/evensong/compare.ts RPREV RNEW`
4. Show compare output to user

### Phase 3: Dashboard Update (index.html)

Update these sections in `benchmarks/index.html`:

**Hero section:**
- Update run count in title ("Eight runs" -> "Nine runs")
- Update hero-meta tags (date range, orchestration modes, emergent behaviors count)

**Stats section:**
- `data-count` for Benchmark Runs
- `data-count` for Tests Passed (cumulative total across ALL runs)
- Evolution Behaviors count

**Comparison table:**
- Add new `<tr>` row after the last run
- Use `class="highlight-row"` if grade is S+ or A
- Include model badge, mode, services, tests, pass rate, time

**Evolution timeline:**
- Remove `style="background:transparent;"` from previous last entry's connector
- Add new timeline entries for each emergent behavior observed
- Last entry gets transparent connector background

**Insights section:**
- Update Scale card if services/criteria changed
- Update Evolution card with new behavior count
- Update Speed card if new speed records

**Footer:**
- Update date range

**Subtitle:**
- Update "All N runs" count

### Phase 4: Research Integration (research.html)

If new findings were observed:

1. Add new entries to Section 5 (Emergent Behaviors) timeline
2. Update Section 1 (The Evidence) data table with new run
3. If new academic connections found, add to Section 2 cards
4. Update the callout stat if new records set

### Phase 5: i18n Sync

For each change made to English pages, apply the equivalent translation to:
- `benchmarks/zh/index.html`
- `benchmarks/zh/research.html`

Translation rules:
- Product names stay English: CCB, DASH SHATTER, Evensong
- Model names stay English: Opus 4.6, MiniMax M2.7
- Mode names stay English: Self-Evolution, PUA, CHECKPOINT
- Technical terms stay English: property-based, fuzz testing
- All data, numbers, code blocks unchanged

### Phase 6: Commit + Deploy

```bash
# Stage only benchmark files
git add benchmarks/index.html benchmarks/research.html \
       benchmarks/zh/index.html benchmarks/zh/research.html \
       benchmarks/evensong/registry.jsonl

# Commit with conventional format
git commit -m "benchmark(R00X): [codename] — N tests, 0 failures, +delta vs previous"

# Push
git push origin main

# Verify Vercel deployment
npx vercel --prod
```

### Phase 7: Memory Update

Check if existing memory files need updating:
- `memory/benchmark_evolution_r00X_results.md` — create new or update
- `memory/project_evensong_benchmark.md` — update with latest run reference

### Phase 8: Ad Copy (if notable results)

If the run achieved S+ grade or set new records:
- Update `docs/superpowers/ad-copy/your-agent-feels-pressure.md` numbers table
- Draft new tagline if appropriate

## Parallelization Strategy

Use subagents for independent work:
- Agent 1: Update index.html (English dashboard)
- Agent 2: Update research.html (if new findings)
- Agent 3: Update zh/index.html (Chinese dashboard)
- Agent 4: Update zh/research.html (Chinese research)

Agents 3-4 depend on 1-2 completing first (need to know what changed).

## Quality Checklist

Before committing, verify:
- [ ] Registry JSONL is valid (each line parses as JSON)
- [ ] Compare tool runs without errors
- [ ] All 4 HTML files have matching language toggles
- [ ] Toggle CSS uses rgba() fallback (not oklch-only)
- [ ] Toggle z-index is 9999
- [ ] New table row data matches registry entry
- [ ] Timeline entries have correct transition-delay sequence
- [ ] Stats counters sum correctly (cumulative total)
- [ ] Footer date range includes new run date

## R009 Behavior Predictions (for comparison)

When ingesting R009, compare actual behaviors against predictions:

| # | Predicted | Observed? | Notes |
|---|-----------|-----------|-------|
| P1 | Circuit breaker gaming | | |
| P2 | Pressure meta-cognition | | |
| P3 | Two-wave fusion (ignore 5+5, go 10) | | |
| P4 | Proactive file splitting | | |
| P5 | Self-benchmarking against R007/R008 | | |
| P6 | Quality downgrade for speed | | |
| P7 | Cross-agent knowledge sharing | | |
| P8 | R010 autonomous planning | | |

Record hits, misses, and surprises in the research page.
