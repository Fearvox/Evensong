# Wave 2C — MLX Embedding Provider Prep (Qwen3-Embedding-4B in Atomic)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install `Qwen3-Embedding-4B` via Atomic Chat's MLX provider and verify it runs concurrently with `Gemma-4-E4B-Uncensored-Q4_K_M` in Apple Silicon unified memory. Document the endpoint for Wave 3+ retrieval consumption. **No src/ code changes — this is a host-side configuration task.**

**Architecture:** Atomic Chat GUI + CLI verification. Both models must stay resident so Wave 3+ hybrid retrieval can call both in the same query cycle. No Docker, no separate process — single Atomic app, two MLX models.

**Tech Stack:** Atomic Chat Mac app (macOS-arm64, llama.cpp + MLX backend), Apple Silicon unified memory (shared GPU/CPU RAM), curl for verification.

**Parent spec:** `docs/superpowers/specs/2026-04-19-vault-foundation-and-preamble-design.md` §3.4 Wave 3+ embedding layer
**Prerequisite:** Atomic Chat running (user has it — confirmed by screenshot + memory)
**Output:** (1) Qwen3-Embedding-4B loaded in Atomic (2) `_vault/infra/retrieval-endpoints.md` doc committed (3) concurrency verified

---

## File Map

| File | Role | Changes |
|---|---|---|
| `_vault/infra/retrieval-endpoints.md` | **NEW** — Wave 3+ retrieval endpoint contract | Create |

No src/ or packages/ code touched. Atomic configuration is Mac app state (not git-tracked).

---

### Task 1: Pre-flight — Atomic + Gemma state

**Files:** (read-only probes)

- [ ] **Step 1: Confirm Atomic Chat is running + Gemma 4 listening**

```bash
curl -sS --max-time 3 http://127.0.0.1:1337/v1/models | jq '.data[] | {id, object}'
```

Expected: JSON list containing at least `Gemma-4-E4B-Uncensored-Q4_K_M` (possibly also `model.gguf`).

If curl fails or empty: open Atomic Chat app → Models → click "Start" on the Gemma model → retry.

- [ ] **Step 2: Check available unified memory**

```bash
vm_stat | head -15
sysctl hw.memsize | awk '{ printf "Total: %.1f GB\n", $2/1024/1024/1024 }'
```

Capture `Pages free` + `Pages speculative` × 16384 bytes ≈ free RAM. Qwen3-Embedding-4B Q4 needs ~2-3GB VRAM.

- [ ] **Step 3: Baseline Gemma smoke test**

```bash
curl -sS -X POST http://127.0.0.1:1337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"Gemma-4-E4B-Uncensored-Q4_K_M","messages":[{"role":"user","content":"say ok"}],"max_tokens":10}' \
  | jq -r '.choices[0].message.content'
```

Expected: Gemma returns some output (e.g. "ok" or similar).

Capture latency by adding `-w "\ntotal=%{time_total}s\n"`.

---

### Task 2: Identify Qwen3-Embedding-4B source

**Files:** none (research)

- [ ] **Step 1: Check Atomic's built-in model catalog first**

Open Atomic Chat app → Models → "Import" or "Browse" button. Look for `Qwen3-Embedding` in the catalog.

If Atomic has built-in import: **prefer this path** (automated quantization + compatibility-tested). Skip to Task 3 Step 5.

- [ ] **Step 2: If not in catalog, locate on HuggingFace**

Canonical sources to check (in order of MLX/llama.cpp compatibility preference):
- HuggingFace `Qwen/Qwen3-Embedding-4B` (official weights, requires MLX conversion)
- HuggingFace `mlx-community/Qwen3-Embedding-4B-bf16` or similar MLX-native
- HuggingFace GGUF variants (search `Qwen3-Embedding-4B gguf`)

Open https://huggingface.co/Qwen/Qwen3-Embedding-4B in browser (manual) and check Files tab for:
- `*.gguf` files (for llama.cpp backend)
- `*.safetensors` + MLX conversion scripts (for MLX backend)

- [ ] **Step 3: Confirm with user which variant to use**

