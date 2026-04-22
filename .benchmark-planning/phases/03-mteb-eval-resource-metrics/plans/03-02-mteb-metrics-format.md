---
name: 03-02 Output MTEB Standardized Metrics
objective: Output MRR@K, NDCG@K, Recall@K (K=1,3,5,10,100) from MTEB RetrievalEvaluator
plan_number: "03-02"
phase: "03"
wave: 1
autonomous: true
gap_closure: false
status: pending
created: "2026-04-22"
key-files:
  created:
    - benchmarks/evensong/mteb_eval/metrics_formatter.py
  modified:
    - benchmarks/evensong/mteb_eval/results/
must-haves:
  - metrics_formatter.py outputs all standard MTEB metrics: MRR@K, NDCG@K, Recall@K for K=1,3,5,10,100
  - Each dataset result includes per-retriever breakdown
  - Output matches mteb library expected format (tasks field with descriptions)
tasks:
  - { id: 1, name: "Implement full metric calculator", description: "Implement MRR@K, NDCG@K, Recall@K for K=1,3,5,10,100" }
  - { id: 2, name: "Format output for MTEB tasks.json", description: "Format results to match mteb ExpectedTasks format with dataset descriptions" }
  - { id: 3, name: "Add to run_evaluator.py pipeline", description: "Integrate formatter into evaluator pipeline as post-processing step" }
---

# Plan: 03-02 — Output MTEB Standardized Metrics

## What

Implement full MTEB metric output format: MRR@K, NDCG@K, Recall@K for K=1,3,5,10,100 per dataset per retriever. Matches official mteb library format for comparison with published baselines.

## How

1. **Full metric set** (not just K=5):
   - MRR@1, MRR@3, MRR@5, MRR@10, MRR@100
   - NDCG@1, NDCG@3, NDCG@5, NDCG@10, NDCG@100
   - Recall@1, Recall@3, Recall@5, Recall@10, Recall@100

2. **Formula**:
   - MRR@K = (1/|Q|) × Σ(1/rank_i) for each query with rel in top-K
   - NDCG@K = DCG@K / IDCG@K (discounted cumulative gain normalized)
   - Recall@K = |relevant docs in top-K| / |total relevant docs|

3. **Output format** (mteb-compatible):
   ```python
   {
     "dataset_name": "MiniwarmFacts",
     "task_name": "MiniwarmFactsRetrieval",
     "languages": ["en"],
     "metrics": {
       "bm25": {"MRR@1": 0.X, "MRR@3": 0.X, ..., "NDCG@5": 0.X, ...},
       "dense": {...},
       "adaptive_hybrid": {...}
     }
   }
   ```

## Why

Phase 3 success criteria requires standardized metrics. MTEB community expects specific metric/K combinations. This plan ensures output is comparable to published MTEB baselines.

## Verification

- [ ] All 15 metric values (5 K-values × 3 metric types) present for each retriever
- [ ] Format matches mteb library task output format
- [ ] Values are mathematically plausible (0.0 to 1.0 range)
