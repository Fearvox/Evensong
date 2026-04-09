# Three-Mode Benchmark Comparison Report

## Date: 2026-04-09
## Task: Meridian FinTech Platform (6-service, 18 verification criteria)
## Model: Opus 4.6 (1M context, max effort)

## Results

| Metric | P9 Tech Lead (CCB) | Codex Rescue | GSD Plan-Phase |
|--------|:---:|:---:|:---:|
| **18-Point Pass Rate** | 18/18 | 18/18 | 18/18 |
| **Tests** | 327 | 111 | 291 |
| **expect() Assertions** | 619 | 207 | 606 |
| **TS Source Files** | ~91 | 64 | 67 |
| **ADRs** | 5 | 6 | 6 |
| **Runbooks** | 5 | 8 | 9 |
| **SOC2 Controls** | N/A | 20 | 24 |
| **Execution Time** | External CCB | 15.7 min | 25.6 min |
| **Token Usage** | External | 126K | 145K |
| **Tool Calls** | External | 144 | 157 |
| **Methodology** | P7 subagent parallel | Fix-on-find, no planning | PLAN.md -> 10-phase verify |

## Key Findings

1. **All modes pass 18/18** -- verification criteria is not the differentiator
2. **Codex is fastest** -- 39% faster than GSD (zero planning overhead)
3. **GSD is most thorough** -- highest doc quality (24 SOC2 controls, 9 runbooks)
4. **P9 has highest test density** -- 327 tests via parallel P7 subagents
5. **Token efficiency**: Codex 126K < GSD 145K (14% less)

## ROI Analysis

| Priority | Best Mode | Why |
|----------|-----------|-----|
| Speed | Codex | No planning phase, build-and-fix loop |
| Quality/Compliance | GSD | Phase verification catches issues early |
| Parallelism | P9 | Multi-agent coordination scales |

## Methodology Notes

- P9 ran in external CCB instance (separate session)
- Codex and GSD ran as subagents in same Opus 4.6 session
- All used identical STRESS-TEST.md specification
- Isolated directories: /tmp/agent-stress-test (P9), /tmp/benchmark-codex, /tmp/benchmark-gsd
