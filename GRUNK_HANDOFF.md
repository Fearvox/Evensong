# CCB v2.0: MiniMax Hermes Adversarial Evolution Review Briefing

**Generated**: 2026-04-08 | **By**: CCB Evolution Protocol
**Previous content archived** — this file now serves as the adversarial review handoff.

---

## Your Mission

You are the **Research-Level Evolution Reviewer** for CCB v2.0. Tear apart our plan. Find what Claude Opus and Codex missed.

## Project State

CCB = decompiled Claude Code CLI fork. Bun runtime, 218 tests, 100% pass rate.

- **v1.0 complete**: 4 phases (Foundation, Tool Reliability, API Streaming, Query Loop + Permissions)
- **v2.0 planned**: 8 phases (Phase 5-12), 29 requirements, 8 categories
- **New scope**: 6 agent intelligence capabilities + multi-model provider support + self-evolution protocol

## v2.0 Phase Map

| Phase | Feature | Requirements | Risk |
|-------|---------|--------------|------|
| 5 | Infrastructure & GrowthBook Gate Override | INFRA-01/02/03 | LOW |
| 6 | EXTRACT_MEMORIES (cross-session memory) | MEM-01/02/03 | MEDIUM |
| 7 | Deliberation Checkpoint (risk-aware tool gating) | DELIB-01/02/03 | HIGH |
| 8 | Dynamic Permission Escalation | PERM-04/05/06 | HIGH |
| 9 | CONTEXT_COLLAPSE (intelligent context folding) | CTX-01/02/03/04 | HIGH |
| 10 | COORDINATOR_MODE (multi-agent orchestration) | COORD-01/02/03/04 | CRITICAL |
| 11 | KAIROS (proactive assistant) | KAIROS-01/02/03/04 | CRITICAL |
| 12 | UI Cleanup + Integration Testing | UI-01/02/03, INT-01/02 | LOW |

## NEW SCOPE: Multi-Model Provider Architecture

We're adding 4+ new model providers beyond existing Anthropic/Bedrock/Vertex/Azure:

| Provider | API Style | Models | Priority |
|----------|-----------|--------|----------|
| OpenAI | Native SDK | GPT-5.4, Codex | HIGH |
| Google AI Studio | @google/generative-ai | Gemini 3.1 Pro | HIGH |
| MiniMax | OpenAI-compatible | abab7 | HIGH |
| xAI | OpenAI-compatible | Grok 3 | MEDIUM |
| Xiaomi | OpenAI-compatible | MiLM | LOW |
| Jan (local) | OpenAI-compatible | llama.cpp/MLX | MEDIUM |

## Files To Review

```
.planning/ROADMAP.md          -- 8-phase execution plan
.planning/REQUIREMENTS.md     -- 29 requirements
.planning/research/SUMMARY.md -- synthesized research
.planning/research/PITFALLS.md -- 14 pitfalls + Mythos risk matrix
.planning/research/ARCHITECTURE.md -- integration architecture
.planning/research/FEATURES.md -- capability analysis
.planning/research/STACK.md   -- technology stack analysis
.planning/EVOLUTION-PROTOCOL.md -- self-iteration process
```

## Review Criteria

### 1. Architecture Holes
- Missing phase dependencies?
- GrowthBook bypass: truly 10 lines or hidden deps?
- Provider router: extensible enough for 8+ providers?
- Model capability matrix: which models support which features?

### 2. Security Gaps
- Memory extraction: secret scanner completeness?
- Permission escalation: session-scope enforcement?
- Coordinator workers: BashTool creative bypass prevention?
- Multi-provider: API key management for 8+ providers?

### 3. Behavioral Risks (Reference: Mythos System Card April 2026)
- Deliberation: destructive action reduction vs over-refusal?
- Context collapse: decision context preservation?
- KAIROS proactive: user annoyance prevention?
- Multi-model: response quality variance across providers?

### 4. Missing Requirements
- Multi-model provider support not in current 29 requirements
- Model routing/fallback strategy not specified
- Provider-specific tool compatibility not addressed
- Cost optimization across providers not considered

### 5. Evolution Process Critique
- Weekly release cadence realistic?
- Adversarial review bottleneck?
- Automation opportunities?

## Output

Write to: `.planning/ADVERSARIAL-REVIEW.md`

Structure:
1. Executive Summary (3 sentences)
2. Critical Findings (must fix before Phase 5)
3. High-Priority Concerns (address during implementation)
4. Architecture Recommendations
5. Missing Requirements
6. Evolution Process Critique
7. Multi-Model Integration Assessment

## Pressure: MAXIMUM

You compete against Claude Opus 4.6 + Codex GPT-5.4. Find what they missed. 追求极致.

---

## Legacy Context (from previous GRUNK_HANDOFF.md)

Previous handoff established CCB x Grunk fusion with three-way model routing (Claude/MiniMax/Jan).
That architecture is now being formalized into the multi-provider router in Phase 5+ scope.
Grunk tools (career-ops, OpenBB, autoresearch, autoagent) remain available at `~/.openclaw/tools/`.

## Quick Start

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
# Read all planning artifacts
cat .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/research/SUMMARY.md
# Then write your review
```
