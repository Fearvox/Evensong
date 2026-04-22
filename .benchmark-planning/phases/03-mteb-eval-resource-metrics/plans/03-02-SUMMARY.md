# SUMMARY 03-02: MTEB Standardized Metrics Format

## What

The metrics formatter was built into `run_evaluator.py` as part of 03-01. The output format already matches MTEB's standard: `{MRR,NDCG,Recall}@{1,3,5,10,100}` per retriever — no additional code needed.

## Implementation

Built into `run_evaluator.py` `compute_metrics()`:
```python
# Output format per retriever:
{
  "MRR@1": 1.0, "NDCG@1": 1.0, "Recall@1": 0.9,
  "MRR@3": 1.0, "NDCG@3": 0.96, "Recall@3": 0.95,
  "MRR@5": 1.0, "NDCG@5": 0.96, "Recall@5": 0.95,
  "MRR@10": 1.0, "NDCG@10": 0.98, "Recall@10": 1.0,
  "MRR@100": 1.0, "NDCG@100": 0.98, "Recall@100": 1.0
}
```

Matches MTEB community format for cross-baseline comparison.

## Verification

| Metric | K=1 | K=3 | K=5 | K=10 | K=100 |
|--------|-----|-----|-----|------|-------|
| MRR | ✅ | ✅ | ✅ | ✅ | ✅ |
| NDCG | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recall | ✅ | ✅ | ✅ | ✅ | ✅ |

All 15 values present, mathematically plausible (0.0–1.0 range).

## Notes

- 03-02 is a subset of 03-01's harness — no separate code needed
- Real MTEB datasets (CQADupstackRetrieval, etc.) can be added via `--dataset` flag
- HF_TOKEN required for real dataset download
