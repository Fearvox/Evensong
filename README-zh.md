<p align="right"><a href="./README.md">English</a></p>

# Evensong · Claude Code Reimagined

**你可以真正阅读的 AI Agent。混合检索基准。开源。**

<p align="center">
  <img src="https://img.shields.io/badge/%E4%BB%A3%E7%A0%81-Apache%202.0-3b82f6?style=flat-square" alt="代码 Apache 2.0" />
  <img src="https://img.shields.io/badge/%E7%A0%94%E7%A9%B6-CC%20BY--NC--ND%204.0-888?style=flat-square" alt="研究 CC BY-NC-ND 4.0" />
  <img src="https://img.shields.io/badge/Bun-%E8%BF%90%E8%A1%8C%E6%97%B6-f472b6?style=flat-square&logo=bun&logoColor=white" alt="Bun 运行时" />
  <img src="https://img.shields.io/badge/TypeScript-100%25-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/%E5%9F%BA%E5%87%86-648--%E8%AF%95%E9%AA%8C-f59e0b?style=flat-square" alt="648 试验基准" />
</p>

<p align="center">
  <b>支持的 Provider:</b> Anthropic | Bedrock | Vertex | Azure | MiniMax | OpenAI/Codex | Gemini | xAI | OpenRouter | 本地 Atomic Chat
</p>

---

## 🔥 Wave 3+ 重磅结果（2026-04-19）

200 条知识库 × 108 道生成查询 × 3 次重复 = **648 次盲测**。跨模型测试（grok-3 出题 / deepseek-v3.2 答题）杜绝自关联偏倚。

| 流水线 | Top-1 准确度 | p50 延迟 | p90 延迟 | Prompt 成本 |
|--------|-------------|----------|----------|-------------|
| LLM-only 直判 | 76.9% (249/324) | 2056ms | 3595ms | 100% |
| **Hybrid BM25 + LLM Rerank** | **79.3%** (257/324) | **1509ms** | **2725ms** | **25%** |

Hybrid **+2.5pp 准确度 / −27% p50 延迟 / −24% p90 延迟 / −75% Token 成本**。
3 次跑 stddev 仅 0.00–0.44pp —— 信号远超噪声。

一条命令复现：

```bash
bun run scripts/benchmark-hybrid-scale.ts --runs=3 --with-body \
  --queries-file=benchmarks/wave3f-generated-queries-2026-04-19.json
```

原始 JSONL + Markdown 摘要存 [`benchmarks/runs/`](./benchmarks/runs/)，生成器 prompt 也 committed 可审计。

---

## 目录

