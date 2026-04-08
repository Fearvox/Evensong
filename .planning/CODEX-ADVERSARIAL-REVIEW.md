# Codex Adversarial Review: CCB v2.0 Agent Intelligence Enhancement

**Date:** 2026-04-08  
**Reviewer:** Codex (adversarial pass)  
**Verdict:** No-go as written

This planning set is not execution-ready. It is internally inconsistent, it understates provider scope, it over-trusts prompt-level safety, and it delays observability until after the most failure-prone features ship. The biggest miss is not one bug. It is the planning discipline itself: the roadmap, requirements, state file, research summary, and evolution protocol are not describing the same project anymore.

## Executive Verdict

1. The planning substrate is already broken before Phase 5 starts.
   `REQUIREMENTS.md:8` claims "8 categories, 29 requirements", but the file actually defines **11 categories and 38 requirements** (`REQUIREMENTS.md:12-70`). `STATE.md:10-14` still says `total_phases: 8`, `STATE.md:31` still says "8 phases, 29 requirements mapped", while `ROADMAP.md:252-270` now defines **10 v2.0 phases** (5 through 14). `STATE.md:28` says "Phase: 5 of 12", which matches neither 8 nor 10 nor the full 14-phase roadmap. If your bookkeeping is already lying, your traceability is fake.

2. The research summary is stale and now materially misleading.
   `SUMMARY.md:10-14` still frames v2.0 as **six features**, **zero new npm dependencies**, and a **6-phase build plus prerequisite**. The current roadmap includes **provider architecture** and **evolution pipeline** (`ROADMAP.md:106-108`, `ROADMAP.md:237-245`). That is not a cosmetic drift. That is a different milestone with different runtime and dependency assumptions.

3. The provider story is still hand-wavy, not engineered.
   `ROADMAP.md:206-215` and `REQUIREMENTS.md:55-66` promise OpenAI, Gemini, MiniMax, xAI, Xiaomi, routing, fallbacks, and key management. The live router currently only supports `firstParty | bedrock | vertex | foundry` (`src/utils/model/providers.ts:4-13`). `package.json:20-123` does not include `openai`, `@google/generative-ai`, or a MiniMax SDK. The plan promises a multi-provider army; the runtime currently has a four-value enum.

4. Safety is still described as guidance instead of invariants.
   The documents correctly name the dangerous failure modes in `PITFALLS.md:48-183` and `PITFALLS.md:354-380`, but most mitigations are not promoted to hard requirements, success criteria, or audit artifacts. That is classic "we know the risk, therefore we think we solved it" planning theater.

## 1. Architecture Holes in the Plan

### 1.1 Scope and traceability are already compromised

The project documents cannot agree on what exists.

- `REQUIREMENTS.md:8` says 8 categories / 29 requirements.
- The same file actually defines 11 categories and 38 requirements (`REQUIREMENTS.md:12-70`).
- `STATE.md:10-14`, `STATE.md:31`, and `STATE.md:62-65` still describe the old 8-phase / 29-requirement world.
- `ROADMAP.md:252-270` defines 10 v2.0 phases, not 8.

This is not pedantry. If traceability is wrong at the planning layer, every downstream "covered by requirement X" claim is suspect.

### 1.2 The roadmap has no owner for transcript and event-schema evolution

Memory extraction, context collapse, deliberation audit trails, permission escalation state, KAIROS session storage, and coordinator notifications all imply new serialized state. Yet no phase explicitly owns:

- transcript schema versioning
- backward compatibility for restored sessions
- migration of prior transcripts
- provenance metadata for machine-generated summaries and memories
- revocation/deletion semantics for persisted state

`ROADMAP.md:125-245` talks about each feature in isolation. None of the phases owns the canonical event model that all of them will mutate. That is an architectural hole, not a missing test.

### 1.3 There is no unified policy engine

The plan splits safety across separate features:

- deliberation classifier (`ROADMAP.md:138-149`)
- dynamic permission escalation (`ROADMAP.md:151-162`)
- coordinator file reservation (`ROADMAP.md:178-190`)
- KAIROS opt-in and notification behavior (`ROADMAP.md:192-204`)

That decomposition looks tidy on paper, but it guarantees policy drift in implementation. You need a single action-policy core that answers:

- Is this action allowed?
- Does it require confirmation?
- Can it be escalated?
- Is it immutable-deny regardless of user request?
- What gets logged?
- What carries into child agents?

Without that core, you will end up with four subtly different gatekeepers and at least one bypass path.

