# SUMMARY 02-03: MTEB SearchProtocol Interface

## What

Implemented `SearchProtocol` — MTEB-compatible retrieval interface wrapping BGE-M3 dense retriever from rag_utils_patch.

## Implementation

Created `benchmarks/evensong/locomo_hybrid/search_protocol.py`:

```python
sp = SearchProtocol()            # BGE-M3 dense
sp.index(corpus=[...])           # LOCOMO-format or flat [{id, text}]
results = sp.search('query', top_k=10)
# [{'id': 'D1:3', 'score': 0.732, 'text': '...'}, ...]
```

**Key features:**
- LOCOMO-format detection: pass single conversation dict → auto-parses session_N keys
- Flat corpus format: pass `[{id, text}, ...]` → standard MTEB input
- Brute-force dot-product (L2-normalized) — FAISS optional
- Graceful FAISS fallback when not installed

## Verification

| Test | Result |
|------|--------|
| LOCOMO format index (419 docs) | ✓ Indexed in ~8min |
| search() query | ✓ Top-1 = D1:3 (correct) |
| Flat corpus format | ✓ doc_5 ranked top for "topic 5" |
| FAISS graceful fallback | ✓ ImportError caught, brute-force active |

## Files Created

- `benchmarks/evensong/locomo_hybrid/search_protocol.py` — 280 lines

## Notes

- FAISS not installed; `use_faiss=True` falls back to brute-force
- BGE endpoint batch_size=50 to avoid timeout (>100 texts/timeout)
- LOCOMO format: `{session_N: [turns], session_N_date_time: ...}` auto-detected
