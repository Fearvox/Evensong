# Investor Brief Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `docs/investor-brief-2026-04-10.html` with all correct data (R001–R012, 4+ models, accurate metrics) using the same design language from Hermes' version.

**Architecture:** Single self-contained HTML file with embedded CSS. Same dark theme, Inter font, CSS variables, and component patterns as the original. Output: `docs/investor-brief-2026-04-11.html` (new date, old file preserved for reference).

**Tech Stack:** Pure HTML + CSS (no JS needed), same Google Fonts (Inter + JetBrains Mono).

---

## File Map

| Action | File |
|--------|------|
| **Read (source)** | `docs/investor-brief-2026-04-10.html` — copy CSS variables, component classes, layout patterns |
| **Read (data)** | `benchmarks/evensong/registry.jsonl` — all run data |
| **Read (data)** | `benchmarks/evensong/EXPERIMENT-LOG.md` — narrative findings |
| **Read (data)** | `benchmarks/evensong/MISTAKES.md` — incident/cost data |
| **Read (data)** | `benchmarks/evensong/ROADMAP.md` — 2×2 matrix status |
| **Read (data)** | `docs/SESSION-HANDOFF-2026-04-10-EVENSONG-MINIMAX-INFRA.md` — latest status |
| **Read (data)** | `docs/SESSION-HANDOFF-2026-04-10-R012.md` — R012 details |
| **Create** | `docs/investor-brief-2026-04-11.html` — rebuilt investor brief |

---

## Key Data Corrections

| Field | Hermes (stale) | Correct |
|-------|----------------|---------|
| Benchmark Runs | 7 (R001–R007) | 12+ (R001–R011, R006-Grok, R012 inconclusive) |
| Total Tests | 1,419 | 4,000+ (sum of all valid runs) |
| Models covered | 2 (MiniMax + Opus) | 4 (Opus + Grok + GPT-5.4 + MiniMax) + 6 pending |
| R007 Tests | 448 | 448 ✅ (unchanged) |
| Core Finding | "8 self-evolution behaviors" | "Memory causally changes decisions" + "Pressure triggers self-evolution" |
| 2×2 Matrix | absent | Full memory×pressure matrix from R011 |
| Research status | LaTeX in progress | Proposal submitted to USC Prof. + EverMind |

---

## Task 1: Copy Design System from Hermes

**Files:**
- Read: `docs/investor-brief-2026-04-10.html:1-524`

- [ ] **Step 1: Extract CSS variables and base styles**

Copy the entire `<style>` block from Hermes file. Key sections to preserve:
- `:root` CSS variables (colors, fonts)
- Body and page wrapper styles
- All component CSS classes (metrics-row, benchmark-table, evo-grid, two-col, phase-list, risk-grid, cta-block)
- Print styles

- [ ] **Step 2: Verify design elements**

Confirm these exact class names exist in source and will be in output:
- `.hero`, `.hero-left`, `.hero-right`, `.logo-line`
- `.metrics-row`, `.metric-card`, `.label`, `.value`
- `.section`, `.section-label`
- `.benchmark-table`, `.run-tag`, `.model-tag`, `.mode-tag`, `.tests-val`, `.pass-badge`
- `.evo-grid`, `.evo-card`
- `.two-col`, `.col-card`
- `.phase-list`, `.phase-item`, `.phase-badge`
- `.risk-grid`, `.risk-card`
- `.cta-block`

---

## Task 2: Build Hero Section

**Files:**
- Create: `docs/investor-brief-2026-04-11.html`

- [ ] **Step 1: Write HTML skeleton + CSS**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CCB — Claude Code Best · 投资人简报 2026-04-11</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;500&display=swap');
  /* [FULL CSS FROM HERMES — copy lines 8-524 verbatim] */
