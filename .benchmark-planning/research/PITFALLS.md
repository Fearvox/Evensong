# Domain Pitfalls: Custom Retriever Integration into LOCOMO and MTEB

**Domain:** Retrieval benchmark integration (BGE-M3 dense + BM25 hybrid retriever)
**Researched:** 2026-04-21
**Confidence:** MEDIUM-HIGH (GitHub source analysis + CCR codebase verification)

---

## 1. LOCOMO Retriever Substitution Pitfalls

### Critical: Dragon/Contriever Embedding Contract Mismatch

**What goes wrong:** BGE-M3 dense embedding produces different vector semantics than what LOCOMO's evaluation expects, causing retrieval quality regression.

**Root cause:** LOCOMO was designed and validated with specific embedding strategies:

| Aspect | Dragon | Contriever | BGE-M3 (your case) |
|--------|--------|-------------|-------------------|
| Pooling | CLS token `[:, 0, :]` | Mean pooling with attention mask | Dense vector via `embeddings['dense_vecs']` |
| Normalization | NOT normalized (raw dot-product) | L2-normalized | L2-normalized (cosine sim) |
| Query encoder | Separate `dragon-plus-query-encoder` | Same as context | Single model for both |
| Context encoder | Separate `dragon-plus-context-encoder` | Same as query | Single model |

**Consequences:** LOCOMO's `get_context_embeddings()` in `rag_utils.py` applies normalization in some code paths but not others. The `get_embeddings()` function for dragon does NOT normalize, but `get_context_embeddings()` DOES normalize dragon outputs. This inconsistency means swapping in BGE-M3 (which always normalizes) will produce systematically different score distributions.

**Prevention:** Implement a compatibility layer that matches the exact normalization path used by the target retriever. If LOCOMO validated with dragon's no-normalization for `get_embeddings()`, your BGE-M3 wrapper must optionally skip normalization.

### Critical: Bug in LOCOMO's Own `mean_pooling` Call

**What goes wrong:** LOCOMO's `contriever` path in `get_embeddings()` passes the wrong attention mask to `mean_pooling()`.

```python
# LOCOMO rag_utils.py — BUG
outputs = encoder(**ctx_input)
embeddings = mean_pooling(outputs[0], inputs['attention_mask'])  # WRONG: `inputs` not defined
# Should be: ctx_input['attention_mask']
```

**Why it happens:** The function parameter is named `inputs` but the tokenized variable is `ctx_input`. Python's name resolution picks up a stale `inputs` from an outer scope (or raises NameError).

**Consequences:** Contriever mode may silently produce garbage embeddings or crash depending on Python version. Dragon mode works because it does not use mean pooling.

**Prevention:** If using contriever mode in LOCOMO, this bug is pre-existing. If substituting BGE-M3, ensure your wrapper does NOT call mean_pooling — BGE-M3's `encode()` returns ready-to-use dense vectors.

### Critical: Bug in `init_query_model` for Contriever

**What goes wrong:** `init_query_model('contriever')` references `context_tokenizer` which is not in scope.

```python
def init_query_model(retriever):
    # ...
    elif retriever == 'contriever':
        context_tokenizer = context_tokenizer  # BUG: context_tokenizer not defined in this function
        question_model = AutoModel.from_pretrained('facebook/contriever').cuda()
```

**Why it happens:** The function attempts to assign `context_tokenizer` to itself (no-op) instead of loading from pretrained.

**Consequences:** Calling `init_query_model('contriever')` raises `NameError` or uses stale state. Only `dragon` and `dpr` query models load correctly.

**Prevention:** This is LOCOMO's bug, not yours. When substituting retrievers, always implement fresh model loading in both `init_query_model` and `init_context_model`.

### Moderate: Hardcoded `batch_size=24` in LOCOMO

**What goes wrong:** LOCOMO's `get_embeddings()` hardcodes `batch_size = 24`. BGE-M3 on GPU with fp16 can handle much larger batches (128-512 depending on VRAM).

