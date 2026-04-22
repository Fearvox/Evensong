# SUMMARY 04-03: Resource Comparison Table

## What

HTML table showing R066-R070 OR-shot resource metrics: latency, tokens, cost, and (with memory_mb/disk_mb from Phase 3.03) for future runs.

## Implementation

`benchmarks/evensong/viz/resource_table.html` — self-contained sortable table:
- Columns: Run, Model, finish_reason, Elapsed(s), Input Tokens, Output Tokens, Cost, Memory(MB), Disk(MB)
- Sortable by clicking any column header
- finish_reason color-coded: green=stop, red=length, orange=error
- memory_mb/disk_mb show "N/A" for R066-R070 (fields added post-run in 03-03)

## Data (R066-R070)

All 5 runs show `finish_reason=length` — max_tokens=16000 too low (fixed in 03-04).

| Run | Model | finish_reason | Elapsed | Cost |
|-----|-------|-------------|---------|------|
| R066 | Elephant-α | length (red) | 90s | $0.08 |
| R067 | GLM-5.1 | length | 85s | $0.07 |
| R068 | Kimi K2.5 | length | 88s | $0.06 |
| R069 | Qwen 3 Max | length | 82s | $0.05 |
| R070 | Qwen 3.6 Plus | length | 95s | $0.09 |

## Notes

- memory_mb/disk_mb will populate on next or-shot run (post-03-03 fix)
- Table self-contained — no build step, open directly in browser
