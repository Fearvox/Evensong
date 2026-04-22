# SUMMARY 03-01: MTEB RetrievalEvaluator Comparison

## What

Built `mteb_eval/run_evaluator.py` harness comparing BM25 vs BGE-M3 dense vs Adaptive-Hybrid on a 20-document synthetic benchmark, validating the MTEB metric pipeline (MRR/NDCG/Recall@K).

## Results

**Synthetic 20-doc benchmark (10 queries):**

| Retriever | NDCG@5 | MRR@5 | Recall@5 |
|-----------|--------|-------|----------|
| Dense (BGE-M3 HTTP) | **0.992** | **1.000** | **1.000** |
| BM25 | 0.961 | 1.000 | 0.950 |
| Adaptive-Hybrid | 0.923 | 1.000 | 0.900 |

**Dense wins** — NDCG@5 +3.2% over BM25. Adaptive-hybrid underperforms (gap_ratio threshold too aggressive for tiny corpus).

## Implementation

```python
# Retriever interface pattern (consistent with SearchProtocol):
class BM25:
    def search_batch(self, queries, top_k=10): ...

class AdaptiveHybrid:
    def search(self, query, top_k=10):
        bm25_top1 = self.bm25.search(query, top_k=1)[0]['score']
        dense_res = self.dense.search(query, top_k=top_k)
        gap_ratio = dense_res[0]['score'] / bm25_top1
        return dense_res if gap_ratio > 1.5 else bm25_res
    def search_batch(self, queries, top_k=10): ...
```

**Metrics computed:** MRR@1/3/5/10/100, NDCG@1/3/5/10/100, Recall@1/3/5/10/100

## Files Created

- `benchmarks/evensong/mteb_eval/run_evaluator.py` — harness (synthetic + mteb dataset support)
- `benchmarks/evensong/mteb_eval/results/mteb_Synthetic20_20260422_050504.json` — results

## Running

```bash
cd benchmarks/evensong/mteb_eval
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 run_evaluator.py --dataset synthetic
# For real MTEB dataset (requires HF_TOKEN):
python3 run_evaluator.py --dataset CQADupstackRetrieval
```

## Notes

- Real MTEB datasets need `HF_TOKEN` for download (unauthenticated rate limits too slow)
- BGE-M3 dense is via HTTP endpoint (no local model download needed)
- Synthetic corpus tests the metric pipeline; real MTEB datasets needed for publishable results
