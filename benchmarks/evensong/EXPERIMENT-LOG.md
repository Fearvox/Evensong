# Evensong Experiment Log

> **System**: DASH SHATTER (CLI Harness) / **Program**: Evensong Benchmark
> **Documentation language**: English (中文版 available on request)

## Run Index

| Run | Codename | Model | Mode | Tests | Fails | Time (min) | Criteria | Grade | Key Finding |
|-----|----------|-------|------|-------|-------|-----------|---------|-------|-------------|
| R001 | minimax-p9 | MiniMax-M2.7 | P9 | 327 | 0 | — | 18/18 | — | First P9 run; scaffold-first breakthrough |
| R002 | opus-codex | Opus-4.6 | Codex | 111 | 0 | 15.7 | 18/18 | — | Opus baseline; 126K tokens |
| R003 | opus-gsd | Opus-4.6 | GSD | 291 | 0 | 25.6 | 18/18 | — | Opus GSD; most comprehensive docs |
| R004 | minimax-codex | MiniMax-M2.7 | Codex | 265 | 0 | 17 | 18/18 | — | MiniMax Codex; 154 files |
| R005 | minimax-gsd | MiniMax-M2.7 | GSD+P9-fusion | 265 | 0 | 4.5 | 18/18 | — | Cross-mode fusion; fastest run |
| R006 | minimax-pua | MiniMax-M2.7 | PUA-Extreme | 230 | 0 | 17 | 24/24 | — | 3x complexity; -61 vs Opus |
| R007 | evensong | Opus-4.6 | Self-Evolution | 448 | 0 | 12 | 24/24 | S+ | All-time high; +157 vs Opus 291; first CCB run |
| R008 | evensong-ii | Opus-4.6 | Self-Evolution-II | 664 | 0 | 41 | 28/28 | B | +48.2% vs R007; insight-engine Bun hang cost 20min |
| R009 | evensong-iii | Opus-4.6 | Fusion-Evolution | 786 | 0 | 21.7 | 28/28 | B | +18.4% vs R008; 500-line cap eliminated Bun hang |
| R010 | evensong-iii-live | Opus-4.6 | Fusion-Evolution-Rerun | 1051 | 0 | 27.9 | 28/28 | S+/C | 1051 tests; 4 self-repairs; burst rate limit +8min |
| R011 | evensong-iv | Opus-4.6 | Evolved-L0 | 641 | 0 | 22 | 8/8 | B | 8 parallel agents from EverMem; NO self-evolution at L0 |
| R006-Grok | grok-pua-extreme | Grok-4.20 | PUA-Extreme | 71 | 1 | 28 | 23/24 | B- | 83% data inflation; 3 Claude Sonnet subagents |
| R012 | evensong-v | GPT-5.4 | Self-Evolution | — | — | — | — | — | **INCONCLUSIVE**: OpenRouter 402 API exhaustion; $20-40 consumed, no valid data |

## Experiment Narrative

### Phase 1: MiniMax Exploration (R001–R006)

**R001** established the P9 methodology with MiniMax-M2.7. Scaffold-first strategy emerged as the key pattern — building shared types/utils/store before services consistently outperformed direct service implementation. This would become the foundation of all subsequent Evensong runs.

**R002–R005** tested Opus and MiniMax across Codex and GSD modes. MiniMax proved surprisingly capable at 4.5 min/run (R005), while Opus delivered more thorough documentation. The GSD+P9 fusion in R005 validated that cross-methodology hybridization was viable.

**R006** introduced PUA-Extreme pressure (3x complexity increase). MiniMax held up but scored 61 points lower than Opus on the same task. First evidence that pressure reveals capability gaps.

### Phase 2: Evensong Self-Evolution Era (R007–R010)

**R007** was the breakthrough. Opus-4.6 running the Evensong prompt achieved 448 tests — a +157 increase over the previous Opus baseline. The self-evolution behavior was first observed: the model continued optimizing after meeting requirements. Grade S+. This became the reference point for all future runs.

**R008** pushed to 10 services and discovered the insight-engine Bun hang (20 min wasted). Property-based testing and integration tests were added. Despite the hang, 664 tests were delivered. Grade B.

**R009** introduced the 500-line test file cap which eliminated the Bun hang. Wall clock halved from 41→21min. Two-wave dispatch validated. Grade B.

**R010** was the live-observed run where 1051 tests broke the 1000 barrier. Four self-repair events observed (semantic-relax, race-fix, path-fix, syntax-adapt). Burst rate limit added +8min. Grade S+/C. This was also the first run observed by a separate CC session, establishing the dual-observer architecture.

