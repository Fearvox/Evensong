# Phase 1: Foundation Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 1-Foundation Hardening
**Areas discussed:** Type recovery strategy, Zod boundary scope, Test structure, Strict mode boundary
**Mode:** Auto (all decisions auto-selected)

---

## Type Recovery Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| tsconfig.strict.json overlay | Secondary tsconfig that only includes hardened files | auto |
| Project references | TypeScript composite projects with cross-project refs | |
| Fix-in-place globally | Enable strict everywhere and fix all errors | |

**User's choice:** tsconfig.strict.json overlay (auto-selected, recommended by research consensus)
**Notes:** Research unanimously recommended this approach. Global strict would produce ~1341 errors; project references add complexity without benefit for a single-package repo.

---

## Zod Boundary Validation

| Option | Description | Selected |
|--------|-------------|----------|
| API boundary only | Validate SDK events at claude.ts entry point | auto |
| All tool inputs | Also validate tool call inputs with Zod | |
| Full pipeline | Validate at every module boundary | |

**User's choice:** API boundary only (auto-selected, recommended: minimal Phase 1 scope)
**Notes:** Tool input validation deferred to Phase 2. Full pipeline validation is overkill — internal boundaries should be type-safe, not runtime-validated.

---

## Test Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Co-located __tests__/ | Tests next to source in __tests__/ dirs | auto |
| Separate test/ directory | All tests in top-level test/ dir | |
| Flat co-located | .test.ts files alongside source | |

**User's choice:** Co-located __tests__/ dirs (auto-selected, recommended: Bun convention)
**Notes:** Bun's test runner auto-discovers files matching *.test.ts in any directory. Co-located dirs keep test proximity while avoiding cluttered source dirs.

---

## Strict Mode Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Type defs + state first | message.ts, permissions.ts, state layer, Tool.ts | auto |
| Core modules first | query.ts, claude.ts, Tool.ts | |
| UI layer first | REPL.tsx, components | |

**User's choice:** Type defs + state files first (auto-selected, recommended: bottom-up import graph)
**Notes:** Research unanimously recommended bottom-up. Type defs fix ~30% of downstream cascading errors. UI layer should be last (Phase 6).

---

## Claude's Discretion

- Internal type naming conventions
- Branded types vs plain aliases for message IDs
- Exact Zod schema structure

## Deferred Ideas

None
