# Plan 01-05: Fix BGE-M3 Batch Size / maxChars Limit

## What

Fix the issue where `maxChars: 1000` exceeds the `-b 512` batch limit on private embedding host's llama-server, causing embedding requests to fail.

## Why

Wave 3H research found that `maxChars=1000` with BGE-M3's tokenization can produce token counts exceeding the 512 batch size limit.

## How

### Option A: Increase batch size (preferred)

Update llama-server startup to use `-b 2048` or higher:
```bash
llama-server --embedding -m model.gguf -c 512 -b 2048 --host 0.0.0.0 --port 8080
```

### Option B: Reduce maxChars in wrapper

If droplet can't be modified, reduce `maxChars` in the BGE-M3 wrapper to stay within 512 tokens.

### Step 1: Test current limit

Send a request with ~1000 chars and check if it fails.

### Step 2: Apply fix

Either increase `-b` on droplet or reduce `maxChars` in wrapper.

### Step 3: Verify

Send test request that previously failed to confirm it now succeeds.

## Verification

1. `maxChars: 1000` requests succeed without batch limit error
2. BGE-M3 wrapper handles full LOCOMO corpus without batching errors

## Success Criteria

BGE-M3 batch size handles `maxChars: 1000` without exceeding `-b 512` limit

## Status

- [x] Done (2026-04-22) — 1000-char requests verified working, batch limit not exceeded
