# Feature Landscape: LOCOMO ET and MTEB Retrieval Benchmarks

**Domain:** Long-term memory retrieval evaluation for LLM agents
**Researched:** 2026-04-21
**Confidence:** MEDIUM (GitHub source analysis + WebFetch verification)

---

## 1. LOCOMO ET — Retriever Interface

### 1.1 Supported Retrievers

LOCOMO supports four retriever backends via `task_eval/rag_utils.py`:

| Retriever | Query Encoder | Context Encoder | Embedding Strategy |
|-----------|---------------|-----------------|-------------------|
| `dpr` | facebook/dpr-question_encoder-single-nq-base | facebook/dpr-ctx_encoder-single-nq-base | CLS token, L2-norm normalized |
| `contriever` | facebook/contriever | facebook/contriever | Mean pooling over last hidden state, L2-norm normalized |
| `dragon` | facebook/dragon-plus-query-encoder | facebook/dragon-plus-context-encoder | CLS token, NOT normalized (raw dot-product) |
| `openai` | text-embedding-ada-002 | text-embedding-ada-002 | API call, returns raw embedding |

### 1.2 Required Functions to Implement

To inject Nolan's BGE-M3 hybrid (dense + BM25) as a LOCOMO retriever, implement these three functions in a `rag_utils`-compatible module:

```python
def init_context_model(retriever):
    """Return (tokenizer, encoder_model) for context encoding."""
    # LOCOMO calls this once, caches model on CUDA
    # Your implementation: return (None, bge_m3_encoder)
    if retriever == 'hybrid':
        from your_module import BGEEncoder
        tokenizer = AutoTokenizer.from_pretrained('BAAI/bge-m3')
        encoder = BGEEncoder().cuda()
        encoder.eval()
        return tokenizer, encoder
    raise ValueError(f"Unknown retriever: {retriever}")

def init_query_model(retriever):
    """Return (tokenizer, encoder_model) for query encoding."""
    # For contriever/dpr: same model for both query and context
    # For dragon/openai: separate query encoder
    # Your implementation: return (tokenizer, bge_m3_encoder) for query encoding
    ...

def get_embeddings(retriever, inputs, mode='context'):
    """Encode batch of texts. Return np.ndarray of shape (N, dim)."""
    # Called per batch (batch_size=24)
    # mode='context' uses init_context_model; mode='query' uses init_query_model
    # Must return torch.cat(all_embeddings).cpu().numpy()
    ...

def get_context_embeddings(retriever, data, context_tokenizer, context_encoder, captions=None):
    """Encode full conversation corpus for a single sample."""
    # Iterates over sessions 1-19, formats each dialog turn as:
    # "(<datetime>) <speaker> said, \"<compressed_text>\"\n"
    # Returns (context_ids: list[str], context_embeddings: torch.Tensor)
    # context_ids are dia_id strings like "D1:3"
    ...
```

### 1.3 RAG Mode Databases

LOCOMO supports three database modes (passed as `--rag-mode`):

| Mode | Content Indexed | Notes |
|------|-----------------|-------|
| `dialog` | Raw compressed_text per turn | Main retrieval target |
| `observation` | GPT-3.5 generated session observations | Pre-computed, in data |
| `summary` | GPT-3.5 session summaries | Pre-computed, in data |

Top-K values tested: **5, 10, 25, 50** for dialog/observation; **2, 5, 10** for summary.

### 1.4 Output Format

LOCOMO outputs a JSON file (one object per sample) with these keys:

```json
{
  "sample_id": "locomo_0",
  "qa": [
    {
      "question": "...",
      "answer": "...",
      "evidence": ["D1:3", "D5:7"],
      "category": 1,
      "gpt-3.5-turbo_dialog_top_5_prediction": "...",
      "gpt-3.5-turbo_dialog_top_5_f1": 0.85,
      "gpt-3.5-turbo_dialog_top_5_recall": 0.60
    }
  ]
}
```

### 1.5 Metrics

| Metric | Definition | Used For |
|--------|------------|----------|
| **F1** | Token-level exact match after normalization (lowercase, remove punctuation/articles) | QA answer quality |
| **Recall** | Fraction of `evidence` dialog IDs found in top-K retrieved docs | Retrieval quality |
| **Accuracy by category** | Per-category F1 averaged | Breakdown by question type |

