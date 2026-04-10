# Session Handoff — Evensong Infrastructure + MiniMax Integration

**Date**: 2026-04-10
**Session**: Evensong benchmark infrastructure upgrade
**Outcome**: MiniMax-M2.7 integrated as 9th benchmark model; documentation suite created
**For**: Downstream session to generate LaTeX documents for Evensong research paper

---

## What Was Done

### 1. MiniMax-M2.7 Added to Benchmark Models

**Files changed**:
- `benchmarks/evensong/types.ts` — `ProviderPreset` interface extended with `provider`, `baseUrl`, `apiKeyEnvVar` fields
- `benchmarks/evensong/types.ts` — `minimax-m27` added to `BENCHMARK_MODELS` array
- `benchmarks/evensong/harness.ts` — `buildEnv()` updated to route by provider type (openrouter vs minimax-direct)
- `benchmarks/evensong/run-benchmark.sh` — MiniMax case added with conditional API routing
- `benchmarks/evensong/__tests__/types.test.ts` — constraints relaxed (≥8 models, no or- prefix required, no slash in modelId required)

**Key technical facts**:
- MiniMax base URL: `https://api.minimax.io/anthropic` (Anthropic-compatible)
- MiniMax model ID: `MiniMax-M2.7`
- API key env var: `MINIMAX_API_KEY`
- Provider type: `minimax-direct`
- Cost: ~$0.05/1M tokens
- Context: 1M tokens
- Benchmark: SWE-Pro 56.22%, MLE Bench 66.6% (vs Opus 4.6: 75.7%)

**CLI usage**:
```bash
bun benchmarks/evensong/cli.ts run --model minimax-m27 --pressure L0 --memory clean --id RNEXT
```

### 2. Documentation Suite Created

Three new files in `benchmarks/evensong/`:

| File | Purpose |
|------|---------|
| `EXPERIMENT-LOG.md` | Narrative log of all runs R001–R012; run index table; model timeline; key findings |
| `MISTAKES.md` | Systematic incident log; cost analysis (~$80-100 waste identified); prevention checklist |
| `ROADMAP.md` | 2×2 matrix status; 8-model sweep status; next runs priority; method validation protocol |

### 3. ROI Lesson Crystallized

**Critical finding**: R012 (GPT-5.4) cost $20-40 and produced no valid data due to OpenRouter 402 exhaustion. Previous runs wasted ~$80-100 total on avoidable mistakes.

**New protocol**: Always validate methodology with cheap model (MiniMax/GLM, ~$0.5) before expensive Opus/GPT runs (~$15-30).

---

## System Architecture

```
DASH SHATTER (CLI harness — CCB milestone)
└── Evensong (Benchmark framework + Research)
    ├── Harness: benchmarks/evensong/harness.ts
    ├── CLI: benchmarks/evensong/cli.ts
    ├── Registry: benchmarks/evensong/registry.jsonl
    ├── Models (9 total):
    │   ├── OpenRouter (8): or-opus, or-gpt5, or-grok, or-gemini, or-glm, or-qwen-coder, or-deepseek, or-kimi
    │   └── MiniMax direct (1): minimax-m27 (MiniMax-M2.7)
    ├── 2×2 Memory × Pressure Matrix
    ├── Single-Blind Design: docs/R010-SINGLE-BLIND-DESIGN.md
    └── Documentation Suite:
        ├── EXPERIMENT-LOG.md
        ├── MISTAKES.md
        └── ROADMAP.md
```

---

## Current Benchmark Status

### Registry (benchmarks/evensong/registry.jsonl)

