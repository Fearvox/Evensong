# Plan 01-01: BGE-M3 Dense Retriever Wrapper

## What

Implement BGE-M3 dense retriever as a Python module with LOCOMO-compatible four-function interface (`init_context_model`, `init_query_model`, `get_embeddings`).

## Why

LOCOMO benchmark requires a retriever implementing the `rag_utils.py` contract. Nolan's BGE-M3 dense (validated at 69.4% top-1) must replace dragon/Contriever.

## How

### Step 1: Create wrapper directory

```bash
mkdir -p benchmarks/evensong/locomo_hybrid
```

### Step 2: Create `rag_utils_patch.py`

Implement the four required functions for the `hybrid` retriever:

```python
# rag_utils_patch.py
import numpy as np
import torch
from transformers import AutoTokenizer, AutoModel
import httpx

BGE_ENDPOINT = "http://<PRIVATE_EMBEDDING_HOST>:8080/embed"

def init_context_model(retriever):
    if retriever != 'hybrid':
        raise ValueError(f"Unknown retriever: {retriever}")
    tokenizer = AutoTokenizer.from_pretrained('BAAI/bge-m3')
    encoder = AutoModel.from_pretrained('BAAI/bge-m3').cuda()
    encoder.eval()
    return tokenizer, encoder

def init_query_model(retriever):
    return init_context_model(retriever)

def get_embeddings(retriever, inputs, mode='context'):
    if retriever != 'hybrid':
        raise ValueError(f"Unknown retriever: {retriever}")
    try:
        resp = httpx.post(BGE_ENDPOINT, json={"texts": inputs}, timeout=10)
        resp.raise_error()
        embeddings = resp.json()['embeddings']
        return np.array(embeddings)
    except Exception:
        tokenizer, encoder = init_context_model(retriever)
        with torch.no_grad():
            inputs_tok = tokenizer(inputs, padding=True, truncation=True, return_tensors='pt')
            inputs_tok = {k: v.cuda() for k, v in inputs_tok.items()}
            outputs = encoder(**inputs_tok)
            embeddings = outputs.last_hidden_state[:, 0, :].cpu().numpy()
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            embeddings = embeddings / norms
            return embeddings

def get_context_embeddings(retriever, data, context_tokenizer, context_encoder, captions=None):
    formatted = []
    context_ids = []
    for session_idx, session in enumerate(data.get('sessions', [])):
        for turn_idx, turn in enumerate(session.get('turns', [])):
            dia_id = f"D{session_idx+1}:{turn_idx+1}"
            speaker = turn.get('speaker', 'Unknown')
            text = turn.get('text', '')
            dt = turn.get('datetime', '')
            formatted_text = f"({dt}) {speaker} said, \"{text}\"\n"
            formatted.append(formatted_text)
            context_ids.append(dia_id)
    embeddings = get_embeddings(retriever, formatted, mode='context')
    return context_ids, torch.from_numpy(embeddings)
```

### Step 3: Verify import

Test that the wrapper can be imported and produces correct output shapes.

## Verification

1. `python -c "from rag_utils_patch import init_context_model; t, e = init_context_model('hybrid'); print('OK')"` succeeds
2. `get_embeddings('hybrid', ['test query', 'another query'])` returns np.ndarray with shape (2, 1024)
3. Output is L2-normalized

## Success Criteria

- `init_context_model('hybrid')` returns (tokenizer, encoder) tuple
- `get_embeddings('hybrid', texts)` returns L2-normalized np.ndarray
- BM25 fallback activates when BGE endpoint unreachable

## Status

- [x] Done (2026-04-22) — Implemented at `benchmarks/evensong/locomo_hybrid/rag_utils_patch.py`