**Consequences:** 3-5x slower encoding than necessary. For LOCOMO's 10-sample evaluation this is tolerable; for MTEB's large datasets it becomes a bottleneck.

**Prevention:** Parameterize batch_size or detect GPU capacity dynamically. The BGE-M3 `BGEM3FlagModel.encode()` accepts explicit `batch_size` parameter.

### Minor: Dragon's `get_embeddings` vs `get_context_embeddings` Normalization Inconsistency

**What goes wrong:** In `rag_utils.py`, `get_embeddings('dragon', ...)` returns unnormalized embeddings, but `get_context_embeddings('dragon', ...)` applies `torch.nn.functional.normalize()` before returning.

**Consequences:** Query-to-context similarity scores use unnormalized dot product in one path and normalized dot product in another. Mixing these produces incompatible score ranges.

**Prevention:** If validating hybrid BGE-M3 against LOCOMO baselines, run both with identical normalization settings end-to-end.

---

## 2. MTEB Custom Retriever Gotchas

### Critical: Runtime Protocol Detection — No Compile-Time Safety

**What goes wrong:** MTEB detects your retriever type at runtime via `isinstance()` checks and wraps accordingly:

```python
if isinstance(model, EncoderProtocol):
    search_model = SearchEncoderWrapper(model)
elif isinstance(model, CrossEncoderProtocol):
    search_model = SearchCrossEncoderWrapper(model)
elif isinstance(model, SearchProtocol):
    search_model = model
else:
    raise ValueError(f"RetrievalEvaluator expects SearchInterface, Encoder, or CrossEncoder, got {type(model)}")
```

**Why it happens:** Python's Protocol is structural (duck-typed), not nominal. Missing a single required method only errors at runtime when the method is first called.

**Consequences:** A subtle method signature mismatch (e.g., `search(self, queries, ...)` vs `search(self, queries: list, ...)`) silently picks the wrong wrapper branch. The wrapper then fails in unpredictable ways during evaluation.

**Prevention:** Implement `SearchProtocol` directly (not `EncoderProtocol` + wrapper) for full control. Validate your implementation against MTEB's test suite before integration. Use `typing.cast` to assert your type to the Protocol.

### Critical: `encode_kwargs` Sprawl — Parameters Get Lost

**What goes wrong:** `encode_kwargs` flows through `evaluate()` → `_evaluate_subset()` → `RetrievalEvaluator` → `SearchEncoderWrapper` → `encode()`:

```
encode_kwargs passed here ──────────────────────
                                          ↓
evaluator.evaluate(model, encode_kwargs={...})
    ↓
RetrievalEvaluator._evaluate_subset()
    ↓
SearchEncoderWrapper.search() ← encode_kwargs arrives but may not propagate
    ↓
model.encode() ← encode_kwargs may be partially applied or dropped
```

**Why it happens:** Each layer in the call chain is expected to forward `encode_kwargs` to the next, but custom wrappers often forget to propagate all keys (e.g., `prompt_type`, `batch_size`, `max_length`).

**Consequences:** Your custom retriever receives default encoding parameters instead of the task-specific ones MTEB computed. Batch sizes may be wrong, prompt templates ignored.

**Prevention:** Explicitly document which `encode_kwargs` keys your retriever handles and which it ignores. Log a warning for unhandled keys. Write integration tests that assert specific kwargs reach your encoder.

### Critical: GPU Memory Not Released Between Tasks

**What goes wrong:** When running MTEB with multiple retrieval tasks (e.g., NQ + MS MARCO), GPU memory from the first task's indexing persists into subsequent tasks.

**Why it happens:** `SearchEncoderWrapper.index()` loads corpus embeddings into GPU memory via the encoder, but MTEB's task loop does not call `del` or trigger garbage collection between tasks.