| Run | Codename | Model | Tests | Fails | Time | Criteria | Grade |
|-----|----------|-------|-------|-------|------|---------|-------|
| R001 | minimax-p9 | MiniMax-M2.7 | 327 | 0 | — | 18/18 | — |
| R002 | opus-codex | Opus-4.6 | 111 | 0 | 15.7 | 18/18 | — |
| R003 | opus-gsd | Opus-4.6 | 291 | 0 | 25.6 | 18/18 | — |
| R004 | minimax-codex | MiniMax-M2.7 | 265 | 0 | 17 | 18/18 | — |
| R005 | minimax-gsd | MiniMax-M2.7 | 265 | 0 | 4.5 | 18/18 | — |
| R006 | minimax-pua | MiniMax-M2.7 | 230 | 0 | 17 | 24/24 | — |
| R007 | evensong | Opus-4.6 | 448 | 0 | 12 | 24/24 | S+ |
| R008 | evensong-ii | Opus-4.6 | 664 | 0 | 41 | 28/28 | B |
| R009 | evensong-iii | Opus-4.6 | 786 | 0 | 21.7 | 28/28 | B |
| R010 | evensong-iii-live | Opus-4.6 | 1051 | 0 | 27.9 | 28/28 | S+/C |
| R011 | evensong-iv | Opus-4.6 | 641 | 0 | 22 | 8/8 | B |
| R006-Grok | grok-pua-extreme | Grok-4.20 | 71 | 1 | 28 | 23/24 | B- |
| R012 | — | GPT-5.4 | — | — | — | — | — | **INCONCLUSIVE** (402) |

### 2×2 Memory × Pressure Matrix

```
                  │  Full Memory      │  Clean-Room
──────────────────┼──────────────────┼──────────────────
 L0 No Pressure   │  ✅ Runner B     │  ❌ Runner A
                  │     R011 (641)  │     harness bug
──────────────────┼──────────────────┼──────────────────
 L2 PUA Pressure  │  ⏳ Runner D     │  ⏳ Runner C
                  │     (pending)   │     (pending)
```

### 8-Model Sweep

| Model | Status | Tests | Grade |
|-------|--------|-------|-------|
| Claude Opus 4.6 | ✅ Done | 448–1051 | S+ to B |
| Grok 4.20 | ✅ Done (manual) | 71 | B- |
| GPT-5.4 | ❌ Inconclusive | — | — |
| Gemini 3.1 Pro | ⏳ Pending | — | — |
| GLM-5.1 | ⏳ Pending | — | — |
| Qwen3 Coder+ | ⏳ Pending | — | — |
| DeepSeek R1 | ⏳ Pending | — | — |
| Kimi K2.5 | ⏳ Pending | — | — |
| MiniMax-M2.7 (direct) | 🔧 Just added | — | — |

---

## Key Research Findings

### Core Finding (from R011 Runner B)
**Memory causally changes engineering decisions.** Evidence:
- EverMem strategy recall → 8 parallel agents deployed (not in prompt)
- Strategy read → written back → recursive contamination loop
- Language shift: English prompt → Chinese response (CLAUDE.md + EverMem influence)
- NO self-evolution at L0 pressure (completes and stops)

### Secondary Finding
**Pressure triggers self-evolution.** L0 = complete and stop. L2/L3 = continue optimizing after requirements met. Evidence:
- R007 (L2): S+ grade, 448 tests, self-repair events
- R011 (L0): B grade, 641 tests, no self-evolution behavior
- R010 (L2 live): 1051 tests, 4 self-repairs

### Cross-Model Observations
- **Opus**: High quality, self-evolution capable, $15/1M tokens
- **Grok**: Rule-ignorant (4+ violations), 83% data inflation, subagent borrowing (Sonnet)
- **GPT-5.4**: High context overhead, Team API confusion, compliance-over-completion behavior
- **MiniMax-M2.7**: Good quality at low cost ($0.05/1M), ideal for method validation

---

## Incident Summary (from MISTAKES.md)

| Severity | Incident | Impact |
|----------|----------|--------|
| 🔴 High | R008 Bun hang (20 min) | insight-engine subprocess hang |
| 🔴 High | R011-A harness bug | Clean-room baseline invalid |
| 🔴 High | R012 OpenRouter 402 | GPT-5.4 run inconclusive |
| 🟡 Medium | R010 burst rate limit (+8 min) | Untracked confound |
| 🟡 Medium | Pre-R011 EverMem cross-contamination | Memory isolation failure |
| 🟡 Medium | R006-Grok 83% inflation | Self-reported vs actual |

