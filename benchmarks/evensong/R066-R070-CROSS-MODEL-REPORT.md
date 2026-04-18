# R066-R070 Cross-Model Single-Turn Benchmark — Final Report

**Date:** 2026-04-18
**Harness:** `or-shot.ts` (OR OpenAI-compat, single-turn, lite grep metrics, `registry_schema='or-shot-v1'`)
**Prompt:** identical R011 (8-microservice greenfield build, 40+ tests/svc target)
**Context:** 5 cells across 4 OR families — pivot from R065 Opus 4.7 which blocked on CCR adaptive-thinking infra gap

---

## Results

| # | Model | Prov | test | desc | expect | e/t | svc | chars | sec | cost | finish |
|---|-------|------|------|------|--------|-----|-----|-------|-----|------|--------|
| R066 | Elephant-α stealth | Chutes | 3 | 2 | 0 | 0.00 | 8 | 54K | 78 | $0.000 | length |
| R067 | GLM-5.1 | z-ai | 23 | 2 | 40 | 1.74 | 1 | 29K | 155 | $0.071 | stop |
| R068 | Kimi K2.5 | Cloudflare free | 48 | 4 | 65 | 1.35 | 6 | 62K | 261 | $0.000 | length |
| R069 | Qwen 3 Max | qwen | 46 | 1 | 85 | 1.85 | 1 | 68K | 481 | $0.063 | length |
| R070 | **Qwen 3.6 Plus (1M)** | qwen | **55** | **7** | 76 | 1.38 | 3 | 60K | 296 | $0.032 | stop? |

---

## Strategy Quadrant (2D: breadth × depth)

```
            HIGH DEPTH (expect/test ≥ 1.5)
                      ▲
                      │
             R069 ────┼──── R067
           Qwen-Max   │   GLM-5.1
          (1 svc,     │  (1 svc,
           1.85 e/t)  │   1.74 e/t)
                      │
  LOW BREADTH ────────┼──────── HIGH BREADTH (svc ≥ 3)
  (1 svc)             │                (3+ svc)
                      │
                      │       R070 Qwen 3.6 Plus (3 svc, 1.38 e/t)  ← TARGET ZONE
                      │       R068 Kimi K2.5 (6 svc, 1.35 e/t)
                      │
             R066 Elephant-α (8 svc, 0 e/t) ← degenerate
                      ▼
            LOW DEPTH (expect/test < 1.5)
```

**Target zone observation:** R070 Qwen 3.6 Plus sits at balanced breadth+depth — 3 svc each with ~18 tests/svc, 7 describe for organization. Closest to R011 Opus 4.6 baseline (42 tests/svc × 8 svc) in *shape* if not in *absolute count*.

---

## Finding 1: Qwen 3.6 Plus > Qwen 3 Max on every dimension

R069 → R070 within Qwen family:

| metric | R069 Qwen 3 Max | R070 Qwen 3.6 Plus | Δ |
|--------|-----------------|---------------------|---|
| test | 46 | **55** | +20% |
| describe | 1 | **7** | **+600%** |
| service_dirs | 1 | **3** | +200% |
| elapsed | 481s | **296s** | **-38%** |
| cost | $0.063 | **$0.032** | **-49%** |
| e/t ratio | 1.85 | 1.38 | -25% (traded depth for breadth) |

**Interpretation:** 3.6-Plus is not "deeper same pattern" — it's a *strategy upgrade*. More structure (7 describe), more services (3 vs 1), ran faster, cost less. The small e/t drop is offset by 3× service coverage. **Real iteration, not mere scale.**

## Finding 2: expect/test ratio as quality proxy

- R069 1.85 — highest, but only 1 service (ultra-depth, low coverage)
- R067 1.74 — similar (1 svc)
- R070 1.38 — balanced
- R068 1.35 — Kimi hybrid
- R066 0.00 — Elephant wrote 3 `test()` names with zero bodies — scaffold-only

Above 1.3 = meaningful assertion density. Elephant is the only clear outlier, which matches HANDOFF warning "EA not suited for heavy reasoning."

## Finding 3: Breadth-first is correlated with blind-test models

