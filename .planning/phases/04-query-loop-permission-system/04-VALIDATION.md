---
phase: 4
slug: query-loop-permission-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — bun auto-discovers `*.test.ts` |
| **Quick run command** | `bun test --testPathPattern=permissions.test` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-specific `<automated>` command
- **After every plan wave:** Run `bun test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green (≥ 182 + Phase 4 new tests)
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | PERM-01, PERM-02 | T-04-01-01 | deny/ask/allow modes enforce correctly; deny before tool.call() | unit | `bun test --testPathPattern=permissions.test` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | PERM-01, PERM-02 | — | N/A | config | `node -e "JSON.parse(require('fs').readFileSync('tsconfig.strict.json','utf8'))"` | ✅ | ⬜ pending |
| 04-02-01 | 02 | 1 | QUERY-02 | T-04-02-01 | compaction triggers at correct token threshold | unit | `bun test --testPathPattern=autoCompact.test` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | QUERY-02 | — | N/A | config | `node -e "JSON.parse(require('fs').readFileSync('tsconfig.strict.json','utf8'))"` | ✅ | ⬜ pending |
| 04-03-01 | 03 | 1 | QUERY-03 | T-04-03-03 | chain order root→leaf preserved; no future message forward references | integration | `bun test --testPathPattern=sessionStorage.test` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 1 | QUERY-03 | — | N/A | config | `node -e "JSON.parse(require('fs').readFileSync('tsconfig.strict.json','utf8'))"` | ✅ | ⬜ pending |
| 04-04-01 | 04 | 2 | QUERY-01, QUERY-04 | T-04-04-01, T-04-04-02 | N tool_use → N results batched; abort leaves conversation API-valid | integration | `bun test --testPathPattern=query.test` | ❌ W0 | ⬜ pending |
| 04-04-02 | 04 | 2 | PERM-03, TEST-04 | T-04-04-04 | alwaysAllowRules only allows explicitly granted tools | integration | `bun test && node -e "JSON.parse(require('fs').readFileSync('tsconfig.strict.json','utf8'))"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/utils/permissions/__tests__/permissions.test.ts` — stubs for PERM-01, PERM-02
- [ ] `src/services/compact/__tests__/autoCompact.test.ts` — stubs for QUERY-02
- [ ] `src/utils/__tests__/sessionStorage.test.ts` — stubs for QUERY-03
- [ ] `src/query/__tests__/query.test.ts` — stubs for QUERY-01, QUERY-04, PERM-03
- [ ] All 4 files added to `tsconfig.strict.json` includes array

*Note: Wave 0 is integrated into Wave 1 plans (04-01 through 04-03) — no separate Wave 0 plan. Each plan creates its test file from scratch rather than filling stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "ask" permission mode displays visible prompt in terminal | PERM-01 | Requires Ink rendering / interactive TTY | Run `bun run dev`, trigger a tool with ask mode, verify prompt appears before tool executes |

*All other phase behaviors have automated verification via bun:test.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify command (see Per-Task map above)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify ✓ (every task has a command)
- [ ] Wave 0 covers all MISSING references (4 new test files)
- [ ] No watch-mode flags ✓
- [ ] Feedback latency < 15s ✓
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
