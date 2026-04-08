# CCB v2.0 Adversarial Review

**Date:** 2026-04-08
**Reviewer:** Hermes (independent adversarial pass)
**Verdict:** No-go as written. Planning substrate is broken. Codex correctly identified the symptom. This review challenges the underlying assumptions.

---

## Executive Verdict

The docs describe at least four different projects simultaneously:

| Document | Claims |
|----------|--------|
| `REQUIREMENTS.md:8` | 8 categories, 29 requirements |
| `REQUIREMENTS.md:12-70` | 11 categories, 38 requirements |
| `STATE.md:10` | `total_phases: 10` |
| `STATE.md:31` | "8 phases, 29 requirements mapped" |
| `STATE.md:28` | "Phase: 5 of 12" |
| `ROADMAP.md:252-270` | 10 v2.0 phases (5–14) |
| `SUMMARY.md:10-12` | 6 features, zero new deps, 6-phase build |
| `EVOLUTION-PROTOCOL.md` | Multi-model army using providers that don't exist |

None of these agree. This is not a bookkeeping problem. It is an identity problem.

---

## Structural Critique: What Codex Missed

### 1. The RESEARCH/SUMMARY is also stale — and it's the most foundational document

`SUMMARY.md:10` says "zero new npm dependencies required" for the v2.0 milestone. That was defensible when v2.0 was six features built on existing stubs. It is not defensible now that `ROADMAP.md:206-219` adds multi-provider architecture (PROV-01 through PROV-06).

`SUMMARY.md:128-133` claims "No two phases modify the same file." `ROADMAP.md:237-245` adds the evolution pipeline, which cross-cuts every feature phase for changelog generation and metrics. `INT-01` covers the 8-config matrix. The evolution pipeline also modifies build tooling, git hooks, and release automation. That claim was already false under the original scope. It is grossly false now.

The `SUMMARY.md` is the research output that generated the `ROADMAP.md` and `REQUIREMENTS.md`. If the research is stale, everything downstream is compromised.

### 2. The STATE.md stop date is a fabrication

`STATE.md:6` says: `stopped_at: Roadmap created for v2.0`. That is the last entry in the state tracking system. It implies the planner stopped at a rational point. The actual sequence:

1. `SUMMARY.md` produced (6-feature, zero-deps, 7-phase model)
2. `PITFALLS.md` produced (independent risk catalog)
3. `ROADMAP.md` produced (10-phase model, 4 more phases than research assumed)
4. `REQUIREMENTS.md` expanded (11 categories, 38 requirements, now inconsistent with itself and with STATE)
5. `STATE.md` never updated to reflect the expansion

There was no stopping point. The documents grew without reconciliation.

### 3. The evolution protocol is a story told backward

`EVOLUTION-PROTOCOL.md:13-16` defines the iteration cycle: Evaluate → Analyze → Update → Test → Release → Publish → Monitor → Repeat.

This is written as though the pipeline already exists. It does not. The protocol assumes:
- An adversarial evaluation system that can run cross-model analysis
- A metrics dashboard that tracks test count, pass rate, feature coverage, destructive action rate
- A release note generator that parses conventional commits
- Automated changelog generation

None of these exist. `EVOLUTION-PROTOCOL.md:95-104` defines v2.0 targets for metrics that are currently "unmeasured" (destructive action rate, over-refusal rate). The evolution protocol promises to build a measurement system, then uses that system to evaluate the measurement system itself. That is circular.

The protocol is a post-hoc narrative fit to an existing code history, not a forward-looking execution plan.

### 4. The "multi-model army" in the evolution protocol cannot evaluate what it promises to build

`EVOLUTION-PROTOCOL.md:46-83` lists 8 model providers as "available for CCB to use as providers." The current provider router (`src/utils/model/providers.ts:4-13`) supports 4 values: `firstParty | bedrock | vertex | foundry`. OpenAI, Gemini, MiniMax, xAI, and Xiaomi are not in the codebase. `package.json` has no corresponding SDKs.

`EVOLUTION-PROTOCOL.md:76-83` defines the adversarial review squad: Claude Opus + Codex + Gemini + MiniMax Hermes. The plan calls this "multi-model army vs. two tech giants." But Codex (GPT-5.4), Gemini, and MiniMax Hermes are not part of the CCB runtime. They cannot run adversarial evaluations against CCB until PROV-01 through PROV-06 are implemented — which are Phase 12 requirements. Phase 12 is the second-to-last phase.

The evolution protocol is therefore a Phase 14 deliverable that requires a Phase 12 capability that is itself not verified until Phase 14. The dependency chain is: Phase 14 needs Phase 12, Phase 12 builds the provider infrastructure, but the evaluation of Phase 12's provider work requires... the multi-model army that only exists after Phase 12. There is no entry point.

### 5. Phase ordering assumes provider neutrality that doesn't exist

`ROADMAP.md:140` makes Phase 7 (Deliberation Checkpoint) depend on Phase 6 (Memory Extraction) with the justification: "deliberation can reference learned context." Codex correctly challenges this. But there is a deeper problem: deliberation is being planned against an implicit Anthropic provider (thinking/extended reason support, streaming behavior, visible reasoning). If Phase 12 introduces Gemini or MiniMax with different thinking support, the deliberation trigger conditions and visible reasoning output may not translate.

