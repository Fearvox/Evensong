# Plan 01-03: Dragon Embedding Normalization Bug Fix

## What

Fix the dragon embedding normalization inconsistency in LOCOMO's `rag_utils.py`. Dragon's `get_embeddings()` does NOT normalize, but `get_context_embeddings()` DOES normalize — causing score distribution mismatch.

## Why

BGE-M3 always normalizes. If LOCOMO evaluation code expects dragon's inconsistent normalization, swapping in BGE-M3 will produce systematically different score distributions. Fixing the LOCOMO source (not working around it) is the correct approach.

## How

### Step 1: Examine LOCOMO rag_utils.py normalization

Read the actual LOCOMO source to understand exactly where normalization happens and where it doesn't.

### Step 2: Patch LOCOMO's rag_utils.py

Add the `hybrid` retriever case to LOCOMO's `rag_utils.py`:

```python
def get_embeddings(retriever, inputs, mode='context'):
    # ... existing code for dpr, contriever, dragon, openai ...

    elif retriever == 'hybrid':
        # BGE-M3: L2-normalized consistently for both query and context
        embeddings = get_embeddings_hybrid(inputs)
        # DO normalize — consistent with BGE-M3 semantics
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / norms
        return embeddings
```

### Step 3: Verify normalization consistency

Confirm that BGE-M3 wrapper's `get_embeddings()` and `get_context_embeddings()` both produce L2-normalized outputs.

## Verification

1. LOCOMO's patched `rag_utils.py` handles `hybrid` retriever
2. Both `get_embeddings` and `get_context_embeddings` normalize consistently for `hybrid`
3. LOCOMO eval script runs without normalization errors

## Success Criteria

Dragon embedding normalization is consistent (both get_embeddings and get_context_embeddings normalize for hybrid mode)

## Status

- [ ] Not started