**Consequences:** Out-of-memory errors when running more than 2-3 retrieval tasks sequentially, even if individual corpora fit in VRAM. The memory appears to "leak" even though it's technically still referenced.

**Prevention:** After each task's evaluation, manually call `torch.cuda.empty_cache()` if your retriever holds GPU tensors. Consider wrapping `SearchProtocol.index()` to pre-allocate and reuse GPU buffers across tasks.

### Moderate: `num_proc` Parallelism Assumption — CPU-Bound Retrievers Starve

**What goes wrong:** MTEB passes `num_proc` to `index()` for parallel corpus encoding, but BGE-M3 on a remote endpoint (private network) is I/O-bound, not CPU-bound.

**Why it happens:** `num_proc` controls `multiprocessing.Pool` workers for HuggingFace dataset.map(). For remote embedding endpoints, this spawns workers that all block on the same network I/O.

**Consequences:** Parallel workers all wait on the same private network connection, no actual speedup, wasted RAM for process spawning.

**Prevention:** For private network-based BGE-M3 endpoints, set `num_proc=1` and rely on the embedding server's internal parallelism. Alternatively, batch corpus encoding client-side and send one large POST rather than many small ones.

### Minor: `top_ranked` Parameter in `search()` — Optional but Semantic

**What goes wrong:** The `search()` method accepts an optional `top_ranked` parameter (pre-filtered top-K documents from a previous ranker for reranking tasks). Custom retrievers that ignore this parameter will silently fail on reranking tasks.

**Consequences:** MTEB's `convert_to_reranking()` tasks produce wrong results with no error — the custom retriever simply ignores the pre-filtered documents.

**Prevention:** If your retriever does not support reranking, raise a `NotImplementedError` when `top_ranked` is passed rather than silently ignoring it.

---

## 3. BGE-M3 Embedding Endpoint Pitfalls (private network)

### Critical: private network Connection State — "Available" != "Reachable"

**What goes wrong:** `isBgeEmbeddingAvailable()` probes the BGE endpoint at `<PRIVATE_EMBEDDING_HOST>:8080` but only checks HTTP connectivity, not private network routing state.

**Root cause:** The private embedding host BGE endpoint (`<PRIVATE_EMBEDDING_HOST>:8080`) is on the private network tailnet. If the Mac's private network is logged out, disconnected, or the subnet router is down, the IP is unreachable even though the service "exists."

**Consequences:** `isBgeEmbeddingAvailable()` returns `true` (HTTP responds) but the response is a private network "relay" page, not an embedding vector. Downstream retrieval produces garbage.

**Prevention:** Add a private network connection health check alongside the HTTP probe. Alternatively, have `isBgeEmbeddingAvailable()` send a known probe text (e.g., "芝麻开门") and verify the returned vector is a valid 1024-dim non-zero vector — not just HTTP 200.

### Critical: Atomic Chat v1.1.44 `--embedding` Spawn Flag Bug

**What goes wrong:** Atomic Chat v1.1.44 loads the `bge-m3` GGUF and lists it in `/v1/models`, but its internal llama-server is spawned WITHOUT the `--embedding` CLI flag.

**Why it happens:** The spawn command in Atomic Chat's llama-server wrapper omits `--embedding`, so the embedding endpoint returns HTTP 501 despite the model being loaded.

**Codex finding (2026-04-19):** `isBgeEmbeddingAvailable()` was green-lighting the broken 1337 endpoint because it only checked `/v1/models` (which listed bge-m3) rather than actually calling `/v1/embeddings`.

**Consequences:** Any code that trusts the "available" flag and routes to Atomic Chat 1337 will fail silently.

**Prevention:** The fix in CCR: default `baseURL` points to `BGE_EMBEDDING_DROPLET_BASE_URL` (droplet private network IP) instead of `BGE_EMBEDDING_ATOMIC_BASE_URL` (1337). Do NOT change this default until Atomic Chat upstream fixes the spawn flag.

### Critical: `maxChars` Truncation Bug — 1000 chars still too large