The `eval_question_answering()` function in `evaluation.py` computes F1 via `has_answer()` — checks if any retrieved doc's `text` contains a token-normalized answer string.

### 1.6 Integration Point

The integration happens in `task_eval/gpt_utils.py`. The RAG flow:

1. `get_context_embeddings()` encodes all dialog turns for the sample
2. `get_embeddings()` encodes the question
3. Dot-product similarity scores all context embeddings vs. query embedding
4. Top-K docs retrieved, formatted as context
5. LLM generates answer given RAG context
6. F1 + recall computed in `eval_question_answering()`

---

## 2. MTEB — RetrievalEvaluator Interface

### 2.1 Custom Retriever Injection Protocol

MTEB's `RetrievalEvaluator` expects a `SearchProtocol` (runtime-checkable Protocol). Nolan's hybrid must implement this interface:

```python
from mteb.models.models_protocols import SearchProtocol

class HybridSearchProtocol(SearchProtocol):
    """Your BGE-M3 dense + BM25 hybrid as MTEB retriever."""

    @property
    def mteb_model_meta(self) -> ModelMeta:
        ...

    def index(
        self,
        corpus: CorpusDatasetType,
        *,
        task_metadata: TaskMetadata,
        hf_split: str,
        hf_subset: str,
        encode_kwargs: EncodeKwargs,
        num_proc: int | None,
    ) -> None:
        """Index the corpus. Encode all documents, build search index."""
        ...

    def search(
        self,
        queries: QueryDatasetType,
        *,
        task_metadata: TaskMetadata,
        hf_split: str,
        hf_subset: str,
        top_k: int,
        encode_kwargs: EncodeKwargs,
        top_ranked: TopRankedDocumentsType | None = None,
        num_proc: int | None,
    ) -> RetrievalOutputType:
        """Search. Returns dict[query_id, dict[doc_id, relevance_score]]."""
        ...
```

### 2.2 EncoderProtocol (for SearchEncoderWrapper composition)

If using `SearchEncoderWrapper` as base, implement `EncoderProtocol`:

```python
class HybridEncoder(EncoderProtocol):
    def __init__(self, model_name: str = "BAAI/bge-m3", ...): ...
    def encode(
        self,
        inputs: DataLoader[BatchedInput],
        *,
        task_metadata: TaskMetadata,
        hf_split: str,
        hf_subset: str,
        prompt_type: PromptType,
        **kwargs,
    ) -> Array: ...
```

### 2.3 Output Format

MTEB returns `RetrievalOutputType` (dict[query_id, dict[doc_id, float]]):

```python
{
    "q1": {"d1": 0.95, "d3": 0.87, "d7": 0.82},
    "q2": {"d2": 0.91, "d5": 0.88},
}
```

### 2.4 Metrics Computed

`RetrievalEvaluator.evaluate()` calls `calculate_retrieval_scores()` using **pytrec_eval**:

| Metric | K Values | Description |
|--------|----------|-------------|
| **MRR@K** | [1, 3, 5, 10, 100] | Mean Reciprocal Rank of first relevant doc |
| **NDCG@K** | [1, 3, 5, 10, 100] | Normalized Discounted Cumulative Gain |
| **Recall@K** | [1, 3, 5, 10, 100] | Fraction of relevant docs in top-K |
| **Precision@K** | [1, 3, 5, 10, 100] | Fraction of top-K docs that are relevant |
| **Hit Rate@K** | [1, 3, 5, 10, 100] | Whether any relevant doc in top-K |

### 2.5 Integration Path

```python
from mteb.evaluation.evaluators import RetrievalEvaluator

evaluator = RetrievalEvaluator(
    corpus=corpus_dataset,
    queries=queries_dataset,
    task_metadata=task_metadata,
    hf_split="test",
    hf_subset=None,
    top_k=10,
)
results = evaluator(search_model=model, encode_kwargs={})
evaluation_result = evaluator.evaluate(qrels=qrels, results=results, k_values=[1,3,5,10])
```

---

## 3. LOCOMO Categories (5 types)

| Category | Name | Description | Example |
|----------|------|-------------|---------|
| **1** | Personal Facts | Identity, preferences, activities, possessions, relationships | "What does Caroline collect?" |
| **2** | Temporal Information | When events occurred | "When did they last go camping?" |
| **3** | Inferences | Reasoning about likely behaviors/preferences from evidence | "Why might Caroline prefer Italian food?" |
| **4** | Explanations | Motivations, meanings, reasons behind choices | "What did Caroline mean when she said X?" |
| **5** | Adversarial | Tests attribution errors — wrong person gets credit | "Did Melanie or Caroline say Y?" |

