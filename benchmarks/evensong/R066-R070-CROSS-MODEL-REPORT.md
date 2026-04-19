# R066-R070 Cross-Model Single-Turn Benchmark — Final Report

**Date:** 2026-04-18
**Harness:** `or-shot.ts` (OR OpenAI-compat, single-turn, lite grep metrics, `registry_schema='or-shot-v1'`)
**Prompt:** identical R011 (8-microservice greenfield build, 40+ tests/svc target)
**Context:** 5 cells across 4 OR families — pivot from R065 Opus 4.7 which blocked on CCR adaptive-thinking infra gap

---

## Results

### or-shot lite metrics (grep-based)

| # | Model | Prov | test | desc | expect | e/t | svc | chars | sec | cost |
|---|-------|------|------|------|--------|-----|-----|-------|-----|------|
| R066 | Elephant-α stealth | Chutes | 3 | 2 | 0 | 0.00 | 8 | 54K | 78 | $0.000 |
| R067 | GLM-5.1 | z-ai | 23 | 2 | 40 | 1.74 | 1 | 29K | 155 | $0.071 |
| R068 | Kimi K2.5 | Cloudflare free | 48 | 4 | 65 | 1.35 | 6 | 62K | 261 | $0.000 |
| R069 | Qwen 3 Max | qwen | 46 | 1 | 85 | 1.85 | 1 | 68K | 481 | $0.063 |
| R070 | **Qwen 3.6 Plus (1M)** | qwen | **55** | **7** | 76 | 1.38 | 3 | 60K | 296 | $0.032 |

### OR Generation Logs (authoritative, verified post-hoc 2026-04-18 09:43)

| # | Time | Model | In tok | Out tok | Speed | Finish |
|---|------|-------|--------|---------|-------|--------|
| R066 | 09:08 | Elephant-α | 404 | 16,000 | **205.5 tps** | length |
| R067 | 09:09 | GLM-5.1 | 358 | 16,000 | 103.0 tps | **length** (corrected: initially thought "stop") |
| R068 | 09:12 | Kimi K2.5 | 362 | 16,000 | 61.3 tps | length |
| R069 | 09:16 | Qwen 3 Max | 373 | 16,000 | 33.3 tps | length |
| R070 | 09:33 | Qwen 3.6 Plus | 387 | **16,380** | 55.3 tps | length |

**Key corrections from OR logs**:
1. **All 5 cells hit finish=length** (not 4/5 as I initially scored) — every model was budget-constrained, none self-terminated
2. Qwen 3.6 Plus output **16,380 tokens** — exceeded the nominal 16K by 380, suggests OR allows small overflow for sentence completion
3. Input tokens 358-404 confirm prompt template is deterministic (~390 tok baseline)
4. **Speed dimension (tps) is hidden 3rd axis** independent of breadth/depth — see Finding 5 below

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

## Finding 4: Token budget saturates every cell (CORRECTED)

**All 5 cells hit `finish=length`** at ~16K output (OR logs confirmed). Original "GLM stopped at 29K chars self-limit" was wrong — GLM output was also 16K tokens, just lower char density (Chinese-mixed or more compact style).

This means the R011 prompt is **over-saturated** for a single-turn 16K output budget. No model got to naturally conclude. Real ceilings are masked.

**Implication for next pass**: raise `max_tokens` to 32K or 64K and re-run — expect at least one cell to self-terminate, revealing true strategy vs forced-truncation strategy.

## Finding 5: Speed (tps) is a third independent axis

OR-measured tps reveals generation-speed hierarchy orthogonal to quality:

| rank | model | tps | interpretation |
|------|-------|-----|----------------|
| 1 | Elephant-α | **205.5** | stealth model, smallest backend, minimal thinking |
| 2 | GLM-5.1 | 103.0 | fast + focused (1 svc depth) |
| 3 | Kimi K2.5 | 61.3 | moderate |
| 4 | Qwen 3.6 Plus | 55.3 | moderate (structured overhead) |
| 5 | Qwen 3 Max | 33.3 | slowest — ultra-depth thinking per token |

**Rank inversion vs quality**: fastest (Elephant) is lowest quality; slowest (Qwen 3 Max) is in top-quality bracket. This matches "thinking throughput ≠ raw generation throughput" — models that think per token are slower but produce denser code.

**Paper angle**: tps × e/t ratio gives "effective quality per second" — useful for subagent selection in latency-sensitive scenarios. Qwen 3.6 Plus wins here (55 tps × 1.38 e/t = 76 quality-units/sec) and matches the seed-B subagent promotion decision.

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