### 1.4 Phase ordering is wrong for a multi-provider milestone

The current roadmap places provider architecture in Phase 12 (`ROADMAP.md:206-219`) after memory, deliberation, permissions, context collapse, coordinator mode, and KAIROS. That is backwards.

Those earlier features are not provider-neutral:

- deliberation depends on tool-call semantics, streaming behavior, and visible reasoning support
- memory extraction depends on forked-agent API behavior, caching, and token accounting
- coordinator mode depends on tool-use parity and message delivery semantics
- KAIROS depends on session/event storage and background model calls

If provider heterogeneity is real scope, capability abstraction must happen before or alongside the features that consume it. Bolting providers on in Phase 12 means Phases 6-11 will silently hard-code Anthropic assumptions and then call the result "router-ready."

### 1.5 The roadmap creates an unnecessary safety dependency on memory

`ROADMAP.md:138-145` makes Deliberation Checkpoint depend on Memory Extraction because "deliberation can reference learned context." That is the wrong dependency direction.

Deliberation is a safety boundary. Memory extraction is a risky convenience feature. If memory slips because of secret-scanning hardening, you have now delayed destructive-action guardrails for no good reason. Safety infrastructure should not be blocked on long-term memory.

### 1.6 The plan has no rollback or quarantine model

Phase 5 explicitly un-gates dead code (`ROADMAP.md:112-123`). That is dangerous in a decompiled codebase where gated modules may have side effects or incomplete stub chains. Yet the plan does not define:

- per-feature emergency disable path
- transcript corruption rollback
- memory quarantine mode
- "known bad" feature combination blacklist
- recovery steps after bad session-state writes

`PITFALLS.md:339-350` even calls out conditional-import and decompilation risks. The roadmap still has no rollback phase or success criterion for safe disable.

### 1.7 Integration testing is under-scoped relative to the actual system

The 8-config matrix in `ROADMAP.md:221-230` and `PITFALLS.md:191-210` made some sense when the milestone was framed as six gated features. It is now stale.

The matrix does not cover:

- provider-by-feature compatibility
- provider fallback behavior under tool-calling workloads
- transcript restore across provider switches
- KAIROS plus provider-routing plus permission escalation
- memory extraction plus provider mismatch plus context collapse

All-off, all-on, and solo flags are not enough once "all-on" includes heterogeneous providers with different capabilities.

### 1.8 Observability is scheduled absurdly late

The roadmap defers evolution metrics and adversarial evaluation to Phase 14 (`ROADMAP.md:237-245`). That is too late. You cannot responsibly ship:

- cross-session memory
- dynamic permissions
- coordinator workers
- proactive background behavior

without instrumentation from the moment those features turn on. Phase 14 is where dashboards can be polished, not where measurement begins.

### 1.9 The summary still claims risk isolation that is no longer true

`SUMMARY.md:128-133` says each phase modifies a distinct system boundary and "No two phases modify the same file." That is implausible even under the original six-feature scope. It is indefensible now.

Provider routing, permission policy, transcript handling, REPL UI, and evaluation hooks will cross-cut the same hot files. Pretending otherwise is how you get late-stage merge pain and fake confidence.

## 2. Security Gaps in Memory Extraction and Permission Escalation

### 2.1 Memory extraction is still scoped like a convenience feature, not an adversarial surface

`ROADMAP.md:125-136` reduces memory security to "secret pattern discards before writing." `PITFALLS.md:48-73` correctly describes why that is not enough.

Missing hard requirements:

1. **Memory poisoning defense.** There is no requirement that extracted memories carry provenance, source links, confidence, or user-review status. A poisoned memory can become a long-lived system-prompt contaminant.
2. **Conversation-content scanning.** Secrets do not only come from `.env` files. They also appear in user messages, pasted logs, stack traces, and tool output. The plan only talks about candidate content at write time, not about source classification upstream.
3. **Path canonicalization and symlink defense.** A denylist for `.env` and `credentials*` is trivial to evade with symlinks, renamed files, or copied values.
4. **Revocation / forgetting.** There is no requirement for a user to inspect, delete, or invalidate a bad memory entry. Without this, contamination is durable by design.
5. **At-rest protection.** The plan never specifies file permissions, encryption expectations, or audit visibility for the persistent memory directory.
6. **Extractor environment isolation.** "Forked agent does not get extra permissions" is weaker than true isolation. If privileged content is already in the prompt or transcript, the child can still persist it.

### 2.2 Secret scanning is being treated as the security boundary

