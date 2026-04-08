---
phase: 06
slug: memory-extraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-08
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | None needed -- bun test auto-discovers `*.test.ts` files |
| **Quick run command** | `bun test src/services/extractMemories/` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/services/extractMemories/`
- **After every plan wave:** Run `bun test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | MEM-01 | — | N/A | unit | `bun test src/services/extractMemories/__tests__/extractionGates.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | MEM-02 | — | N/A | unit | `bun test src/memdir/__tests__/memoryLoading.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | MEM-03 | T-06-01 | scanForSecrets blocks credential content in canUseTool write-intercept | unit | `bun test src/services/extractMemories/__tests__/secretInterception.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | SEC-01 | T-06-01 | All SEC-01 patterns detected by scanner combination | unit | `bun test src/services/extractMemories/__tests__/secretInterception.test.ts -t "SEC-01"` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | MEM-03 | T-06-03 | User secret patterns config loads, defaults created, invalid patterns handled | unit | `bun test src/services/extractMemories/__tests__/userSecretPatterns.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/services/extractMemories/__tests__/secretInterception.test.ts` — stubs for MEM-03, SEC-01
- [ ] `src/services/extractMemories/__tests__/extractionGates.test.ts` — stubs for MEM-01
- [ ] `src/services/extractMemories/__tests__/userSecretPatterns.test.ts` — stubs for user config loading
- [ ] `src/memdir/__tests__/memoryLoading.test.ts` — stubs for MEM-02 (optional, existing code verification)

*Existing test infrastructure covers framework — no new installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bun setTimeout().unref() drain | MEM-01 | Bun process lifecycle timing | Start CLI, send message, exit — verify no hanging process |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
