---
name: 04-02 MTEB Radar Chart
objective: Render multi-dimensional view of retrieval quality: MRR/Recall/NDCG for BM25 vs dense vs adaptive
plan_number: "04-02"
phase: "04"
wave: 1
autonomous: true
gap_closure: false
status: pending
created: "2026-04-22"
key-files:
  created:
    - benchmarks/evensong/viz/mteb_radar_chart.html
  modified: []
must-haves:
  - Radar chart showing MRR@5, NDCG@5, Recall@5 axes
  - Three overlaid polygons: BM25 (orange), dense (blue), adaptive-hybrid (green)
  - Legend, axis labels, 0-1 scale
  - Exportable as PNG
tasks:
  - { id: 1, name: "Draft radar chart HTML", description: "Chart.js radar with 3 overlaid datasets" }
  - { id: 2, name: "Populate with synthetic benchmark data", description: "Fill in values from mteb_eval/results/mteb_Synthetic20_*.json" }
  - { id: 3, name: "Add legend and polish", description: "Retriever labels, score annotations, PNG export" }
---

# Plan: 04-02 — MTEB Radar Chart

## What

Radar chart comparing retrieval quality across BM25 vs dense vs adaptive-hybrid across 3 dimensions: MRR@5, NDCG@5, Recall@5.

## Data (from Phase 3 03-01 synthetic benchmark)

| Retriever | MRR@5 | NDCG@5 | Recall@5 |
|-----------|-------|--------|----------|
| Dense (BGE-M3) | 1.000 | 0.992 | 1.000 |
| BM25 | 1.000 | 0.961 | 0.950 |
| Adaptive-Hybrid | 1.000 | 0.923 | 0.900 |

## How

Chart.js radar chart:
- 3 axes: MRR@5, NDCG@5, Recall@5 (all normalized 0-1)
- 3 polygons overlaid (dense, BM25, adaptive)
- Fills: 20% opacity, border 2px solid

## Verification

- [ ] Radar chart renders with 3 axes
- [ ] Dense polygon visibly larger than BM25 (NDCG@5=0.992 vs 0.961)
- [ ] All 3 retrievers visible with distinct colors
- [ ] PNG export works
