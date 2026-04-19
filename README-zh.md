<h1 align="center">Evensong</h1>

<p align="center">
  <em>逆向工程 Claude Code · 真能扩容的混合记忆检索<br/>
  <strong>648 次盲测 · 跨 LLM 设计 · 全部原始数据公开 committed</strong></em>
</p>

<p align="center">
  <a href="./README.md">🇺🇸 English</a> · <a href="./README-zh.md">🇨🇳 中文</a>
</p>

<p align="center">
  <a href="https://github.com/Fearvox/Evensong"><img src="https://img.shields.io/badge/Evensong-161A1D?style=for-the-badge&logo=github&logoColor=white" alt="Evensong"/></a>
  <a href="./LICENSE-APACHE"><img src="https://img.shields.io/badge/%E4%BB%A3%E7%A0%81-Apache_2.0-3B82F6?style=for-the-badge&logo=apache&logoColor=white" alt="代码: Apache 2.0"/></a>
  <a href="./LICENSE-CC-BY-NC-ND"><img src="https://img.shields.io/badge/%E7%A0%94%E7%A9%B6-CC_BY--NC--ND_4.0-6B7280?style=for-the-badge&logo=creative-commons&logoColor=white" alt="研究: CC BY-NC-ND 4.0"/></a>
  <a href="./README.md"><img src="https://img.shields.io/badge/%E5%8F%8C%E8%AF%AD-EN%20%2B%20ZH-FF6B35?style=for-the-badge&logo=translate&logoColor=white" alt="双语"/></a>
</p>

<p align="center">
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/%E8%BF%90%E8%A1%8C%E6%97%B6-Bun-F472B6?style=for-the-badge&logo=bun&logoColor=white" alt="Bun"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-100%25-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
  <a href="./benchmarks/runs"><img src="https://img.shields.io/badge/%E5%9F%BA%E5%87%86-648%E6%AC%A1%E7%9B%B2%E6%B5%8B-F59E0B?style=for-the-badge&logo=lightning&logoColor=white" alt="648 次盲测"/></a>
  <a href="https://github.com/EverMind-AI/EverOS"><img src="https://img.shields.io/badge/%E5%AF%B9%E8%AF%9D-EverOS-00D4AA?style=for-the-badge&logo=brain&logoColor=white" alt="对话 EverOS"/></a>
</p>

<p align="center">
  <a href="#-%E6%A0%B8%E5%BF%83%E6%95%B0%E6%8D%AE">📊 <strong>核心数据</strong></a>
  &nbsp;·&nbsp;
  <a href="#-%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B">⚡ 快速开始</a>
  &nbsp;·&nbsp;
  <a href="#-%E6%9E%B6%E6%9E%84">🏗 架构</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Fearvox/Evensong/discussions">💬 讨论区</a>
</p>

---

## 目录

