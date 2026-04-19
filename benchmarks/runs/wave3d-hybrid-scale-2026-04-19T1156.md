# Wave 3+ D' — Hybrid Scale Benchmark

- Manifest: **200 entries** (18 real + 182 junk)
- Queries: **20**
- Runs per (pipeline × query): **3**
- Pipelines: **llm-only** (deepseek-v3.2 over full manifest) vs **hybrid** (BM25 top-50 → deepseek-v3.2)
- Total calls: **120**

## Aggregated (all runs flattened)

| Pipeline | Top-1 | Top-5 | p50 latency | p90 latency | Avg manifest handed to LLM |
|----------|-------|-------|-------------|-------------|-----------------------------|
| llm-only | 58/60 (96.7%) | 59/60 (98.3%) | 2000ms | 4841ms | 200 |
| hybrid | 58/60 (96.7%) | 58/60 (96.7%) | 1283ms | 1795ms | 50 |

## Per-run top-1 accuracy (variance inspection)

| Pipeline | run 0 | run 1 | run 2 | mean | stddev |
| --- | --- | --- | --- | --- | --- |
| llm-only | 100.0% | 95.0% | 95.0% | 96.67% | 2.36 pp |
| hybrid | 100.0% | 95.0% | 95.0% | 96.67% | 2.36 pp |

## Per-query run-to-run consistency

| Pipeline | Queries w/ identical top-1 across all runs | Partial disagreement |
|----------|---------------------------------------------|----------------------|
| llm-only | 19/20 | 1/20 |
| hybrid | 19/20 | 1/20 |

## Top-1 disagreements between pipelines (any run)

- **Q7** "LLM insider threat blackmail misalignment"  ideal=`20260411-2510-05179v2.md`  llm→`20260411-2510-05179v2.md`  hybrid→`20260411-msa-memory-sparse-attention.md`
- **Q18** "AI agent memory benchmark competitor landscape 2026"  ideal=`20260411-competitor-landscape.md`  llm→`20260411-competitor-landscape.md`  hybrid→`20260411-competitor-landscape.md`

