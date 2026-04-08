# Phase 06: Memory Extraction - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** Interactive discuss-phase

<domain>
## Phase Boundary

Enable the existing memory extraction system (gated behind `feature('EXTRACT_MEMORIES')`) so the CLI automatically extracts cross-session memories after conversations, loads them in future sessions, and prevents secret leakage through a programmatic scanner.

Key: Most code already exists in `src/services/extractMemories/`, `src/memdir/`, and `src/query/stopHooks.ts`. This phase enables the flag, verifies Bun runtime compatibility, adds hard secret scanning, and tests the full flow.

</domain>

<decisions>
## Implementation Decisions

### Secret Scanning Strategy
- **Write-before intercept**: Programmatic regex check runs BEFORE the forked agent writes any memory file to disk. If a secret pattern matches → discard that memory entry entirely, log the discard.
- **Pattern source**: Custom config file (`~/.claude/secret-patterns.json`) with SEC-01 core patterns as shipped defaults:
  - `AWS_SECRET_ACCESS_KEY`, `AWS_ACCESS_KEY_ID`
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - Private key blocks (`-----BEGIN.*PRIVATE KEY-----`)
  - Hex tokens 20+ chars (`[0-9a-fA-F]{20,}` in key-value context)
  - `sk-[a-zA-Z0-9]{20,}` (OpenAI/Anthropic style)
  - `ghp_[a-zA-Z0-9]{36}` (GitHub PAT)
  - `xoxb-`, `xoxp-` (Slack tokens)
- **Init template**: First run auto-creates `~/.claude/secret-patterns.json` with all defaults. User can edit to add/remove patterns. File is self-documenting with comments explaining each pattern.
- Keep existing prompt instruction ("never save API keys") as defense-in-depth alongside the hard filter.

### Memory Loading Strategy
- **Use existing logic as-is**: Sonnet sideQuery selects up to 5 most relevant memories per query. MEMORY.md index always loaded in system prompt.
- Verify this flow works under Bun runtime with the EXTRACT_MEMORIES flag enabled.
- No changes to the loading mechanism in this phase.

### Extraction Behavior Visibility
- **Silent on success**: No notification when extraction completes normally.
- **Log on failure/intercept**: When extraction fails or secret scanner intercepts content, write to debug log (accessible via `--debug` or log file).
- User can manually inspect `~/.claude/projects/<path>/memory/` directory to see extracted memories.

### Claude's Discretion
- Exact implementation of the write-intercept hook (where in the code to add the check)
- Config file format details (JSON schema for secret-patterns.json)
- Test fixture design for secret scanning tests
- forkedAgent Bun compatibility verification approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Memory Extraction Core
- `src/services/extractMemories/extractMemories.ts` — Main extraction logic, forked agent pattern, tool permissions
- `src/services/extractMemories/prompts.ts` — Extraction prompt templates
- `src/query/stopHooks.ts` — Trigger point (lines 41-43: EXTRACT_MEMORIES gate)

### Memory Directory Infrastructure
- `src/memdir/paths.ts` — Memory path management, isAutoMemoryEnabled()
- `src/memdir/memoryScan.ts` — Memory file scanning and header parsing
- `src/memdir/findRelevantMemories.ts` — Relevance-based memory loading (Sonnet sideQuery)
- `src/memdir/memdir.ts` — Memory directory entrypoint

### Context Integration
- `src/utils/claudemd.ts` — CLAUDE.md loading (loads MEMORY.md index)
- `src/utils/forkedAgent.ts` — Forked agent utility (used by extraction)

### Feature Flag
- `src/utils/featureFlag.ts` — Created in Phase 05, controls EXTRACT_MEMORIES gate

### Requirements
- `.planning/REQUIREMENTS.md` — MEM-01, MEM-02, MEM-03, SEC-01

</canonical_refs>

<specifics>
## Specific Ideas

- Secret patterns config should ship with sensible defaults but be editable — like a `.gitignore` for secrets
- Init template should have comments explaining each pattern so user knows what they're editing
- The forked agent already has `createAutoMemCanUseTool()` that restricts write paths — secret scanning adds content-level filtering on top of path-level filtering

</specifics>

<deferred>
## Deferred Ideas

- Team memory sync (`TEAMMEM` flag) — separate feature, separate phase
- autoDream consolidation — related but separate (KAIROS-04)
- Memory search/query UI — would be nice but out of scope

</deferred>

---

*Phase: 06-memory-extraction*
*Context gathered: 2026-04-08 via interactive discuss-phase*