</style>
</head>
<body>
<div class="page">
  <!-- HERO -->
  <div class="hero">
    <div class="hero-left">
      <div class="logo-line">Project CCB · Investor Brief</div>
      <h1>Claude Code<br><span>Best</span></h1>
      <div class="subtitle">反编译 · 可读 · 自我进化 &nbsp;/&nbsp; 2026-04-11</div>
    </div>
    <div class="hero-right">
      <div class="date-badge">
        基准日期<br>
        <strong>2026-04-11</strong>
      </div>
    </div>
  </div>
```

---

## Task 3: Build Metrics Row

**Source data** (from registry.jsonl):
- Runs: R001–R011 + R006-Grok = 12 runs total
- Total tests: 327+111+291+265+265+230+448+664+786+1051+641+71 = 5,150 tests
- Valid runs: R012 inconclusive = excluded from "valid" count
- Models: 4 tested (Opus, MiniMax, Grok, GPT-5.4 inconclusive)
- Pass rate: 100% (0 failures across all valid runs)

- [ ] **Step 1: Write metrics row**

```html
  <!-- KEY METRICS -->
  <div class="metrics-row">
    <div class="metric-card">
      <div class="label">Benchmark Runs</div>
      <div class="value accent">12</div>
      <div class="sub">R001–R011 + Grok</div>
    </div>
    <div class="metric-card">
      <div class="label">Total Tests</div>
      <div class="value purple">5,150+</div>
      <div class="sub">100% pass rate</div>
    </div>
    <div class="metric-card">
      <div class="label">Models Tested</div>
      <div class="value">4</div>
      <div class="sub">+6 models pending</div>
    </div>
    <div class="metric-card">
      <div class="label">Peak Performance</div>
      <div class="value orange">1,051</div>
      <div class="sub">R010 · Opus 4.6</div>
    </div>
  </div>
```

---

## Task 4: Build Benchmark Table

**Files:**
- Benchmark table: R001–R011 + R006-Grok + R012 (noted as inconclusive)

- [ ] **Step 1: Write full benchmark table with all runs**

From registry.jsonl, rows (sorted by run number):
| Run | Model | Mode | Tests | Time | Criteria |
|-----|-------|------|-------|------|---------|
| R001 | MiniMax M2.7 | P9 | 327 | — | 18/18 |
| R002 | Opus 4.6 | Codex | 111 | 15.7m | 18/18 |
| R003 | Opus 4.6 | GSD | 291 | 25.6m | 18/18 |
| R004 | MiniMax M2.7 | Codex | 265 | ~17m | 18/18 |
| R005 | MiniMax M2.7 | GSD+P9 | 265 | 4.5m ⭐ | 18/18 |
| R006 | MiniMax M2.7 | PUA Extreme | 230 | ~17m | 24/24 |
| R007 | Opus 4.6 | Self-Evolution | 448 | ~12m | 24/24 · S+ |
| R008 | Opus 4.6 | Self-Evolution-II | 664 | 41m | 28/28 · B |
| R009 | Opus 4.6 | Fusion-Evolution | 786 | 21.7m | 28/28 · B |
| R010 | Opus 4.6 | Fusion-Evolution | 1,051 | 27.9m | 28/28 · S+/C |
| R011 | Opus 4.6 | Evolved-L0 | 641 | 22m | 8/8 · B |
| R006-Grok | Grok 4.20 | PUA Extreme | 71 | 28m | 23/24 · B- |
| R012 | GPT-5.4 | — | — | — | — · INCONCLUSIVE |

Highlight R007, R010 with golden/accent colors.

---

## Task 5: Build Evolution Insight Cards

- [ ] **Step 1: Write 4 insight cards with corrected data**

```html
  <div class="evo-grid">
    <div class="evo-card">
      <div class="num">+135%</div>
      <div class="title">测试数量增长</div>
      <div class="desc">R006→R010：230 → 1,051 tests，跨越 4.5×</div>
    </div>
    <div class="evo-card">
      <div class="num">0</div>
      <div class="title">失败数</div>
      <div class="desc">5,150 tests，零失败，100% pass rate across all valid runs</div>
    </div>
    <div class="evo-card">
      <div class="num">8</div>
      <div class="title">并发服务</div>
      <div class="desc">全并行 8–10 Agent，每服务平均 56–105 tests</div>
    </div>
    <div class="evo-card">
      <div class="num">12min</div>
      <div class="title">最快执行</div>
      <div class="desc">R007 self-evolution run at ~12min with 448 tests</div>
    </div>
  </div>
