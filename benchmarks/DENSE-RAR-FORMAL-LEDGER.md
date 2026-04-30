# Dense RAR Formal Evidence Ledger

This is the canonical ledger for Dense/RAR retrieval evidence. It is separate from the older Evensong run index because these runs evaluate a retrieval pipeline, not self-evolution orchestration.

## Run Index

| Run ID | Date | Boundary | Result |
|--------|------|----------|--------|
| dense-rar-2026-04-24T0854 | 2026-04-24 | formal, live allowed | dense-rar and dense-adaptive 24/24 Top-1 and Top-5 across 24 queries; 0 errors |
| dense-rar-2026-04-24T0801 | 2026-04-24 | formal, live allowed | Stage1TopK 20 baseline; dense-rar and dense-adaptive 23/24 |
| dense-rar-2026-04-24T0644 | 2026-04-24 | probe only | internal/probe-only evidence; dirty git state |

## Canonical Formal Run

- Run ID: `dense-rar-2026-04-24T0854`
- Date: 2026-04-24
- Mode: `formal`, live providers explicitly allowed
- Metadata commit: `9148853`, clean git state
- Suite: `wave3-adversarial-retrieval` v1.0.0
- Manifest: 200 entries, with 18 real vault documents and 182 adversarial junk distractors
- Stage 1: BGE-M3 Q4_K_M, `stage1TopK=50`
- Stage 2 judge: `deepseek-v4-flash`, thinking disabled
- Artifacts: [`summary`](runs/wave3i-dense-rar-2026-04-24T0854.md), [`meta`](runs/wave3i-dense-rar-2026-04-24T0854.meta.json), [`jsonl`](runs/wave3i-dense-rar-2026-04-24T0854.jsonl)

| Pipeline | Top-1 | Top-5 | Valid | Errors | Candidate pool | p50 | p90 | Avg |
|----------|------:|------:|------:|-------:|---------------:|----:|----:|----:|
| dense | 17/24 | 18/24 | 24/24 | 0 | 50 | 526 ms | 576 ms | 5532 ms |
| dense-rar | 24/24 | 24/24 | 24/24 | 0 | 50 | 1703 ms | 1842 ms | 1724 ms |
| dense-adaptive | 24/24 | 24/24 | 24/24 | 0 | 50 | 1615 ms | 1854 ms | 1678 ms |

q113 (`negative_exclusion`) is resolved in this run. Stage 1 recovers the ideal at candidate rank 27, and dense-rar/dense-adaptive both rerank it to Top-1.

Partner interpretation: compared with dense-only retrieval, the rerank paths recover every target in this 24-query adversarial suite while keeping a committed evidence trail. Cite it as a bounded hard-suite result, not as broad retrieval superiority.

## Prior Formal Baseline

- Run ID: `dense-rar-2026-04-24T0801`
- Mode: `formal`, live providers explicitly allowed
- Metadata commit: `3c274d1`, clean git state
- Stage 1: BGE-M3 Q4_K_M, `stage1TopK=20`
- Artifacts: [`summary`](runs/wave3i-dense-rar-2026-04-24T0801.md), [`meta`](runs/wave3i-dense-rar-2026-04-24T0801.meta.json), [`jsonl`](runs/wave3i-dense-rar-2026-04-24T0801.jsonl)

| Pipeline | Top-1 | Top-5 | Valid | Errors | Notes |
|----------|------:|------:|------:|-------:|-------|
| dense | 16/24 | 18/24 | 24/24 | 0 | q113 ideal absent from Stage-1 TopK 20 candidate pool |
| dense-rar | 23/24 | 23/24 | 24/24 | 0 | Reranker could not select a missing candidate |
| dense-adaptive | 23/24 | 23/24 | 24/24 | 0 | Same candidate-recall miss |

## Probe-Only Evidence

| Run ID | Date | Mode | Git state | Result | Why not formal |
|--------|------|------|-----------|--------|----------------|
| `dense-rar-2026-04-24T0841` | 2026-04-24 | probe | clean | q113-only canary: Stage1TopK 50 made dense-rar, dense-adaptive, rrf-rar, and rrf-adaptive Top-1-hit q113 | Query suite was limited to q113 and run mode was `probe` |
| `dense-rar-2026-04-24T0644` | 2026-04-24 | probe | dirty | dense-rar/adaptive reached 23/24 | Dirty git state and `mode=probe`; do not cite as formal evidence |

## Evidence Boundaries

- The 24/24 claim applies to the verified 24-query Wave 3+I hard suite only.
- Stage1TopK 50 increases rerank candidate exposure from 20 to 50. This is the accepted tradeoff for fixing q113 candidate recall.
- BM25/RRF was not needed for the canonical fix; q113 diagnostics showed dense TopK 50 was the smallest reliable path.
- Remote embedding service health was verified through HTTP `/v1/models` and `/v1/embeddings`. Host-level SSH/systemd verification stayed operator-side pending because private-network SSH required interactive auth.
- Metadata stores provider role labels instead of private infrastructure coordinates; public summaries should keep using role labels.
