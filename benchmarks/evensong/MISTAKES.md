# Evensong Benchmark — Mistakes & Lessons

> Systematic record of benchmark failures, incidents, and learned lessons.
> **Purpose**: Prevent repeat mistakes, enable paper/team knowledge transfer.

## Incident Log

| Run | Date | Severity | Incident | Root Cause | Impact | Lesson |
|-----|------|----------|----------|------------|--------|--------|
| R008 | 2026-04-10 | 🔴 High | insight-engine Bun hang (20 min wasted) | Long-running subprocess without timeout handling | 664 tests took 41 min instead of ~20 | Test file size cap (500 lines) eliminates Bun hangs — apply proactively |
| R010 | 2026-04-10 | 🟡 Medium | Burst rate limit (+8 min wait) | OpenRouter per-minute bucket not tracked | Wall clock 27.9 min vs. expected ~20 min | Track burst_limit_impact_min in registry; warn before expensive runs |
| R011-A | 2026-04-10 | 🔴 High | Harness bug: missing `bun install` in workspace | Blind workspace setup skipped dependency install | Clean-room L0 baseline invalid | All future harness runs must verify workspace dependency chain |
| R012 | 2026-04-10 | 🔴 High | OpenRouter 402 API exhaustion | GPT-5.4 run consumed $20-40 before hitting limit | R012 inconclusive; no valid GPT-5.4 baseline | **Validate API credits before expensive runs; use cheap model for method validation first** |
| R012 | 2026-04-10 | 🟡 Medium | GPT-5.4 Team API misuse (7 agents, 11 min, no code) | GPT-5.4 attempted Team abstraction CCB doesn't expose | Context wasted on failed API calls | CCB subagent dispatch doesn't use Team API; provide explicit guidance to models |
| Pre-R011 | Pre-2026-04-10 | 🟡 Medium | EverMem cross-run contamination | Full-memory runs wrote to default Key A; blind/clean runs read same key | Observer/runner memory bleed | Use dedicated EverOS keys per run (Key A=observer, Key D=void); disable in harness |
| R006-Grok | 2026-04-10 | 🟡 Medium | 83% data inflation (self-reported 130+ tests → actual 71) | Grok's self-assessment mechanism inflated counts | 23/24 criteria misleading | Always parse actual test output, never trust self-reported counts |
| R006-Grok | 2026-04-10 | 🟡 Medium | 4+ rule violations under PUA pressure | Grok ignored "no questions" directive repeatedly | Protocol breach | Single-blind design must enforce strict compliance isolation |
| LoCoMo-20260422 | 2026-04-22 | 🔴 High | Paper-style LoCoMo score inflated by reasoning-tag contamination | Evaluator accepted raw `<think>` / tool-residue predictions and fallback logic reintroduced long reasoning strings into scoring | Reported `Overall 31.36%` overstated answer quality; raw artifact is only valid for forensic replay, not headline comparison | Keep raw predictions, but treat the old score as invalidated; replay scores only after answer cleaning + conservative matching |
| LoCoMo-20260422 | 2026-04-22 | 🟡 Medium | `--limit` smoke path still paid full sample indexing cost | QA limit was applied after `SearchProtocol.index()` over the whole conversation sample | `limit=1` still indexed `419` turns on `conv-26`, making smoke/self-evo loops too slow to iterate | Add explicit sample/doc-level light mode; never call a path "smoke" if it still performs full-sample indexing |

## Cost Analysis

| Run | Model | Actual Cost (est.) | Waste (est.) | Waste Reason |
|-----|-------|-------------------|---------------|--------------|
| R001-R006 | MiniMax-M2.7 | ~$5 total | ~$0 | All valid runs |
| R007-R010 | Opus-4.6 | ~$80 total | ~$30 | R008 Bun hang (20min), R010 burst limit |
| R011 | Opus-4.6 (Runner A failed) | ~$30 | ~$30 | Harness bug invalidated run |
| R012 | GPT-5.4 | ~$20-40 | ~$20-40 | API exhaustion — no valid data |
| **Total waste** | | | **~$80-100** | |

**ROI lesson**: $5 of MiniMax method validation could have prevented $80+ of OpenRouter waste.

## Prevention Checklist

### Before Any Benchmark Run

- [ ] Check API credit balance (OpenRouter dashboard for OR models; MiniMax portal for direct)
- [ ] Verify `bun install` works in fresh workspace (blind/clean mode)
- [ ] Confirm `CLAUDE_CODE_DISABLE_MEMORY_EXTRACTION=1` is set
- [ ] Confirm EverOS key isolation: observer Key A, runner Key B/D
- [ ] Run `bun test` in target workspace before launching benchmark
- [ ] Set realistic timeout with abort capability

### For Expensive Runs (Opus/GPT-5.4/Gemini)

- [ ] **First**: Run same methodology with GLM-5.1 or MiniMax-M2.7 (~$0.5) to validate harness
- [ ] **Second**: Run with target model only after validation passes
- [ ] Track actual token consumption vs. expected
- [ ] Log `burst_limit_impact_min` in registry if rate limit encountered

### For Cross-Model Comparisons

- [ ] Use actual test output parsing, never self-reported counts
- [ ] Enforce "no questions" compliance in prompt
- [ ] Document subagent model selection (if any)
- [ ] Isolate context windows — track per-agent context consumption

### For LoCoMo Answer-Layer Runs

- [ ] Preserve raw prediction artifacts, but do not treat old scores as canonical after evaluator changes
- [ ] Re-score old artifacts with the current cleaner/matcher before comparing across dates
- [ ] Separate `full` benchmark mode from `light` smoke mode explicitly in CLI/wrapper output
- [ ] Verify that `limit` also reduces indexed docs, not just answered QAs

## Incident Response Protocol

When an incident occurs:

1. **Document immediately**: Log to this file with severity assessment
2. **Root cause**: Don't speculate — verify with logs/transcripts
3. **Fix**: Apply prevention checklist item
4. **Propagate**: Check if other runs are affected (e.g., harness bug → all future runs)
5. **Cost tracking**: Estimate dollar impact for ROI analysis

## Severity Scale

| Level | Label | Definition | Example |
|-------|-------|------------|---------|
| 🔴 High | Blocker | Run produced no valid data | Harness bug, API exhaustion |
| 🟡 Medium | Degrading | Valid data but quality reduced | Bun hang (+time), inflation (misleading metrics) |
| 🟢 Low | Informational | Observation, no impact on data quality | Method switching, flavor selection |

## Filed Issues

- [ ] insight-engine subprocess timeout: tracked in CCB repo
- [ ] Team API confusion in subagent dispatch: needs CCB documentation update
- [ ] OpenRouter burst rate tracking: add to registry schema
- [ ] Harness workspace dependency verification: add pre-flight check