---

## 4. Feature Dependencies

### LOCOMO Dependencies
```
get_context_embeddings(session_data)
       ↓
get_embeddings(query, mode='query')
       ↓
Dot-product similarity scoring
       ↓
Top-K selection + format as RAG context
       ↓
LLM generation (gpt_utils.py)
       ↓
eval_question_answering() → F1 + Recall
       ↓
analyze_aggr_acc() → per-category breakdown
```

### MTEB Dependencies
```
RetrievalEvaluator(search_model, encode_kwargs)
       ↓
search_model.index(corpus) → encode + build index
       ↓
search_model.search(queries) → hybrid retrieval
       ↓
RetrievalEvaluator.evaluate(qrels, results)
       ↓
calculate_retrieval_scores() → MRR, NDCG, Recall, Precision
```

---

## 5. Integration Requirements Summary

### For LOCOMO
- [ ] Implement `init_context_model('hybrid')` returning (tokenizer, BGE-M3 encoder on CUDA)
- [ ] Implement `init_query_model('hybrid')` returning (tokenizer, BGE-M3 encoder on CUDA)
- [ ] Implement `get_embeddings('hybrid', texts, mode)` returning np.ndarray
- [ ] Implement `get_context_embeddings('hybrid', data, tokenizer, encoder)` returning (ids, embeddings)
- [ ] Support BM25 fallback for cases where dense retrieval underperforms
- [ ] Format context as `"(<datetime>) <speaker> said, \"<text>\"\n"`

### For MTEB
- [ ] Implement `SearchProtocol` with `index()` and `search()` methods
- [ ] `encode()` corpus via BGE-M3 with `PromptType.document`
- [ ] `encode()` queries via BGE-M3 with `PromptType.query`
- [ ] Build hybrid index: FAISS for dense + rank BM25 scores
- [ ] Return `{query_id: {doc_id: score}}` dict from `search()`

### Shared
- [ ] BM25 scoring function (LOCOMO uses raw text; MTEB uses pre-tokenized corpus)
- [ ] RRF or weighted score fusion (if hybrid; note: Wave 3H showed dense alone beats RRF)

---

## 6. Anti-Features

| Do NOT Build | Why |
|--------------|-----|
| RRF fusion for LOCOMO | Wave 3H Phase 4: RRF 61.1% < Dense 69.4% |
| Multi-vector BM25 (COLIEE-style) | LOCOMO expects simple token matching, not learned sparse |
| Learned sparse (BGE-M3 ColBERT) | BGE-M3 ColBERT is for reranking, not first-stage retrieval |
| Query expansion / pseudo-relevance feedback | LOCOMO evaluates raw retrieval; expansion would alter what is being measured |

---

## Sources

- [LOCOMO GitHub (snap-research/locomo)](https://github.com/snap-research/locomo) — retriever implementation, data format, categories
- [LOCOMO rag_utils.py](https://raw.githubusercontent.com/snap-research/locomo/main/task_eval/rag_utils.py) — dragon/contriever/dpr/openai implementations
- [LOCOMO evaluation.py](https://raw.githubusercontent.com/snap-research/locomo/main/task_eval/evaluation.py) — F1, recall metrics
- [LOCOMO evaluation_stats.py](https://raw.githubusercontent.com/snap-research/locomo/main/task_eval/evaluation_stats.py) — per-category accuracy breakdown
- [MTEB RetrievalEvaluator](https://github.com/embeddings-benchmark/mteb) — SearchProtocol interface
- [MTEB retrieval_metrics.py](https://github.com/embeddings-benchmark/mteb/blob/main/mteb/_evaluators/retrieval_metrics.py) — MRR, NDCG, Recall via pytrec_eval
- [MTEB models_protocols.py](https://github.com/embeddings-benchmark/mteb/blob/main/mteb/models/models_protocols.py) — SearchProtocol, EncoderProtocol
- [MTEB search_wrappers.py](https://github.com/embeddings-benchmark/mteb/blob/main/mteb/models/search_wrappers.py) — SearchEncoderWrapper composition
