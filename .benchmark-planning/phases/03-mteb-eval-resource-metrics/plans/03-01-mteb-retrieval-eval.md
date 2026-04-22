---
name: 03-01 MTEB RetrievalEvaluator Comparison
objective: Run MTEB RetrievalEvaluator comparing BM25 vs dense vs adaptive-hybrid on at least one MTEB dataset
plan_number: "03-01"
phase: "03"
wave: 1
autonomous: true
gap_closure: false
status: pending
created: "2026-04-22"
key-files:
  created:
    - benchmarks/evensong/mteb_eval/run_evaluator.py
    - benchmarks/evensong/mteb_eval/results/
  modified:
    - benchmarks/evensong/locomo_hybrid/search_protocol.py
must-haves:
  - SearchProtocol.search_batch() called with 10+ queries from MTEB dataset
  - MRR@5, NDCG@5, Recall@5 reported for each retriever (BM25/dense/adaptive-hybrid)
  - Results written to JSON file with timestamp
  - Run completes without timeout (>300s timeout if needed)
tasks:
  - { id: 1, name: "Set up MTEB dataset loading", description: "Load a sample MTEB dataset (e.g., MiniwarmFacts or a 5k subset) using mteb library" }
  - { id: 2, name: "Implement BM25 retriever baseline", description: "Implement simple BM25 retriever using rank_bm25 library for comparison" }
  - { id: 3, name: "Implement adaptive-hybrid retriever", description: "Implement adaptive-hybrid: BM25 gap_ratio threshold to decide dense vs BM25" }
  - { id: 4, name: "Run full comparison and collect metrics", description: "Run all 3 retrievers on dataset, collect MRR/NDCG/Recall@K" }
  - { id: 5, name: "Write results to JSON", description: "Save results to benchmarks/evensong/mteb_eval/results/ with timestamp" }
---

# Plan: 03-01 — MTEB RetrievalEvaluator Comparison

## What

Run MTEB RetrievalEvaluator on a sample MTEB dataset comparing three retriever strategies:
- **BM25** (sparse, keyword match baseline)
- **BGE-M3 dense** (SearchProtocol, from Phase 2)
- **Adaptive-hybrid** (BM25 gap_ratio threshold → skip LLM)

## How

1. **Load MTEB dataset**: Use `mteb` library to load a small retrieval dataset (e.g., `MiniwarmFacts` or `NQ` subset — must be achievable without external API keys)

2. **BM25 baseline**: Use `rank_bm25` library. Tokenize corpus, build BM25 index, query with tokenized query string

3. **Dense (SearchProtocol)**: Use BGE-M3 dense from Phase 2 `SearchProtocol`. Already has `search_batch()` for efficient batch querying

4. **Adaptive-hybrid logic**:
   - Run BM25 search first, get top-1 score
   - If BM25 top-1 score is very high (e.g., > gap_ratio × dense_top1): use BM25
   - Otherwise: use dense (BGE-M3)
   - gap_ratio threshold: 1.5x from Wave 3E results

5. **Collect metrics**: Use `mteb.RecommendationEvaluator` or custom metric calculation:
   - MRR@K = Mean Reciprocal Rank at K
   - NDCG@K = Normalized Discounted Cumulative Gain
   - Recall@K = % of relevant docs in top-K

6. **Output**: JSON with structure:
   ```json
   {
     "timestamp": "2026-04-22T...",
     "dataset": "MiniwarmFacts",
     "retrievers": {
       "bm25": { "MRR@5": 0.XYZ, "NDCG@5": 0.XYZ, "Recall@5": 0.XYZ },
       "dense": { "MRR@5": 0.XYZ, "NDCG@5": 0.XYZ, "Recall@5": 0.XYZ },
       "adaptive_hybrid": { "MRR@5": 0.XYZ, "NDCG@5": 0.XYZ, "Recall@5": 0.XYZ }
     }
   }
   ```

## Why

MTEB (Massive Text Embedding Benchmark) provides standardized retrieval metrics across 56 datasets. Running a subset validates that SearchProtocol (Phase 2) is compatible with MTEB's evaluation framework before full 56-dataset evaluation in Phase 4.

## Verification

- [ ] All 3 retrievers run without crash
- [ ] MRR@5, NDCG@5, Recall@5 all non-zero for each retriever
- [ ] Results written to JSON file
- [ ] adaptive-hybrid shows different results than pure BM25 or pure dense
