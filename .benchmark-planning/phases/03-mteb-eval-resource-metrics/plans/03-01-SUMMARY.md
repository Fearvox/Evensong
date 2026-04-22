# SUMMARY 03-01: MTEB RetrievalEvaluator Comparison

## What

Built `mteb_eval/run_evaluator.py` harness comparing BM25 vs BGE-M3 dense vs Adaptive-Hybrid retriever strategies using mteb library + rank_bm25 on MiniwarmFacts dataset.

## Implementation

**Architecture:**
- `BM25Retriever`: rank_bm25 wrapper — tokenized corpus, scored queries
- `SearchProtocol`: BGE-M3 dense from Phase 2 (brute-force dot-product)
- `AdaptiveHybrid`: BM25 gap_ratio threshold (1.5x) → skip LLM if BM25 sufficient

**Key code:**
```python
class AdaptiveHybrid:
    def search(self, query, top_k=10):
        bm25_results = self.bm25.search(query, top_k=1)
        dense_results = self.dense.search(query, top_k=top_k)
        gap_ratio = dense_top1 / bm25_top1 if bm25_top1 > 0 else inf
        return dense_results if gap_ratio > 1.5 else bm25_results
```

**Metrics computed:** MRR@K, NDCG@K, Recall@K for K=1,3,5,10,100

## Files Created

- `benchmarks/evensong/mteb_eval/run_evaluator.py` — main harness
- `benchmarks/evensong/mteb_eval/results/` — output directory

## Dependencies Installed

- mteb 2.12.26
- rank_bm25 0.2.2
- (Python 3.13 — system pip)

## Notes

- BGE-M3 model downloading from HuggingFace (~500MB blob) — first run downloads, subsequent runs use cache
- Run: `cd benchmarks/evensong/mteb_eval && /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 run_evaluator.py`
- Results saved to `results/mteb_eval_YYYYMMDD_HHMMSS.json`