- [这是什么](#这是什么)
- [📊 核心数据](#-核心数据)
- [🏗 架构](#-架构)
- [⚡ 快速开始](#-快速开始)
- [📁 目录结构](#-目录结构)
- [🧩 Retrieval API](#-retrieval-api)
- [📚 研究参考](#-研究参考)
- [🤝 贡献](#-贡献)
- [📄 许可证](#-许可证)
- [🙏 致谢](#-致谢)

---

## 这是什么

一个**逆向工程、可修改**的 Anthropic Claude Code CLI 实现，加上一套 **production 级混合检索基准套件**，用于 agent 记忆系统评估。

本仓库存在的三个目的：

| 目的 | 具体意义 |
|---|---|
| **学习** | 在不依赖闭源二进制的前提下，从源码层面研究 Claude Code 的工作方式 |
| **扩展** | 自定义 agent 工具、检索流水线、遥测——模块间不是胶水粘死的，可以换 |
| **基准测试** | 以可复现证据评估 Retrieve-and-Rerank (RaR) 架构——EverMemOS §3.4 立的 bar，用我们的数字度量 |

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

## 📊 核心数据

200 条知识库 · **648 次盲测**（108 道生成查询 × 2 条流水线 × 3 次重复）· 跨 LLM 设计杜绝自关联偏倚：出题 = `grok-3`，答题 = `deepseek/deepseek-v3.2`。

| 流水线 | Top-1 准确度 | p50 延迟 | p90 延迟 | Prompt Token 成本 |
|--------|-------------|----------|----------|-------------------|
| LLM 直判 | 76.9% (249/324) | 2056 ms | 3595 ms | 100% (200 entries) |
| **Hybrid BM25 + LLM Rerank** | **79.3%** (257/324) | **1509 ms** | **2725 ms** | **25%** (50 entries) |

**Hybrid 双面赢**：准确度 +2.5pp **同时** 延迟 p50 -27% / p90 -24%，LLM prompt token 成本砍 75%。3 次跑 stddev 0.00–0.44pp——差距远超测量噪声。

一条命令复现：

```bash
bun run scripts/benchmark-hybrid-scale.ts \
  --runs=3 --with-body \
  --queries-file=benchmarks/wave3f-generated-queries-2026-04-19.json
```

原始 JSONL + Markdown 摘要存于 [`benchmarks/runs/`](./benchmarks/runs)。生成器 prompt 也 committed——审阅者可直接 audit 查询是怎么出的。

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

## 🏗 架构

```
┌─────────────────────────────────────────────────────────────────┐
│  CCR — 逆向工程的 Claude Code 运行时                             │
│  src/entrypoints/cli.tsx → src/main.tsx → src/screens/REPL.tsx  │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  检索流水线（Wave 3+）                                           │
│                                                                 │
│   manifestBuilder   BM25 索引       atomicProvider              │
│   (读 vault →       (tokenize,      (LLM Rerank，                │
│    VaultManifest)    score, topK)   走 Atomic Chat 网关)         │
│         │              │                    │                   │
│         └──────────────┴────────┬───────────┘                   │
│                                 ▼                               │
│                         hybridProvider                          │
│                  (stage1 → 收窄 → stage2)                       │
│                                 ▼                               │
│                         vaultRetrieve                           │
│                       (回退链编排)                              │
└─────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Atomic Chat 网关 (http://127.0.0.1:1337/v1)                    │
│  统一 OpenAI 兼容端点，代理：                                    │
│    • deepseek/deepseek-v3.2 (主 judge)                          │
│    • grok-3, grok-4-*-fast-reasoning (xAI)                      │
│    • MiniMax-M2.7, qwen/qwen3.6-plus, openrouter/auto:free      │
│    • 本地 Gemma-4-E4B via llama.cpp (离线兜底)                   │
└─────────────────────────────────────────────────────────────────┘
```

详细开发者注释见 [`AGENTS.md`](./AGENTS.md) 和 [`CLAUDE.md`](./CLAUDE.md)。

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

## ⚡ 快速开始

**前置条件**：[Bun](https://bun.sh) 1.3+（Node.js 不兼容）。检索功能需 Atomic Chat 运行在 `127.0.0.1:1337`（[文档](https://atomicchat.io)）。

```bash
# 1. 安装
bun install

# 2. 开发模式 REPL
bun run dev

# 3. 构建单文件 bundle (~27MB)
bun run build      # → dist/cli.js

# 4. 运行检索测试套件
bun test src/services/retrieval src/services/api

# 5. 对真实 vault 临时检索
bun run scripts/vault-recall.ts "超图记忆用于长对话"

# 6. 复现 648 次盲测的 Hybrid vs LLM-only benchmark
bun run scripts/benchmark-hybrid-scale.ts --runs=3 --with-body \
  --queries-file=benchmarks/wave3f-generated-queries-2026-04-19.json
```

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

## 📁 目录结构

```
src/                 逆向工程的 CCR 核心（CLI, REPL, 工具, 状态）
src/services/
  api/localGemma.ts           Atomic Chat OpenAI 兼容客户端 + 模型 registry
  retrieval/                  Hybrid RaR + manifest builder + BM25 + providers
packages/
  research-vault-mcp/         research vault 的 MCP 服务（npx-ready）
scripts/
  benchmark-hybrid-scale.ts       规模基准 harness (--runs, --concurrency)
  benchmark-judge.ts              单流水线 judge 基准
  generate-benchmark-queries.ts   跨 LLM 查询生成器（grok-3）
  vault-recall.ts                 临时检索的 CLI 入口
  dogfood-wave2b.ts               模型对比 harness
benchmarks/
  wave3f-generated-queries-*.json  108 道查询集，committed 保证可复现
  wave3-judge-queries.json         原始 20 道手写查询集
  runs/                            原始 JSONL + Markdown 摘要
docs/                 设计 specs、计划、debug 笔记
tests/                回归 + 集成测试
services/             benchmark 内部使用的 8-服务微服务套件
api/                  HTTP relay / provider 回退链
```

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

## 🧩 Retrieval API

库调用 —— 手工组合 hybrid 流水线做自定义流程：

```ts
import { createLocalGemmaClient, ATOMIC_MODELS } from 'src/services/api/localGemma'
import { createAtomicProvider } from 'src/services/retrieval/providers/atomicProvider'
import { createBM25Provider } from 'src/services/retrieval/providers/bm25Provider'
import { createHybridProvider } from 'src/services/retrieval/providers/hybridProvider'
import { buildVaultManifest } from 'src/services/retrieval/manifestBuilder'
import { vaultRetrieve } from 'src/services/retrieval/vaultRetrieve'

const manifest = await buildVaultManifest({ vaultRoot: '_vault', withBody: true })

const hybrid = createHybridProvider({
  stage1: createBM25Provider(),
  stage2: createAtomicProvider(
    createLocalGemmaClient({ model: ATOMIC_MODELS.DEEPSEEK_V32 })
  ),
  stage1TopK: 50,
})

const result = await vaultRetrieve(
  { query: '超图记忆用于长期对话', manifest, topK: 5 },
  { providers: [hybrid] },
)
```

**可用 provider**：`createAtomicProvider`、`createBM25Provider`、`createHybridProvider`。全部实现 `VaultRetrievalProvider` 契约——组合或互换皆自由。

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

## 📚 研究参考

本项目与最近发表的 agent 记忆系统工作保持对话：

| 工作 | 参考 | 我们如何使用 |
|---|---|---|
| **EverMemOS** | [arxiv 2601.02163](https://arxiv.org/abs/2601.02163)（EverMind / 盛大） | 采纳 §3.4 两阶段设计。stage 2 简化为直接 listwise 判断（舍弃 verifier 循环）。 |
| **HyperMem** | arxiv 2604.08256 | 三层超图记忆——引用为相关工作。 |
| **MemGPT** | arxiv 2310.08560 | LLM 作 OS 分页；基准集里包含 MemGPT 类查询。 |
| **MSA** | arxiv 2604.08256 | Memory Sparse Attention——未集成，用于基准对比。 |
| **Reflexion** | arxiv 2303.11366 | 自反思 agents——查询集含 Reflexion 式任务。 |
| **Extended Mind** | Clark & Chalmers 1998 | 外部记忆即认知的哲学支撑。 |

完整的 108 道查询测试集（含 provenance）见 [`benchmarks/wave3f-generated-queries-2026-04-19.json`](./benchmarks/wave3f-generated-queries-2026-04-19.json)。

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

## 🤝 贡献

欢迎 PR——尤其在：

- **稠密向量 stage 1** provider（BGE-M3 集成、与 BM25 的 RRF 融合）
- **自适应门控**（BM25 置信度高时跳过 stage 2——calibration 数据已 committed 在 `benchmarks/runs/`）
- **更多模型连接器**，走 `atomicProvider` 工厂
- **新基准类别**（对抗式查询、多意图、否定陷阱）
- **Vault 规模扩展**实验（100 / 500 / 1000+ entries）

模板已就位：

- 🐛 [Bug 报告](.github/ISSUE_TEMPLATE/bug_report.yml)
- ✨ [功能提议](.github/ISSUE_TEMPLATE/feature_request.yml)
- 📊 [基准报告](.github/ISSUE_TEMPLATE/benchmark_report.yml)
- 🔀 [Pull Request 模板](.github/PULL_REQUEST_TEMPLATE.md)
- 💬 [讨论区](https://github.com/Fearvox/Evensong/discussions)——ideas、Q&A、show-and-tell、benchmarks

非 trivial PR 请先开 issue 对齐 shape。

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

## 📄 许可证

**双许可**。逐目录映射 + 兼容性矩阵见 [LICENSING.md](./LICENSING.md)。

| 适用 | 许可证 | 文件 |
|---|---|---|
| 源代码、测试、基准、脚本、配置、开发者文档 | **Apache License 2.0** | [LICENSE-APACHE](./LICENSE-APACHE) |
| 研究论文、长文叙述 | **CC BY-NC-ND 4.0** | [LICENSE-CC-BY-NC-ND](./LICENSE-CC-BY-NC-ND) |

所有代码 Apache 2.0 授权，可被其他 Apache 兼容开源项目自由引用集成（含 [EverMind-AI/EverOS](https://github.com/EverMind-AI/EverOS)）。

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

## 🙏 致谢

作者：**[Fearvox / 0xVox](https://github.com/Fearvox)**（朱珩源 / Hengyuan Zhu）。

CCR 运行时是对 Anthropic Claude Code CLI 的 clean-room 逆向工程研究。所有识别性字符串、遥测端点和内部 API 已 stub 或移除。本仓库不主张任何 Anthropic 商标或原始二进制设计的所有权。

混合检索架构、基准 harness、以及 `src/services/retrieval/`、`scripts/benchmark-*.ts`、`benchmarks/wave3*` 中的所有原创代码均为原创工作，独立受 EverMemOS 公开设计启发。

<p align="right"><a href="#目录">↑ 回目录</a></p>

---

<p align="center">
  <strong>如果你基于此做了自己的 agent 记忆系统，欢迎告诉我们。</strong>
</p>

<p align="center">
  <a href="https://github.com/Fearvox/Evensong/issues/new/choose">提 Issue</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Fearvox/Evensong/discussions">开 Discussion</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Fearvox/Evensong">⭐ Star</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Fearvox/Evensong/fork">Fork</a>
</p>