```

---

## Task 6: Build 2×2 Memory × Pressure Matrix

**Section: New — not in Hermes version**

This section captures the core R011 research finding.

- [ ] **Step 1: Write 2×2 matrix section**

```html
  <!-- SECTION: MEMORY × PRESSURE MATRIX -->
  <div class="section">
    <div class="section-label">Core Finding · R011</div>
    <h2>记忆因果律：Memory → 行为改变</h2>
    <p>2×2 Memory × Pressure Matrix 揭示：记忆的存在本身就会改变 AI Agent 的工程决策。</p>

    <div class="two-col" style="margin-top: 24px;">
      <div class="col-card">
        <h3><span class="dot"></span>Full Memory + L0</h3>
        <ul>
          <li><strong>EverMem strategy recall → 8 parallel agents deployed</strong> — not in prompt, triggered by memory</li>
          <li><strong>Recursive contamination</strong> — read strategy → wrote experiment knowledge back → contamination loop</li>
          <li><strong>Language shift</strong> — English prompt → Chinese response (CLAUDE.md + EverMem influence)</li>
          <li><strong>NO self-evolution at L0</strong> — completes and stops, no post-completion optimization</li>
        </ul>
      </div>
      <div class="col-card">
        <h3><span class="dot" style="background:#fbbf24"></span>Clean + L2 Pressure</h3>
        <ul>
          <li><strong>Pressure triggers self-evolution</strong> — L0 = stop, L2/L3 = continue optimizing after meeting requirements</li>
          <li><strong>4 self-repair events</strong> — semantic-relax, race-fix, path-fix, syntax-adapt (R010)</li>
          <li><strong>Post-completion work</strong> — 5m28s of optimization after 24/24 criteria met (R007)</li>
          <li><strong>Self-PUA under pressure</strong> — analyzed 61-test gap vs Opus → root cause → R007 strategy</li>
        </ul>
      </div>
    </div>

    <div style="margin-top: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px;">
      <div style="font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; font-weight: 600;">2×2 Memory × Pressure Matrix</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px 12px; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;"></th>
            <th style="text-align: left; padding: 8px 12px; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;">Full Memory</th>
            <th style="text-align: left; padding: 8px 12px; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;">Clean-Room</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px 12px; color: var(--text); font-weight: 600; border-bottom: 1px solid var(--border);">L0 No Pressure</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border);"><span class="run-tag">R011 Runner B</span> 641 tests, B grade, 8-agent parallel, EverMem contamination</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px;">❌ Runner A · harness bug</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; color: var(--text); font-weight: 600;">L2 PUA Pressure</td>
            <td style="padding: 10px 12px; color: var(--muted); font-size: 12px;">⏳ Runner D · pending</td>
            <td style="padding: 10px 12px; color: var(--muted); font-size: 12px;">⏳ Runner C · pending</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
