# 我们对 Claude Code 生态的贡献 + Evensong 长期价值

> 用人话写的贡献总结，给 Anthropic 团队 + 未来 Harness 推进参考

---

## 一、我们向 Anthropic 提交的 Issues（5个）

| # | 问题 | 核心发现 | 影响范围 |
|---|------|----------|----------|
| [#46416](https://github.com/anthropics/claude-code/issues/46416) | 第三方 API 的 context window 检测失败 | MiniMax/Azure/Bedrock 全部回退到 200K，实际可能是 1M | AutoCompact 触发时机全错 |
| [#46420](https://github.com/anthropics/claude-code/issues/46420) | 换模型 = 上下文重置 | 换一次模型，MEMORY.md + history 全部丢失 | 跨模型协作完全失效 |
| [#46421](https://github.com/anthropics/claude-code/issues/46421) | 并行 subagent 的 cache_read 乘法堆积 | 3个并行 agent 各自读 ~50K = 总共 150K（串行只需 50K） | 预算无声烧穿 |
| [#46422](https://github.com/anthropics/claude-code/issues/46422) | 本地 token 估算 vs API 报告严重偏差 | 显示 60% 实际可能 85%+，cache_read 没被正确计算 | AutoCompact 时机误判 |
| [#46423](https://github.com/anthropics/claude-code/issues/46423) | 跨模型 session 连续性（Feature） | 换模型时保留 memory files + conversation history | 多 provider 路由的基础需求 |

### 我们还帮别人 existing issues 补充了评论（3个）

- **#46311** (skills frontmatter 不注入 subagent)：确认 `agents:` frontmatter 也受影响，cache timing 导致长 resume 时 skill 丢失
- **#45958** (并行 subagent 烧 cache)：补充我们的 3-agent 数据点，cache 累积是乘法不是加法
- **#35214** (has1mContext 不匹配 canonical model IDs)：指出 fix 需要两层——first-party API response 修 + third-party provider 扩展分别不同

---

## 二、第一性原理发现（踩过的坑）

### 坑1：换模型 = 记忆清零

**现象**：在 session 里换模型（Opus → MiniMax 或反过来），之前所有 memory files、conversation history、in-progress understanding 全没了。

**根因**：每个模型 provider 维护独立的 conversation state。换模型 = 新 session，从零开始。

**影响**：
- 跨模型协作时每次换都要重新 orient from files
- 唯一的 workaround：换模型前必须手动写 memory，不能靠系统记住

**我们的处理**：critical findings 必须即时写 memory，不能等 session 结束。

---

### 坑2：并行 agent 调度有且只有在文件边界清晰时才快

**现象**：3个独立任务并行 ~2min，串行 ~6min，3x 加速。

**触发条件**：任务数 ≥ 2 + 文件修改边界不重叠。风险：两个 agent 改同一个文件 → git conflict。

**我们的处理**：dispatch 前用 `git status` 确认文件隔离。

---

### 坑3：AutoCompact 对第三方 provider 的阈值是假的

**现象**：Claude Code 显示 "80% full"，但实际可能已经 90%+ 了。

**根因**：`getContextWindowForModel()` 对所有第三方 provider 回退到 200K，不去检测实际能力。

**计算偏差**：假设实际是 1M 模型，Claude Code 用 200K 做分母——显示的百分比全是错的。

---

### 坑4：并行 subagent 的 cache_read 是乘法级堆积

**现象**：3个并行 agent 各自独立读 ~50K cache，parent session 被收了 ~150K。串行只需 ~50K。

**根因**：每个 subagent 独立从 parent context 读 cache，没有去重，没有上限。

---

## 三、Evensong / Harness 的长期价值

### 对 AI Agent 生态

**Self-Evolution 量化研究**（核心发现）
- Memory 的存在本身会改变 AI Agent 的决策
- 压力（L0/L2/L3）调节 self-evolution 的强度
- 应用：让 Agent 在高压下自主优化，无压时主动停下来

**多模型协作基础设施**
- 8 个模型的 benchmark matrix（Opus + Grok + GPT-5.4 + MiniMax + 6 pending）
- 模型路由 + 动态切换的标准化 benchmark 协议
- 不同模型在不同压力下的协作模式差异数据

**Cache/Token 效率优化**
- 发现并行 subagent 的 cache_read 乘法堆积问题
- 建立 agent-level token accounting 标准
- 企业级 Agent 部署成本控制基础

**可测量的安全边界**
- Benchmark 的 clean-room isolation 设计
- 跨组织协作测试的保密协议
- 第三方安全审计可行性

### 对 Claude Code 生态（直接贡献）

**能力输出**：
- Deep bench：完整 benchmark 基础设施，能快速验证 bug fix 后的行为
- 跨模型场景：MiniMax + Opus + Grok + GPT-5.4 并行协作实战经验
- 长 session 观测：R007-R011 完整数据（448-1051 tests/run）

**我们愿意提供的**：
1. Regression test data（基于 Evensong benchmark）
2. Fix 有效性验证（用 harness 测试修完后的行为）
3. Multi-provider testing（MiniMax + Opus 双 provider 测试 context continuity）

---

## 四、快速索引

```
GitHub Issues:
#46416 - 第三方 API context window 检测失败
#46420 - 换模型上下文重置
#46421 - 并行 subagent cache_read 乘法堆积
#46422 - token 估算与 API 报告偏差
#46423 - 跨模型 session 连续性（Feature）

文档：
docs/evensong-research-contributions.md - 完整贡献记录（含论文索引）
.learnings/model-switch-context-loss-pitfall.md - 换模型坑
.learnings/parallel-agent-orchestration.md - 并行调度发现
```
