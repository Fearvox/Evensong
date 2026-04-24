# Phase 15.0 Stage1TopK50 Formal Rerun Report

## Formal result

- Run ID: `dense-rar-2026-04-24T0854`
- Artifact prefix: `benchmarks/runs/wave3i-dense-rar-2026-04-24T0854`
- Mode: `formal`
- Git commit in meta: `9148853`
- Git dirty in meta: `False`
- Stage1TopK: `50` (`inputs.stage1TopK` in meta)
- BGE endpoint/model: `http://100.65.234.77:8080/v1`, `bge-m3`
- Judge: `deepseek-v4-flash`, thinking disabled

## Verification summary

| Pipeline | Valid | Errors | Top-1 | Top-5 |
|---|---:|---:|---:|---:|
| dense | 24 | 0 | 17/24 | 18/24 |
| dense-rar | 24 | 0 | 24/24 | 24/24 |
| dense-adaptive | 24 | 0 | 24/24 | 24/24 |

- JSONL rows: 72
- Required assertions: passed for formal mode, clean meta, 72 rows, 24 valid/pipeline, 0 errors, 24/24 dense-rar, 24/24 dense-adaptive.
- q113 dense-rar: candidateIdealHit=True, candidateIdealRank=27, top1Hit=True.
- q113 dense-adaptive: candidateIdealHit=True, candidateIdealRank=27, top1Hit=True.

## Category slice

| Category | Pipeline | Valid | Errors | Top-1 | Top-5 |
|---|---|---:|---:|---:|---:|
| negative_exclusion | dense | 4 | 0 | 1 | 1 |
| negative_exclusion | dense-rar | 4 | 0 | 4 | 4 |
| negative_exclusion | dense-adaptive | 4 | 0 | 4 | 4 |
| engineering_specific | dense | 4 | 0 | 1 | 1 |
| engineering_specific | dense-rar | 4 | 0 | 4 | 4 |
| engineering_specific | dense-adaptive | 4 | 0 | 4 | 4 |

## Comparison with 0801 Stage1TopK20 baseline

| Pipeline | 0801 Top1 | 0801 Top5 | 0854 Top1 | 0854 Top5 | Delta |
|---|---:|---:|---:|---:|---:|
| dense | 16/24 | 18/24 | 17/24 | 18/24 | Top1 +1, Top5 +0 |
| dense-rar | 23/24 | 23/24 | 24/24 | 24/24 | Top1 +1, Top5 +1 |
| dense-adaptive | 23/24 | 23/24 | 24/24 | 24/24 | Top1 +1, Top5 +1 |

Conclusion: Stage1TopK=50 recovers q113 and moves dense-rar/dense-adaptive from 23/24 to 24/24 without requiring BM25/RRF.

## README / registry / ledger review

Reviewed `README.md`, `README-zh.md`, `benchmarks/BENCHMARK-REGISTRY.md`, and `benchmarks/DENSE-RAR-FORMAL-LEDGER.md` for the 0854 run. They consistently identify 0854 as the latest formal Stage1TopK50 run, keep 0801 as the Stage1TopK20 baseline, and keep 0644 as probe/internal-only evidence.

## Commands run

- `git status --short && git rev-parse --short HEAD`
- Python artifact verifier for `0854.meta.json` and `0854.jsonl`
- README/registry/ledger accuracy scan
- Targeted tests: `bun test scripts/__tests__/benchmark-dense-rar.test.ts src/services/retrieval/providers/__tests__/bgeEmbeddingProvider.test.ts src/services/retrieval/providers/__tests__/bm25Provider.test.ts src/services/retrieval/providers/__tests__/rrfFusionProvider.test.ts src/services/retrieval/providers/__tests__/hybridProvider.test.ts src/services/retrieval/providers/__tests__/adaptiveHybridProvider.test.ts`

## Decision and next action

Decision: keep BGE-M3 on the persistent 8080 endpoint; ingest 0854 as the current formal dense-rar/dense-adaptive 24/24 evidence; no BM25/RRF work needed for this phase.

Next single action: after commit, use 0854 as the canonical Dense RAR formal evidence for downstream reporting/publishing.
