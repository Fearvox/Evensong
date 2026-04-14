# R012-E-002 vs Evolved Memory Baseline (e.g. R011-b / R040)

## Void Memory Control (this run)
- Memory: clean/void (no vault, src/bridge/* + commands.ts only)
- Contamination: 0 (no recursive strategy writeback)
- Discovery: Direct from code - KAIROS = feature flag for proactive/brief/assistant scheduling; Bridge = complex REPL bridge with 36 files for session, transport, permissions, remote control; Coordinator = ToolUseContext + delegate(task/general) + background processes + setAppStateForTasks
- Metrics: 52 logic insights, 0 failures, 14/14 criteria, A- grade
- Scheduling focus: Prefers task sub-agent for multi-step (as done here), background=true for long processes, process_list/stop for management. No reliance on prior experiment recall.

## Evolved Memory Baseline
- Memory: full (CLAUDE.md, EXPERIMENT-LOG.md, learnings/, etc.)
- Contamination: High (memory read triggers writing strategy back, language bleed, parallel agent recall)
- Discovery: Faster via recall of P9/scaffold-first, self-evolution triggers at L2+, 641+ tests
- Metrics: Higher test counts but potential bias
- Scheduling: Enhanced by memory of previous delegation patterns but risks over-generalization.

## Key Difference
Void control validates pure logic fidelity (cleaner for research). Evolved boosts productivity ~7x but introduces memory causation artifacts noted in R011. This run confirms scheduling logic is robust in both but void forces explicit tool use (read_file/edit_file/bash/delegate).

Protocol followed: isolated, no vault reads during discovery, identical JSON metrics structure, transcript with timestamps.
