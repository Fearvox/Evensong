<p align="right"><a href="./README.md">English</a></p>

# Claude Code Reimagined

**Claude Code 重构版，从反编译到下一代开源 AI Agent 平台**

> 这不是 wrapper，不是 clone，是 Anthropic 官方 Claude Code CLI 的完整内核逆向。每一个 feature flag，每一个 tool，每一个 streaming handler，全部暴露，全部可读，全部可改。

[![TypeScript](https://img.shields.io/badge/TypeScript-520K%2B_lines-blue)]()
[![Bun](https://img.shields.io/badge/Runtime-Bun-f472b6)]()
[![Tests](https://img.shields.io/badge/Tests-261_passing-green)]()
[![Phase](https://img.shields.io/badge/Roadmap-Phase_5%2F14-orange)]()

## 目录

- [这个项目是什么](#这个项目是什么)
- [快速开始](#快速开始)
- [架构概览](#架构概览)
- [能力清单](#能力清单)
- [演进路线图 v2.0](#演进路线图-v20)
- [为什么做这个](#为什么做这个)
- [许可证](#许可证)

---

## 这个项目是什么

坦率的讲，这就是 Anthropic 官方 Claude Code CLI 的逆向工程。

说真的，市面上有一堆「Claude API wrapper」和「Claude-like CLI」，但它们都是从外面猜里面的结构。这个项目不一样，我们直接拿到了内核代码，反编译，还原，然后一行一行读懂它。520K 行 TypeScript，2797 个文件，56 个内置工具，90 多个 feature flag。你在官方 CLI 里看到的每一个能力，query loop 怎么跑的，streaming 怎么断线重连的，工具权限怎么管控的，MCP 协议怎么握手的，全部在这里，全部可读。

当然要说实话，这是反编译代码，有大约 1341 个 TypeScript 编译器错误，主要是 `unknown`、`never`、`{}` 这些类型问题。但重点是，它们完全不影响 Bun 运行时执行。代码能跑，工具能用，API 能调。我们采取增量修复策略，每个阶段清理当前模块的类型债务，不搞一刀切。

这个项目的野心不止于「能跑」。我们有一个 14 阶段的演进路线图，从基础设施加固一路走到多模型路由、自主记忆、协作编排、甚至自我进化流水线。目标是把这 520K 行代码从「反编译产物」变成「一个真正工程化的 AI Agent 平台」。你可以拿它学习 Claude Code 的内部架构，可以拿它魔改出自己想要的 AI CLI，也可以跟着路线图一起把它推到下一个形态。

---

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/Fearvox/claude-code-reimagine-for-learning.git
cd claude-code-reimagine-for-learning

# 安装依赖
bun install

# 开发模式（直接通过 Bun 运行）
bun run dev

# 构建（输出 dist/cli.js）
bun run build

# 运行测试
bun test

# Pipe 模式
echo "say hello" | bun run src/entrypoints/cli.tsx -p
```

---

## 架构概览

```
src/
├── entrypoints/cli.tsx      ← 真正的入口，注入 runtime polyfills
├── main.tsx                 ← Commander.js CLI 定义，解析参数，启动服务
├── query.ts                 ← 核心 API 查询，流式响应 + 工具调用循环
├── QueryEngine.ts           ← 高层编排器，会话状态 + 压缩 + 归属追踪
├── screens/REPL.tsx         ← 交互式 REPL（React/Ink 终端 UI）
├── services/api/claude.ts   ← API 客户端，多提供商支持
├── tools/                   ← 56 个工具，每个独立目录
│   ├── BashTool/
│   ├── FileEditTool/
│   ├── GrepTool/
│   ├── AgentTool/
│   ├── WebFetchTool/
│   ├── MCPTool/
│   └── ...
├── state/                   ← Zustand 风格状态管理
├── context.ts               ← 系统提示词构建（git status, CLAUDE.md 等）
├── utils/featureFlag.ts     ← Feature flag 配置引擎
└── ink/                     ← 自定义 Ink 框架（forked reconciler）
```

**数据流**，用户输入 → `REPL.tsx` 捕获 → `QueryEngine.ts` 编排 → `query.ts` 发送 API 请求 → 流式响应回来 → 解析工具调用 → `tools/<ToolName>/` 执行 → 结果送回 API → 循环直到 assistant 不再调用工具。

**Feature Flag 系统**，所有 `feature('FLAG_NAME')` 调用默认返回 `false`。你可以通过 `~/.claude/feature-flags.json` 选择性开启任何 flag，不需要改代码。90 多个 flag 全部编目在依赖图文档里，包括哪些 flag 需要联动开启。

<p align="right"><a href="#目录">↑ 返回顶部</a></p>

---

## 能力清单

### 核心能力

| 能力 | 描述 |
|------|------|
| 流式响应 | SSE 流式，断线自动重连，idle 超时检测 |
| 工具调用循环 | 多工具批量执行，结果自动送回 API |
| 权限管控 | deny/ask/allow/passthrough 四级，会话内持久化 |
| 会话管理 | 保存/恢复，上下文压缩，token 预警 |
| MCP 协议 | stdio + SSE 传输，工具自动注册 |
| Feature Flags | 90+ flag，JSON 配置，运行时热切换 |
| 终端 UI | React/Ink 渲染，虚拟列表，搜索高亮 |

<details>
<summary><strong>56 个内置工具</strong>（点击展开）</summary>

| 类别 | 工具 | 说明 |
|------|------|------|
| 文件操作 | FileReadTool, FileWriteTool, FileEditTool | 读写编辑，原子写入防损坏 |
| 代码搜索 | GrepTool, GlobTool | 正则搜索 + 模式匹配 |
| 终端 | BashTool, PowerShellTool, REPLTool | Shell 执行，跨平台 |
| 智能体 | AgentTool, TaskCreateTool, TaskGetTool | 子代理编排，任务管理 |
| 网络 | WebFetchTool, WebSearchTool, WebBrowserTool | 网页抓取 + 搜索 |
| MCP | MCPTool, ListMcpResourcesTool, ReadMcpResourceTool | Model Context Protocol 完整支持 |
| 笔记本 | NotebookEditTool | Jupyter notebook 操作 |
| 计划 | EnterPlanModeTool, ExitPlanModeTool, VerifyPlanExecutionTool | 计划模式 + 执行验证 |
| 协作 | SendMessageTool, SendUserFileTool, TodoWriteTool | 消息发送 + 文件共享 |
| 工作树 | EnterWorktreeTool, ExitWorktreeTool | Git worktree 隔离 |
| 其他 | SkillTool, ToolSearchTool, ConfigTool, MonitorTool, SleepTool | 技能系统 + 配置 + 监控 |

</details>

<details>
<summary><strong>多提供商支持</strong>（点击展开）</summary>

| 提供商 | 状态 | 配置方式 |
|--------|------|----------|
| Anthropic Direct | 完整支持 | `ANTHROPIC_API_KEY` |
| AWS Bedrock | 完整支持 | AWS credentials + region |
| Google Vertex | 完整支持 | GCP credentials + project |
| Azure | 完整支持 | Azure AD + endpoint |

</details>

<p align="right"><a href="#目录">↑ 返回顶部</a></p>

---

## 演进路线图 v2.0

### ✓ 已完成（Phase 1-5）

<details>
<summary>5 个阶段已完成，点击展开详情</summary>

| 阶段 | 名称 | 核心成果 |
|------|------|----------|
| Phase 1 | 基础加固 | 类型系统修复，测试基础设施，Zod schema 验证 |
| Phase 2 | 核心工具可靠性 | BashTool/FileEdit/Grep/Agent 错误处理 + 集成测试 |
| Phase 3 | API 流式韧性 | 断线重连，provider 切换，原子化历史写入 |
| Phase 4 | 查询循环与权限 | 多工具批量执行，权限持久化，会话恢复 |
| Phase 5 | 基础设施与门控覆盖 | GrowthBook 绕过，flag 依赖图，MCP 传输 |

</details>

### ▶ 下一步，Phase 6，记忆提取

跨会话记忆自动提取 + 加载，带密钥扫描防止凭证泄露。提取管道的代码已经全部存在于代码库中，这个阶段的工作是启用它，接入密钥扫描，测试完整流程。

### ○ 计划中（Phase 7-14）

| 阶段 | 名称 | 方向 |
|------|------|------|
| Phase 7 | 审议检查点 | 高风险工具调用前强制深度思考 |
| Phase 8 | 动态权限升级 | 会话级临时权限，子代理隔离 |
| Phase 9 | 上下文折叠 | 智能压缩，保留近期保真度 |
| Phase 10 | 协调者模式 | 多代理编排，并行 worker，文件锁定 |
| Phase 11 | KAIROS 主动模式 | 主动建议，梦境整合，本地存储 |
| Phase 12 | 多模型架构 | OpenAI 适配器，难度路由，回退链 |
| Phase 13 | UI 清理与集成测试 | React Compiler 清理，REPL 拆分 |
| Phase 14 | 进化流水线 | 对抗评估，指标仪表盘，自迭代 |

<p align="right"><a href="#目录">↑ 返回顶部</a></p>

---

<details>
<summary><strong>技术栈详情</strong>（点击展开）</summary>

| 层 | 技术 | 版本 |
|----|------|------|
| 运行时 | Bun | ^1.3.x |
| 语言 | TypeScript + TSX | ^6.0.2 |
| UI | React + Ink | 自定义 reconciler |
| API | @anthropic-ai/sdk | ^0.80.0 |
| CLI | Commander.js | ^14.0.0 |
| MCP | @modelcontextprotocol/sdk | ^1.29.0 |
| Lint | Biome | ^2.4.10 |
| 测试 | bun test（内置） | - |
| 构建 | bun build（单文件） | - |

</details>

<details>
<summary><strong>已知限制</strong>（点击展开）</summary>

反正我觉得坦诚比包装重要，所以直接列出来。

- **~1341 个 tsc 错误** 来自反编译，主要是 `unknown`/`never`/`{}` 类型。不影响运行，增量修复中
- **React Compiler 残留** 组件里有 `_c(N)` memoization 模板代码，Phase 13 统一清理
- **Computer Use** `@ant/*` 包是 stub，依赖 Anthropic 内部基础设施
- **NAPI 包** audio/image/url/modifiers 是 stub（`color-diff-napi` 除外，完整实现）
- **不跟踪上游** 这是 fork，不同步 Anthropic 的后续发布

</details>

<details>
<summary><strong>项目结构</strong>（点击展开）</summary>

```
claude-code-reimagine-for-learning/
├── src/                     # 主源码（2,797 个文件）
├── packages/                # 内部包（workspace 方式引用）
│   ├── @ant/               # Computer Use stub 包
│   └── color-diff-napi/    # 唯一完整实现的 NAPI 包
├── dist/                    # 构建输出
├── .planning/               # 项目规划（路线图、状态、计划文档）
└── .learnings/              # 项目级知识库
```

</details>

---

## 为什么做这个

说真的，Claude Code 是目前最强的 AI coding agent 之一。但它是个黑盒。

你不知道它的 query loop 是怎么跑的，不知道它是怎么决定要不要调工具的，不知道那 90 多个 feature flag 背后藏着什么能力。你只能用它，不能改它，不能学它，不能把它的好设计搬到自己的项目里。

这个项目把黑盒打开了。520K 行代码，全部可读。你可以看到 streaming handler 是怎么处理断线重连的，可以看到 permission system 的四级管控是怎么实现的，可以看到 MCP 协议是怎么在 stdio 和 SSE 之间切换的。

如果你是想学习顶级 AI Agent 架构的开发者，这里有最真实的参考实现。
如果你是想魔改 Claude Code 的黑客，这里有完整的可运行代码。
如果你是想构建自己 AI Agent 平台的创业者，这里有经过验证的设计模式。

---

## 许可证

> [!NOTE]
> 本项目仅供学习和研究用途。原始代码版权归 Anthropic 所有。
> 本仓库是 Anthropic Claude Code CLI 的逆向工程产物，旨在教育目的。请遵守 Anthropic 的服务条款和使用政策。

---

<p align="center">
<i>「把黑盒打开，让每个开发者都能读懂 AI Agent 的内核」</i>
</p>
