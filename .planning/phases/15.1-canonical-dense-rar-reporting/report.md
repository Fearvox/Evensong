# Phase 15.1 — Canonical Dense RAR reporting pack

## Canonical status

- Canonical latest formal Dense RAR evidence: `dense-rar-2026-04-24T0854`.
- Repository preflight HEAD: `fd50cde`.
- Formal run metadata commit: `9148853`, clean git, `runMode=formal`.
- Prior formal baseline: `dense-rar-2026-04-24T0801` remains Stage-1 TopK 20 baseline, not latest.
- Prior probe: `dense-rar-2026-04-24T0644` remains internal/probe only.

## Artifacts

- `/root/ccr/benchmarks/runs/wave3i-dense-rar-2026-04-24T0854.md`
- `/root/ccr/benchmarks/runs/wave3i-dense-rar-2026-04-24T0854.meta.json`
- `/root/ccr/benchmarks/runs/wave3i-dense-rar-2026-04-24T0854.jsonl`
- `/root/ccr/.planning/phases/15.0-stage1topk50-formal-rerun/report.md`

## Result table

| Pipeline | Top-1 | Top-5 | Valid rows | Errors |
|---|---:|---:|---:|---:|
| dense | 17/24 | 18/24 | 24/24 | 0 |
| dense-rar | 24/24 | 24/24 | 24/24 | 0 |
| dense-adaptive | 24/24 | 24/24 | 24/24 | 0 |

q113 is verified as `candidateIdealHit=true` and `top1Hit=true` for dense-rar and dense-adaptive in the 0854 formal run.

## Latency and risk note

Stage1TopK50 fixed the q113 candidate-recall blind spot by exposing more candidates to the reranker, but it increases rerank/adaptive candidate exposure from 20 to 50. Public/local summaries must keep the latency/cost tradeoff visible and must not generalize beyond the verified 24-query hard suite.

## Surfaces checked

- `README.md`
- `README-zh.md`
- `benchmarks/BENCHMARK-REGISTRY.md`
- `benchmarks/DENSE-RAR-FORMAL-LEDGER.md`
- `benchmarks/runs/wave3i-dense-rar-2026-04-24T0854.*`
- `.planning/phases/15.0-stage1topk50-formal-rerun/report.md`
- `docs/` and `benchmarks/evensong/` search hits for unrelated Evensong pass-rate summaries

## Changes made

No stale downstream benchmark summary needed correction: README, README-zh, BENCHMARK-REGISTRY, and DENSE-RAR-FORMAL-LEDGER already identify 0854 as latest/canonical formal evidence, keep 0801 as prior Stage1TopK20 formal baseline, keep 0644 as probe/internal, and include the Stage1TopK50 latency/candidate-exposure caveat.

This Phase 15.1 report was added as the compact downstream handoff pack.

## Next immediate action

Publish or locally sync the canonical reporting set from README/README-zh, `benchmarks/BENCHMARK-REGISTRY.md`, `benchmarks/DENSE-RAR-FORMAL-LEDGER.md`, and this report. Do not rerun the benchmark unless the tracked 0854 artifacts fail future integrity checks.
