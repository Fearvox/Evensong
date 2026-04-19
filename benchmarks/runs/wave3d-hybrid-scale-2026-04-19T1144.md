# Wave 3+ D' — Hybrid Scale Benchmark

- Manifest: **200 entries** (18 real + 182 junk)
- Queries: **20**
- Pipelines: **llm-only** (deepseek-v3.2 over full manifest) vs **hybrid** (BM25 top-50 → deepseek-v3.2)
- Total calls: **40**

| Pipeline | Top-1 | Top-5 | p50 latency | p90 latency | Avg manifest handed to LLM |
|----------|-------|-------|-------------|-------------|-----------------------------|
| llm-only | 18/20 (90%) | 19/20 (95%) | 2977ms | 4497ms | 200 |
| hybrid | 20/20 (100%) | 20/20 (100%) | 1243ms | 2098ms | 50 |

## Top-1 disagreements between pipelines: 2/20

- Q3 "LLM as operating system memory paging": llm=20260411-msa-memory-sparse-attention.md | hybrid=20260411-2310-08560-memgpt.md | ideal=20260411-2310-08560-memgpt.md
- Q18 "AI agent memory benchmark competitor landscape 2026": llm=20260411-2510-05179v2.md | hybrid=20260411-competitor-landscape.md | ideal=20260411-competitor-landscape.md
