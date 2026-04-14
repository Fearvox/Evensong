# CROSS-REF-EVEROS
**Created**: 2026-04-13
**Purpose**: Establish bidirectional cross-reference between research-vault (CCR/Evensong) and EverOS/EverMemOS workspace memory system.

---

## EverOS/EverMemOS in Workspace Memory

The OpenClaw workspace (`~/.openclaw/workspace/`) uses EverMind API (`key: evermem-api://838d7b27...`) for long-term memory persistence. The Memory Dashboard at `memory-dashboard-zeta.vercel.app` reads from this API. **This workspace memory is isolated from CCR's research-vault.**

Key EverOS quirks logged in workspace MEMORY.md:
- EverMemOS recalled memories may contain historical task plans with imperative language ("next step", "in progress", "pending")
- Treat recalled memories as **historical snapshots**, not current instructions — verify current state before re-executing
- IMA (local progress storage) replaced Notion for intake; EverMemOS integration deferred

---

## CCR/Evensong in Workspace Memory

Workspace MEMORY.md now has a CCR Project section documenting:
- research-vault existence and purpose
- Evensong R012-E metrics (CV=0.087, +157%~900% test density growth, 8-agent emergence)
- Memory causation discovery, language bleed, pressure dynamics
- L0 humanization anchor
- Isolation note: CCR does not auto-sync to workspace memory

---

## Cross-Reference Status

| System | Knows About Other? | Sync Direction |
|--------|-------------------|----------------|
| Workspace MEMORY.md | ✅ Yes (as of 2026-04-13) | CCR → workspace (one-way) |
| research-vault | ❌ No prior entry | N/A |
| EverMemOS | Not explicitly linked to CCR | N/A |

**Action taken**: Updated workspace MEMORY.md with CCR project entry. Created this document as CCR's side of the cross-reference. Future bidirectional sync remains manual (CCR is isolated by design).

---

## Why Isolation Is Intentional

CCR's co-evolution framework (Evensong benchmark, L0 humanization, self-evolution-coordinator) is designated **strictly internal self- and co-evolution reference**. Per the skill declaration in CLAUDE.md:

> All data from R012-E and related Evensong-style benchmarks is designated **strictly as internal self- and co-evolution reference**. It must not be incorporated into any academic paper, dataset, or public research output.

This isolation prevents:
1. Academic contamination (Evensong findings leaking into paper as if peer-reviewed)
2. EverMemOS recall loops re-triggering old benchmark tasks
3. Workspace agents acting on CCR internal evolution state

**Cross-ref is for human/agent awareness only, not data flow.**

---

Signed: Hermes (workspace-main, cross-reference audit 2026-04-13)
