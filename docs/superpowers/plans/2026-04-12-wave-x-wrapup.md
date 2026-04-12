# Wave X Wrap-Up: Commit, Fix, Ship

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get all Wave X v2 work committed in clean logical commits, fix the 138 failing service tests, and leave repo green for Wave X v3.

**Architecture:** Three logical commits — (1) services refactor from Wave X runs, (2) evensong harness + pre/post diff, (3) docs/config cleanup. Then fix test failures in the 4 broken modules (analytics, search, payments/orders, users).

**Tech Stack:** Bun test, TypeScript, services/ microservice test scaffold

---

### Task 1: Commit — Services Refactor (Wave X v2 output)

**Files:**
- Modified: `services/*/index.ts` (8 files — all services)
- Deleted: `services/*/app.ts` (8 files — removed)
- Created: `services/*/handlers.ts`, `services/*/store.ts` (16 files — new)
- Created: `services/shared/*.ts` (5 files — shared utils)
- Modified: `services/*/__tests__/*.test.ts` (all test files)
- Created: `services/*/__tests__/handlers*.test.ts`, `services/*/__tests__/store.test.ts`
- Modified: `services/README.md`, `services/run-tests.sh`
- Created: `services/run-tests.ts`, `services/__tests__/integration.test.ts`

- [ ] **Step 1: Stage all services files**

```bash
git add services/
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(services): Wave X v2 — split app.ts into handlers+store, add shared utils

8 services refactored from monolithic app.ts to handlers.ts + store.ts.
Shared HTTP, validation, types extracted to services/shared/.
New edge-case and handler-specific test files added.
1412 pass / 148 fail — failures are import/interface mismatches from rapid generation."
```

### Task 2: Commit — Evensong Harness + Pre/Post Diff

**Files:**
- Modified: `benchmarks/evensong/harness.ts` (pre/post snapshot + diff)
- Modified: `benchmarks/evensong/types.ts` (tests_pre, tests_new fields)
- Modified: `benchmarks/evensong/cli.ts` (batch/config enhancements)
- Modified: `benchmarks/evensong/prompts.ts`
- Modified: `benchmarks/evensong/__tests__/prompts.test.ts`
- Modified: `benchmarks/evensong/__tests__/types.test.ts`
- Modified: `benchmarks/evensong/EXPERIMENT-LOG.md`
- Created: `benchmarks/evensong/configs.ts`, `benchmarks/evensong/stats.ts`
- Created: `benchmarks/evensong/inject-memory.ts`
- Created: `benchmarks/evensong/__tests__/configs.test.ts`, `benchmarks/evensong/__tests__/stats.test.ts`
- Created: `benchmarks/evensong/stats/*.json` (4 R011 stats files)

- [ ] **Step 1: Run evensong tests to confirm green**

```bash
bun test benchmarks/evensong/__tests__/
```

Expected: 65 pass, 0 fail

- [ ] **Step 2: Stage and commit**

```bash
git add benchmarks/evensong/ 
git commit -m "feat(harness): pre/post diff snapshots + configs/stats/inject-memory modules

- snapshotTestFiles() captures sha256 hashes before CCB spawn
- diffSnapshots() computes new/modified files and net new test count
- RunResult gains tests_pre/tests_new for clean data separation
- New modules: configs.ts (run presets), stats.ts (analysis), inject-memory.ts
- R011 stats data (4 JSON files for 2x2 matrix cells)"
```

### Task 3: Commit — Docs + Config Cleanup

**Files:**
- Modified: `README.md`
- Modified: `package.json`
- Modified: `.claude/settings.json`
- Modified/Created: `docs/evensong-*.{tex,pdf,aux,xdv,toc,fdb_latexmk,fls,bbl,blg}`

- [ ] **Step 1: Stage docs and config**

