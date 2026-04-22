# Plan 01-04: Fix Atomic Chat v1.1.44 --embedding Flag

## What

Fix the bug where Atomic Chat v1.1.44 on ccr-droplet spawns `llama-server` WITHOUT the `--embedding` flag, causing the endpoint to return 501.

## Why

Wave 3H research found that `isBgeEmbeddingAvailable()` was green-lighting a broken endpoint. The `--embedding` flag is required for embedding endpoints.

## How

### Step 1: Identify current startup command

Check how Atomic Chat / llama-server is started on ccr-droplet.

### Step 2: Add --embedding flag

Ensure the startup command includes `--embedding`:
```bash
llama-server --embedding -m model.gguf -c 512 --host 0.0.0.0 --port 8080
```

### Step 3: Verify endpoint

```bash
curl -X POST http://100.65.234.77:8080/embed \
  -H "Content-Type: application/json" \
  -d '{"texts": ["test"]}'
```

Should return embeddings, not 501.

## Verification

1. Endpoint returns valid embeddings for a test query
2. `isBgeEmbeddingAvailable()` returns true after fix
3. BGE-M3 wrapper can successfully call endpoint

## Success Criteria

BGE-M3 endpoint accepts `--embedding` flag (Atomic Chat v1.1.44 bug fixed)

## Status

- [x] Done (2026-04-22) — Endpoint verified working at `http://100.65.234.77:8080/embedding`
