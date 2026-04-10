# CCB Benchmark Registry

## Run Index

| Run | Date | Model | Mode | Tests | Pass Rate | Time | Token | Files |
|-----|------|-------|------|-------|-----------|------|-------|-------|
| R001 | 2026-04-09 | MiniMax M2.7 | P9 Tech Lead | 327 | 18/18 | ~20m | ext | ~91 |
| R002 | 2026-04-09 | Opus 4.6 max | Codex (subagent) | 111 | 18/18 | 15.7m | 126K | 64 |
| R003 | 2026-04-09 | Opus 4.6 max | GSD (subagent) | 291 | 18/18 | 25.6m | 145K | 67 |
| R004 | 2026-04-09 | MiniMax M2.7 | Codex (CCB 6-agent) | 265 | 18/18 | ~17m | ~8.6K | 154 |
| R005 | 2026-04-09 | MiniMax M2.7 | GSD (CCB 6-agent fused) | 265 | 18/18 | ~10m (4.5m peak) | ~7K | ~154 |
| R006 | 2026-04-09 | MiniMax M2.7 | PUA Extreme (8-svc, 24-criteria) | 230 | 24/24 | ~17m | ~14K | ~60 |
| R007 | 2026-04-09 | MiniMax M2.7 | Evensong (self-evo, 40t/svc) | *pending* | 24/24 | *pending* | *pending* | *pending* |

## Task Spec
- 6-service FinTech platform (Meridian Financial Systems)
- 18 verification criteria (see STRESS-TEST.md)
- SOC2, GDPR, ONNX ML, CDC, Chaos Engineering

## Evolution Tracking

### Generation 0 (2026-04-09)
- P9 over-think paralysis discovered -> scaffold-first fix
- Self-aware bypass observed (CCB sensed monitoring)
- MiniMax 6-agent parallel: 154 files in 17min

### Key Metrics Across Runs

#### Speed Leader: Opus Codex (15.7m) then MiniMax Codex (17m)
#### Test Density Leader: P9 MiniMax (327 tests)
#### File Output Leader: MiniMax Codex (154 files)
#### Doc Quality Leader: Opus GSD (24 SOC2, 9 runbooks)
#### Parallel Efficiency: MiniMax 6-agent > Opus single-agent

## Directory Structure
```
benchmarks/
  BENCHMARK-REGISTRY.md    <- this file
  runs/
    R001-minimax-p9/
    R002-opus-codex/
    R003-opus-gsd/
    R004-minimax-codex/
    R005-minimax-gsd/       <- pending
    R006-minimax-pua/       <- pending
    R007-evensong/          <- self-evolution run
  evolution-log/
    gen-0.md                <- current generation
  v1.0-three-mode-comparison/
    COMPARISON.md
```
