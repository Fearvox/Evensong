---
phase: 5
slug: infrastructure-gate-override
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-08
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun test (built-in) |
| **Config file** | bunfig.toml (existing) |
| **Quick run command** | `bun test --filter "feature-flag\|gate\|mcp"` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test --filter "feature-flag\|gate\|mcp"`
- **After every plan wave:** Run `bun test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | INFRA-01 | T-05-01 | Config file validated before loading (boolean-only) | unit | `bun test src/utils/__tests__/featureFlag.test.ts` | W0 | pending |
| 05-01-02 | 01 | 1 | INFRA-01 | T-05-01 | All bun:bundle imports replaced with featureFlag.ts | unit | `bun test src/utils/__tests__/featureFlag.test.ts` | W0 | pending |
| 05-02-01 | 02 | 1 | INFRA-03 | T-05-06 | MCP stdio transport connects and lists tools | integration | `bun test src/services/mcp/__tests__/stdioTransport.test.ts --timeout 30000` | W0 | pending |
| 05-02-02 | 02 | 1 | INFRA-03 | T-05-04 | MCP tools wrapped into internal Tool format | unit | `bun test src/services/mcp/__tests__/mcpToolAssembly.test.ts` | W0 | pending |
| 05-02-03 | 02 | 1 | INFRA-03 | T-05-10 | MCP SSE transport connects and lists tools | integration | `bun test src/services/mcp/__tests__/sseTransport.test.ts --timeout 30000` | W0 | pending |
| 05-03-01 | 03 | 2 | INFRA-01 | T-05-07 | GrowthBook tengu_* override without USER_TYPE=ant | unit | `bun test src/services/analytics/__tests__/growthbookOverride.test.ts` | W0 | pending |
| 05-03-02 | 03 | 2 | INFRA-02 | T-05-09 | Feature flag dependency graph documented | smoke | `bun test src/utils/__tests__/featureFlagDeps.test.ts` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `src/utils/__tests__/featureFlag.test.ts` -- stubs for INFRA-01 (featureFlag module, config loading, override behavior)
- [ ] `src/services/mcp/__tests__/stdioTransport.test.ts` -- stubs for INFRA-03 (stdio transport connect, tool-list, tool-call round-trip)
- [ ] `src/services/mcp/__tests__/mcpToolAssembly.test.ts` -- stubs for INFRA-03 (tool wrapping into internal format)
- [ ] `src/services/mcp/__tests__/sseTransport.test.ts` -- stubs for INFRA-03 (SSE transport connect, tool-list, tool-call round-trip)
- [ ] `src/services/analytics/__tests__/growthbookOverride.test.ts` -- stubs for INFRA-01 (tengu_* override, USER_TYPE guard removal)
- [ ] `src/utils/__tests__/featureFlagDeps.test.ts` -- stubs for INFRA-02 (dependency graph completeness)

*Existing test infrastructure from v1.0 covers framework setup -- only new test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP server stdio end-to-end with real server | INFRA-03 | Requires external MCP server process | Start `@modelcontextprotocol/server-filesystem`, connect via CLI, verify tool-list response |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
