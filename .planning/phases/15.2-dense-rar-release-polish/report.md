# Phase 15.2 Dense RAR Release Polish Report

## Goal

Turn the imported Hermes Dense RAR evidence into a release-quality benchmark presentation: clear claim, short evidence chain, explicit boundaries, and no terminal-log-shaped prose in public-facing surfaces.

## Changes

- `README.md`: rewrote the Dense RAR section around the canonical formal result, evidence links, and claim boundary.
- `README-zh.md`: mirrored the same structure in Chinese.
- `benchmarks/DENSE-RAR-FORMAL-LEDGER.md`: replaced the wide single-row ledger with four scoped sections:
  - canonical formal run
  - prior formal baseline
  - probe-only evidence
  - evidence boundaries
- `benchmarks/BENCHMARK-REGISTRY.md`: made the retrieval ledger a concise pointer instead of duplicating internal run detail inside the older Evensong run index.

## Canonical Evidence Kept Intact

- Canonical run: `dense-rar-2026-04-24T0854`
- Formal status: `runMode=formal`, clean metadata commit `9148853`
- Result: dense-rar and dense-adaptive both `24/24` Top-1 and `24/24` Top-5, errors `0`
- Baseline: `dense-rar-2026-04-24T0801` remains the Stage1TopK 20 formal baseline at `23/24`
- Probe boundary: `dense-rar-2026-04-24T0644` and `dense-rar-2026-04-24T0841` remain probe-only evidence

## Presentation Decisions

- Public README sections now use role labels and artifact links instead of foregrounding infrastructure coordinates.
- The ledger still records enough audit detail to explain the run and its tradeoffs.
- Raw artifacts remain unchanged as source evidence.
- The 24/24 claim is explicitly limited to the verified 24-query Wave 3+I hard suite.
- Stage1TopK50 latency/candidate-exposure tradeoff remains visible.

## Verification

- Re-parsed `0854` JSONL and meta: `runMode=formal`, clean metadata, `stage1TopK=50`, 72 rows, 24 valid rows per pipeline, 0 errors.
- Confirmed dense-rar and dense-adaptive are both `24/24` Top-1 and `24/24` Top-5.
- Confirmed README/registry/ledger do not call `0801` the latest formal run.
- Confirmed README/registry/ledger do not promote probe runs as formal evidence.
- Ran Dense RAR/retrieval targeted tests:
  - `bun test scripts/__tests__/benchmark-dense-rar.test.ts src/services/retrieval/providers/__tests__/bgeEmbeddingProvider.test.ts src/services/retrieval/providers/__tests__/bm25Provider.test.ts src/services/retrieval/providers/__tests__/rrfFusionProvider.test.ts src/services/retrieval/providers/__tests__/hybridProvider.test.ts src/services/retrieval/providers/__tests__/adaptiveHybridProvider.test.ts`
  - Result: 69 pass, 0 fail.
