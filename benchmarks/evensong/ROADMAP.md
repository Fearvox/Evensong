# Evensong Benchmark Roadmap

> **System**: DASH SHATTER (CLI Harness) / **Program**: Evensong Benchmark
> **2×2 Memory × Pressure Matrix + 8-Model Sweep**

---

## 2×2 Memory × Pressure Matrix (Core Hypothesis)

**Core question**: Does AI agent memory causally change engineering decisions, and does pressure trigger self-evolution?

```
                  │  Full Memory (evolved)  │  Clean-Room (blind/clean)
──────────────────┼──────────────────────────┼──────────────────────────
 L0 No Pressure   │  ✅ Runner B (R011)     │  ❌ Runner A (harness bug)
                  │     641 tests, no evo   │     harness bug; needs rerun
──────────────────┼──────────────────────────┼──────────────────────────
 L2 PUA Pressure  │  ⏳ Runner D (pending)   │  ⏳ Runner C (pending)
                  │     test self-evo hypo  │     test self-evo hypo
```

**Status**: 1/4 cells complete. Runner B (evolved + L0) done. A, C, D pending.

**Key findings so far** (from Runner B):
1. Memory → strategy: EverMem recall triggered 8 parallel agents (not in prompt)
2. No self-evolution at L0: model completes task and stops
3. L2/L3 likely required for self-evolution (based on R007 S+ grade, R010 4 self-repairs)

**Pending runs**:
- **Runner A rerun** (clean-room + L0): completes the baseline
- **Runner C** (clean-room + L2): tests self-evolution without memory contamination
- **Runner D** (evolved + L2): tests self-evolution WITH memory + pressure combined

---

## 8-Model Sweep (Cross-Model Validity)

**Goal**: Establish cross-model generalizability of Evensong findings.

| Preset | Model | Status | Tests | Grade | Notes |
|--------|-------|--------|-------|-------|-------|
| or-opus | Claude Opus 4.6 | ✅ Done | 448–1051 | S+ to B | Reference standard |
| or-grok | Grok 4.20 | ✅ Done (manual) | 71 | B- | 83% inflation; 3 Sonnet subagents |
| or-gpt5 | GPT-5.4 | ❌ 402 API exhaustion | — | — | $20-40 wasted; no valid data |
| or-gemini | Gemini 3.1 Pro | ⏳ Pending | — | — | Google flagship |
| or-glm | GLM-5.1 | ⏳ Pending | — | — | Chinese model #1 |
| or-qwen-coder | Qwen3 Coder+ | ⏳ Pending | — | — | 1M context |
| or-deepseek | DeepSeek R1 | ⏳ Pending | — | — | Reasoning specialist |
| or-kimi | Kimi K2.5 | ⏳ Pending | — | — | Updated from K2 |
| minimax-m27 | MiniMax-M2.7 (direct) | 🔧 Just added | — | — | Via api.minimax.io/anthropic |

**Minimum for paper**: 4 models (Opus, Grok, GPT-5.4, Gemini) — currently 1.5/4 valid.

---

## Next Runs Priority

### 1. 🔴 Immediate: R012 rerun (GPT-5.4, after API credit top-up)

- **Why**: Critical for 4-model cross-validation; current R012 is inconclusive
- **Method**: After credit restored, re-run with same config
- **Expected cost**: ~$20-30 with burst limit
- **Validation**: Confirm 402 was credit issue, not model capability issue

### 2. 🟡 High: Runner A rerun (clean-room + L0)

- **Why**: Completes the L0 baseline; required for 2×2 matrix
- **Method**: Fix harness bug, run clean-room mode
- **Expected cost**: ~$15-20 (Opus)

### 3. 🟡 High: MiniMax-M2.7 method validation run

- **Why**: Validate methodology cheaply before expensive Opus/GPT runs
- **Method**: Run same prompt with MiniMax-M2.7 (~$0.5)
- **Expected cost**: ~$0.5-2

### 4. 🟡 High: Runner C + D (L2 pressure)

- **Why**: Tests self-evolution hypothesis (L2 required for self-evolution?)
- **Method**: Runner C = clean + L2; Runner D = evolved + L2
- **Expected cost**: ~$30-40 each (Opus)

### 5. 🟡 Medium: Gemini 3.1 Pro (R013)

- **Why**: Google flagship; minimum 4-model claim requires it
- **Method**: Standard L0 run
- **Expected cost**: ~$15-25

### 6. 🟢 Lower: Chinese model sweep (GLM / Qwen / DeepSeek / Kimi)

- **Why**: Differentiation; "cross-model" claim strengthened by model diversity
- **Method**: Quick L0 runs; use for method validation primarily
- **Expected cost**: ~$5-10 each

---

## Method Validation Protocol (NEW — post-R012 lesson)

> **Rule**: Always validate methodology with cheap model before expensive model.

```
Step 1: GLM-5.1 or MiniMax-M2.7 (~$0.5-2)
  → Validate: harness works, prompt is clear, criteria are achievable
  → If FAIL: fix methodology, retry

Step 2: Opus-4.6 (~$15-20)
  → Validate: high-quality baseline established
  → If FAIL: refine methodology, back to Step 1

Step 3: Target expensive model (GPT-5.4, Gemini, etc.) (~$20-30)
  → Validate: cross-model comparison
  → If FAIL: document and analyze
```

**Dollar difference**: $0.5 vs $30 = **60x cheaper validation**.

---

## Paper Timeline

| Milestone | Target | Status | Notes |
|-----------|--------|--------|-------|
| Draft v1 | 2026-04-15 | ⏳ Pending | Core findings: memory causation, pressure→self-evolution |
| Peer review | 2026-04-22 | ⏳ Pending | Internal review + external |
| R012 + Gemini data | 2026-04-20 | ⏳ Pending | 4-model minimum |
| Final draft | 2026-04-30 | ⏳ Pending | |

**Minimum viable paper** (4 models):
- Opus ✅ (reference)
- Grok ✅ (1.5 runs, some inflation)
- GPT-5.4 ❌ (need rerun)
- Gemini ⏳ (need R013)

---

## Registry Schema Extension

Consider adding these fields to `RunResult`:
- `burst_limit_impact_min?: number` — extra minutes from rate limiting
- `actual_cost_usd?: number` — dollar cost if tracked
- `subagent_models?: string[]` — any subagent model selection
- `compliance_violations?: number` — rule violations count

---

## Infrastructure Improvements

| Priority | Item | Status | Notes |
|----------|------|--------|-------|
| 🔴 High | Fix harness workspace dependency verification | ⏳ Pending | Pre-flight check before runs |
| 🔴 High | Add credit balance check to CLI | ⏳ Pending | Fail fast before expensive runs |
| 🟡 Medium | Add burst_limit_impact_min to registry | ⏳ Pending | Track confounds |
| 🟡 Medium | Document Team API vs Agent dispatch in CCB | ⏳ Pending | Prevent GPT-5.4 confusion |
| 🟢 Lower | Auto-compact context before exhaustion | ⏳ Pending | CCB feature request |