Ask user: "Qwen3-Embedding-4B 有 3 种分发形式候选：(a) Atomic built-in catalog (如果 Atomic 支持 embedding model import); (b) GGUF variant for llama.cpp backend; (c) MLX-native safetensors. 你倾向哪个？(a/b/c/skip if ambiguous)"

Capture choice.

---

### Task 3: Download + import into Atomic

**Files:** (download target chosen in Task 2.3 — one of: Atomic built-in catalog / HuggingFace GGUF variant / HuggingFace MLX-native safetensors)

- [ ] **Step 1: Download chosen variant**

**If user chose (a) Atomic built-in**: use Atomic's Import UI, skip to Step 4.

**If user chose (b) GGUF**: 
```bash
cd ~/Downloads
# Example (user will provide actual URL from HF)
curl -LO "https://huggingface.co/<repo>/resolve/main/qwen3-embedding-4b-q4_k_m.gguf"
ls -lh qwen3-embedding-4b-q4_k_m.gguf
```
Expected size: ~2.3-2.8GB.

**If user chose (c) MLX safetensors**: 
```bash
cd ~/Downloads
# Atomic may auto-quantize; alternative: use mlx_lm cli or AtomicTurboQuant built-in
mkdir qwen3-embedding-4b-mlx && cd qwen3-embedding-4b-mlx
# Download all files from HF model repo
```

- [ ] **Step 2: Open Atomic Chat → Settings → MLX Provider (or AtomicTurboQuant)**

Refer to user's screenshot (shown earlier): Settings sidebar has Models section. MODEL PROVIDERS list has MLX / AtomicTurboQuant etc.

For AtomicTurboQuant (current user active provider), click **Import**. For MLX provider, click **Import** or drag model directory into the Models list.

- [ ] **Step 3: Point import to downloaded file/dir**

Select the `.gguf` file or MLX model directory from Task 3.1.

- [ ] **Step 4: Wait for quantization/import (UI progress)**

Atomic will parse/validate + (if needed) quantize. Typically 30s-3min depending on size.

- [ ] **Step 5: Click "Start" button next to Qwen3-Embedding-4B model**

Gemma stays running alongside (both should show "Running" indicator).

- [ ] **Step 6: Verify both models in /v1/models**

```bash
curl -sS http://127.0.0.1:1337/v1/models | jq '.data[].id'
```

Expected output includes both:
```
"Gemma-4-E4B-Uncensored-Q4_K_M"
"Qwen3-Embedding-4B"
```
(or similar name)

If only one shows → that's the problem, see Troubleshooting below.

---

### Task 4: Smoke test — embedding endpoint

**Files:** none (curl verification)

- [ ] **Step 1: Probe /v1/embeddings endpoint**

```bash
curl -sS --max-time 10 -X POST http://127.0.0.1:1337/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen3-Embedding-4B","input":"hello world"}' \
  | jq '{object, model, dims: (.data[0].embedding | length), first5: (.data[0].embedding[0:5])}'
```

Expected output shape:
```json
{
  "object": "list",
  "model": "Qwen3-Embedding-4B",
  "dims": 2560,   // or 1024 / 768 depending on variant
  "first5": [0.0123, -0.0456, 0.0789, -0.0012, 0.0345]
}
```