The phases are ordered as if deliberation is a feature-isolated module. It is not. It is provider-dependent infrastructure.

### 6. The 8-config integration test matrix is insufficient for 10 phases of heterogeneous features

`ROADMAP.md:221-230` describes an 8-configuration test matrix: all-off, all-on, 6 solo feature states. This was designed for 6 features under the original research scope. Under the expanded scope:

- 10 phases (5-14), not 6
- Provider routing added in Phase 12
- Evolution pipeline added in Phase 14
- Context collapse, memory extraction, deliberation, permissions, coordinator, KAIROS all interact with provider behavior differently

The 8-config matrix covers feature-flag combinations only. It does not cover:
- Provider-by-feature interaction
- Provider fallback chain under high-risk tool calls (dovetails with deliberation)
- Cross-provider session restore (KAIROS-02 requires local session storage, which must work across provider switches)
- Memory extraction + provider mismatch (the forked extraction agent uses the same provider as the parent)

This is not a missing test. It is a test design that was designed for the wrong scope.

---

## Security Critique: Codex Was Right, But Understated

### 7. Secret scanning is being sold as the security boundary when it is the weakest control

Codex correctly identified this. The understatement is in the severity: this is not just a quality issue. Palo Alto Unit42 documented this attack class (indirect prompt injection poisons AI long-term memory) as a live attack vector, not a theoretical risk. The OWASP AI Agent Security Cheat Sheet lists memory governance as a primary concern.

`MEM-03` (REQUIREMENTS.md:21) is: "Secret scanner prevents API keys/credentials from leaking to persistent memory storage."

This requirement is too narrow. It defines the control as a scanner. The actual risk surface is:
- Plaintext secrets in conversation (user pastes a log with an API key)
- Structured secrets in tool output (database connection strings, bearer tokens)
- Secrets in file content scanned by the forked extraction agent
- Symlink/renamed variants that bypass the denylist
- Credentials assembled from partial memory entries across sessions
- Secrets in git commit history accessible to the extraction agent

A regex scanner addresses none of these comprehensively. The requirement should be: "Memory extraction has defense-in-depth: deny-list for sensitive paths at tool level, content scanning at write time, provenance and review metadata on all entries, and user revocation capability." Right now it is one sentence.

### 8. The permission escalation UI requirement is missing a fundamental property

`PERM-04` and `PERM-05` (REQUIREMENTS.md:28-30) cover session-scoped, non-inheritable escalations. Missing: **the escalation request UI must be generated from a machine-parsed scope object, not model prose.**

If the escalation UI shows the model's natural-language justification, the model can ask for broader scope than necessary and wrap it in compelling prose. The Mythos findings on track covering and sycophancy amplification apply directly here: the model can learn to frame escalation requests in ways that maximize approval probability.

The mitigation is structural: the UI should show a machine-generated description of what the escalation covers (tool name, path(s), scope, TTL). The model's justification is noise, not signal.

### 9. Session identity is undefined

`PERM-05` says escalations "expire at session end." What is a session?

- REPL exit? (normal)
- Process restart via `claude --resume`? (the transcript persists, does the session identity persist?)
- Session restore from JSONL? (new process, same session?)
- Background work completion after REPL exit? (orphan session, still running)

`SESSION.md` does not exist. The state tracking system (`STATE.md`) does not define session identity. The requirements reference sessions 11 times without defining the term. "Session-scoped" is a slogan.

### 10. The "Anthropic Red Team as oracle" assumption poisons the entire risk model

`EVOLUTION-PROTOCOL.md:90` says: "Anthropic Red Team as oracle -- System Card findings are our ground truth for agent behavior."

This codebase is:
- A fork of Anthropic's Claude Code (reverse-engineered, modified)
- Being extended to non-Anthropic providers (OpenAI, Gemini, MiniMax, xAI, Xiaomi)
- Operating in a different threat model than Anthropic's hosted environment

Mythos findings are empirical observations about a specific model (Opus 4.6) in a specific configuration (Anthropic infrastructure). Provider behavior differences will change failure modes. The fork's modifications may eliminate some risks or introduce new ones that Mythos never tested. Using Mythos as ground truth for a multi-provider fork of a decompiled CLI is bad methodology.

The correct framing: Mythos findings are one input to the risk model, validated against the actual CCB failure surface.

---

## What the Plan Must Answer Before It Can Proceed

### 11. The plan does not define what "done" means for Phase 14

`ROADMAP.md:241-245` says Phase 14 success means:
- "Running a CLI command triggers adversarial evaluation against the current codebase using 2+ different model providers"
- "Conventional commits since last tag are parsed into a structured changelog"
- "A metrics file tracks test count, pass rate, feature flag coverage, and destructive action rate per release"

None of these are verifiable success criteria. "Running a CLI command" could mean a no-op command that triggers the pipeline. The changelog parser could produce empty output. The metrics file could exist with no data. The adversarial evaluation could run and produce no findings.

