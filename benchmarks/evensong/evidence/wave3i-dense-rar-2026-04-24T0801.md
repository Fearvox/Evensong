# Wave 3+I Dense-first RAR Benchmark

- Schema: **dense-rar-v3**
- Run ID: **dense-rar-2026-04-24T0801**
- Mode: **formal** (live providers explicitly allowed)
- Git: **3c274d1** (clean)
- Vault root: **private research-vault mirror** (public mirror redacts host paths)
- Manifest: **200 entries** (18 real + 182 adversarial junk)
- Manifest hash: **bd9afb901dadd199**
- Queries hash: **bcce230b845b7226**
- Query suite: **wave3-adversarial-retrieval** (1.0.0, adversarial)
- Query categories: near_neighbor_memory, lexical_trap, cross_lingual, negative_exclusion, methodology_philosophy, engineering_specific
- Queries: **24**
- Runs per (pipeline × query): **1**
- Stage 1: **BGE-M3-Q4_K_M-8080** via internal embedding endpoint (model: **bge-m3**)
- Embedding timeout: **180000ms**
- Corpus batch size: **50**
- Stage-1 candidate pool: **20**
- Final top-K: **5**
- Stage 2 judge: **deepseek-v4-flash** via https://api.deepseek.com (thinking: disabled)
- Pipelines: dense, dense-rar, dense-adaptive
- Total calls: **72**
- Public mirror note: raw JSONL and private endpoint coordinates are retained in the canonical repo evidence path, not deployed here.

## Aggregated (all runs flattened)

| Pipeline | Status | Valid | Errors | Top-1 | Top-5 | p50 latency | p90 latency | Avg latency | Judge exposure |
|----------|--------|-------|--------|-------|-------|-------------|-------------|-------------|----------------|
| dense | ok | 24/24 | 0 | 16/24 (66.7%) | 18/24 (75.0%) | 520ms | 552ms | 5666ms | 0 |
| dense-rar | ok | 24/24 | 0 | 23/24 (95.8%) | 23/24 (95.8%) | 1533ms | 1761ms | 1600ms | 20 |
| dense-adaptive | ok | 24/24 | 0 | 23/24 (95.8%) | 23/24 (95.8%) | 1528ms | 1713ms | 1580ms | 20 on 100%, 0 on 0% |

## Candidate Recall by Category

| Pipeline | Category | Valid | Top-1 | Top-5 | Candidate hit | Candidate miss | Synthetic miss | Real miss | Empty miss |
|----------|----------|-------|-------|-------|---------------|----------------|----------------|-----------|------------|
| dense | cross_lingual | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense | engineering_specific | 4/4 | 1/4 | 1/4 | 4/4 | 0/4 | 3 | 0 | 0 |
| dense | lexical_trap | 4/4 | 3/4 | 4/4 | 4/4 | 0/4 | 1 | 0 | 0 |
| dense | methodology_philosophy | 4/4 | 3/4 | 4/4 | 4/4 | 0/4 | 1 | 0 | 0 |
| dense | near_neighbor_memory | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense | negative_exclusion | 4/4 | 1/4 | 1/4 | 3/4 | 1/4 | 3 | 0 | 0 |
| dense-rar | cross_lingual | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-rar | engineering_specific | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-rar | lexical_trap | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-rar | methodology_philosophy | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-rar | near_neighbor_memory | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-rar | negative_exclusion | 4/4 | 3/4 | 3/4 | 3/4 | 1/4 | 1 | 0 | 0 |
| dense-adaptive | cross_lingual | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-adaptive | engineering_specific | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-adaptive | lexical_trap | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-adaptive | methodology_philosophy | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-adaptive | near_neighbor_memory | 4/4 | 4/4 | 4/4 | 4/4 | 0/4 | 0 | 0 | 0 |
| dense-adaptive | negative_exclusion | 4/4 | 3/4 | 3/4 | 3/4 | 1/4 | 0 | 0 | 1 |

## Trust Status

- Result status: **valid-execution**
- Formal eligible: **yes**

## Adaptive gating stats

### dense-adaptive

- Skip rate: **0/24 (0.0%)**
- Top-1 on skipped queries: **0/0 (0%)**
- Top-1 on invoked queries: **23/24 (95.8%)**
- Gate threshold: stage1_score[0] / stage1_score[1] ≥ 1.5
