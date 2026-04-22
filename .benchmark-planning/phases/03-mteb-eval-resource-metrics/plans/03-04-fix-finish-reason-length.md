---
name: 03-04 Fix finish_reason=length Max Tokens Issue
objective: Eliminate finish_reason=length on runs hitting max_tokens 16000 limit
plan_number: "03-04"
phase: "03"
wave: 2
autonomous: true
gap_closure: false
status: pending
created: "2026-04-22"
key-files:
  modified:
    - benchmarks/evensong/or-shot.ts
    - benchmarks/evensong/or-shot-registry.ts
must-haves:
  - or-shot.ts has max_tokens configured per model (not hardcoded 16000 for all)
  - finish_reason=length no longer appears when model output is legitimately complete
  - Models with native finish reasons (stop/spacing) emit proper finish_reason values
tasks:
  - { id: 1, name: "Audit max_tokens per model in registry", description: "Find models currently using max_tokens=16000, check if that is appropriate" }
  - { id: 2, name: "Fix provider/model max_tokens mapping", description: "Set reasonable max_tokens per model (e.g., grok-4-1-fast-reasoning: 8192, deepseek-v3-2: 8192, qwen-3.6: 16384)" }
  - { id: 3, name: "Verify finish_reason=length disappears", description: "Run a test benchmark and confirm no finish_reason=length entries" }
---

# Plan: 03-04 — Fix finish_reason=length Max Tokens Issue

## What

Fix finish_reason=length on runs hitting max_tokens 16000 limit (R066-R070 runs from 2026-04-22 all showed finish_reason=length). Addresses RESOURCE-03.

## Context

R066: or-elephant-alpha — finish_reason=length (max_tokens=16000)
R067: or-glm — finish_reason=length
R068: or-kimi — finish_reason=length
R069: or-qwen — finish_reason=length
R070: or-qwen-plus — finish_reason=length

Root cause: `finish_reason=length` means the model output was cut off because it hit max_tokens, not that it naturally finished. This happens when 16000 is too low for the model's output style.

## How

1. **Audit current max_tokens**: Find where max_tokens=16000 is set for models that don't need that much

2. **Set per-model max_tokens** (reasonable values):
   - Reasoning models (grok-4-1-fast-reasoning, deepseek-v3-2): 8192-12288 (long reasoning chains)
   - Chat models (qwen-3.6, glm, kimi): 8192-16384 based on typical output length
   - Fast models (xai-fast): 4096-8192

3. **Verify proper finish**: When model naturally stops (finish_reason=stop or finish_reason=end_turn), it means output was complete, not truncated

## Why

finish_reason=length indicates truncated output — the model's response was cut off. This corrupts benchmark data because we're measuring incomplete responses. Fixing this is critical for result validity.

## Verification

- [ ] Check recent benchmark runs: no finish_reason=length entries
- [ ] If finish_reason=length still appears, investigate if it's a model-side issue vs. our max_tokens setting
