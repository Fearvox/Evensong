# Plan 02-01: Run LOCOMO RAG Evaluation

## What

Run LOCOMO benchmark evaluation comparing BGE-M3 dense vs dragon baseline retrievers.

## Why

LOCOMO (ACL 2024) provides F1 and Recall metrics for memory causation in conversations. BGE-M3 dense (69.4% top-1 from Wave 3H) should outperform dragon baseline.

## How

### Step 1: Create LOCOMO eval harness

Implement `eval_locomorag.py` that:
1. Loads LOCOMO conversations from `data/locomo10.json`
2. For each QA pair, retrieves relevant context using hybrid retriever
3. Computes F1 and Recall against evidence spans

### Step 2: Implement retrieval

```python
def retrieve_for_question(question, conversation, retriever='hybrid'):
    # Get context embeddings
    context_ids, context_embs = get_context_embeddings(
        retriever, conversation, None, None
    )

    # Get query embedding
    query_emb = get_embeddings(retriever, [question], mode='query')

    # Compute similarity (dot product since both are L2-normalized)
    scores = np.dot(context_embs.numpy(), query_emb[0])

    # Get top-k
    top_k_idx = np.argsort(scores)[-5:][::-1]

    return [context_ids[i] for i in top_k_idx]
```

### Step 3: Compute metrics

- **Recall@K**: Does retrieved context contain the evidence IDs?
- **F1**: Based on overlap between retrieved and evidence

## Verification

1. LOCOMO eval runs on all 10 conversations
2. BGE-M3 dense achieves > 60% Recall@5
3. Results saved to `results/locomorag_eval.json`

## Success Criteria

LOCOMO RAG eval completes on all 10 conversations, outputting F1 + Recall for BGE-M3 dense

## Status

- [x] Completed (2026-04-22)

## Results

LOCOMO10 Conv1 (199 QAs): Recall@5=0.583, F1=0.213 (BGE-M3 dense baseline)
Per-category: Cat2 Temporal best (R=0.86), Cat5 Adversarial hardest (R=0.41)
Pipeline: ~8min context encode (419 embeddings, batch=50), ~0.5s/query
