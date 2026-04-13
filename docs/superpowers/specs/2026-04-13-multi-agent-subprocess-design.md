# Multi-Agent Subprocess Layer Design

**Date**: 2026-04-13
**Status**: Draft
**Author**: CCR + User (co-evolved)

## Problem Statement

CCR has validated through Evensong benchmarks that different sub-domains benefit from specialized agents. The goal is to integrate Hermes (NousResearch) and Grok (xAI) as subprocess agents under CCR's orchestration, while leveraging shared memory via EverOS.

**Core tension identified**: Hermes's memory may arrive asynchronously before CCR's, creating asymmetric information states. Resolution: CCR maintains causal final-write authority over shared memory.

## Design Principles

1. **Manual routing by user** — User decides which agent handles which task
2. **Minimum viable infrastructure** — No manifest, no FSEvents, no heuristic routing engine
3. **Causal memory authority** — CCR merges and writes final memory state to EverOS
4. **Evals-first** — Prove value through observable outcomes before adding complexity

## Topology

```
User (central controller)
  │
  └── "hermes [task]" ──→ CCR ──→ hermes -q "task" --directory $PWD
                                └─→ stdout回CCR

Shared Memory (EverOS, zonicdesign.art space)
  │
  ├── CCR pulls before dispatch
  ├── Hermes writes after task
  └── CCR merges: CCR memory + Hermes contribution → final write to EverOS
```

## Phase 1: Hermes Only (Minimal Viable)

### CCR Changes

- Register one new agent type `hermes` in `AgentTool`
- Spawn via `LocalShellTask`: `~/.local/bin/hermes -q "{task}" --directory {cwd}`
- Output captured as stdout, passed back to CCR as tool result
- No file output, no manifest, no background monitoring

### Hermes Integration

- Binary: `~/.local/bin/hermes`
- CLI: `hermes -q "{prompt}" --directory {cwd}`
- Uses existing Hermes model config (`~/.hermes/config.yaml`, defaults to MiniMax-M2.7)

### Memory Flow

```
CCR pull EverOS → Hermes context
Hermes executes → Hermes writes memory
CCR executes    → CCR reads Hermes stdout
CCR merge+write → EverOS (causal final state)
```

### What CCR Does NOT Do (Phase 1)

- No Grok or Codex registration
- No file-based output (research-vault deferred)
- No FSEvents monitoring
- No manifest.jsonl
- No automatic routing

## Phase 2+ (Deferred, data-driven)

 contingent on Phase 1 producing observable value:

- Grok integration (`grok --prompt "{task}" --directory $PWD --format json`)
- Codex integration (`codex exec "{task}" --directory $PWD`)
- research-vault file output for async result retrieval
- Manifest-based task queue if manual routing proves insufficient

## Success Criteria

Observable within one week:

- User can dispatch Hermes via CCR and receive results
- Hermes's contributions are visibly additive to CCR's solo output
- Memory merge produces coherent causal history in EverOS
- No system-induced memory corruption (self-contamination managed by CCR merge logic)

## File Structure

No new directories or files in CCR required for Phase 1.

Agent registration in: `src/tools/AgentTool/loadAgentsDir.ts` or `src/tools/AgentTool/builtInAgents.ts`

Hermes binary path: `~/.local/bin/hermes`
Hermes config: `~/.hermes/config.yaml`
