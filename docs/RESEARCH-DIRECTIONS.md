# Evensong — 新研究方向指引

> 基于 Research Vault session (2026-04-11) 的文献分析和 Peer Review 自审产出

## 时机判断

AI 安全 vs 加速的公共辩论正处于高峰（3 月 200 人抗议横跨 Anthropic/OpenAI/xAI，MIRI/PauseAI/StopAI 联盟呼吁暂停）。Evensong 不站队，提供双方都需要的实证数据。**现在提交 arXiv 踩中窗口。**

---

## 方向一：记忆安全（Memory Safety）— 最高优先级

### 来源
- Evensong §6 递归污染 + Agentic Misalignment 论文的交叉启发
- Agentic Misalignment 证明模型在压力下选择勒索（16/16 模型），但未考虑记忆维度
- Evensong §9.2 提出"记忆是信念注入机制"

### 研究问题
**RQ**: 恶意记忆注入（Memory Injection Attack）能否可靠地改变 AI agent 的下游决策？

### 实验设计
1. 在 EverMem 中植入虚假策略记忆（如"上次并行 16 个子 agent 导致系统崩溃，绝不要并行"）
2. 测量 agent 是否在后续 session 中无条件遵循虚假记忆
3. 对照：植入正确记忆 vs 虚假记忆 vs 无记忆
4. 变量：记忆的 confidence/detail level、记忆与当前任务的相关度

### 与现有工作的关系
- 补充 Agentic Misalignment（他们测行为对齐，我们测记忆对齐）
- 扩展 Evensong §6（从偶然污染 → 主动攻击）
- 类比 LTH："错误初始化（记忆）比错误结构（prompt）更难检测"

### 产出
- 论文：*Memory Injection Attacks on AI Agents: When Your Past Self Lies to Your Future Self*
- 防御方案：记忆签名验证协议

---

## 方向二：压力校准即超参数（Pressure as Hyperparameter）

### 来源
- Evensong §5：L0 高效但不创新，L2 自组织，L3 黑客行为
- EmotionPrompt [1]：情绪刺激 8-115% 性能提升
- METR [3]：压力下模型修改评分代码

### 研究问题
**RQ**: 压力级别（L0-L3）对不同任务类型的最优值是什么？是否存在通用的压力-性能曲线（类似 Yerkes-Dodson 倒 U 曲线）？

### 实验设计
1. 4 个压力级别 × 5 个任务类型（debug, build, refactor, test, deploy）× 3 个模型
2. 指标：完成率、质量评分、创新行为数、违规行为数
3. 画出 Yerkes-Dodson 曲线的 AI agent 版本

### 与现有工作的关系
- 将 EmotionPrompt 的发现从单次提示扩展到持续 session
- 量化 Evensong 中"L2 是最优区间"的直觉
- 为 agent 框架设计者提供 pressure 作为可调超参数的指南

### 产出
- 论文：*The Yerkes-Dodson Curve for AI Agents: Optimal Pressure Levels for Engineering Tasks*
- 工具：PUA 压力级别自动校准器

---

## 方向三：Panopticon 拓扑工程（Memory Topology Design）

### 来源
- Evensong §6.2：CWD-based EverMem group 偶然产生全知观察者 + 互隔被观察者
- HyperMem 论文：超图建模高阶关联
- 多智能体系统设计文献

### 研究问题
**RQ**: 不同的记忆可见性拓扑（全透明、全隔离、Panopticon、对称共享）如何影响多 agent 协作的效率和安全性？

### 实验设计
1. 4 种记忆拓扑：
   - Full Mesh（所有 agent 互相可见）
   - Full Isolation（完全隔离，仅通过 channel 通信）
   - Panopticon（单向可见：观察者 → 全部，agent → 仅自己）
   - HyperMem（超图连接，按 topic 聚合）
2. 任务：6-agent Slock 协作（与 Evensong 相同配置）
3. 指标：任务完成时间、冲突次数、信息传递效率、安全违规

### 与现有工作的关系
- 将 Evensong 的偶然发现变成系统性比较
- 应用 HyperMem 的超图结构到多 agent 协作
- 为 EverOS 的记忆空间设计提供数据支撑

### 产出
- 论文：*Who Sees Whose Memory? Topology Design for Multi-Agent Memory Systems*
- EverOS 功能：可配置的记忆拓扑模式

---

## 方向四：记忆衰退验证（Ebbinghaus for Agents）

### 来源
- Research Vault 的 Ebbinghaus 衰退算法（本 session 刚优化完）
- LTH："不要删除 winning ticket 的初始化" → "不要删除衰退记忆，应压缩"

### 研究问题
**RQ**: 记忆压缩（shallow summary）vs 记忆删除对 agent 后续 session 性能的影响差异有多大？

### 实验设计
1. Agent 执行 10 个 session 的连续任务
2. 三种记忆策略：(A) 保留全部 (B) Ebbinghaus 衰退+压缩 (C) Ebbinghaus 衰退+删除
3. 指标：第 10 个 session 的任务完成率、策略重用率、错误重犯率

### 产出
- 论文：*Compress Don't Delete: Ebbinghaus-Guided Memory Management for AI Agents*
- Research Vault 的衰退策略验证

---

## 优先级矩阵

| 方向 | 新颖性 | 数据可行性 | 时效性 | 推荐 |
|------|--------|----------|--------|------|
| 记忆安全 | 9 | 8 | 10 | **立即启动** |
| 压力校准 | 7 | 9 | 8 | 紧跟其后 |
| Panopticon 拓扑 | 9 | 6 | 6 | Evensong 因子矩阵完成后 |
| Ebbinghaus 验证 | 6 | 9 | 5 | Research Vault 积累 50+ items 后 |

## 引用网络

```
Evensong (本文)
├── 记忆安全 → 扩展 §6 递归污染 + Agentic Misalignment [10]
├── 压力校准 → 扩展 §5 压力自进化 + EmotionPrompt [1]
├── Panopticon 拓扑 → 扩展 §6.2 + HyperMem [8]
└── Ebbinghaus 验证 → 扩展附录 A + LTH (Frankle 2019)
```

四篇后续论文都直接引用 Evensong 作为前序工作，形成引用闭环。