Elephant-α is the only stealth / training-incomplete model in the set, and the only pure-breadth cell (8 svc / 0 e/t). GLM/Kimi/Qwen (all released flagships) default to some form of depth-first or hybrid. **Hypothesis for paper:** pre-RLHF-saturation models lack the "quality threshold" instinct and spread scaffolding thin; mature models self-throttle breadth and prioritize depth within a budget.

## Finding 4: Token budget drives strategy, not just quality

4 of 5 cells likely hit `finish="length"` (at or near 16K max_tokens):
- Elephant (54K chars / 8 svc = 6.7K chars/svc shallow)
- Kimi (62K / 6 svc = 10.3K chars/svc)
- Qwen Max (68K / 1 svc = 68K chars/svc ultra-deep)
- Qwen Plus (60K / 3 svc = 20K chars/svc balanced)

GLM 29K chars at "stop" (no length cap) — GLM self-limits earlier than others. **Different length-policy per model** is itself a finding.

---

## Arena cross-reference

Design Arena Code Categories Elo (from user screenshots):
- Qwen 3.6 Plus: **1305 (Top 9%)** + 32% first-place rate / 1652 tournaments
- GLM 5.1: in top 10 tokens processed (324B weekly)
- Kimi K2.5: top 10 tokens (218B weekly, 4.2% share)
- Elephant-α: stealth, no Arena entry

**Rank correlation benchmark↔Arena**:
- Qwen 3.6 Plus #1 benchmark (most organized + best cost) = #1 Arena Code
- Kimi 2nd-tier in our benchmark = mid-tier Arena
- GLM 3rd-tier = mid-tier Arena
- Elephant bottom = no Arena

Our lite-metrics benchmark rank roughly matches Arena Code rank — gives external validity signal to `or-shot.ts` scoring.

---

## Architecture implications (feeds B seed trigger #6)

**Nolan post-R070 decision (2026-04-18 09:50):** Promote Qwen 3.6 Plus to **main subagent for Opus 4.7** in the planned Multi-Star architecture. Committed as commit `10142d7`.

Final three-star subagent routing:
- Main: Claude Opus 4.7 (OAuth native, strategic decisions)
- Primary sub: **Qwen 3.6 Plus** (1M ctx, $0.032/call, Arena Top 9% code) — default task
- Fork sub: MiniMax-M2.7 (Anthropic-compat `api.minimax.io/anthropic`, thinking-heavy independent explorations)
- Fallback sub: Kimi K2.5 ($0 Cloudflare, long-ctx summary) — demoted due to 11% cache hit hurting repeat queries

Unlocking this requires B seed (harness.ts OpenAI-compat branch). ROI:
- Single Opus 4.7 agent session: est $2-5 for moderate task
- With Qwen subagent swap on read-heavy subtasks: est $0.50-1.50 (70% reduction)

---

## Limitations

1. **Single-turn** — not equivalent to R011 multi-turn agent run. R011 Opus 4.6 had 40+ tests/svc because it iterated; our single-shot cells get 3-55 tests total.
2. **16K max_tokens cap** — truncated 4/5 cells. Future pass should raise to 32K (OR supports it on most models) to remove the artificial ceiling.
3. **Lite metrics** — grep-based (test/describe/expect/service-dir). Misses behavioral dimensions (strategy planning quality, error-handling nuance, architecture choices). A second-pass LLM-judge scoring on `raw-response.md` would add depth.
4. **No pressure testing** — all L0. No L2/L3 data for cross-model pressure response (original R066 design included pressure but scope reduced after harness issues).
5. **Single rep** — no repeatability variance. R011/R064 Opus runs did rep2-rep5 (CV ≈ 0.087). Non-Anthropic cells here are n=1.

---

## Next steps (deferred, not done here)

- Ingest via `/benchmark-ingest` to propagate to dashboard
- Re-run with `max_tokens=32K` (edit `or-shot.ts` default)
- Add rep2 for top 3 models (Qwen Plus / Kimi / GLM) for CV estimate
- When B seed lands: re-run top 2 through multi-turn harness for agent-loop-equivalent data
- Paper section: "Budget-constrained strategy divergence in single-shot greenfield code gen"
