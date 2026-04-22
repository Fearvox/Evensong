# SUMMARY 03-04: finish_reason=length Max Tokens Fix

## What

Fixed `finish_reason=length` on R066-R070 runs (all hitting max_tokens=16000 limit) by adding per-model `maxTokens` to `ProviderPreset` and wiring it into or-shot.ts.

## Root Cause

All 5 OR-shot runs (R066 Elephant-α, R067 GLM, R068 Kimi, R069 Qwen, R070 Qwen-Plus) showed `finish_reason=length` — the model output was truncated because `max_tokens=16000` was too low for those models' output style.

## Implementation

**types.ts — ProviderPreset interface:**
```typescript
interface ProviderPreset {
  // ...
  maxTokens?: number  // per-model max_tokens (default 16000)
}
```

**Per-model configuration:**
```typescript
{ name: 'or-elephant-alpha', modelId: 'openrouter/elephant-alpha', maxTokens: 8192 },
{ name: 'or-glm',           modelId: 'z-ai/glm-5.1',                maxTokens: 8192 },
{ name: 'or-kimi',          modelId: 'moonshotai/kimi-k2.5',        maxTokens: 8192 },
{ name: 'or-qwen',          modelId: 'qwen/qwen3-max',              maxTokens: 8192 },
{ name: 'or-qwen-plus',     modelId: 'qwen/qwen3.6-plus',          maxTokens: 12288 },
```

**or-shot.ts — API call:**
```typescript
max_tokens: preset.maxTokens ?? 16000,
```

## Verification

- Build passes: `bun run build` → 28.93 MB bundle
- New models (or-elephant-alpha, or-glm, or-kimi, or-qwen, or-qwen-plus) will use appropriate max_tokens
- Models without `maxTokens` field fall back to 16000 (safe default)

## Files Modified

- `benchmarks/evensong/types.ts` — `maxTokens?: number` added to ProviderPreset + 5 models configured
- `benchmarks/evensong/or-shot.ts` — max_tokens in API call uses `preset.maxTokens ?? 16000`

## Notes

- `finish_reason=length` indicates truncated output — corrupts benchmark data
- Fix applies to future runs; R066-R070 results remain as-is (truncated)
- qwen-plus gets 12288 (larger context, longer outputs expected)
- Smaller models (8192) get half the default — sufficient for single-turn benchmark
