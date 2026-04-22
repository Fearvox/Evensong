# Plan 02-03: Implement MTEB SearchProtocol Interface

## What

Implement the MTEB SearchProtocol interface that allows LOCOMO-style evaluation on any MTEB dataset.

## Why

MTEB (Massive Text Embedding Benchmark) has 56 datasets. SearchProtocol provides a unified interface for retrieval evaluation.

## How

### Step 1: Define SearchProtocol interface

```python
class SearchProtocol:
    """MTEB-compatible retrieval interface."""

    def __init__(self, retriever='hybrid'):
        self.retriever = retriever

    def index(self, corpus: List[Dict], batch_size: int = 32):
        """
        Build index from corpus.

        Args:
            corpus: List of dicts with 'id', 'text' fields
            batch_size: Embedding batch size
        """
        pass

    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        """
        Search index for query.

        Returns:
            List of dicts with 'id', 'score', 'text'
        """
        pass
```

### Step 2: Implement with BGE-M3

Use `get_embeddings()` for both corpus and query encoding.
Store embeddings in memory or use FAISS for efficient retrieval.

### Step 3: Test with sample MTEB corpus

Use a small MTEB dataset (e.g., `Berard/bio-redundancy-mteb`) to verify interface.

## Verification

1. `SearchProtocol.index()` builds index from sample corpus
2. `SearchProtocol.search()` returns ranked results
3. Results format compatible with MTEB RetrievalEvaluator

## Success Criteria

SearchProtocol.index() successfully builds a FAISS index from a sample MTEB corpus

## Status

- [ ] Not started
