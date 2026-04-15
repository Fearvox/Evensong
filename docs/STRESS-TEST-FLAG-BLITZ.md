# 🔥 FLAG BLITZ STRESS TEST — CCR Feature Activation Validation

> **Meta-test**: Use newly activated features to stress-test the newly activated features.
> Target: Exercise 15+ feature flags in a single session, build real infrastructure.

## Mission

Build a **CCR Self-Diagnostic System** — 3 interconnected modules that exercise
the newly activated feature flags while producing a permanent test/monitoring infrastructure.

**Time budget**: 20 minutes max. Ship or die.

## Module 1: Feature Flag Health Monitor (`src/services/flagHealth/`)

Build a runtime health monitor that:

1. **Reads all active flags** from `~/.claude/feature-flags.json`
2. **For each flag**, attempts to import and instantiate the gated module
3. **Classifies** each flag as: `operational` | `loadable` | `broken` | `missing-dep`
4. **Generates** a JSON report: `{ flag, status, loadTimeMs, error?, dependsOn[] }`

This exercises: `EXTRACT_MEMORIES` (read config), `SLOW_OPERATION_LOGGING` (timing),
`SHOT_STATS` (metrics collection)

### Files to create:
- `src/services/flagHealth/flagHealth.ts` — Core scanner
- `src/services/flagHealth/report.ts` — Report generator (JSON + terminal table)
- `src/services/flagHealth/__tests__/flagHealth.test.ts` — Tests

### Acceptance Criteria:
- [ ] Scans all 39 flags in < 2 seconds
- [ ] Correctly identifies at least 1 `missing-dep` case (if any)
- [ ] Output is valid JSON parseable by `jq`
- [ ] `bun test` passes for this module

## Module 2: Gate Decoupling Layer (`src/services/localGates/`)

Replace ALL GrowthBook remote gate checks with local-first reads.

The problem: `checkStatsigFeatureGate_CACHED_MAY_BE_STALE()` reads from
`~/.claude.json` `cachedGrowthBookFeatures` — stale data from official Claude Code.
When our CCR build hits these gates, we get phantom errors (like the auto-mode gate crash).

Build a **Local Gate Provider** that:

1. **Intercepts** all `checkStatsigFeatureGate_CACHED_MAY_BE_STALE` calls
2. **Routes** to `~/.claude/feature-flags.json` first (our truth)
3. **Falls back** to cached GrowthBook only for non-`tengu_` keys
4. **Logs** every gate check with flag name + resolved value + source

This exercises: `DYNAMIC_PERMISSION_ESCALATION` (permission system),
`CONTEXT_COLLAPSE` (handling large config), `TOKEN_BUDGET` (resource management)

### Files to create/modify:
- `src/services/localGates/localGateProvider.ts` — Gate routing logic
- `src/services/localGates/__tests__/localGateProvider.test.ts` — Tests
- Modify: `src/services/analytics/growthbook.ts` — Wire in local gate provider

### Acceptance Criteria:
- [ ] All `tengu_*` gates resolve from local flags, not remote cache
- [ ] The auto-mode gate error from earlier is structurally impossible
- [ ] `bun test` passes with zero gate-related failures
- [ ] A `--debug` run shows gate resolution source for each check

## Module 3: Activation Report CLI (`src/commands/flag-report/`)

Add a new `/flag-report` slash command that:

1. Runs Module 1's health scanner
2. Runs Module 2's gate audit
3. Produces a formatted terminal report:

```
╔══════════════════════════════════════════════╗
║         CCR FLAG BLITZ REPORT v1.0           ║
╠══════════════════════════════════════════════╣
║ Active Flags:    39/94 (41%)                 ║
║ Operational:     37                          ║
║ Broken:          0                           ║
║ Gates Decoupled: 12/12                       ║
║ Test Coverage:   100%                        ║
╚══════════════════════════════════════════════╝
```

4. Saves report to `.planning/FLAG-BLITZ-REPORT.md`

This exercises: `STREAMLINED_OUTPUT` (formatting), `NEW_INIT` (command registration),
`REVIEW_ARTIFACT` (report generation), `COMMIT_ATTRIBUTION` (auto-commit)

### Files to create:
- `src/commands/flag-report/index.ts` — Command registration
- `src/commands/flag-report/flagReport.tsx` — Ink component for report display
- Register in `src/commands.ts`

### Acceptance Criteria:
- [ ] `/flag-report` renders in REPL without crash
- [ ] Report data matches Module 1 + 2 output
- [ ] Report file is valid markdown

## Constraints

- **All code must pass `bun test`** — write tests FIRST (TDD)
- **No new dependencies** — use only what's in package.json
- **Commit after each module** — atomic, verifiable progress
- **Use parallel sub-agents** if Coordinator Mode is working — spawn one per module

## Feature Flags Exercised

| Flag | How |
|------|-----|
| COORDINATOR_MODE | Parallel module building |
| FORK_SUBAGENT | Forked test runners |
| CONTEXT_COLLAPSE | Large report handling |
| DYNAMIC_PERMISSION_ESCALATION | Gate system testing |
| EXTRACT_MEMORIES | Config reading |
| VERIFICATION_AGENT | Post-build verification |
| STREAMLINED_OUTPUT | Report formatting |
| SLOW_OPERATION_LOGGING | Performance timing |
| SHOT_STATS | Metrics collection |
| COMMIT_ATTRIBUTION | Auto-commit |
| NEW_INIT | Command registration |
| REVIEW_ARTIFACT | Report artifact |
| TOKEN_BUDGET | Resource management |
| ULTRATHINK | Deep reasoning for gate analysis |
| MCP_SKILLS | Skill integration |

**15 flags exercised in one stress test. Ship it.**
