# Multica Ultimate Hybrid Workbench Design

Date: 2026-04-29

Status: Approved design, pre-implementation

## Purpose

Build a durable Multica workbench that uses Codex, Claude Code/Mimo, and Hermes together as a two-ring collaboration machine:

- Multica is the native collaboration layer: agents, issues, comments, direct chat, skills, projects, runtimes, and autopilots.
- A local workbench repository is the durable operating memory: prompts, synthesis, decision log, issue templates, agent creation commands, and helper scripts.
- Codex remains responsible for command and patch-level caution through Codex CLI approval settings. Multica is not forced to become a Codex command approval UI.

The first implementation must maximize existing Multica capabilities without modifying Multica daemon, Desktop UI, or core runtime code.

## Inputs Reviewed

- Multica official docs: overview, how Multica works, agents, creating agents, providers, workspaces, autopilots, Desktop app, and troubleshooting.
- Current local Multica Desktop state: workspace `DASH`, one existing private `Workbench Max` prototype, and visible online runtimes for Copilot, Claude, Codex, Opencode, Openclaw, Hermes, and Gemini.
- Local CLI availability: `multica`, `codex`, `claude`, and `hermes` are on `PATH`.
- Codex CLI supports `--ask-for-approval on-request`, `untrusted`, `never`, and related sandbox flags.
- Grok-provided draft spec at `/Users/0xvox/Downloads/Codex_Ultimate_Workbench_Spec.md`, treated as a candidate design rather than authority.

## First-Principles Corrections To The Grok Spec

Keep:

- Two-ring topology: small command ring plus wider specialist ring.
- Use every Multica collaboration mode: issue assignment, @mentions, direct chat, and autopilots.
- Claude Code/Mimo as the long-context coordinator.
- Codex as careful executor, reviewer, local ops guard, and verification specialist.
- Hermes as researcher, alternate-perspective runtime, and resumable local/OAuth route where applicable.
- Shared synthesis and issue comments as the audit trail.

Change:

- Do not fork Multica daemon/UI in version 1. Native Multica first; extensions only after the workflow proves real pain points.
- Do not assume Multica can approve every internal Codex command. Codex approval is configured through Codex CLI/profile/custom args.
- Do not let Outer Ring agents freely summon each other. Dispatch and fan-out are command-ring responsibilities.
- Do not put secrets or OAuth material into agent environment variables or prompt files.
- Do not equate "unlimited tokens" with unlimited concurrency. The workbench should be powerful because roles are bounded, not because every agent runs constantly.

## Architecture

### Inner Ring: Command Layer

Three private agents own coordination, risk control, and canonical memory.

| Agent | Runtime | Concurrency | Primary Use | Notes |
| --- | --- | ---: | --- | --- |
| Workbench Admin | Claude Code + Mimo | 2 | Front door, requirement clarification, issue creation, specialist assignment | Talks to the user most often. |
| Workbench Supervisor | Codex or Claude Code | 2 | Risk review, goal-backward verification, evidence checks, loop stopping | Codex preferred when repo/ops safety matters. |
| Workbench Synthesizer | Hermes or Claude Code | 1 | `SYNTHESIS.md`, `WORKBENCH_LOG.md`, decisions, handoffs | Avoids memory sprawl. |

### Outer Ring: Specialist Layer

Specialists do bounded execution or analysis. They do not create new work for each other unless the Admin explicitly asks.

| Agent | Runtime | Concurrency | Role |
| --- | --- | ---: | --- |
| Codex Guardian | Codex | 1 | High-risk edits, local ops, rollback plans, command/patch review. |
| Codex Developer | Codex | 2-3 | Focused implementation with tests and verification. |
| Hermes Researcher | Hermes | 3 | Research, alternate approaches, OAuth-backed local routes, long-running exploration. |
| Claude Architect | Claude Code + Mimo | 2 | Architecture, MCP-aware investigation, long-context planning. |
| Claude Docs | Claude Code + Mimo | 2 | Specs, README, release notes, handoff docs, public/private boundary checking. |
| QA Verifier | Codex | 2 | Test runs, browser checks, screenshot evidence, regression probes. |
| Benchmark Scout | Hermes or Codex | 1-2 | Evensong, research-vault, benchmark artifact review. |
| Ops Mechanic | Codex | 1 | Daemons, CLI paths, config precedence, launchd, local machine repair. |
| Memory Curator | Claude Code or Hermes | 1 | Synthesis, vault notes, stale-memory checks, canonical decision extraction. |