**What goes wrong:** The `bgeEmbeddingProvider.ts` code documents:

```
Observed 2026-04-19:
- maxChars 2000 → 1006 tokens (fail)
- maxChars 1000 → 542 tokens (fail)
- maxChars 800 → 542 tokens (fail)
- maxChars 600 → still hit batch limit occasionally
- maxChars 500 → stable
```

**Why it happens:** BGE-M3's sentencepiece tokenizer compresses Chinese/English mixed text differently than expected. "500 chars ≈ 300-400 tokens" was a wrong assumption — actual token count is ~1 token/char for dense CJK paragraphs.

**Consequences:** Documents that pass the `maxChars` check still exceed the llama-server's `-b 512` batch limit, returning HTTP 500 with "input is too large, increase batch size."

**Prevention:** Current `maxChars` default is 500. Only raise it if the droplet's llama-server is rebuilt with `-b 8192` or larger. The code currently caps at 500 with a comment explaining this constraint.

### Moderate: 60s Default Timeout Insufficient for Cold Batch

**What goes wrong:** `createBgeEmbeddingClient()` defaults to `timeoutMs: 60000` (60s). A cold corpus embed of 200 entries at ~600ms/entry = ~120s.

**Why it happens:** BGE-M3 on CPU (droplet) takes ~500-700ms per embedding call. On `--parallel 1` (sequential llama-server), 200 entries = 120s. The 60s timeout covers warm/hot paths but not cold corpus indexing.

**Consequences:** Corpus embedding during benchmark initialization times out, causing the benchmark run to fail with a cryptic fetch abort error.

**Prevention:** The smoke-bge-rrf.ts script explicitly sets `timeoutMs: 180000` for this reason. For benchmark harness use, either warm the corpus cache before timing runs OR raise timeout to 180s+ for cold paths.

### Moderate: private network Network Latency Biases Latency Measurements

**What goes wrong:** When BGE-M3 endpoint is accessed via private network, latency measurements include ~180ms of private network transit overhead.

**Why it happens:** `BGE_EMBEDDING_DROPLET_BASE_URL = 'http://<PRIVATE_EMBEDDING_HOST>:8080/v1'` routes through private network. Even localhost-equivalent private network connections incur TCP relay overhead.

**Consequences:** Dense retrieval latency appears 30-40% higher than it would over LAN. This biases any comparison between dense and BM25 (BM25 is local, dense is private network-routed).

**Prevention:** Report dense latency as "private network-included" in benchmark results. If running comparison benchmarks, either use LAN-connected embedding endpoint for dense or document the overhead explicitly.

### Minor: Batch Embedding Response Order Not Guaranteed

**What goes wrong:** The `embedBge()` function includes defensive sorting:

```typescript
// Preserve input order: OpenAI spec guarantees data[i].index === i, but
// we sort defensively in case a server proxy reorders.
const sorted = [...data.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
```

**Why this matters:** If the private network relay or a proxy reorders the embedding batch responses, without this sort the corpus embeddings would be misaligned with their source documents — silently corrupting retrieval rankings.

**Prevention:** The defensive sort is already in the code. Verify this protection is preserved in any refactoring.

---

## 4. or-shot.ts Resource Measurement Pitfalls

### Critical: `memory_mb` and `disk_mb` Not Currently Measured

**What goes wrong:** `or-shot.ts` measures `elapsed_sec`, `cost_usd`, `input_tokens`, `output_tokens` but has NO memory or disk instrumentation.

**Current `OrShotResult` fields:**
```
response_length, code_blocks, describe_count, test_count, expect_count,
service_dirs, finish_reason, elapsed_sec, cost_usd, input_tokens, output_tokens
```

**Missing:** `memory_mb`, `disk_mb` — required for EverMind algorithm group's resource consumption comparison.

**Prevention:** Add `performance.memory` (Bun/Node exposed via `performance.memory` or external `ps` invocation) and `disk_mb` via `fs.stat` on the run directory. See SECTION below on "How to Add Memory/Disk Fields."