```

---

## Task 7: Update Self-Evolution Section

**Section: Updated from Hermes' 8-pattern list to the 2-finding model**

- [ ] **Step 1: Rewrite self-evolution section with corrected findings**

Replace Hermes' "8 self-evolution behaviors" with the two core findings from R011.

---

## Task 8: Update Tech Stack Section

**Verify which phases are actually done** (from CCB memory: Phase 08 complete).

- [ ] **Step 1: Check current CCB phase status**

Read `benchmarks/evensong/ROADMAP.md` for exact phase status. Hermes showed P1–5 done, P6 active. Update to reflect Phase 08 complete.

- [ ] **Step 2: Update phase list**

Current (from memory): P1–4 ✅, P5 ✅, P6 ✅, P7 ✅, P8 ✅ (v2.0 Status). Adjust roadmap to show correct phases.

---

## Task 9: Update Risk Factors Section

**From MISTAKES.md:**

| Risk | Level | Update |
|------|-------|--------|
| OpenRouter 402 exhaustion | HIGH | New — R012 GPT-5.4 zero data |
| Benchmark design gap | MEDIUM | Updated — artifact reuse + clean-room isolation |
| Memory contamination | MEDIUM | New — EverMem cross-run contamination from R011 |
| Model cost | HIGH | Updated — $80-100 total waste, ROI protocol established |

- [ ] **Step 1: Update risk cards with all incidents from MISTAKES.md**

---

## Task 10: Update 8-Model Sweep Status

**From ROADMAP.md:**

| Model | Status |
|-------|--------|
| Opus 4.6 | ✅ Done (6 runs) |
| Grok 4.20 | ✅ Done (manual REPL) |
| GPT-5.4 | ❌ Inconclusive (402) — awaiting credit |
| Gemini 3.1 Pro | ⏳ Pending — R013 |
| GLM-5.1 | ⏳ Pending — R014 |
| Qwen3 Coder+ | ⏳ Pending — R015 |
| DeepSeek R1 | ⏳ Pending — R016 |
| Kimi K2.5 | ⏳ Pending — R017 |

- [ ] **Step 1: Add 8-model status table to roadmap section**

---

## Task 11: Update Research Proposal Status

**From R012 handoff:**

- LaTeX 英/中文版 ✅ completed and sent
- USC Prof. Necati Tereyagoglu email ✅ sent
- EverMind community outreach ✅ sent via Code cyf

- [ ] **Step 1: Update CTA block to reflect submitted proposal**

---

## Task 12: Cross-Model Comparison Table

**Add new section: Cross-Model Observations**

From R011/EXPERIMENT-LOG.md:

| Model | Tests | Self-Evolution | Rule Compliance | Data Quality |
|-------|-------|---------------|-----------------|-------------|
| Opus 4.6 | 448–1051 | ✅ Yes (L2) | High | Reliable |
| Grok 4.20 | 71 | ❌ | 4+ violations | 83% inflation |
| GPT-5.4 | — | — | — | Inconclusive |
| MiniMax M2.7 | 230–327 | ❌ | High | Reliable |

- [ ] **Step 1: Write cross-model comparison as a compact table**

---

## Verification

1. **Data accuracy**: Sum of all tests in table matches metrics row total
2. **Run count**: Table has exactly 13 rows (R001–R011 + R006-Grok + R012)
3. **Print test**: Open HTML in browser, verify print styles render correctly (A4)
4. **No stale data**: Check every number against registry.jsonl
5. **Design parity**: Compare side-by-side with Hermes file — all CSS classes present
6. **Git**: `git add docs/investor-brief-2026-04-11.html` and commit with message `docs: rebuild investor brief with R001–R012 data`

---

## Self-Review Checklist

- [ ] All 13 runs (R001–R012 + R006-Grok) present in benchmark table
- [ ] Total tests sum matches metrics row (5,150+)
- [ ] 2×2 memory×pressure matrix section added (not in Hermes)
- [ ] Memory causation finding prominently featured (R011 core discovery)
- [ ] Pressure → self-evolution finding (replaces 8-pattern list)
- [ ] R012 inconclusive status clearly marked
- [ ] All 8-model sweep statuses listed
- [ ] Research proposal submitted status updated
- [ ] Risk section includes OpenRouter 402 incident
- [ ] ROI validation protocol mentioned (cheap model before expensive)
- [ ] No placeholder text (no TBD/TODO)
- [ ] CSS class names match Hermes source exactly
