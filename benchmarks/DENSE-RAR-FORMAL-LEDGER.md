# Dense RAR Formal Evidence Ledger

This ledger records Dense RAR retrieval benchmark evidence separately from Evensong self-evolution runs. It is the canonical small ledger for dense/RAR hard-suite results because the older `benchmarks/BENCHMARK-REGISTRY.md` is a CCB/Evensong run index, not a retrieval-pipeline evidence ledger.

## Current formal evidence

| Run ID | Date | Mode | Git | Suite | Stage 1 | Judge | Pipelines | Result | Artifacts | Notes |
|--------|------|------|-----|-------|---------|-------|-----------|--------|-----------|-------|
| dense-rar-2026-04-24T0854 | 2026-04-24 | formal, live allowed | 9148853 clean | wave3-adversarial-retrieval v1.0.0; 24 queries; 200-entry manifest (18 real + 182 adversarial junk) | BGE-M3 Q4_K_M on `100.65.234.77:8080` (`bge-m3`, stage1TopK=50) | `deepseek-v4-flash`, thinking disabled | dense; dense-rar; dense-adaptive | dense 17/24 Top-1, 18/24 Top-5; dense-rar 24/24 Top-1, 24/24 Top-5; dense-adaptive 24/24 Top-1, 24/24 Top-5; errors 0 | [`md`](runs/wave3i-dense-rar-2026-04-24T0854.md), [`meta`](runs/wave3i-dense-rar-2026-04-24T0854.meta.json), [`jsonl`](runs/wave3i-dense-rar-2026-04-24T0854.jsonl) | Formal-eligible. Stage1TopK 50 fixed q113 candidate recall (candidate rank 27) and produced no rerank regressions versus 0801. ccr-droplet SSH/systemd verification operator-side pending due Tailscale interactive auth; HTTP `/v1/models` and `/v1/embeddings` checks passed. 8081/8082/8083 had no HTTP response. |

## Prior formal baseline

| Run ID | Date | Mode | Git | Stage 1 | Result | Artifacts | Notes |
|--------|------|------|-----|---------|--------|-----------|-------|
| dense-rar-2026-04-24T0801 | 2026-04-24 | formal, live allowed | 3c274d1 clean | BGE-M3 Q4_K_M on `100.65.234.77:8080` (`bge-m3`, stage1TopK=20) | dense 16/24 Top-1, 18/24 Top-5; dense-rar 23/24 Top-1, 23/24 Top-5; dense-adaptive 23/24 Top-1, 23/24 Top-5; errors 0 | [`md`](runs/wave3i-dense-rar-2026-04-24T0801.md), [`meta`](runs/wave3i-dense-rar-2026-04-24T0801.meta.json), [`jsonl`](runs/wave3i-dense-rar-2026-04-24T0801.jsonl) | Formal-eligible prior baseline. q113 `negative_exclusion` missed because Stage-1 TopK 20 did not include the ideal. |

## Internal / probe evidence only

| Run ID | Date | Mode | Git state | Result | Why not formal |
|--------|------|------|-----------|--------|----------------|
| dense-rar-2026-04-24T0841 | 2026-04-24 | probe | clean | q113-only canary: Stage1TopK 50 made dense-rar/dense-adaptive/rrf-rar/rrf-adaptive top1-hit q113 | Diagnostic canary only: query suite limited to q113 and run mode was `probe`. |
| dense-rar-2026-04-24T0644 | 2026-04-24 | probe | dirty | dense-rar 23/24 Top-1, 23/24 Top-5; dense-adaptive 23/24 Top-1, 23/24 Top-5 | Internal probe only: run mode was `probe` and git state was dirty. Do not cite as formal evidence. |

## Blind-spot status

q113 (`negative_exclusion`) is resolved in the formal Stage1TopK50 run `dense-rar-2026-04-24T0854`. The diagnostic trail remains in `/root/ccr/.planning/phases/14.9-q113-candidate-recall-diagnostic/report.md`. Do not generalize this to unrelated suites without rerunning them: TopK 50 increases judge exposure from 20 to 50 candidates for rerank/adaptive paths.