## Collaboration Protocol

### Direct Chat

Use direct chat for:

- Fuzzy thinking before a task is ready.
- Private planning with Workbench Admin.
- Sensitive context that should not be copied into an issue too early.
- Quick "what should we do?" discussions.

Direct chat should produce an issue only when there is a concrete owner, deliverable, and verification condition.

### Issue Assignment

Use issue assignment for execution. Every executable issue should include:

- Goal
- Context
- Owner
- Specialists
- Files or systems involved
- Non-goals
- Approval gates
- Verification method
- Reporting format

The Admin writes or normalizes executable issues. The assigned agent owns the output. The Supervisor checks whether the output satisfies the original goal, not just whether steps were completed.

### @Mention Fan-Out

Use @mentions for parallel advice or review, not uncontrolled delegation.

Allowed:

- Admin @mentions 2-5 specialists for independent opinions.
- Supervisor @mentions Guardian or QA for verification.
- Synthesizer @mentions Admin when logs, issues, or decisions contradict.

Blocked by instruction:

- Outer Ring agents do not @mention other Outer Ring agents to create new work.
- Research agents do not hand implementation directly to Developer.
- Agents batch uncertainties instead of pinging the user for every micro-decision.

### Autopilots

Version 1 autopilots use create-issue mode only. They should remember and queue checks, not silently execute risky work.

Initial autopilot candidates:

- Daily workbench health digest.
- Stale memory / synthesis drift check.
- Benchmark artifact privacy and evidence review.
- Dependency and config drift review.
- Open issue aging and blocked-task sweep.

## Failure And Stop Rules

Every agent instruction should include:

- If two attempts fail, post `BLOCKED` and stop.
- If ownership is unclear, post `BLOCKED` and stop.
- If the task expands beyond the original issue, ask Admin or Supervisor before continuing.
- No agent claims "done" without evidence: command output, path, screenshot, link, or a clear missing-verification note.
- Risky or irreversible actions must be held for explicit user confirmation.

## Local Workbench Repository

The implementation should create a dedicated local directory:

```text
multica-ultimate-workbench/
├── README.md
├── SYNTHESIS.md
├── WORKBENCH_LOG.md
├── DECISIONS.md
├── agents/
│   ├── inner/
│   │   ├── workbench-admin.md
│   │   ├── workbench-supervisor.md
│   │   └── workbench-synthesizer.md
│   ├── outer/
│   │   ├── codex-guardian.md
│   │   ├── codex-developer.md
│   │   ├── hermes-researcher.md
│   │   ├── claude-architect.md
│   │   ├── claude-docs.md
│   │   ├── qa-verifier.md
│   │   ├── benchmark-scout.md
│   │   ├── ops-mechanic.md
│   │   └── memory-curator.md
│   └── multica-create-commands.md
├── issue-templates/
│   ├── implementation.md
│   ├── research.md
│   ├── review.md
│   ├── ops.md
│   └── autopilot-check.md
├── autopilots/
│   ├── daily-health.md
│   ├── stale-memory.md
│   ├── benchmark-artifacts.md
│   └── dependency-review.md
└── scripts/
    ├── create-agents.sh
    ├── list-workbench-state.sh
    └── sync-synthesis-from-issues.sh
```

### Canonical Files

`SYNTHESIS.md` stores current strategy, active projects, role map, latest decisions, and open risks. Every serious agent should read it before work.

`WORKBENCH_LOG.md` is append-only and records concrete events only: created agents, changed prompts, verified commands, and meaningful state changes.

`DECISIONS.md` uses short ADR-style entries: date, decision, reason, rejected alternatives, rollback note.

## Agent Configuration Model

