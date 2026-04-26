# Phase 1: LOCOMO Infrastructure + BGE-M3 Endpoint Fixes - Discussion Log

> **Audit trail only.** Decisions captured in 01-CONTEXT.md.

**Date:** 2026-04-22
**Phase:** 01-locomofoundation-bgefixes
**Mode:** auto (no discussion — decisions from P10 plan synthesis)

---

## Auto-Resolved Decisions (no discussion needed)

| Area | Decision | Options Considered |
|------|----------|-----------------|
| Python wrapper location | `benchmarks/evensong/locomo_hybrid/` | LOCOMO repo / Evensong harness / standalone |
| BM25 implementation | `rank_bm25` package | rank_bm25 / custom / whoosh |
| Normalization | BGE-M3 L2-norm both paths (consistent) | dragon-consistent (inconsistent) / BGE-M3-native (consistent) |
| LOCOMO repo | Patch rag_utils.py, don't fork | patch / fork / submodule |
| BGE-M3 endpoint | private embedding host private network (existing) | private embedding host / new endpoint / cloud-hosted |
| BM25 fallback | Graceful degradation on endpoint error | fail-fast / graceful fallback |

## Notes

All decisions synthesized from P10 strategic plan + research findings (FEATURES.md, PITFALLS.md).
No user discussion required — all gray areas had clear recommended approaches from research.

