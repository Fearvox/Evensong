---
name: Collaboration Benchmark Dimension
description: New benchmark dimension measuring inter-model collaboration (orchestrator→worker dispatch). xAI predicted strongest at same-family collab. Chinese model pairs are unexplored territory.
type: project
---

Inter-model collaboration is a NEW Evensong benchmark dimension (added 2026-04-10).

**Why:** No existing benchmark measures how AI models coordinate with each other. We test orchestrator model A dispatching subtasks to worker model B.

**How to apply:**
- collaboration-schema.ts defines CollaborationProfile and COLLABORATION_MATRIX
- Same-family pairs (Grok×Grok, Claude×Claude) vs cross-family (Claude→Grok, GPT→GLM)
- Multi-worker configs test 1 orchestrator + 2+ workers
- xAI predicted strongest due to native grok-4.20-multi-agent variant
- Chinese model pairs (GLM×Qwen, GLM×DeepSeek) are completely unexplored

**Key insight from user:** Low prediction hit rate = high emergent creativity. The GOAL is for models to surprise us.
