## [ERR-20260410-003] Model Switch = Context Reset (Critical)

- **What**: Switching between models (Opus ↔ MiniMax ↔ Opus) loses ALL conversation context, memory state, and in-progress understanding
- **Why**: Providers maintain isolated conversation states. Each new model session starts fresh
- **Manifestation**: "Key learnings forgotten" — the MiniMax session lost track of what the Opus session had already established
- **Prevention**: Always use `/clear` + explicit command BEFORE starting new work in a different model context
- **Memory persistence**: Critical findings MUST be written to memory files (`.learnings/` or MEMORY.md) immediately, not relied upon across model switches
- **Domain**: session-management, context, model-switching, pitfall
- **Confidence**: high