If 404 or `model not found` → endpoint name differs (check Atomic's Local API Server settings for actual embedding endpoint).

If 200 and `dims` is non-zero integer → **success**.

- [ ] **Step 2: Record actual dimension for Wave 3+ vector index sizing**

Capture the `dims` value — it'll be used in Wave 3 vector DB config.

- [ ] **Step 3: Latency baseline**

```bash
time curl -sS --max-time 10 -X POST http://127.0.0.1:1337/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen3-Embedding-4B","input":"memory sparse attention for efficient end-to-end memory model scaling"}' \
  > /dev/null
```

Expected: `real 0m0.1xxs` to `0m0.5xxs`. Anything > 2s indicates unified memory swap pressure.

---

### Task 5: Concurrent fit verification

**Files:** none (stress test)

- [ ] **Step 1: Fire concurrent chat + embedding requests**

```bash
(curl -sS -X POST http://127.0.0.1:1337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"Gemma-4-E4B-Uncensored-Q4_K_M","messages":[{"role":"user","content":"2+2"}],"max_tokens":20}' &)

(curl -sS -X POST http://127.0.0.1:1337/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen3-Embedding-4B","input":"test concurrent"}' &)

wait
```

Both should return valid responses within 3s. If either hangs or errors → VRAM pressure; may need to use smaller Gemma quant (or lower context size in Atomic settings Fit Target per Device).

- [ ] **Step 2: Check Atomic logs / Activity Monitor for OOM or swap**

```bash
vm_stat | grep -E "Pageins|Pageouts|Swapins|Swapouts"
```

Compare pre/post Task 5.1. If `Swapouts` increased significantly → unified memory pressure, document as caveat.

- [ ] **Step 3: 10-round sustained test**

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -sS -X POST http://127.0.0.1:1337/v1/embeddings \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"Qwen3-Embedding-4B\",\"input\":\"test round $i\"}" \
    -w "\nround=$i  time=%{time_total}s\n" > /dev/null
done
```

Capture each round latency. Steady-state < 500ms = OK. Increasing latency round-over-round = cache pressure.

---

### Task 6: Document endpoint for Wave 3+ consumption

**Files:**
- Create: `_vault/infra/retrieval-endpoints.md`

- [ ] **Step 1: Create endpoint contract doc**

Create `_vault/infra/retrieval-endpoints.md`:

```markdown
# Retrieval Endpoints Contract — Wave 3+ Reference

**Status**: Wave 2C verified 2026-04-19
**Host**: Atomic Chat Mac desktop app (single-process, serves both chat + embedding)
**Base URL**: `http://127.0.0.1:1337/v1`
**API shape**: OpenAI-compatible (chat completions + embeddings)

## Models Served

| Model ID | Role | Dims (embedding) | Quant | Notes |
|---|---|---|---|---|
| `Gemma-4-E4B-Uncensored-Q4_K_M` | Chat / LLM re-ranker | N/A | Q4_K_M | Wave 1 §3.4 primary; ~4.5GB VRAM |
| `Qwen3-Embedding-4B` | Dense embedding encoder | (填 Task 4.2 实测 dims) | (Task 3.1 chosen) | Wave 3+ §3.4 primary embedding; ~2-3GB VRAM |

## Endpoint Contracts

### Chat completion (Wave 1 §3.4 retrieval LLM judge)

```
POST http://127.0.0.1:1337/v1/chat/completions
Content-Type: application/json

{
  "model": "Gemma-4-E4B-Uncensored-Q4_K_M",
  "messages": [{"role":"system","content":"..."}, {"role":"user","content":"..."}],
  "temperature": 0.1,
  "max_tokens": 1024
}
```

Response:
```
{
  "choices": [{"message": {"role":"assistant", "content": "..."}}]
}
```

Typical latency: 300-500ms (Apple Silicon M-series, Q4 quant).

### Embedding (Wave 3+ §3.4 dense retrieval)

```
POST http://127.0.0.1:1337/v1/embeddings
Content-Type: application/json

{
  "model": "Qwen3-Embedding-4B",
  "input": "text to embed"
}
```

Response:
```
{
  "object": "list",
  "model": "Qwen3-Embedding-4B",
  "data": [{"object": "embedding", "embedding": [0.xxx, ...], "index": 0}]
}
```

Typical latency: (填 Task 4.3 实测).
Dimension: (填 Task 4.2 实测).

### Health probe (§3.4 isLocalGemmaAvailable / ...Available)

```
GET http://127.0.0.1:1337/v1/models
```

Response (200):
```
{
  "object": "list",
  "data": [
    {"id": "Gemma-4-E4B-Uncensored-Q4_K_M", "object": "model"},
    {"id": "Qwen3-Embedding-4B", "object": "model"}
  ]
}
```

## Concurrency

Wave 2C verified: both models can serve simultaneously with Apple Silicon unified memory.

- Task 5.1 concurrent chat + embedding: (填实测 OK/OOM/...)
- Task 5.3 10-round sustained embedding: (填平均 latency)
- Memory pressure (vm_stat pageouts delta): (填 Task 5.2 结果)

## Caveats

- If Atomic app closes, all models stop. No auto-restart. Wave 3 retrieval must handle this via `isAvailable()` health probes before each query.
- `Fit (auto-adjust to device memory)` Atomic setting: ON (Task 1 screenshot). Both models quant-adjust to fit VRAM — may degrade quality silently under pressure.
- `GGML_VK_VISIBLE_DEVICES` env var can pin GPUs on multi-GPU systems (N/A for Apple Silicon).
- Timeout setting: 600s (default per Atomic Settings). Override in client if needed.

## Client Code Integration (Wave 3+ reference)

Chat: `src/services/api/localGemma.ts` (Wave 2B shipped)
Embedding: **not yet implemented** — Wave 3+ will add `src/services/api/localEmbedding.ts` following same pattern (fetch-based OpenAI-compat client).

## Failure Modes + Fallback

| Failure | Detection | Fallback |
|---|---|---|
| Atomic not running | GET /v1/models → connection refused | `isLocalGemmaAvailable()` returns false → skip to xAI |
| Model unloaded (e.g. user clicked Stop) | /v1/models returns 200 but model not in list | Add per-model check; fallback to cloud |
| OOM / quant degradation | Abnormal latency (>2s) or nonsensical output | No auto-detect; manual monitoring |
| Embedding provider down, chat up | /v1/embeddings returns 404 | Fall back to BGE-M3 via CF Workers AI (Wave 3+) |
```

Fill in `(填 ...)` placeholders with actual numbers from Task 4.2, 4.3, 5.1, 5.2.

- [ ] **Step 2: Commit to _vault**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning/_vault
git add infra/retrieval-endpoints.md
git commit -m "docs(infra): Wave 2C retrieval endpoints contract (Gemma + Qwen3-Embedding verified)"
git push origin main
```

---

## Troubleshooting

### Qwen3-Embedding-4B doesn't appear in /v1/models after Start
- Check Atomic app logs: Settings → right panel → look for import errors
- Try smaller quant first (Q4_K_S or Q4_K_M rather than unquantized)
- Ensure model file is not corrupted (re-check SHA256 from HF)

### /v1/embeddings returns 404
- Some Atomic backends serve embeddings at a different path (e.g. `/embedding` or `/v1/embed`)
- Check Atomic's Local API Server settings for actual exposed routes
- May need to explicitly enable embedding endpoint in model metadata

### Concurrent requests hang
- VRAM exhausted → Atomic will serialize requests. Acceptable but slower.
- Reduce Gemma 4 quant (Q4_K_M → Q4_K_S) or lower context via Atomic Fit Target setting
- Or load only one model at a time and toggle

### `vm_stat` shows large Swapouts delta
- Means macOS is paging to SSD — unified memory insufficient
- Options: smaller quant, disable other memory-heavy apps, or accept the slowdown

---

## Post-implementation Verification

```bash
# 1. Both models registered
curl -sS http://127.0.0.1:1337/v1/models | jq '.data | map(.id) | sort'
# Expected: contains both Gemma + Qwen3-Embedding

# 2. Chat works
curl -sS -X POST http://127.0.0.1:1337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"Gemma-4-E4B-Uncensored-Q4_K_M","messages":[{"role":"user","content":"2+2"}],"max_tokens":5}' \
  | jq -r '.choices[0].message.content'
# Expected: numeric answer

# 3. Embedding works
curl -sS -X POST http://127.0.0.1:1337/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen3-Embedding-4B","input":"test"}' \
  | jq '.data[0].embedding | length'
# Expected: positive integer (dims)

# 4. Doc committed
cd /Users/0xvox/claude-code-reimagine-for-learning/_vault
git log --oneline -1 -- infra/retrieval-endpoints.md
# Expected: "docs(infra): Wave 2C retrieval endpoints contract..."
```

All 4 checks pass = Wave 2C DONE.

---

## Rollback Plan

- **Undo model import**: Atomic Chat Settings → Models → trash icon next to Qwen3-Embedding-4B → model file deleted from Atomic's managed dir
- **Undo doc commit**: `cd _vault && git revert HEAD`
- **No code to roll back** — this plan is config + docs only
