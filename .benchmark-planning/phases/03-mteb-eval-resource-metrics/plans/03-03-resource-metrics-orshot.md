---
name: 03-03 Add Resource Metrics to or-shot.ts
objective: Add memory_mb and disk_mb fields to or-shot.ts JSON output
plan_number: "03-03"
phase: "03"
wave: 2
autonomous: true
gap_closure: false
status: pending
created: "2026-04-22"
key-files:
  created:
    - or-shot.ts (modified)
  modified:
    - benchmarks/evensong/or-shot.ts
must-haves:
  - or-shot.ts JSON output includes 'memory_mb' field from process.memoryUsage().heapUsed / 1024 / 1024
  - or-shot.ts JSON output includes 'disk_mb' field with actual output file size
  - Both fields are numeric (float for memory_mb, integer for disk_mb)
tasks:
  - { id: 1, name: "Add memory_mb field", description: "Add memory_mb = process.memoryUsage().heapUsed / 1024 / 1024 to or-shot output" }
  - { id: 2, name: "Add disk_mb field", description: "Add disk_mb = actual output file size in MB using fs.stat" }
  - { id: 3, name: "Test both fields populated", description: "Run or-shot.ts and verify both fields appear in JSON output" }
---

# Plan: 03-03 — Add Resource Metrics to or-shot.ts

## What

Add `memory_mb` and `disk_mb` fields to the or-shot.ts JSON output for resource consumption tracking. Addresses RESOURCE-01 and RESOURCE-02.

## How

1. **memory_mb**: Use `process.memoryUsage().heapUsed` to get current heap usage in bytes, convert to MB:
   ```typescript
   const memory_mb = process.memoryUsage().heapUsed / 1024 / 1024;
   ```

2. **disk_mb**: After output JSON is written, use `fs.stat` to get actual file size:
   ```typescript
   const stats = fs.statSync(outputPath);
   const disk_mb = stats.size / 1024 / 1024;
   ```

3. **Add to output JSON** alongside existing fields (model, tokens, latency_ms, etc.)

## Why

EverMind algorithm team needs resource consumption metrics for model comparison. memory_mb shows heap pressure during generation; disk_mb verifies output file size matches reported values.

## Verification

- [ ] Run or-shot.ts for any model
- [ ] Check output JSON has numeric `memory_mb` (e.g., 45.2) and `disk_mb` (e.g., 0.08)
- [ ] Values are plausible (memory_mb 20-500MB typical, disk_mb small for short outputs)
