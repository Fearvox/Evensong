# Roadmap: Evensong x EverMind Benchmark Integration

## Overview

Adapt LOCOMO (ACL 2024) and MTEB (56 datasets) benchmarks to use Nolan's BGE-M3 dense + BM25 hybrid retriever, extend or-shot.ts with resource metrics, and produce visualizations for the EverMind algorithm team. SEED-001 trigger (EverOS PR #196 merge) unblocks actual benchmark runs; this roadmap delivers all independently preparable work before that trigger.

## Phases

- [ ] **Phase 1: LOCOMO Infrastructure + BGE-M3 Endpoint Fixes** - BGE-M3 dense retriever wrapper, LOCOMO interface implementation, dragon normalization fix, BGE endpoint bug fixes
- [ ] **Phase 2: LOCOMO Evaluation + MTEB Protocol Setup** - LOCOMO RAG eval (dense vs dragon), per-category analysis, MTEB SearchProtocol interface + dense index
- [ ] **Phase 3: MTEB Evaluation + or-shot Resource Metrics** - MTEB RetrievalEvaluator comparison (BM25 vs dense vs adaptive-hybrid), resource metrics in or-shot.ts
- [ ] **Phase 4: Visualization Dashboard** - LOCOMO per-category chart, MTEB radar chart, resource comparison table, unified dashboard for EverMind

## Phase Details

### Phase 1: LOCOMO Infrastructure + BGE-M3 Endpoint Fixes

**Goal**: LOCOMO benchmark infrastructure ready with BGE-M3 dense retriever; endpoint bugs fixed

**Depends on**: Nothing (first phase)

**Requirements**: LOCOMO-01, LOCOMO-02, LOCOMO-03, LOCOMO-04, BGE-01, BGE-02

**Success Criteria** (what must be TRUE):
  1. `init_context_model('hybrid')` and `init_query_model('hybrid')` return working retriever instances callable from LOCOMO eval harness
  2. `get_embeddings('hybrid', texts, mode)` returns np.ndarray with BGE-M3 dense embeddings; BM25 fallback activates when BGE-M3 endpoint is unreachable
  3. `get_context_embeddings('hybrid', data, tokenizer, encoder)` produces LOCOMO-compatible format without crashing on any of the 10 LOCOMO conversations
  4. Dragon embedding normalization inconsistency is fixed (get_embeddings normalizes, get_context_embeddings normalizes — both consistent)
  5. BGE-M3 endpoint accepts `--embedding` flag (Atomic Chat v1.1.44 bug fixed)
  6. BGE-M3 batch size handles `maxChars: 1000` without exceeding `-b 512` limit

**Plans**: TBD

Plans:
- [ ] 01-01: Implement BGE-M3 dense retriever wrapper (LOCOMO-01, LOCOMO-02)
- [ ] 01-02: Implement get_context_embeddings with LOCOMO format compatibility (LOCOMO-03)
- [ ] 01-03: Fix dragon embedding normalization inconsistency bug (LOCOMO-04)
- [ ] 01-04: Fix Atomic Chat v1.1.44 `--embedding` flag missing (BGE-01)
- [ ] 01-05: Fix BGE-M3 batch size / maxChars limit (BGE-02)

### Phase 2: LOCOMO Evaluation + MTEB Protocol Setup

**Goal**: LOCOMO eval runs and produces F1/Recall results; MTEB SearchProtocol ready

**Depends on**: Phase 1

**Requirements**: LOCOMO-05, LOCOMO-06, MTEB-01, MTEB-02

**Success Criteria** (what must be TRUE):
  1. LOCOMO RAG eval completes on all 10 conversations, outputting F1 + Recall for BGE-M3 dense and dragon baseline
  2. Per-category breakdown exists for all 5 LOCOMO categories (Personal Facts, Temporal, Inferences, Explanations, Adversarial) with F1 and Recall per category
  3. `SearchProtocol.index()` successfully builds a FAISS index from a sample MTEB corpus
  4. `SearchProtocol.search()` returns ranked results matching expected MTEB RetrievalEvaluator format

**Plans**: TBD

Plans:
- [ ] 02-01: Run LOCOMO RAG evaluation: BGE-M3 dense vs dragon baseline (LOCOMO-05)
- [ ] 02-02: Generate per-category LOCOMO precision analysis (LOCOMO-06)
- [ ] 02-03: Implement MTEB SearchProtocol interface (MTEB-01)
- [ ] 02-04: Build BGE-M3 dense FAISS index for MTEB (MTEB-02)

### Phase 3: MTEB Evaluation + or-shot Resource Metrics

**Goal**: MTEB comparison complete with MRR/NDCG/Recall metrics; resource tracking added to or-shot.ts

**Depends on**: Phase 2

**Requirements**: MTEB-03, MTEB-04, RESOURCE-01, RESOURCE-02, RESOURCE-03

**Success Criteria** (what must be TRUE):
  1. MTEB RetrievalEvaluator produces MRR@K, NDCG@K, Recall@K (K=1,3,5,10,100) for at least one MTEB dataset comparing BM25 vs dense vs adaptive-hybrid
  2. or-shot.ts output JSON includes `memory_mb` field populated from `process.memoryUsage().heapUsed`
  3. or-shot.ts output JSON includes `disk_mb` field with actual output file size
  4. `finish_reason=length` no longer appears on runs hitting max_tokens 16000 limit (RESOURCE-03)

**Plans**: TBD

Plans:
- [ ] 03-01: Run MTEB RetrievalEvaluator comparison: BM25 vs dense vs adaptive-hybrid (MTEB-03)
- [ ] 03-02: Output MTEB standardized metrics: MRR@K, NDCG@K, Recall@K (MTEB-04)
- [ ] 03-03: Add memory_mb and disk_mb fields to or-shot.ts (RESOURCE-01, RESOURCE-02)
- [ ] 03-04: Fix finish_reason=length max_tokens issue (RESOURCE-03)

### Phase 4: Visualization Dashboard

**Goal**: EverMind algorithm team can view all benchmark results in unified dashboard

**Depends on**: Phase 3

**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04

**Success Criteria** (what must be TRUE):
  1. LOCOMO per-category bar chart is renderable (F1 + Recall per category, BGE-M3 dense vs dragon)
  2. MTEB MRR/Recall radar chart is renderable (multi-dimensional view of retrieval quality)
  3. Resource comparison table shows Latency / Token / Memory / Disk for each model
  4. Unified dashboard page exists at a stable URL with all four visualizations accessible

**Plans**: TBD

Plans:
- [ ] 04-01: Build LOCOMO per-category bar chart (VIZ-02)
- [ ] 04-02: Build MTEB MRR/Recall radar chart (VIZ-03)
- [ ] 04-03: Build resource consumption comparison table (VIZ-04)
- [ ] 04-04: Assemble unified dashboard (VIZ-01)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. LOCOMO Infrastructure + BGE Fixes | 0/5 | Not started | - |
| 2. LOCOMO Evaluation + MTEB Protocol | 4/4 | ✓ Complete (2026-04-22) | 620e8df |
| 3. MTEB Evaluation + Resource Metrics | 4/4 | ✓ Complete (2026-04-22) | 0a2432a |
| 4. Visualization Dashboard | 0/4 | Planned (2026-04-22) | - |
| 4. Visualization Dashboard | 0/4 | Not started | - |