- [Benchmark 结果](#benchmark-结果)
- [项目缘起](#项目缘起)
- [当前功能](#当前功能)
- [快速开始](#快速开始)
- [架构设计](#架构设计)
- [功能开关](#功能开关)
- [演进路线图](#演进路线图)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## Benchmark 结果

| 运行 | 模型 | 模式 | 服务数 | 测试数 | 通过率 | 耗时 |
|------|------|------|--------|--------|--------|------|
| R001 | MiniMax M2.7 | P9 Tech Lead | 6 | 327 | 18/18 | ~20m |
| R002 | Opus 4.6 | Codex Rescue | 6 | 111 | 18/18 | 15.7m |
| R003 | Opus 4.6 | GSD Plan-Phase | 6 | 291 | 18/18 | 25.6m |
| R004 | MiniMax M2.7 | Codex 6-Agent | 6 | 265 | 18/18 | ~17m |
| **R005** | **MiniMax M2.7** | **GSD+P9 融合** | **6** | **265** | **18/18** | **~4.5m** |
| R006 | MiniMax M2.7 | PUA 极限压测 | **8** | 230 | **24/24** | ~17m |

[Live Dashboard](https://benchmarks-zeta.vercel.app)

<p align="right"><a href="#目录">↑ 顶部</a></p>

---

## 项目缘起

Anthropic 将 Claude Code 打包成编译后的二进制文件。你可以使用它，但无法研究它。你无法修改工具系统、替换流式处理器、重连权限模型，也无法理解一个 50 工具的 AI Agent 究竟是如何工作的。

这个项目改变了这一点。每一个函数、每一个工具、每一个功能开关、每一个流式事件处理器 -- 全部反编译、恢复、可读化。这不是一个 API 封装层。这不是一个从零构建的"Claude Code 克隆"。这是真正的 Claude Code 内部实现：真正的查询循环、真正的工具分发、真正的基于 Ink 的终端 UI、真正的 MCP 集成 -- 拆散后重新组装成你可以阅读、运行和修改的形式。

坦诚地说：这一切始于约 52 万行反编译的 TypeScript，带着约 1,341 个 tsc 错误和无处不在的 React Compiler 产物。它在 Bun 上运行完全正常（反编译导致的类型错误不会阻塞运行时）。目标是逐步将它从"反编译后能运行"转变为"经过工程化、有测试、可扩展" -- 一个用于构建下一代 AI Agent 的真正平台。我们已经深入这个过程，而且它正在发挥作用。

---

## 当前功能

### 核心系统

| 功能 | 状态 | 详情 |
|-----------|--------|---------|
| 交互式 REPL | 可用 | 全功能 Ink 终端 UI，5000+ 行主屏幕代码 |
| 流式对话 | 可用 | 完整的查询循环，支持自动压缩和 token 追踪 |
| 多 Provider API | 可用 | Anthropic、Bedrock、Vertex、Azure、MiniMax、OpenAI/Codex、Gemini、本地 |
| 权限系统 | 可用 | Plan / auto / manual 模式，配备 YOLO 分类器 |
| Hook 系统 | 可用 | 通过 `settings.json` 配置工具调用前后钩子 |
| 会话恢复 | 可用 | 通过 `/resume` 完全恢复对话状态 |
| MCP 集成 | 可用 | stdio + SSE 传输，支持资源列表和工具代理 |
| 上下文构建 | 可用 | Git 状态、CLAUDE.md 发现、记忆文件 |

<details>
<summary><strong>50+ 内置工具</strong>（点击展开）</summary>

| 工具 | 功能 |
|------|-------------|
| `BashTool` | 带沙箱和权限检查的 shell 执行 |
| `FileReadTool` | 读取文件、PDF、图片、Jupyter notebook |
| `FileEditTool` | 字符串替换编辑，带 diff 追踪 |
| `FileWriteTool` | 创建/覆写文件，生成 diff |
| `GlobTool` | 快速文件模式匹配 |
| `GrepTool` | 基于 ripgrep 的正则搜索 |
| `AgentTool` | 派生子 Agent（fork / async / background / remote） |
| `WebFetchTool` | URL 获取、Markdown 转换、AI 摘要 |
| `WebSearchTool` | 网页搜索，支持域名过滤 |
| `NotebookEditTool` | Jupyter notebook 单元格编辑 |
| `SkillTool` | 斜杠命令/skill 调用 |
| `SendMessageTool` | Agent 间消息传递（peers / teammates / mailbox） |
| `AskUserQuestionTool` | 多问题交互提示 |
| `MCPTool` | Model Context Protocol 工具代理 |
| `TodoWriteTool` | 任务列表管理 |
| `SyntheticOutputTool` | 非交互会话的结构化输出 |
| ...以及 30+ 更多 | 条件加载、功能开关控制或平台特定工具 |

</details>

<details>
<summary><strong>70+ 斜杠命令</strong>（点击展开）</summary>

从 `/compact`（压缩对话）到 `/model`（切换模型）到 `/provider`（切换 Provider，支持 Anthropic、MiniMax、OpenAI/Codex、Gemini、本地等）到 `/doctor`（健康检查）到 `/vim`（vim 模式）。完整列表见 `src/commands/`。

</details>

<p align="right"><a href="#目录">↑ 顶部</a></p>

---

## 快速开始

```bash
# 前置条件：Bun >= 1.3.11，有效的 Anthropic API 密钥（或 Bedrock/Vertex/Azure 凭证）
bun install

# 开发模式 -- 如果看到版本号 888，说明运行正常
bun run dev

# 管道模式
echo "解释这个代码库" | bun run src/entrypoints/cli.tsx -p

# 构建（单文件打包 -> dist/cli.js，约 26 MB）
bun run build

# 测试（35 个测试文件，1,419 个测试通过）
bun test
```

就这么简单。无需 Node.js。无需 Docker。无需复杂配置。Bun 搞定一切。

<p align="right"><a href="#目录">↑ 顶部</a></p>

---

## 架构设计

```
                          CLI 入口
                             |
                    cli.tsx（polyfills + MACRO 注入）
                             |
                          main.tsx
                      (Commander.js CLI 定义)
                             |
               +-------------+-------------+
               |                           |
          REPL 模式                    管道模式
          （交互式）                   （stdin -> stdout）
               |                           |
               +-------------+-------------+
                             |
                         query.ts
                   (API 流式处理 + 工具循环)
                             |
              +--------------+--------------+
              |              |              |
         claude.ts      QueryEngine.ts   context.ts
      （多 Provider    （对话状态管理）   （CLAUDE.md +
       API 客户端）                     Git 上下文）
              |              |
    +---------+-------+      |
    |    |    |    |   |     |
  Anthr Bedr Vert Azur |     |
  opic  ock  ex   e    |     |
                       |     |
                   tools.ts --+-- 工具注册表
                       |
         +------+------+------+------+------+
         |      |      |      |      |      |
       Bash   Edit   Grep   Agent  Fetch   MCP
       Tool   Tool   Tool   Tool   Tool   Tools
         |      |      |      |      |      |
         +------+------+------+------+------+
                       |
                   permissions/
              （plan / auto / manual 模式）
                       |
                   Ink UI 层
              （React 终端渲染）
```

### 核心模块

| 模块 | 路径 | 功能 |
|--------|------|-------------|
| 入口 | `src/entrypoints/cli.tsx` | 注入 `feature()` polyfill、`globalThis.MACRO`，引导运行时 |
| CLI | `src/main.tsx` | Commander.js 定义，参数解析，服务初始化 |
| 查询循环 | `src/query.ts` | 向 Claude API 发送消息，流式响应，分发工具调用，管理轮次循环（约 1700 行） |
| 引擎 | `src/QueryEngine.ts` | 高级编排器：对话状态、压缩、归因、文件历史（约 1300 行） |
| API 客户端 | `src/services/api/claude.ts` | 构建请求，调用 Anthropic SDK 流式端点，处理多 Provider 认证（约 3400 行） |
| REPL | `src/screens/REPL.tsx` | 交互式终端 UI：输入、消息、工具权限、键盘快捷键 |
| 工具 | `src/tools/<名称>/` | 50+ 自包含工具模块，各带 schema、执行逻辑和可选的 React 渲染器 |
| 权限 | `src/services/permissions/` | 6300+ 行：YOLO 分类器、路径验证、规则匹配、plan/auto/manual 模式 |
| MCP | `src/services/mcp/` | 完整 Model Context Protocol：stdio + SSE 传输、资源列表、工具代理（约 12000 行） |
| 上下文 | `src/context.ts` | 从 git 状态、CLAUDE.md 层级、记忆文件构建系统提示词 |
| 功能开关 | `src/utils/featureFlag.ts` | 已编目 90+ 开关；可通过 `~/.claude/feature-flags.json` 配置 |

<p align="right"><a href="#目录">↑ 顶部</a></p>

---

## 功能开关

原始 Claude Code 使用由 `bun:bundle` 在构建时注入的 GrowthBook 功能开关。我们已经编目了 90+ 个开关，并构建了本地覆盖系统。

**此分支中的工作原理：**
- 默认：`feature()` polyfill 为返回 `false`（所有 Anthropic 内部功能默认禁用）
- 覆盖：在 `~/.claude/feature-flags.json` 中设置开关以选择性启用功能
- 编目：每个开关都有文档说明其用途和依赖代码路径

<details>
<summary><strong>开关分类</strong>（点击展开）</summary>

| 分类 | 开关 | 控制范围 |
|----------|-------|------------------|
| 自主 Agent | `KAIROS`、`PROACTIVE`、`COORDINATOR_MODE`、`BUDDY` | 长期运行 Agent、主动执行、多 Agent 编排 |
| 远程/分布式 | `BRIDGE_MODE`、`DAEMON`、`SSH_REMOTE`、`DIRECT_CONNECT` | 远程控制、后台守护进程、SSH 隧道 |
| 增强工具 | `WEB_BROWSER_TOOL`、`VOICE_MODE`、`CHICAGO_MCP`、`WORKFLOW_SCRIPTS` | 浏览器、语音输入、计算机使用、工作流自动化 |
| 对话 | `HISTORY_SNIP`、`ULTRAPLAN`、`AGENT_MEMORY_SNAPSHOT` | 历史修剪、大规模规划、记忆快照 |
| 基础设施 | `ABLATION_BASELINE`、`HARD_FAIL`、`TORCH`、`LODESTONE` | 实验、错误模式、深度链接 |

这是你了解 Anthropic 正在构建但尚未公开的所有功能的地图。

</details>

<p align="right"><a href="#目录">↑ 顶部</a></p>

---

## 演进路线图

横跨两个里程碑的 14 个阶段。目标：将这个可以工作的反编译产物转变为一个智能的、可自我进化的 Agent 平台。

### 里程碑 v1.0：基础与核心可靠性（已完成）

| 阶段 | 名称 | 关键成果 |
|-------|------|----------------|
| 1 | 基础强化 | 类型系统、测试基础设施、Zod schema |
| 2 | 核心工具可靠性 | 4 个核心工具的错误处理 + 集成测试 |
| 3 | API 与流式处理韧性 | 自动重试、Provider 切换、原子历史写入 |
| 4 | 查询循环与权限系统 | 多工具批处理、权限持久化、会话恢复 |

### 里程碑 v2.0：Agent 智能增强（进行中）

| 阶段 | 名称 | 重点 | 状态 |
|-------|------|-------|--------|
| 5 | 基础设施与门控覆盖 | GrowthBook 绕过、90+ 开关编目、MCP 传输 | 已完成 |
| 6 | 记忆提取 | 跨会话记忆、密钥扫描 | 进行中 |
| 7 | 审议检查点 | 高风险工具调用前的可见推理 | 计划中 |
| 8 | 动态权限升级 | 会话作用域的临时权限授予 | 计划中 |
| 9 | 上下文折叠 | 智能上下文折叠，保留近期消息保真度 | 计划中 |
| 10 | 协调者模式 | 带文件预留的多 Agent 编排 | 计划中 |
| 11 | KAIROS 主动模式 | 可选主动建议、梦境整合 | 计划中 |
| 12 | 多模型 Provider 架构 | OpenAI 兼容适配器、难度路由、回退链 | 进行中 |
| 13 | UI 清理与集成测试 | React Compiler 清理、REPL 分解、测试矩阵 | 计划中 |
| 14 | 进化流水线 | 对抗性评估、指标仪表板、自我迭代 | 计划中 |

<p align="right"><a href="#目录">↑ 顶部</a></p>

---

<details>
<summary><strong>技术注记</strong>（tsc 错误、构建系统、React Compiler、单仓结构）</summary>

**关于 tsc 错误：** 共有约 1,341 个 TypeScript 错误，来自反编译 -- 大部分是 `unknown`/`never`/`{}` 类型和 React Compiler 产物（`_c()` memoization 调用）。这些不影响 Bun 运行时执行。我们通过 tsconfig islands 增量修复，而非大量使用 `@ts-ignore`。

**关于 `feature()` polyfill：** 在 `cli.tsx` 中，`feature()` 被注入为始终返回 `false`。这意味着除非你在 `~/.claude/feature-flags.json` 中覆盖，否则所有 Anthropic 内部功能在此构建中都是死代码。

**关于 React Compiler 输出：** 整个代码库中的组件都有反编译的 memoization 模板代码（`const $ = _c(N)`）。这是 React Compiler 的预期输出，运行时正常工作。

**关于构建：** `bun build src/entrypoints/cli.tsx --outdir dist --target bun` 产生单个约 26 MB 的文件。无需 webpack、esbuild 或 rollup。只有 Bun。

### 单仓结构

```
claude-code-reimagined/
|-- src/
|   |-- entrypoints/        # CLI 入口点 + SDK stub
|   |   `-- cli.tsx          # 真正入口（polyfills、MACRO 注入）
|   |-- main.tsx             # Commander.js CLI 定义
|   |-- query.ts            # 核心 API 查询循环
|   |-- QueryEngine.ts       # 对话状态编排器
|   |-- screens/            # Ink UI 屏幕（REPL、Resume 等）
|   |-- tools/              # 50+ 自包含工具模块
|   |-- services/
|   |   |-- api/            # 多 Provider API 客户端
|   |   |-- mcp/            # Model Context Protocol（24 个文件）
|   |   |-- permissions/   # 权限引擎
|   |   |-- compact/        # 对话压缩
|   |   `-- ...
|   |-- components/          # React/Ink 终端 UI 组件
|   |-- commands/           # 70+ 斜杠命令
|   |-- state/              # Zustand 风格应用状态
|   |-- utils/              # 功能开关、模型路由、配置
|   `-- types/              # 全局类型、消息类型、权限
|-- packages/
|   |-- color-diff-napi/    # 完整实现（语法高亮 diff）
|   |-- audio-capture-napi/ # Stub
|   |-- image-processor-napi/# Stub
|   |-- @ant/               # Anthropic 内部包 stub
|   `-- ...
|-- tests/                   # 35 个测试文件，1,419 个测试通过
`-- dist/                   # 构建输出（单文件打包）
```

</details>

---

## 贡献指南

这个项目发展很快 -- Opus 在后台运行持续优化。虽说如此：

- **Issue：** 欢迎。Bug 报告、功能想法、关于内部实现的问题 -- 都可以。
- **Pull Request：** 目前不接受 PR，因为代码库正在大量自动化转型。随着情况稳定，这可能会改变。
- **Fork：** 鼓励 Fork。Clone 或下载 zip（由于变化速度快，fork 可能无法正确跟踪）。构建一些疯狂的东西。

私人咨询：`claude-code-best@proton.me`

---

## 许可证

**双许可** · 详见 [LICENSING.md](./LICENSING.md) 完整映射 + 兼容性矩阵。

| 部分 | 许可证 | 文件 |
|------|--------|------|
| 源代码、测试、基准、脚本、配置、开发者文档 | **Apache License 2.0** | [LICENSE-APACHE](./LICENSE-APACHE) |
| 研究论文文本、长文叙述 | **CC BY-NC-ND 4.0** | [LICENSE-CC-BY-NC-ND](./LICENSE-CC-BY-NC-ND) |

所有代码 Apache 2.0 授权，可被其他 Apache 兼容开源项目自由引用集成（含 EverMind-AI/EverOS 等）。

<p align="right"><a href="#目录">↑ 顶部</a></p>

---

> [!NOTE]
> 本项目**源自教育和研究目的**。原始 Claude Code 的所有权利归 [Anthropic](https://www.anthropic.com/) 所有。这是一个对他们工作的逆向工程研究，不是官方产品。请负责任地使用。
>
> 混合检索架构、基准 harness、以及 `src/services/retrieval/` 等目录的所有原创代码均为 @Fearvox 原创工作，独立受 EverMemOS（arxiv 2601.02163）公开设计启发。

<p align="center">
  <a href="https://github.com/Fearvox/Evensong"><b>github.com/Fearvox/Evensong</b></a>
</p>
<p align="center">
  <i>从反编译到工程化。从黑箱到开放平台。从单一 LLM 到混合检索与再排。</i>
</p>

<p align="center">
  <a href="https://github.com/Fearvox/Evensong/issues/new/choose">提 Issue</a> ·
  <a href="https://github.com/Fearvox/Evensong/discussions">开 Discussion</a> ·
  <a href="https://github.com/Fearvox/Evensong">Star</a> ·
  <a href="https://github.com/Fearvox/Evensong/fork">Fork</a>
</p>
