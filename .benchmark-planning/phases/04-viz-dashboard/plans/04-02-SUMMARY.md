# SUMMARY 04-02: MTEB Radar Chart

## What

Radar chart overlaying 3 retrievers (dense, BM25, adaptive-hybrid) across MRR@5, NDCG@5, Recall@5 axes.

## Implementation

`benchmarks/evensong/viz/mteb_radar_chart.html` — self-contained Chart.js radar:
- 3 axes (MRR@5, NDCG@5, Recall@5), scale 0.8–1.05
- 3 overlaid polygons with 20% fill, 2px border
- Dense (cyan #00e5ff), BM25 (orange #ff9500), Adaptive (green #76ff03)

## Data (from Phase 3 synthetic benchmark)

| Retriever | MRR@5 | NDCG@5 | Recall@5 |
|-----------|-------|--------|----------|
| Dense | 1.000 | **0.992** | **1.000** |
| BM25 | 1.000 | 0.961 | 0.950 |
| Adaptive | 1.000 | 0.923 | 0.900 |

Dense wins: NDCG@5 +3.2%, Recall@5 +5.3% over BM25.

## Notes

- Synthetic corpus (20 docs × 10 queries) — not a real MTEB dataset
- Radar clearly shows dense polygon larger than BM25
- Adaptive-hybrid underperforms on tiny corpus (threshold too aggressive)
