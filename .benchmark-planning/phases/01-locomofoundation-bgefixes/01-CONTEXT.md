# Phase 1: LOCOMO Infrastructure + BGE-M3 Endpoint Fixes - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build LOCOMO-compatible BGE-M3 dense retriever wrapper and fix BGE-M3 endpoint bugs. Deliverables: Python module with `init_context_model`/`init_query_model`/`get_embeddings`/`get_context_embeddings` interfaces, dragon normalization compatibility, and fixed Atomic Chat v1.1.44 endpoint.

</domain>

<decisions>
## Implementation Decisions

### Python Wrapper Location
- **D-01:** BGE-M3 wrapper lives in `benchmarks/evensong/locomo_hybrid/` directory — co-located with benchmark harness, not inside LOCOMO repo clone

### BM25 Implementation
- **D-02:** Use `rank_bm25` Python package for BM25 — standard, well-tested, no need to reinvent

### Normalization Strategy
- **D-03:** BGE-M3 wrapper normalizes consistently (L2-norm for both `get_embeddings` AND `get_context_embeddings`) — this is a deviation from dragon's inconsistent normalization but is correct for BGE-M3 semantics
- **D-04:** Add explicit `normalize=True` flag to wrapper to allow future comparison runs with/without normalization

### LOCOMO Repo Integration
- **D-05:** LOCOMO repo cloned to `benchmarks/evensong/locomo/` — patch `task_eval/rag_utils.py` with `hybrid` retriever option, don't fork LOCOMO

### BGE-M3 Endpoint
- **D-06:** BGE-M3 dense calls go to ccr-droplet Tailscale endpoint (already deployed at 100.65.234.77)
- **D-07:** BM25 fallback activates when BGE-M3 endpoint returns error — graceful degradation, not hard failure

### Claude's Discretion
- Exact batch size for embedding calls
- HTTP timeout values for BGE-M3 endpoint
- Error handling specifics for network failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### LOCOMO Retriever Interface
- `.benchmark-planning/research/FEATURES.md` §1.1-1.2 — LOCOMO's four required functions (init_context_model, init_query_model, get_embeddings, get_context_embeddings), embedding strategies for dragon/contriever/dpr/openai
- `.benchmark-planning/research/FEATURES.md` §1.4-1.5 — LOCOMO output format (F1 + Recall) and metrics definition

### LOCOMO Bugs to Fix
- `.benchmark-planning/research/PITFALLS.md` §1 — Dragon embedding normalization inconsistency (get_embeddings NOT normalized, get_context_embeddings normalized) and LOCOMO's own mean_pooling NameError bug
- `.benchmark-planning/research/PITFALLS.md` §2 — BGE-M3 Tailscale endpoint failure modes (Atomic Chat v1.1.44 --embedding flag missing, maxChars exceeds batch limit)

### BGE-M3 Integration
- Wave 3H research (CCR codebase) — BGE-M3 dense via ccr-droplet Tailscale, already validated at 69.4% top-1 vs 61.1% RRF

### MTEB Protocol (Phase 2 dependency)
- `.benchmark-planning/research/FEATURES.md` §2.1-2.2 — SearchProtocol interface with index() + search() methods

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `benchmarks/evensong/or-shot.ts` — benchmark harness pattern (Bun, JSONL output, run directory structure)
- `benchmarks/evensong/types.ts` — BENCHMARK_MODELS array with 16 model presets
- ccr-droplet Tailscale endpoint at 100.65.234.77 — already running BGE-M3 embedding service

### Established Patterns
- LOCOMO eval scripts use `rag_utils.py` with four-function retriever contract
- BGE-M3 produces L2-normalized dense vectors via `embeddings['dense_vecs']`

### Integration Points
- LOCOMO `task_eval/gpt_utils.py` calls `get_context_embeddings()` then `get_embeddings()` then dot-product similarity
- Phase 2: MTEB SearchProtocol uses same `index()` + `search()` pattern

</code_context>

<specifics>
## Specific Ideas

- "BGE-M3 wrapper should be callable from both LOCOMO and a standalone test script"
- "BM25 fallback should log when activated so we can measure fallback rate"

</specifics>

<deferred>
## Deferred Ideas

- None — all items in scope for Phase 1

</deferred>

---
*Phase: 01-locomofoundation-bgefixes*
*Context gathered: 2026-04-22*
