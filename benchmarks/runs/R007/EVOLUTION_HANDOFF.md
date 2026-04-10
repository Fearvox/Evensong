# Benchmark 超进化交接文档
**生成时间**: 2026-04-09 20:15 UTC
**当前 R006 结果**: 230 tests, 24/24 标准通过, 8 服务
**对标 Opus R006**: 291 tests

---

## 一、根因分析

### 差距数据
| 指标 | R006 (当前) | Opus R006 | 差距 |
|------|------------|-----------|------|
| 测试数量 | 230 | 291 | -61 (-21%) |
| 执行时间 | ~17min | ~15.7min | +1.3min |
| 服务数量 | 8 | 6 | +2 |
| 标准达成 | 24/24 ✅ | 18/18 ✅ | +6 |

### 根因
```
61 测试差距 = 子 agent 预填边界测试数量不足

Opus 每个服务平均: 291/6 = 48.5 tests
我每个服务平均: 230/8 = 28.75 tests

差距原因:
1. 子 agent prompt 没有明确要求"每个模块 X 个测试"
2. 没有 A/B 验证并行策略
3. 测试覆盖没有基线监控
```

---

## 二、超进化策略

### 2.1 测试数量基线 (新标准)

```
每个服务最低测试数: 40 tests (不是 8-10 个)
每个模块最低测试数: 12 tests

分解:
- happy path: 3 tests
- 边界条件: 5 tests
- 错误处理: 4 tests
- 并发/竞态: 2 tests (关键模块额外)
- 性能基线: 1 test
```

### 2.2 并行策略 A/B 测试

```
策略 A: 8 并行 (当前)
  - pros: 资源稳定，调试简单
  - cons: 子 agent 粒度粗

策略 B: 16 并行 (新)
  - pros: 更多子任务，并行度更高
  - cons: 资源争抢，可能 OOM

验证方法:
1. 同一任务跑两次 A/B
2. 记录执行时间和测试数量
3. 数据选优
```

### 2.3 子 Agent Prompt 模板 (必须使用)

```
## [AGENT_TEMPLATE_V2]

你正在构建 {SERVICE_NAME} 服务。

### 交付标准
1. 所有源文件必须完整实现，不能有 TODO 占位符
2. 必须包含完整的测试套件

### 测试数量要求 (强制)
- 总测试数 >= 40 tests per service
- 每个模块 >= 12 tests
- 覆盖率分解:
  * happy path: 3 tests
  * 边界条件: 5 tests (含空输入、最大值、特殊字符)
  * 错误处理: 4 tests (各种异常场景)
  * 并发测试: 2 tests (Promise.allSettled、race condition)
  * 性能基线: 1 test (超时测试)

### 缺陷预防 Checklist (生成后自检)
- [ ] 所有 public 函数有对应测试
- [ ] 错误路径覆盖: 404、500、超时、权限拒绝
- [ ] 并发安全: 多线程/多协程同时调用
- [ ] 资源清理: 测试后无内存泄漏
- [ ] 边界值: 0、-1、MAX_INT、空字符串、null

### 代码质量
- 无 any 类型 (除非官方类型声明)
- 错误处理完整 (try/catch + Result type)
- 日志级别正确 (info/warn/error)
```

### 2.4 缺陷预防自动化

```typescript
// 在测试文件顶部自动注入的基线测试
const BASELINE_TESTS = {
  // 每个服务必须有这些
  healthCheck: () => { /* service responds to /health */ },
  emptyInput: () => { /* handles empty/null input */ },
  maxValue: () => { /* handles MAX values */ },
  concurrentCalls: () => { /* 100 concurrent requests */ },
  timeout: () => { /* times out after limit */ },
  authFailure: () => { /* returns 401 without auth */ },
  notFound: () => { /* returns 404 for missing resource */ },
  internalError: () => { /* handles 500 gracefully */ },
};
```

---

## 三、R007 行动计划

### 3.1 目标
- 测试数量: 300+ tests (超过 Opus 的 291)
- 执行时间: < 15 min (追上 Opus)
- 服务数量: 保持 8 个
- 标准达成: 24/24

### 3.2 关键改进

1. **Prompt 升级**: 使用 v2 模板，每个服务要求 40+ 测试
2. **A/B 并行策略**: 同时跑 8 并行和 16 并行，记录哪个更快
3. **测试数量监控**: 每个子 agent 完成后报告测试数，低于 40 立即补充
4. **缺陷预防**: 在子 agent 执行前检查是否覆盖了所有边界条件

### 3.3 验证标准

```
R007 成功条件:
- [ ] 测试数量 > 291
- [ ] 执行时间 < 15 min
- [ ] 所有服务 build 通过
- [ ] 所有测试 pass (0 fail)
- [ ] 24/24 标准达成
```

---

## 四、自我进化清单

### 4.1 当前会话要保存的记忆

```
[LRN-20260409-001] benchmark测试数量基线
- What: 每个服务必须至少 40 个测试，不是 8-10 个
- Why: R006 因为测试数量不足输给 Opus 61 个
- How: 子 agent prompt 里明确写 ">= 40 tests per service"
- Domain: benchmark, agent-prompting
- Confidence: high

[LRN-20260409-002] 并行策略A/B验证
- What: 8 并行 vs 16 并行要实际测试对比
- Why: 不确定哪个更快，需要数据驱动
- How: 同一任务跑两次，记录时间和测试数
- Domain: benchmark, parallel-strategy
- Confidence: high

[LRN-20260409-003] 缺陷预防优于缺陷修复
- What: 在代码生成阶段就覆盖边界测试，而不是生成后再补
- Why: R006 花时间修复测试，说明预防意识不够
- How: 每个模块生成时同步生成边界测试
- Domain: code-quality, test-strategy
- Confidence: high
```

### 4.2 下次 Benchmark 要做的第一件事

```
1. 读取本交接文档
2. 更新子 agent prompt 模板 (加入测试数量要求)
3. 建立测试数量监控 (每个服务完成后检查)
4. 准备 A/B 并行策略验证
5. 启动 R007
```

---

## 五、交接确认

本交接文档包含:
- ✅ 根因分析 (61 测试差距)
- ✅ 测试数量基线 (40 tests/service)
- ✅ 子 agent prompt v2 模板
- ✅ 缺陷预防 checklist
- ✅ A/B 并行策略验证方法
- ✅ R007 目标设定
- ✅ 自我进化记忆 (3 条)

**下一步**: 等待 `/clear` 后，读取本文档，执行超进化策略。
