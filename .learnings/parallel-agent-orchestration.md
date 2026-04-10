## [LRN-20260410-002] Parallel Agent Orchestration — When to Dispatch

- **What**: Parallel subagent dispatch is a first-class optimization when tasks are truly independent (no shared file modifications, no sequential dependencies)
- **Why**: 3x efficiency gain observed — 3 agents in ~2min vs sequential ~6min. Also enables "farming out" tasks while maintaining conversation context
- **Trigger condition**: Task count ≥ 2 AND file modification boundaries are non-overlapping
- **Risk**: If two agents touch the same file, git conflicts arise. Always verify file isolation before dispatching
- **Domain**: agent-orchestration, efficiency, parallelism
- **Confidence**: high