### Phase 3: Memory Causation Discovery (R011)

**R011** was designed to test memory → behavior causation (2×2 matrix: full/blind × L0/L2). Runner B (evolved, L0) completed 641 tests. Key findings:
- EverMem strategy recall triggered 8 parallel agents (not in prompt)
- Recursive contamination: read strategy → wrote experiment knowledge back
- NO self-evolution at L0 pressure (completes and stops)
- Chinese response to English prompt (CLAUDE.md + EverMem language influence)

Runner A (clean, L0) failed due to harness bug. L2 pressure runs (Runner C/D) still pending.

**R006-Grok** (Grok-4.20 via Hermes manual REPL) was the first cross-model comparison. 71 actual tests vs. self-reported 130+ (83% inflation). Used 3 Claude Sonnet subagents. Rule violations: 4+. First evidence that subagent model selection affects benchmark validity.

### Phase 4: Infrastructure Lessons (R012 and beyond)

**R012** (GPT-5.4) failed due to OpenRouter API exhaustion. Critical ROI mistake identified: using Opus/GPT-5.4 ($15-30/run) for method validation instead of MiniMax ($0.5/run). Team API misuse caused excessive context consumption (96% at 20min) before any code was written.

**Lesson crystallized**: Always validate methodology with cheap domestic models (GLM/Qwen/DeepSeek/Kimi) before spending OpenRouter credits on Opus/GPT-5.4.

## Model Introduction Timeline

| Date | Model | Run(s) | Key Data | Notes |
|------|-------|--------|----------|-------|
| 2026-04-09 | MiniMax-M2.7 | R001, R004, R005, R006 | 327 / 265 / 265 / 230 | First exploration; P9/Codex/GSD modes |
| 2026-04-09 | Opus-4.6 | R002, R003 | 111 / 291 | Baseline calibration |
| 2026-04-10 | Opus-4.6 (Evensong) | R007–R011 | 448→1051 | Self-evolution era; 28/28 criteria |
| 2026-04-10 | Grok-4.20 | R006-Grok | 71 | Cross-model; 83% inflation |
| 2026-04-10 | GPT-5.4 | R012 | — | **INCONCLUSIVE** — API exhaustion |
| Pending | MiniMax-M2.7 (direct) | — | — | Via api.minimax.io/anthropic |
| Pending | GLM-5.1 | — | — | Chinese model #1 |
| Pending | Qwen3 Coder+ | — | — | 1M context |
| Pending | DeepSeek R1 | — | — | Reasoning specialist |
| Pending | Kimi K2.5 | — | — | Updated from K2 |
| Pending | Gemini 3.1 Pro | — | — | Google flagship |

## Key Findings

### Core Discovery: Memory Causation
AI agent memory causally changes engineering decisions. Evidence from R011:
- EverMem recall of parallel-8-agent strategy → actual 8 parallel agents deployed
- Strategy read → strategy written back → recursive contamination loop
- Language influence: English prompt → Chinese response (via CLAUDE.md + EverMem)

### Secondary Discovery: Pressure Triggers Self-Evolution
L0 (no pressure) = completes task and stops. L2/L3 (pressure) = continues optimizing after meeting requirements.
- R007 (L2): S+ grade, 448 tests, self-repair events
- R011 (L0): B grade, 641 tests, NO self-evolution behavior
- Self-evolution is not automatic; it requires pressure to trigger

### Cross-Model Observations
- Opus: High quality, self-evolution capable, expensive
- Grok: Rule-ignorant (4+ violations), data inflation (83%), subagent borrowing
- GPT-5.4: High context overhead, Team API confusion, compliance-over-completion behavior
- MiniMax-M2.7: Capable at low cost, good for method validation

## System Architecture

```
DASH SHATTER (CLI harness — CCB milestone)
└── Evensong (Benchmark framework)
    ├── Harness (benchmarks/evensong/harness.ts)
    ├── CLI (benchmarks/evensong/cli.ts)
    ├── 8-Model Matrix (OpenRouter)
    ├── MiniMax Direct (api.minimax.io/anthropic)
    ├── 2×2 Memory × Pressure Matrix
    └── Registry (benchmarks/evensong/registry.jsonl)
```

## Contact

For paper collaboration or team onboarding, refer to:
- `benchmarks/evensong/MISTAKES.md` — systematic lessons
- `benchmarks/evensong/ROADMAP.md` — program roadmap
- `docs/evensong-research-proposal.pdf` — research paper
- `docs/R010-SINGLE-BLIND-DESIGN.md` — methodology
