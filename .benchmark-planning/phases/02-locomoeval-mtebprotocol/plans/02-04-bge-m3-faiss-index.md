# Plan 02-04: Build BGE-M3 Dense FAISS Index for MTEB

## What

Build FAISS index using BGE-M3 dense embeddings for efficient MTEB retrieval.

## Why

FAISS enables fast approximate nearest neighbor search at scale. Required for full MTEB evaluation (56 datasets).

## How

### Step 1: Implement FAISS indexing

```python
import faiss
import numpy as np

def build_faiss_index(embeddings: np.ndarray, index_type: str = 'IP'):
    """
    Build FAISS index from embeddings.

    Args:
        embeddings: L2-normalized embeddings (N x D)
        index_type: 'IP' for inner product (cosine sim when normalized)

    Returns:
        FAISS index
    """
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)  # Inner product = cosine sim for normalized
    index.add(embeddings.astype(np.float32))
    return index
```

### Step 2: Integrate with SearchProtocol

Add FAISS index to `SearchProtocol.index()` for efficient search.

### Step 3: Verify index quality

Test that FAISS search returns same results as brute-force.

## Verification

1. FAISS index built from 1000 embeddings
2. Search results match brute-force within tolerance
3. Index persists to disk

## Success Criteria

SearchProtocol.search() returns ranked results matching expected MTEB RetrievalEvaluator format

## Status

- [ ] Not started
