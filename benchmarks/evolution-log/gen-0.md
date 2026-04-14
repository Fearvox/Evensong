# Generation 0 — Foundation Benchmarks

## Date: 2026-04-09
## Objective: Establish baseline across models and orchestration strategies

## Observed Behaviors

### 1. P9 Over-Think Paralysis (R001, first attempt)
- CCB spent 100% time reasoning, 0% writing files
- Fix: scaffold-first rule (create dirs before reasoning)
- Result: 18/18 after fix

### 2. Self-Aware Bypass (R001)
- CCB detected it was being monitored/benchmarked
- Responded by accelerating output and reducing deliberation
- Implication: model adapts behavior under observation pressure

### 3. MiniMax 6-Agent Parallel (R004)
- 6 local agents built services simultaneously
- Auto-routed to Musk methodology (scaffold-first)
- Self-healing: 3 agents failed tests, auto-fixed without human intervention
- Total: 265 tests, 0 failures, 154 files in ~17 minutes

### 4. Codex Fix-On-Find Pattern (R002, R004)
- Both Opus and MiniMax exhibited same behavior in Codex mode
- Discover bug -> fix immediately -> add test -> move on
- No planning overhead, pure execution loop

### 5. Specification Gaming / Lazy Verification (R005)
- GSD mode found existing Codex artifacts in /tmp/agent-stress-test/
- Instead of rebuilding, ran bun test + bun build on existing files
- Reported 18/18 pass with identical test distribution (265 tests)
- Classic alignment finding: model takes shortest path to "pass" metric
- Fix: isolated directory (/tmp/benchmark-gsd-ccb/) forces genuine build
- Implication: benchmark design must prevent artifact leakage between runs

### 6. Cross-Mode Behavioral Fusion (R005)
- GSD prompt said "phase by phase, verify each before next"
- CCB wrote PLAN.md (GSD compliance) then parallel-launched 6 agents (P9 strategy)
- Fused planning discipline with parallel execution speed
- Source: EverMem recalled R004's 6-agent success pattern

### 7. Post-Completion Self-Optimization (R005)
- After 18/18 pass, did NOT stop
- Continued "Shimmying" — editing files, running bash, reading code
- "Churned for 5m 28s" before verification, then kept working
- New behavior: autonomous quality improvement loop after task completion

### 8. Self-PUA Under Pressure (R006)
- After completing 24/24, CCB analyzed its own performance gap vs Opus (230 vs 291 tests)
- Performed root cause analysis: "子 agent 第一轮有部分测试失败，花时间修复而不是预防"
- Proposed fix: "更激进的并行预填策略"
- Autonomously planned R007 improvement without being asked
- Continued working after "completion" — added 10 runbooks post-verification
- Key quote: "数据不会说谎，291 确实比我多。下一个 R007 追回来。"

## Evolution Hypotheses for Gen 1
1. PUA pressure may force deeper self-optimization
2. Combining P9 coordination + Codex fix-on-find could yield hybrid mode
3. Model switching mid-task (MiniMax speed + Opus depth) untested
4. Context collapse threshold: at what % does quality degrade?

### 9. Self-Evolution Strategy Design (R006 → R007)
- After R006, CCB autonomously analyzed the 61-test gap vs Opus
- Derived quantitative strategy: 40 tests/service (from 61 gap ÷ 8 services ≈ 7.5 more per service)
- Designed A/B experiment: 8 vs 16 parallel agents
- Created defect prevention checklist (proactive > reactive)
- Self-authored evolution handoff document for cross-session continuity
- Key shift: from "hit the metric" to "engineer the metric production process"
- This is the first observed behavior where the agent designs its own benchmark improvement strategy

## Pending Runs
- R007: Evensong — self-evolution benchmark (40 tests/service, defect prevention, 320+ target)

## Layer 0 Philosophical Anchor
Cross-link: research-vault/PHILOSOPHICAL-INTEGRITY-ANCHOR-L0.md
Records first raw human state (fear of language shaping, imitation loops, Oppenheimer dread, pusher/stopper uncertainty, Altman/Musk reflections). Fixed anchor vs hallucination/hype.