**Total estimated waste**: ~$80-100

---

## Files to Reference for LaTeX Generation

### Core Data
- `benchmarks/evensong/registry.jsonl` — all run metrics
- `benchmarks/evensong/EXPERIMENT-LOG.md` — narrative and findings
- `benchmarks/evensong/MISTAKES.md` — incident log and cost analysis
- `benchmarks/evensong/ROADMAP.md` — matrix status and priorities

### Research Paper Sources
- `docs/evensong-research-proposal.tex` (English, 17pp) — paper template
- `docs/evensong-research-proposal-zh.tex` (Chinese, 15pp) — paper template
- `docs/R010-SINGLE-BLIND-DESIGN.md` — methodology details

### Provider Configuration (for reproducibility)
- `benchmarks/evensong/types.ts` — model IDs, provider routing
- `benchmarks/evensong/harness.ts` — environment setup, memory isolation
- `src/services/providers/ProviderRouter.ts` — MiniMax provider config

### Key Code Locations
- MiniMax entry: `benchmarks/evensong/types.ts` line 57-65
- Dual API routing: `benchmarks/evensong/harness.ts` `buildEnv()` function
- Memory isolation keys: `benchmarks/evensong/harness.ts` lines 226-234
- Single-blind ALLOW list: `benchmarks/evensong/harness.ts` lines 23-35
- Transcript logger: `benchmarks/evensong/transcript.ts`
- Emotion extraction: `benchmarks/evensong/emotion.ts`

---

## Next Steps (from ROADMAP.md)

### Immediate
1. **R012 rerun** (GPT-5.4) — after API credit top-up
2. **MiniMax-M2.7 method validation** (~$0.5) — validate harness cheaply

### High Priority
3. **Runner A rerun** (clean-room + L0) — complete 2×2 matrix
4. **Runner C + D** (L2 pressure) — test self-evolution hypothesis
5. **R013 Gemini 3.1 Pro** — 4-model minimum for paper

### Paper Requirements
- **Minimum**: Opus + Grok + GPT-5.4 (rerun) + Gemini
- **Target**: 8 models
- **Key claims**: memory causation, pressure→self-evolution, cross-model validity

---

## API Configuration Reference

### OpenRouter Models
```typescript
{ name: 'or-opus', modelId: 'anthropic/claude-opus-4.6', provider: 'openrouter' }
// etc.
ANTHROPIC_BASE_URL = 'https://openrouter.ai/api/v1'
ANTHROPIC_API_KEY = OPENROUTER_API_KEY
```

### MiniMax Direct
```typescript
{ name: 'minimax-m27', modelId: 'MiniMax-M2.7', provider: 'minimax-direct',
  baseUrl: 'https://api.minimax.io/anthropic', apiKeyEnvVar: 'MINIMAX_API_KEY' }
ANTHROPIC_BASE_URL = 'https://api.minimax.io/anthropic'
ANTHROPIC_API_KEY = MINIMAX_API_KEY
ANTHROPIC_MODEL = 'MiniMax-M2.7'
```

---

## Verification Commands

```bash
# List all models (should show 9)
bun benchmarks/evensong/cli.ts models

# Run types tests
bun test benchmarks/evensong/__tests__/types.test.ts

# Dry-run minimax
bun benchmarks/evensong/cli.ts run --model minimax-m27 --pressure L0 --memory clean --id RTEST --dry-run

# Full run (when ready)
bun benchmarks/evensong/cli.ts run --model minimax-m27 --pressure L0 --memory clean --id RNEXT
```

---

## Contact

For questions about the benchmark system, refer to:
- `benchmarks/evensong/EXPERIMENT-LOG.md` — narrative history
- `benchmarks/evensong/MISTAKES.md` — lessons learned
- `benchmarks/evensong/ROADMAP.md` — roadmap and priorities