### Critical: Warmup Latency Bias — First Query Pays Full Corpus Embedding Cost

**What goes wrong:** In smoke-bge-rrf.ts, the dense provider's first call to `retrieve()` fills the corpus embedding cache. Without this warmup step, the first real query's latency would include ~60-90s of cold batch penalty.

**Why it matters:** If or-shot.ts is modified to include retrieval benchmarks, the first query's latency measurement will be catastrophically biased by cold corpus embedding — making subsequent queries look fast by comparison.

**Prevention:** Always warm the dense corpus cache before starting timed retrieval runs. Document whether your benchmark measurements include or exclude the warmup call.

### Moderate: Self-Contention Inflation in Parallel Retrieval

**What goes wrong:** In smoke-bge-rrf.ts, the comment notes:

```typescript
// Serialize per-query so the dense backend is never hit by two
// parallel embed requests at once (RRF internally calls dense
// itself). Without this, rrfLatencyMs is inflated by self-
// contention with the standalone dense timing.
```

**Why it happens:** If `timedRun(bm25, ...)` and `timedRun(dense, ...)` run in parallel, both call the dense endpoint simultaneously. The standalone dense timing becomes unreliable because it competes with the RRF parallel call for the same GPU/cpu resources.

**Prevention:** Serialize all retrieval calls when measuring individual pipeline latencies. Run parallel calls only when measuring end-to-end hybrid pipeline latency (where self-contention is realistic).

### Moderate: `finish_reason=length` — Truncated Responses Skew Metrics

**What goes wrong:** Registry shows R066-R070 all have `finish_reason=length` — meaning the model response was truncated by `max_tokens: 16000`. The `liteMetrics()` function counts `describe()` and `test()` calls in the truncated output.

**Why it matters:** If the truncation happens mid-function-declaration, the metric counts are artificially low — the model "only" generated N tests because it ran out of tokens, not because it chose to stop.

**Prevention:** Filter registry entries where `finish_reason != 'stop'` before computing metric statistics. Track `finish_reason` as a primary filter dimension, not just a data field.

### Minor: Bun Runtime Memory Reporting Unreliable for Long-Running Processes

**What goes wrong:** Bun's `performance.memory` (exposed via V8 API) reports heap usage that includes JIT-compiled code, internal structures, and fragmentation — not actual "process resident set size."

**Why it matters:** For short-lived or-shot runs (minutes), JIT warmup overhead dominates memory reporting. For long-running benchmark sweeps (hours), RSS grows but Bun's reported heap may not reflect actual memory pressure on the system.

**Prevention:** Use external process monitoring (`ps aux | grep bun` or OS-level RSS) for accurate memory tracking. Bun's internal memory API is useful for relative comparisons within a single warmed-up process, not for cross-process comparison.

---

## 5. Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| LOCOMO dragon substitution | CLS vs mean pooling mismatch | Implement compatibility layer matching dragon's exact pooling/normalization path |
| LOCOMO hybrid integration | `init_query_model('contriever')` NameError bug | Always implement fresh model loading; do not rely on LOCOMO's buggy contriever path |
| MTEB SearchProtocol implementation | Runtime-only type checking | Write unit tests validating all Protocol methods exist before integration |
| MTEB `encode_kwargs` propagation | Parameters silently dropped | Log unhandled kwargs at each layer; integration test with probe kwargs |
| BGE-M3 private network endpoint | Atomic Chat 501 despite "available" | Always probe `/v1/embeddings` directly, not just `/v1/models` |
| BGE-M3 `maxChars` | 1000 chars still exceeds batch limit | Default 500 chars; do not raise without rebuilding droplet llama-server with `-b 8192` |
| or-shot memory fields | `performance.memory` inaccurate for RSS | Use external `ps` invocation for accurate memory_mb |
| or-shot warmup | Cold corpus embed biases first query | Always warm dense cache before timing runs |
| or-shot parallel retrieval | Self-contention inflates standalone dense timing | Serialize individual pipeline timing; parallel only for hybrid end-to-end |
| or-shot `finish_reason=length` | Truncated responses skew metric counts | Filter `finish_reason != 'stop'` before aggregating metrics |

