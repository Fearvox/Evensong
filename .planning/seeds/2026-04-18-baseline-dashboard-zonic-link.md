# SEED: R066-R070 Baseline dashboard segment + evensong.zonicdesign.art link

**Planted:** 2026-04-18T09:50 EDT by Claude Opus 4.7 + Nolan post-benchmark-ingest decision
**Type:** presentation / paper material
**Priority:** low-medium (data preserved in registry + CROSS-MODEL-REPORT.md; dashboard link is UX nicety)
**Surfaces when:** any trigger below fires

---

## Context

R066-R070 single-turn cross-model benchmark produced 5 valid cells (or-shot-v1 schema). Full data lives at:
- `benchmarks/evensong/registry.jsonl` — 5 rows with `registry_schema='or-shot-v1'`
- `benchmarks/evensong/R066-R070-CROSS-MODEL-REPORT.md` — narrative + strategy quadrant + 5 findings

Schema **intentionally NOT ingested** into main `index.html` (R011 Evolution timeline) because:
- `test_count` (grep-based, lite) ≠ `tests` (bun-test-passed, R011 semantic) — different units
- Hero "Tests Passed 18306" is cumulative `bun test` pass counts from R007-R064; adding 167 grep counts would be dimensional-error contamination
- Main timeline tells Self-Evolution story R007→R012→R064; single-turn cross-family is orthogonal narrative

## What this seed proposes

Create a **parallel baseline page** at `benchmarks/baseline.html` (+ `benchmarks/zh/baseline.html`) that:
1. Tables the 5 cells with or-shot-v1 fields (test_count, describe, expect, e/t, svc, chars, tps, cost, $-ROI)
2. Renders the strategy quadrant (breadth × depth ASCII or SVG)
3. Embeds Arena Code Elo cross-reference (Qwen 3.6 Plus 1305 / Kimi K2.5 4.2% weekly share / GLM 5.1 5.8%)
4. Has a banner clearly labeling: **"Orthogonal axis — single-turn cross-family. Not part of Self-Evolution timeline."**
5. Link back to main index.html and forward to CROSS-MODEL-REPORT.md

Then **main index.html footer adds one line**:
```
Explore orthogonal axis: <a href="/baseline.html">Single-Turn Cross-Model Baseline →</a>
```

Nothing in main index.html Hero/Stats/Evolution-timeline changes.

**External link**: publish baseline to `evensong.zonicdesign.art/baseline` (or `/cross-model`) alongside the existing promo page. User 2026-04-18 request: "link to evensong.zonicdesign.art".

---

## Trigger conditions (surface when)

1. **Paper draft section needs cross-family data** — reviewers ask "how do you know the R011 findings generalize?" → this baseline is the cross-family answer
2. **User wants to show investors the 5-cell quadrant visually** — current CROSS-MODEL-REPORT.md is markdown only
3. **R071+ new cross-model run** — if we accumulate 10+ single-turn cells, baseline page becomes its own dashboard
4. **DASH SHATTER main site adds "Explore all benchmarks" CTA** — natural place to link baseline
5. **evensong.zonicdesign.art gets a facelift** — include baseline page in restructure

## Implementation sketch

### Phase 1 (2h): static baseline.html
- Copy `index.html` structure, rip out Hero/Stats/Evolution sections, keep styles + header/footer
- Replace body with:
  - `<section class="banner">` — orthogonal-axis warning
  - `<section class="table">` — 5-row cells table, columns = schema fields + ROI
  - `<section class="quadrant">` — CSS/SVG 2D scatter (breadth x-axis, depth y-axis, 5 dots labeled)
  - `<section class="findings">` — the 5 findings from CROSS-MODEL-REPORT.md as cards
  - `<section class="arena">` — Arena Code Elo cross-ref table
  - `<footer>` — link back to index.html

### Phase 2 (1h): i18n
- `benchmarks/zh/baseline.html` — same structure, translated
- Rules: English product/model names, Chinese prose

### Phase 3 (30min): link up
- `benchmarks/index.html` footer — add baseline.html link
- `benchmarks/research.html` — brief mention in "Related" section
- Commit + Vercel deploy

### Phase 4 (30min): zonicdesign.art sync
- Mirror to `evensong.zonicdesign.art` at `/baseline` or `/cross-model`
- Repo: locate which `~/*` dir hosts evensong.zonicdesign.art (likely under dash-shatter or its own next project)

## Related files

- `benchmarks/evensong/R066-R070-CROSS-MODEL-REPORT.md` — content source
- `benchmarks/evensong/registry.jsonl` — data source (5 or-shot-v1 rows)
- `benchmarks/index.html` — style reference + footer link target
- `benchmarks/zh/index.html` — zh structure reference
- `.planning/seeds/2026-04-18-harness-openai-compat-branch.md` — B seed (complementary)
- `.planning/seeds/2026-04-18-openclaw-leaderboard-adapter.md` — C seed (complementary, auto-populates baseline Arena column)

## Cost estimate

- Phase 1-3: ~3.5h single-session work
- Phase 4: ~30min if zonic repo is known; longer if need to hunt its deploy repo
- No runtime cost (static HTML)

## Success criteria

1. `benchmarks/baseline.html` deployed, loads on `benchmarks-zeta.vercel.app/baseline.html`
2. Main index.html unchanged in Hero/Stats/Evolution (pure additive link)
3. `evensong.zonicdesign.art/baseline` (or `/cross-model`) mirror live
4. Reviewer or visitor can see "we have 2 axes of data: vertical (Self-Evolution) and horizontal (Cross-Model)" within 2 clicks