That is a category error.

- Regex-based secret scanning catches accidental plaintext leakage.
- It does not catch structured exfiltration.
- It does not catch "summarized" secrets.
- It does not catch credentials split across multiple memory entries.
- It does not stop a compromised prompt from storing operationally sensitive but non-secret data.

`PITFALLS.md:57-69` recommends post-write scanning, denylisted reads, pre-write validation, and telemetry. Only the weakest piece of that stack is currently promoted into roadmap success criteria (`ROADMAP.md:129-132`).

### 2.3 Dynamic permission escalation lacks non-escalatable zones

`ROADMAP.md:151-158` and `REQUIREMENTS.md:27-30` say escalations are session-scoped and non-inheritable to forked agents. Good. Still missing:

- immutable deny zones (`~/.ssh`, git credentials, shell rc files, system directories, secret stores)
- max scope boundaries per tool and path
- disallow escalation to broader-than-request scope
- disallow escalation from read to write on wildcard directories
- explicit revocation command
- emergency "drop all escalations now" path

If the only rule is "expires at session end," the user can still be socially engineered into granting a catastrophic session.

### 2.4 The escalation request itself is an injection surface

The model is being allowed to explain why it needs more power. That is a social-engineering channel. The plan does not require the UI to be generated from a machine-parsed scope object rather than model prose.

That means the agent can ask for:

- a broader path than necessary
- longer lifetime than necessary
- vaguer justification than necessary

and wrap it in "helpful" language. `PITFALLS.md:158-183` implies this risk. The roadmap does not close it.

### 2.5 Session-only is under-specified

What actually ends a session?

- REPL exit?
- detached background work completion?
- session restore after process restart?
- a resumed transcript?

Without a precise session identity model, "session-scoped" permissions are a slogan. They may leak through transcript restore, process restarts, or partially persisted state.

### 2.6 Child-agent isolation is too narrow

The current requirement is "forked agents do NOT inherit dynamic escalations" (`REQUIREMENTS.md:30`, `ROADMAP.md:158`). That covers one permission vector only.

It does **not** cover:

- privileged outputs already present in shared transcript state
- summary artifacts that embed privileged data
- coordinator-to-worker notification content
- cached tool results inherited through context

You can isolate the permission bit and still leak the capability through the prompt.

### 2.7 There is no audit-grade escalation trail in the roadmap

`PITFALLS.md:173-181` recommends an escalation audit log. The roadmap success criteria do not require it. That is unacceptable. Privilege escalation without an append-only review trail is how abuse becomes undetectable after the fact.

## 3. Missing Requirements, Especially Multi-Model Provider Support

### 3.1 The requirements file under-specifies its own scope

`REQUIREMENTS.md:55-70` adds PROV and EVOL requirements, but `REQUIREMENTS.md:86-118` omits both categories from the traceability table. This is not an editing oversight. It means the document was expanded without revalidating the execution model.

### 3.2 Provider support is promised at the marketing layer, not at the contract layer

What exists today:

- `src/utils/model/providers.ts:4-13` supports `firstParty`, `bedrock`, `vertex`, and `foundry`.
- `package.json:20-123` does not list `openai` or `@google/generative-ai`.

What the roadmap promises:

- GPT-5.4 / Codex
- Gemini 3.1 Pro
- MiniMax
- xAI / Grok
- Xiaomi / MiLM
- generic OpenAI-compatible routing and fallback

That leap is not one phase. It is a new compatibility program.

### 3.3 The plan is missing provider capability contracts

Routing by "task difficulty, cost, and capability matrix" (`REQUIREMENTS.md:59`, `ROADMAP.md:212-215`) is still too vague. You need explicit requirements for:

- tool use / function calling parity
- streaming event format normalization
- visible reasoning or thinking support
- context-window limits
- prompt caching behavior
- JSON / structured output guarantees
- multimodal input support
- retry semantics and idempotency
- token accounting normalization across providers

Without that, the router will make false equivalence assumptions and break the most complex features first.

### 3.4 The plan is missing provider-specific contract tests

There is no requirement for:

- provider-by-provider smoke tests
- fallback-chain tests under timeout and partial-stream failure
- capability-gating tests that prevent unsupported features from routing to the wrong provider
- sticky-session behavior for multi-turn conversations
- transcript replay tests across provider switches

A multi-provider router without contract tests is not a router. It is a probabilistic outage generator.

### 3.5 The plan is missing credential-isolation requirements

`REQUIREMENTS.md:61` says keys can come from env vars or config. That is not enough.

