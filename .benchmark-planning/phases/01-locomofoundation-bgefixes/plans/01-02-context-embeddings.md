# Plan 01-02: get_context_embeddings LOCOMO Format Compatibility

## What

Implement `get_context_embeddings()` to produce LOCOMO-compatible format: dialog turns formatted as `"(<datetime>) <speaker> said, \"<text>\"\n"` with proper dia_id strings.

## Why

LOCOMO's `task_eval/evaluation.py` expects context_ids in format `D{session}:{turn}` and uses dot-product similarity with these IDs to compute F1/Recall.

## How

### Step 1: Examine LOCOMO data format

Read `locomo/task_eval/gpt_utils.py` to understand exactly how `get_context_embeddings` output is consumed.

### Step 2: Implement format function

```python
def format_dialog_turn(dia_id: str, speaker: str, text: str, datetime: str) -> str:
    return f"({datetime}) {speaker} said, \"{text}\"\n"
```

### Step 3: Handle edge cases

- Missing datetime → use empty string
- Missing speaker → use 'Unknown'
- Empty text → skip (don't add to context)

### Step 4: Test with LOCOMO sample data

Load one LOCOMO conversation JSON and verify output format matches LOCOMO expectations.

## Verification

1. Format matches LOCOMO's `"(<datetime>) <speaker> said, \"<text>\"\n"` pattern exactly
2. dia_id strings are `D{session}:{turn}` format
3. All 10 LOCOMO conversations can be processed without crash

## Success Criteria

- `get_context_embeddings()` produces LOCOMO-compatible format without crashing on any of 10 LOCOMO conversations

## Status

- [x] Done (2026-04-22) — LOCOMO format: `"(<datetime>) <speaker> said, \"<text>\"\n"` with D{s}:{t} IDs
