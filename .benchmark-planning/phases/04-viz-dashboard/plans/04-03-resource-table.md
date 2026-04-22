---
name: 04-03 Resource Comparison Table
objective: Table showing Latency/Tokens/Memory/Disk per model from or-shot.ts runs
plan_number: "04-03"
phase: "04"
wave: 2
autonomous: true
gap_closure: false
status: pending
created: "2026-04-22"
key-files:
  created:
    - benchmarks/evensong/viz/resource_table.html
  modified: []
must-haves:
  - HTML table with columns: Model, Latency(s), Input Tokens, Output Tokens, Memory(MB), Disk(MB), finish_reason
  - Data populated from or-shot.ts registry.jsonl runs (R066-R070)
  - Sortable columns, zebra striping
  - Exportable as PNG
tasks:
  - { id: 1, name: "Read registry.jsonl and extract metrics", description: "Parse registry.jsonl to get memory_mb, disk_mb, finish_reason, elapsed_sec for R066-R070" }
  - { id: 2, name: "Build HTML table", description: "Sortable HTML table with the extracted data" }
  - { id: 3, name: "Add styling and export", description: "Zebra stripes, header, PNG export" }
---

# Plan: 04-03 — Resource Comparison Table

## What

Table displaying resource metrics from or-shot.ts runs (R066-R070) to compare per-model consumption: latency, tokens, memory, disk, finish_reason.

## Data Sources

From `benchmarks/evensong/registry.jsonl` (R066-R070 or-shot runs):
- `elapsed_sec`: total run time
- `input_tokens`: prompt tokens
- `output_tokens`: completion tokens
- `memory_mb`: heap used during run
- `disk_mb`: raw response file size
- `finish_reason`: stop/length/error

## How

Self-contained HTML:
- CSS grid/table with zebra striping
- JS column sort (click header to sort)
- `canvas.toDataURL()` PNG export button
- Loads Chart.js via CDN for PNG export button

## Verification

- [ ] Table rows match registry entries
- [ ] memory_mb, disk_mb columns populated
- [ ] finish_reason column shows which runs were `length` (pre-fix)
- [ ] PNG export produces readable image