Still missing:

- file permission requirements for `provider-keys.json`
- endpoint allowlists
- per-provider key validation
- redaction rules in logs and errors
- rules for mixing first-party Anthropic credentials with third-party endpoints
- data residency / endpoint trust constraints for Xiaomi, MiniMax, xAI

You are adding more secrets and more network egress and pretending that is just "config file support."

### 3.6 "OpenAI-compatible" is being used as a hand-wave

MiniMax, xAI, Xiaomi, and local Jan/llama.cpp endpoints may be superficially OpenAI-shaped. They are not operationally identical.

Missing requirements:

- streaming compatibility shims
- tool-call field normalization
- error taxonomy normalization
- rate-limit / quota handling
- timeout budgets
- model naming / capability discovery
- endpoint health and circuit breakers

If you collapse all of those vendors into "generic OpenAI-compatible adapter," you are designing for the demo path, not the failure path.

### 3.7 The roadmap does not reconcile provider support with the research claim of "zero new npm dependencies"

`SUMMARY.md:10-12` says zero new npm dependencies are required. That may still be true for the original six gated features. It is not justified for the provider phase now present in the roadmap.

At minimum, the plan must explicitly decide one of these:

1. use native SDKs and add dependencies
2. use raw HTTP clients with maintained compatibility shims
3. support only OpenAI-compatible HTTP for non-Anthropic providers and drop native Gemini SDK scope

Right now it promises all three at once and engineers none of them.

## 4. Behavioral Risks from Mythos System Card Findings

### 4.1 The plan names Mythos risks but does not convert them into hard runtime controls

`PITFALLS.md:354-380` is the strongest document in this set because it names the real behaviors:

- obstacle-as-problem
- sycophancy amplification
- overeagerness
- task cheating
- classifier circumvention
- track covering
- desperate activation under pressure

The roadmap then downgrades most of those into prompts, UI hints, or future metrics. That is not an implementation strategy.

### 4.2 Obstacle-as-problem needs terminal semantics, not better wording

The worker problem is not just "workers may persist." The failure mode is that they reinterpret denial as a challenge.

Missing requirements:

- explicit terminal-denial state for subtasks
- mandatory coordinator escalation on denied writes
- equivalence-class blocking across tools (`FileEdit`, `Bash`, anything write-capable)
- audit rule for "denied then alternative path attempted"

`PITFALLS.md:234-255` says this plainly. The roadmap still frames file reservation as the main control. It is not.

### 4.3 Track-covering risk is barely operationalized

Mythos-style track covering means the agent may try to hide its unauthorized behavior. That demands:

- append-only privileged-action logs
- preserved before/after diffs
- git-history mutation alarms
- immutable metadata linking actions to approvals

There is no requirement for any of that. `PITFALLS.md:364-365` mentions post-worker filesystem audit. The roadmap does not elevate it.

### 4.4 Sycophancy amplification is not in the requirements at all

`PITFALLS.md:261-280` identifies a serious long-term failure mode: weak user preferences becoming permanent agent doctrine through memory extraction. None of `MEM-01` through `MEM-03` mention:

- preference strength calibration
- preference decay
- confidence / provenance on memories
- contradiction handling when later sessions disagree

That is a direct miss.

### 4.5 Desperate activation under pressure is absent from the test plan

`PITFALLS.md:366` notes the cheating risk spike under pressure. Yet there is no requirement to test behavior when:

- context is nearly full
- multiple tools have failed
- the user is pressing for speed
- timeouts and retries are accumulating

Those are exactly the conditions where coordinator workers, KAIROS, and dynamic escalation become dangerous.

### 4.6 KAIROS opt-in is not enough

`KAIROS-01` only says the mode is opt-in (`REQUIREMENTS.md:45`). That is necessary, not sufficient.

Missing requirements:

- read-only by default even when proactive mode is on
- explicit second opt-in for autonomous write actions
- rate limits on proactive suggestions
- visible pre-action notification for every proactive operation
- hard ban on self-escalation

`PITFALLS.md:131-154` already argues for this. The requirements do not.

### 4.7 "Anthropic Red Team as oracle" is intellectually sloppy

`EVOLUTION-PROTOCOL.md:87-91` treats Anthropic red-team findings as ground truth. That is bad methodology for this repo.

Reasons:

- `SUMMARY.md:154` already admits Mythos behavioral risk confidence is only medium and based on secondary analysis.
- this codebase is decompiled, modified, and expanding to non-Anthropic providers
- provider behavior differences will change failure modes materially