```bash
git add README.md package.json .claude/settings.json
git add docs/
```

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: paper build artifacts + README trim + package.json cleanup"
```

### Task 4: Fix — Analytics Test Failures (~40 failures)

**Files:**
- Fix: `services/analytics/__tests__/analytics.test.ts`
- Fix: `services/analytics/__tests__/analytics-edge.test.ts`
- Check: `services/analytics/index.ts`, `services/analytics/handlers.ts`, `services/analytics/store.ts`

- [ ] **Step 1: Identify root cause**

```bash
bun test services/analytics/ 2>&1 | head -40
```

Look for: import errors, missing exports, interface mismatches between old tests and new handlers/store split.

- [ ] **Step 2: Read the first failing test and trace the import chain**

Check what `analytics.test.ts` imports vs what `index.ts` now exports. The refactor split `app.ts` into `handlers.ts` + `store.ts` — tests likely still import from `app.ts` or expect the old API shape.

- [ ] **Step 3: Fix imports and interface alignment**

Update test imports to match new module structure. If tests import `{ app }` from `../app`, change to import from `../index` or `../handlers` as appropriate.

- [ ] **Step 4: Run and verify**

```bash
bun test services/analytics/ 2>&1 | tail -5
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add services/analytics/
git commit -m "fix(analytics): align tests with handlers+store refactor"
```

### Task 5: Fix — Search Test Failures (~30 failures)

**Files:**
- Fix: `services/search/__tests__/search.test.ts`
- Fix: `services/search/__tests__/store.test.ts`
- Check: `services/search/index.ts`, `services/search/handlers.ts`, `services/search/store.ts`

- [ ] **Step 1: Identify root cause**

```bash
bun test services/search/ 2>&1 | head -40
```

Search had `search-edge.test.ts` DELETED — confirm the store.test.ts covers those cases or re-add edge tests.

- [ ] **Step 2: Fix imports and missing exports**

Trace `SearchEngine` class — likely in `store.ts` now. Tests may reference old location.

- [ ] **Step 3: Run and verify**

```bash
bun test services/search/ 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add services/search/
git commit -m "fix(search): align tests with handlers+store refactor"
```

### Task 6: Fix — Payments + Orders Test Failures (~30 failures)

**Files:**
- Fix: `services/payments/__tests__/payments.test.ts`, `services/payments/__tests__/handlers.test.ts`, `services/payments/__tests__/store.test.ts`
- Fix: `services/orders/__tests__/orders.test.ts`, `services/orders/__tests__/handlers.test.ts`, `services/orders/__tests__/store.test.ts`
- Check: respective `index.ts`, `handlers.ts`, `store.ts`

- [ ] **Step 1: Diagnose payments**

```bash
bun test services/payments/ 2>&1 | head -30
```

- [ ] **Step 2: Fix payments imports/interfaces**

- [ ] **Step 3: Diagnose orders**

```bash
bun test services/orders/ 2>&1 | head -30
```

- [ ] **Step 4: Fix orders imports/interfaces**

- [ ] **Step 5: Run both and verify**

```bash
bun test services/payments/ services/orders/ 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add services/payments/ services/orders/
git commit -m "fix(payments,orders): align tests with handlers+store refactor"
```

### Task 7: Fix — Users Test Failures (~20 failures)

**Files:**
- Fix: `services/users/__tests__/users.test.ts`, `services/users/__tests__/users-edge.test.ts`
- Fix: `services/users/__tests__/handlers*.test.ts`, `services/users/__tests__/store.test.ts`
- Check: `services/users/index.ts`, `services/users/handlers.ts`, `services/users/store.ts`

- [ ] **Step 1: Diagnose**

```bash
bun test services/users/ 2>&1 | head -30
```

- [ ] **Step 2: Fix imports/interfaces**

- [ ] **Step 3: Run and verify**

```bash
bun test services/users/ 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add services/users/
git commit -m "fix(users): align tests with handlers+store refactor"
```

### Task 8: Final Verification + Push

- [ ] **Step 1: Run full test suite**

```bash
bun test services/ 2>&1 | tail -5
bun test benchmarks/evensong/__tests__/ 2>&1 | tail -5
```

Expected: 0 fail across both

- [ ] **Step 2: Verify git log looks clean**

```bash
git log --oneline -10
```

- [ ] **Step 3: Push**

```bash
git push origin main
```
