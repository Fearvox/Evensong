# SUMMARY 03-03: Resource Metrics in or-shot.ts

## What

Added `memory_mb` and `disk_mb` fields to `OrShotResult` JSON output, enabling resource consumption tracking per model run.

## Implementation

**Interface change (`or-shot.ts`):**
```typescript
interface OrShotResult {
  // ... existing fields ...
  memory_mb: number  // heapUsed in MB (2 decimal places)
  disk_mb: number    // raw response file size in MB (2 decimal places)
}
```

**Success path (line ~175):**
```typescript
const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100
const diskMB = Math.round((statSync(rawPath).size / 1024 / 1024) * 100) / 100
const result: OrShotResult = {
  // ...
  memory_mb: memMB,
  disk_mb: diskMB,
}
```

**Error path:** Both fields set to 0 (graceful degradation).

## Verification

- Build passes: `bun run build` → 28.93 MB bundle
- Fields numeric: memory_mb ~10-500MB typical, disk_mb ~0.01-0.5MB for short outputs
- `fs.statSync` imported for disk size

## Files Modified

- `benchmarks/evensong/or-shot.ts` — OrShotResult interface + success/error path updates
- `benchmarks/evensong/types.ts` — `maxTokens?: number` field on ProviderPreset

## Notes

- memory_mb captures heap pressure during generation (not full process heap)
- disk_mb reflects actual written file size — useful for verifying output_length vs. actual storage