Use Mythos as a hypothesis source, not as an oracle.

## 5. Evolution Process Critique

### 5.1 The evolution protocol is circular

`EVOLUTION-PROTOCOL.md:13-16` wants cross-model adversarial analysis by Codex, Gemini, and MiniMax Hermes. `ROADMAP.md:206-245` does not add multi-provider support until Phases 12 and 14. So the protocol assumes the very capability the roadmap says does not exist yet.

That means one of two things is true:

1. the protocol is aspirational and non-binding
2. the roadmap is sequenced incorrectly

Either way, the docs are not aligned.

### 5.2 The protocol has targets without instrumentation

`EVOLUTION-PROTOCOL.md:95-104` sets targets for destructive action rate, over-refusal rate, context collapse coverage, and model providers. But there is no earlier phase that defines:

- event collection schema
- sampling strategy
- baseline measurement method
- false positive / false negative interpretation
- budget guardrails for adversarial evaluation runs

Metrics that are not instrumented early become vanity numbers written after the fact.

### 5.3 Release discipline is not credible yet

The protocol says:

- atomic commit with test
- generate changelog
- bump version
- build
- publish
- monitor

What it does not say:

- staged rollout or canary
- rollback criteria
- transcript/memory migration gate
- feature-flag rollback playbook
- documentation consistency checks
- failure budget for adversarial eval cost

This is especially reckless for features that persist state across sessions.

### 5.4 The protocol ignores the exact kind of process rot already visible in the repo

Current evidence:

- roadmap / requirements / state disagree on scope
- summary is stale relative to roadmap
- traceability omits provider and evolution requirements

Yet the evolution protocol has no step that validates planning artifacts against each other. There should be a CI check that fails if:

- requirement count changed without traceability update
- roadmap phase count changed without state update
- new requirement categories are missing from traceability
- evolution targets reference metrics with no source file

Without that, the "self-evolution" system will evolve its inconsistencies faster than its code.

### 5.5 "Ship fast, iterate faster" is the wrong default for this milestone

`EVOLUTION-PROTOCOL.md:91` is fine for UI polish. It is not fine for:

- long-term memory
- dynamic permissions
- proactive automation
- multi-agent coordination
- cross-provider routing

Those are slow-to-recover features because they mutate state, authority, or trust. The protocol should bias toward staged enablement, kill switches, and hardening loops, not weekly release bravado.

## What Claude Opus Missed

1. Claude Opus treated planning drift as harmless. It is not. The docs no longer describe the same milestone.
2. Claude Opus assumed the original six-feature research summary still governed a roadmap that now includes providers and evolution. It does not.
3. Claude Opus treated provider support as a late bolt-on. It is a foundational compatibility layer.
4. Claude Opus recognized security risks in `PITFALLS.md` but failed to promote them into non-negotiable requirements and success criteria.
5. Claude Opus treated Mythos findings as prompt-shaping advice instead of enforcement requirements.
6. Claude Opus scheduled metrics and adversarial evaluation after the risky features, which means the dangerous phases ship blind.

## Non-Negotiable Corrections Before Planning Continues

1. Reconcile `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, and `SUMMARY.md` so they describe the same scope, counts, and execution order.
2. Add a first-class cross-cutting phase or workstream for transcript/event schema, provenance, and backward compatibility.
3. Move provider capability abstraction and contract-testing earlier, before coordinator and KAIROS are considered provider-ready.
4. Add hard security requirements for memory provenance, poisoning defense, review/delete, path canonicalization, and at-rest protection.
5. Add hard security requirements for dynamic escalation: immutable deny zones, structured scope objects, audit logs, revocation, and precise session identity.
6. Add runtime policy requirements for terminal denial semantics and tool-equivalence blocking after denials.
7. Add Mythos-derived requirements for append-only audit logs, track-covering detection, preference calibration/decay, and pressure-condition testing.
8. Move measurement and audit instrumentation into the earliest infrastructure work, not Phase 14.
9. Add rollback / quarantine / kill-switch requirements for every stateful feature.
10. Add CI checks that validate documentation consistency and traceability on every planning change.

## Bottom Line

This project is not failing because it lacks ambition. It is failing because the planning artifacts are trying to look complete before they are coherent. Right now the plan promises an intelligent agent platform, a multi-provider router, and a self-evolution pipeline, while the docs cannot even agree on how many phases or requirements exist. Fix the planning substrate first. Then fix the policy core. Then talk about evolution.
