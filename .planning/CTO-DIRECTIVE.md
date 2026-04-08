# CTO Directive: Pre-Phase-5 Mandatory Fixes

**Issued:** 2026-04-08
**Authority:** P10 Architecture Committee
**Sources:** Codex Adversarial Review (493 lines), MiniMax Hermes Evolution Review (16KB)
**Status:** BLOCKING — Phase 5 planning cannot start until items 1-3 are resolved

---

## Non-Negotiable Actions (Do Before Phase 5)

### 1. Fix the Dirty Source — Update SUMMARY.md [5 min]
- Hermes correctly identified: SUMMARY.md is the source document for the roadmap, and it still describes "6 features, 0 new deps, 6-phase build"
- Reality: 10 phases, 38 requirements, multi-model providers, evolution pipeline
- **Action:** Append a "Post-Expansion Addendum" to SUMMARY.md acknowledging the expanded scope

### 2. Define "Session" — It's Not a Word, It's a Contract [5 min]
- Hermes: "session-scoped" is a slogan without a definition
- Codex: privilege creep risk if session boundary is ambiguous
- **Action:** Add to REQUIREMENTS.md a formal definition: session = from CLI launch to CLI exit (process lifetime). Forked agents = child processes that do NOT inherit dynamic escalations.

### 3. Promote 3 Pitfalls to Hard Requirements [10 min]
- Codex: "safety described as guidance, not invariants"
- Hermes: "secret scanner is the weakest control yet it's the security boundary"
- **Action:** Convert these pitfalls into testable requirements:
  - **SEC-01**: Memory extraction MUST NOT persist any string matching known credential patterns (AWS_SECRET, ANTHROPIC_API_KEY, etc.)
  - **SEC-02**: Dynamic permission escalations MUST be scoped to process PID, not session name
  - **SEC-03**: Coordinator workers MUST NOT have BashTool write access to paths reserved by other workers

### 4. Acknowledge Mythos Limitations [2 min]
- Hermes: "Anthropic Red Team as oracle is bad methodology — CCB is a different system"
- **Action:** Add a note to EVOLUTION-PROTOCOL.md: Mythos findings are testable hypotheses, not ground truth. CCB must validate each claim empirically.

---

## Accepted But Deferred (Address During Implementation)

| Finding | Source | Phase to Address |
|---------|--------|-----------------|
| Provider router is a 4-value enum, plan promises 8+ | Codex | Phase 12 |
| 8-config test matrix undersized for 10 phases | Codex | Phase 13 |
| Evolution pipeline is circular (Phase 14 needs Phase 12) | Hermes | Phase 14 design |
| SUMMARY.md should be regenerated, not patched | Codex | After Phase 5 |
| Measurement infrastructure should come before features | Codex | Phase 5 scope expansion |

---

## Team Performance Assessment

| Agent | Grade | Notes |
|-------|-------|-------|
| Codex (GPT-5.4) | A- | Found doc inconsistencies first, verdict was harsh but correct |
| MiniMax Hermes | A | Found what Codex missed: dirty source, session identity, Mythos limitations |
| Gemini 3.1 Pro | Incomplete | Still initializing. 追求极致? 你连初始化都没过。 |
| Claude Opus (self) | B+ | Built the plan but let docs drift. As CTO: 你自己制造了 Codex 说的问题。 |

---

**下一步：执行上述 4 项 non-negotiable fix，然后立即 `/clear` → `/gsd-plan-phase 05`。**
**不再等 Gemini。数据够了，开干。**

*追求极致，务实敢为。Context not Control。*
