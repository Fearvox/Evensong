# Wave 3+H Phase 4 Smoke — BGE/RRF

- Manifest: 24 real + 182 junk = 206
- Queries: 20 (handwritten wave3-judge-queries.json)
- RRF k: 10

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Wave 3+H Phase 4 Smoke — 20q × 206-entry manifest, rrf k=10
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Stage-1 pipeline            | Top-1 accuracy              | Avg latency |
|-----------------------------|-----------------------------|-------------|
| BM25 alone                  | 18/20 (90.0%)            | 14ms      |
| BGE-M3 dense alone          | 20/20 (100.0%)            | 465ms     |
| **RRF(BM25, BGE) k=10**       | **19/20 (95.0%)**            | 693ms     |

## Per-category top-1

| Category | N | BM25 | Dense | RRF |
|----------|---|------|-------|-----|
| direct      | 5 | 5/5 | 5/5 | 5/5 |
| abstract    | 3 | 3/3 | 3/3 | 3/3 |
| zh          | 4 | 4/4 | 4/4 | 4/4 |
| comparative | 3 | 2/3 | 3/3 | 2/3 |
| negation    | 3 | 2/3 | 3/3 | 3/3 |
| engineering | 2 | 2/2 | 2/2 | 2/2 |

## RRF vs BM25 — rescues & regressions

**RRF rescued 1 query(ies) that BM25 missed:**
- Q18 "AI agent memory benchmark competitor landscape 202" — want=`20260411-competitor-landscape.md`, bm25=`20260411-garnet-ai-digest-division-of-it-at-usc.md`, rrf=`20260411-competitor-landscape.md`

