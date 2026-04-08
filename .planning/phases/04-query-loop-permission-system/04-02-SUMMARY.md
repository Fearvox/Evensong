---
phase: 04-query-loop-permission-system
plan: "02"
subsystem: compact
tags: [testing, tdd, autocompact, token-limits, QUERY-02]
dependency_graph:
  requires: []
  provides: [QUERY-02-tests]
  affects: [tsconfig.strict.json]
tech_stack:
  added: []
  patterns: [env-var-override-for-testing, afterEach-env-restore, pure-function-unit-tests]
key_files:
  created:
    - src/services/compact/__tests__/autoCompact.test.ts
  modified:
    - tsconfig.strict.json
decisions:
  - "用 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE 百分比覆盖使阈值可预测，避免硬编码绝对 token 数"
  - "afterEach 用快照恢复 process.env，防止测试间污染（与 streamWatchdog.test.ts 保持一致）"
  - "直接测试 getAutoCompactThreshold() 返回值作为边界，阈值下方 -1 / 精确 / 上方 +1000 三档"
  - "isAutoCompactEnabled() 依赖 getGlobalConfig()——用 DISABLE_AUTO_COMPACT 绕过，不依赖用户磁盘配置"
metrics:
  duration: "~2min"
  completed_date: "2026-04-08"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
requirements_satisfied: [QUERY-02]
---

# Phase 04 Plan 02: autoCompact Boundary Unit Tests Summary

**One-liner:** 10 个单元测试直接验证 calculateTokenWarningState() 和 isAutoCompactEnabled() 的精确边界行为，通过 env var 覆盖绕过磁盘配置依赖。

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Compaction 边界单元测试 | 028daf4 | src/services/compact/__tests__/autoCompact.test.ts (创建) |
| 2 | 将 autoCompact.test.ts 加入 tsconfig.strict.json | 6f4fcc7 | tsconfig.strict.json (修改) |

## What Was Built

**Task 1:** 创建 `src/services/compact/__tests__/autoCompact.test.ts`，包含 10 条测试（超过计划最低要求 ≥ 6 条）：

`describe('calculateTokenWarningState')` — 8 条测试：
1. `isAboveAutoCompactThreshold` 在 `threshold - 1` 时为 false（阈值下方不触发）
2. `isAboveAutoCompactThreshold` 在 `threshold` 时为 true（精确阈值触发）
3. `isAboveAutoCompactThreshold` 在 `threshold + 1000` 时为 true（超过阈值触发）
4. `DISABLE_AUTO_COMPACT=1` 时 `isAboveAutoCompactThreshold` 在任意超阈值 tokenUsage 下均为 false
5. `CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE=5000` 时 `tokenUsage=5000` → `isAtBlockingLimit=true`
6. `CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE=5000` 时 `tokenUsage=4999` → `isAtBlockingLimit=false`
7. `tokenUsage=0` 时 `percentLeft === 100`
8. `tokenUsage=threshold` 时 `percentLeft ≤ 1`

`describe('isAutoCompactEnabled')` — 2 条测试：
9. `DISABLE_AUTO_COMPACT=1` → 返回 false
10. `DISABLE_COMPACT=1` → 返回 false

**Task 2:** 将 `"src/services/compact/__tests__/autoCompact.test.ts"` 追加到 `tsconfig.strict.json` 的 `include` 数组末尾。

## Verification Results

```
bun test --testPathPattern=autoCompact.test
→ 10 pass, 0 fail

bun test (full suite)
→ 197 pass, 0 fail (no regression)

node -e "JSON.parse(...)" tsconfig.strict.json
→ JSON valid
```

## Deviations from Plan

None — 计划完全按预期执行。

**实现注意事项（非偏差）：**
- 10 条测试超过计划最低要求（≥ 6 条），包含 8 + 2 两个 describe 块
- TDD RED 阶段：测试文件创建后首次运行直接通过（GREEN），因为被测函数是已有纯函数，行为符合预期——这是针对已有实现补测试的正常 TDD 模式
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE='50'` 使阈值约为 effective context window 的 50%（与原始 autocompactThreshold 中的较小值），避免硬编码绝对 token 数

## Known Stubs

None — 所有测试均断言真实行为，无 placeholder 或硬编码假数据。

## Threat Surface Scan

无新增网络端点、认证路径或文件访问模式。测试文件不引入新的信任边界。

威胁模型验证（T-04-02-01）：`isAtBlockingLimit` 边界测试（Tests 5 & 6）直接验证了 DoS 防御机制在 `CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE=5000` 时的精确触发边界。

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/services/compact/__tests__/autoCompact.test.ts | FOUND |
| tsconfig.strict.json | FOUND |
| 04-02-SUMMARY.md | FOUND |
| commit 028daf4 (test: autoCompact boundary tests) | FOUND |
| commit 6f4fcc7 (chore: tsconfig.strict.json update) | FOUND |