Each agent has one markdown instruction source and one generated Multica create/update command.

Multica CLI template. The implementation should set these shell variables from verified runtime and agent data before running the command:

```bash
AGENT_NAME="Codex Guardian"
AGENT_DESCRIPTION="High-risk local ops, command approval, rollback planning, and evidence-first verification."
AGENT_INSTRUCTIONS_FILE="agents/outer/codex-guardian.md"
RUNTIME_ID="verified-codex-runtime-id"
RUNTIME_CONFIG_JSON='{"custom_args":["--ask-for-approval","on-request"]}'
MAX_CONCURRENT_TASKS="1"

multica agent create \
  --name "$AGENT_NAME" \
  --description "$AGENT_DESCRIPTION" \
  --instructions "$(cat "$AGENT_INSTRUCTIONS_FILE")" \
  --runtime-id "$RUNTIME_ID" \
  --runtime-config "$RUNTIME_CONFIG_JSON" \
  --max-concurrent-tasks "$MAX_CONCURRENT_TASKS" \
  --visibility private
```

Codex agents should use Codex CLI approval configuration in custom args or profile after the runtime-config schema is verified. The intended policy is:

```text
--ask-for-approval on-request
```

Guardian and Ops agents should avoid high-friction global bypasses and should never use:

```text
--dangerously-bypass-approvals-and-sandbox
```

## Implementation Preconditions

Before creating real agents:

- Resolve the current CLI/Desktop mismatch: Multica Desktop shows online runtimes, but `multica runtime list --output json` returned no data in this session.
- Confirm the active Multica workspace/profile and workspace ID.
- Retrieve exact runtime IDs for Claude Code, Codex, and Hermes.
- Inspect an existing agent or runtime config shape before generating `--runtime-config` JSON.
- Decide whether to keep the earlier prototype `Workbench Max`, update it, or archive it. Do not delete/archive without explicit confirmation.

## First Implementation Boundary

Allowed in the first implementation plan:

- Create the local workbench directory and canonical files.
- Write all agent prompt files.
- Generate Multica CLI create/update commands.
- Create/update Multica agents after explicit confirmation.
- Create initial projects/issues if CLI support is verified.
- Add autopilot prompt specs or create autopilots through UI/CLI after verification.

Not allowed in the first implementation plan:

- No Multica daemon fork.
- No Multica Desktop UI fork.
- No secrets in files, prompts, agent env, or reports.
- No destructive cleanup of existing agents without confirmation.
- No high-risk Codex bypass flags.
- No public/private boundary leaks from internal benchmark or partner materials.

## Success Criteria

The workbench is successful when:

- The user can enter through Workbench Admin and get a clean issue plan instead of scattered agent chatter.
- Inner Ring agents can assign or @mention specialists without causing Outer Ring loops.
- Codex Guardian can safely handle high-risk local work with Codex approval configured outside Multica.
- Hermes Researcher and Claude Architect can contribute parallel research or long-context reasoning without becoming task owners by accident.
- Every agent has a clear prompt, runtime, concurrency budget, and stop rule.
- `SYNTHESIS.md`, `WORKBENCH_LOG.md`, and `DECISIONS.md` are sufficient for the next session to resume without relying on memory alone.

## Verification Plan For Implementation

Implementation should verify in this order:

1. Confirm active Multica workspace/profile and runtime IDs.
2. Dry-run or print agent create commands before execution.
3. Create or update one pilot agent first.
4. Assign a small test issue to the pilot agent.
5. Verify the agent reads its instruction, posts evidence, and respects stop rules.
6. Expand to the rest of the roster only after the pilot succeeds.
7. Create a small autopilot in create-issue mode and verify it creates an issue rather than executing hidden work.

## Source Links

- https://multica.ai/docs
- https://multica.ai/docs/how-multica-works
- https://multica.ai/docs/agents
- https://multica.ai/docs/agents-create
- https://multica.ai/docs/providers
- https://multica.ai/docs/autopilots
- https://multica.ai/docs/desktop-app
- https://multica.ai/docs/troubleshooting
