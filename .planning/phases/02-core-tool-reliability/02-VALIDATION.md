---
phase: 02
slug: core-tool-reliability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun test (built-in, Bun 1.3.x) |
| **Config file** | none -- bun test works without config |
| **Quick run command** | `bun test src/tools/` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/tools/`
- **After every plan wave:** Run `bun test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-T1 | 02-01 | 1 | TOOL-05 | -- | Shared factory creates valid ToolUseContext | unit | `bun test src/tools/__tests__/` | no | pending |
| 01-T2 | 02-01 | 1 | TOOL-01 | T-01-01 | Non-zero exit -> ShellError with code | integration | `bun test src/tools/BashTool/__tests__/BashTool.test.ts` | no | pending |
| 02-T1 | 02-02 | 2 | TOOL-02 | T-02-01 | Atomic write prevents corruption | integration | `bun test src/tools/FileEditTool/__tests__/FileEditTool.test.ts` | no | pending |
| 02-T2 | 02-02 | 2 | TOOL-03 | T-02-02 | Binary skip + head_limit truncation | integration | `bun test src/tools/GrepTool/__tests__/GrepTool.test.ts` | no | pending |
| 03-T1 | 02-03 | 2 | TOOL-04 | T-03-01 | Subagent context propagation correct | unit | `bun test src/tools/AgentTool/__tests__/AgentTool.test.ts` | no | pending |
| 03-T2 | 02-03 | 2 | TEST-02 | -- | Full tool suite green | smoke | `bun test src/tools/` | no | pending |