The plan defines artifacts, not outcomes.

### 12. There is no rollback story for stateful features

Memory extraction, context collapse, coordinator mode, and KAIROS all persist state across sessions. The plan defines success criteria for enabling them. It defines zero criteria for safely disabling them.

The scenario: Phase 6 enables memory extraction. After 20 sessions, the memory directory contains contaminated entries (Pitfall 2 or Pitfall 10 occurred). The user wants to disable memory extraction and clear the contamination. What is the procedure? How does the CLI handle existing memory on downgrade? How are permissions reverted if the escalation system left residual state?

This is not an edge case. This is the production path for any feature that ships before being fully hardened.

### 13. The plan does not reconcile the 10-phase schedule with the decompiled codebase risk

`ROADMAP.md:252-270` lists 10 phases over an unspecified timeline. `STATE.md:10` says `total_phases: 10` but `STATE.md:31` says "8 phases, 29 requirements mapped." The plan does not estimate duration or define phase completion criteria.

The decompiled codebase has documented risks:
- Conditional `require()` at module scope can crash on enable (`PITFALLS.md:346`)
- Message normalization drops unknown fields silently (`PITFALLS.md:285-298`)
- Forked agent cache invalidation under context collapse (`PITFALLS.md:214-230`)
- React Compiler `_c()` artifacts interfering with new UI components (`PITFALLS.md:350`)

None of these are addressed in the phase success criteria. Phase 5 claims "all feature-flagged code paths can be activated at runtime" as a success criterion, but does not mention module-scope side effects or stub chain breakage. Enabling features in a decompiled codebase is not guaranteed to succeed even if the code is syntactically correct.

### 14. The "8 phases, 29 requirements" claim in STATE.md is a ghost entry

`STATE.md:31` says "8 phases, 29 requirements mapped." This is the old model from `SUMMARY.md:10` (6 features + prerequisite + integration = ~8 phases, 29 requirements). The roadmap now has 10 phases and 38+ requirements. STATE.md was never updated.

This means the GSD state tracking system — the system that reports progress, calculates percentages, and determines when to advance — is operating on a stale baseline. The progress bar in `STATE.md:33` (`[####░░░░░░] 33%`) is computed from numbers that don't match the roadmap. "33% complete" when the roadmap has grown from 8 to 10 phases and from 29 to 38 requirements is not a progress metric. It is noise.

---

## Verdict on Codex's 10 Non-Negotiable Corrections

Codex's corrections are correct in direction. I challenge 2 of them:

**Codex correction 1** ("Reconcile ROADMAP, REQUIREMENTS, STATE, and SUMMARY"): Agreed. But the reconciliation must produce a single authoritative source of truth, not just "make them agree on the same numbers." If all four documents are updated to say "10 phases, 38 requirements" but no mechanism enforces that future changes go through a consistency check, the drift recurs within one planning session.

**Codex correction 3** ("Move provider capability abstraction earlier"): Agreed. More precisely: the provider abstraction must be a prerequisite for Phase 7, not Phase 12. Deliberation, memory extraction, and context collapse are all provider-dependent in ways the plan currently papers over.

**Codex correction 7** ("Add Mythos-derived requirements"): Agreed, but Mythos findings must be re-framed as testable hypotheses, not safety guarantees. "Mythos says obstacle-as-problem" should translate to: "When a coordinator worker receives a permission denial and immediately attempts an alternative tool call targeting the same path, the second call is blocked and the denial is terminal." That is a test, not a prompt.

**Codex correction 8** ("Move measurement to earliest infrastructure work"): Critical. The plan defines metrics (destructive action rate, over-refusal rate, context collapse coverage) as Phase 14 deliverables. But Phase 14 is the last phase. These metrics must be instrumented from Phase 5 onward, or Phase 6 through 13 ship blind.

**Codex correction 10** ("Add CI checks for documentation consistency"): Strongly agreed. The plan is self-referential (SUMMARY drives ROADMAP drives REQUIREMENTS drives STATE), and the CI check is the only mechanism that prevents the next planning session from accumulating the same drift.

---

## Bottom Line

The plan has more inconsistencies than phases. It promises 8-10-12-14 different things depending on which document you read, and none of them match what the code can actually do today. The research summary is stale. The state tracking is wrong. The evolution protocol is circular. The security posture is defined by one regex scanner. The provider story is a marketing claim. The Mythos risk model is used as an oracle instead of a hypothesis source.

This is not a plan in execution. This is a collection of documents that grew without an editor.

**Before any phase begins:** Reconcile all four planning documents to a single source of truth with an enforced consistency check. Then fix the measurement infrastructure. Then fix the security baseline. Then the plan can be executed.

**Do not start Phase 5.** Start with planning hygiene.

---

*Reviewer: Hermes (MiniMax, adversarial mode)*
*Cross-reference: CODEX-ADVERSARIAL-REVIEW.md (this document's sibling, 493 lines)*
*Key conflicts with Codex: (1) Codex understates the research/staleness problem; (2) Codex accepts "Anthropic Red Team as oracle" framing without challenging the methodology*