---

## 6. How to Add Memory/Disk Fields to or-shot.ts

### Option A: Bun `performance.memory` (Quick, Inaccurate)

```typescript
// Add to OrShotResult interface
interface OrShotResult {
  // ... existing fields ...
  memory_mb?: number
  disk_mb?: number
}

// Add to runOrShot()
const mem = (performance as any).memory
const memory_mb = mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : undefined
```

**Pros:** Zero dependencies, works in Bun.
**Cons:** V8 heap, not RSS. Excluded from Bun builds by default (requires `--expose-gc`).

### Option B: External `ps` Process (Accurate, Cross-Platform)

```typescript
import { execSync } from 'child_process'
import { statSync } from 'fs'

function getProcessMemoryMB(pid: number): number {
  const out = execSync(`ps -o rss= -p ${pid}`, { encoding: 'utf8' })
  return Math.round(parseInt(out.trim()) / 1024) // RSS in KB → MB
}

function getRunDirSizeMB(runDir: string): number {
  const out = execSync(`du -sm ${runDir}`, { encoding: 'utf8' })
  return parseInt(out.split('\t')[0]!)
}
```

**Pros:** True RSS, includes shared libraries.
**Cons:** Unix-only (`ps` on macOS/Linux). Requires run directory to be written before measurement.

### Recommended Approach

1. Use Option B for `memory_mb` (accurate RSS)
2. Use `statSync` on the run directory for `disk_mb` after writing
3. Add fields as optional (`memory_mb?: number`) so existing registry entries are backward-compatible
4. Run external `ps` after response is written but before returning (captures peak memory during the run)

---

## Sources

- [LOCOMO GitHub — snap-research/locomo](https://github.com/snap-research/locomo) — full retriever interface, data format
- [LOCOMO rag_utils.py (raw)](https://raw.githubusercontent.com/snap-research/locomo/main/task_eval/rag_utils.py) — dragon/contriever/dpr embeddings with bugs
- [LOCOMO gpt_utils.py (raw)](https://raw.githubusercontent.com/snap-research/locomo/main/task_eval/gpt_utils.py) — embeddings usage patterns
- [MTEB AbstaskRetrieval (GitHub)](https://github.com/embeddings-benchmark/mteb) — SearchProtocol interface
- [MTEB models_protocols.py](https://raw.githubusercontent.com/embeddings-benchmark/mteb/main/mteb/models/models_protocols.py) — EncoderProtocol, SearchProtocol
- [MTEB _evaluators/retrieval.py](https://raw.githubusercontent.com/embeddings-benchmark/mteb/main/mteb/abstasks/retrieval.py) — RetrievalEvaluator.evaluate() flow
- [CCR bgeEmbedding.ts](https://github.com/Fearvox/Evensong/blob/main/src/services/api/bgeEmbedding.ts) — BGE-M3 client, private network endpoint, Atomic Chat bug
- [CCR bgeEmbeddingProvider.ts](https://github.com/Fearvox/Evensong/blob/main/src/services/retrieval/providers/bgeEmbeddingProvider.ts) — maxChars constraint, corpus caching
- [CCR smoke-bge-rrf.ts](https://github.com/Fearvox/Evensong/blob/main/scripts/smoke-bge-rrf.ts) — warmup, serialization, latency measurement patterns
- [BGE-M3 HuggingFace](https://huggingface.co/BAAI/bge-m3) — model specs, batch_size guidance, no instruction prefix
- [FlagEmbedding GitHub](https://github.com/FlagOpen/FlagEmbedding) — BGE-M3 API usage, inference details
