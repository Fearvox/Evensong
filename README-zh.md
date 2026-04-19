<h1 align="center">Evensong</h1>

<p align="center">
  <em>逆向工程 Claude Code · 真能扩容的混合记忆检索<br/>
  <strong>两份正式 artifact（648 + 972 次盲测）· 跨 LLM 设计 · 全部原始数据公开 committed</strong></em>
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
  <a href="./benchmarks/runs"><img src="https://img.shields.io/badge/%E5%9F%BA%E5%87%86-972%2B648%E6%AC%A1%E7%9B%B2%E6%B5%8B-F59E0B?style=for-the-badge&logo=lightning&logoColor=white" alt="972+648 次盲测"/></a>
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

**两份独立正式 artifact**，同 harness、同 108 道跨 LLM 测试题（出题 = `grok-3`，答题 = `deepseek/deepseek-v3.2`）、同 200 条 manifest（18 条真实 `_vault` + 182 条合成 junk）。两次 raw 数据均已 commit 至 [`benchmarks/runs/`](./benchmarks/runs)。只是跑在 Atomic Chat gateway 的不同负载窗口下。

### Wave 3+F — 648 次两流水线对比 ✅

| 流水线 | Top-1 准确度 | p50 延迟 | p90 延迟 | Prompt Token 成本 |
|--------|-------------|----------|----------|-------------------|
| LLM 直判 | 76.9% (249/324) | 2056 ms | 3595 ms | 100% (200 entries) |
| **Hybrid BM25 + LLM Rerank** | **79.3%** (257/324) | **1509 ms** | **2725 ms** | **25%** (50 entries) |

原始 artifact：[`benchmarks/runs/wave3d-hybrid-scale-2026-04-19T1220.md`](./benchmarks/runs/wave3d-hybrid-scale-2026-04-19T1220.md)。3 次跑 stddev 0.00–0.44pp。

### Wave 3+G — 972 次三流水线正式复测 ✅

| 流水线 | Top-1 | p50 | p90 | Avg 延迟 | LLM 调用 |
|--------|-------|-----|-----|---------|---------|
| LLM 直判 | 77.8% (252/324) | 3861 ms | 6404 ms | 4139 ms | 100% (200 entries) |
| Hybrid BM25 + LLM Rerank | 77.5% (251/324) | 2919 ms | 4669 ms | 3248 ms | 100% (50 entries) |
| **Adaptive Hybrid** | **73.1%** (237/324) | **2519 ms** | **4376 ms** | **2365 ms** | **73%**（27% 跳过） |

原始 artifact：[`benchmarks/runs/wave3g-pipelines-2026-04-19T1652.md`](./benchmarks/runs/wave3g-pipelines-2026-04-19T1652.md)。墙钟时间 **10.5 min**。3 次跑 stddev：llm-only 0.76pp · hybrid 1.15pp · adaptive 0.76pp。

### 两次跑都站得住的结论

| 指标 | Wave 3+F (648 次) | Wave 3+G (972 次) | 结论 |
|------|-------------------|-------------------|------|
| Hybrid vs LLM-only **延迟**（p50） | **−27%** | **−24%** | ✅ 延迟优势稳定 |
| Hybrid **prompt token 成本** | **−75%** | **−75%** | ✅ 完全一致 |
| Hybrid vs LLM-only **top-1 准确度** | **+2.5pp** | **−0.3pp**（持平） | ⚠️ 跑间方差存在，落在 per-run stddev 的 2σ 内 |
| Adaptive **跳过率** | — （未跑） | **26.9%** | ✅ 精确命中内部 prelim 的 27% |
| Adaptive **top-1** | — | **73.1%** | ✅ 精确命中内部 prelim |

### 诚实解读

- **延迟 + token 成本优势是稳的赢。** 两次跑都一致：BM25 stage 1 收窄 LLM 输入池，能节省 22–27% p50 延迟 + 75% prompt token。这是能 ship 的 claim。
- **准确度优势比首次测量要 noisier。** Wave 3+F 测出 Hybrid 相对 LLM-only 领先 +2.5pp。Wave 3+G 的 972 次复测捕捉到的是持平（−0.3pp）。per-run stddev（0.8–1.2pp）+ API 负载时段方差一起足以覆盖这个 delta。请把 Hybrid 理解为 *"vs LLM-only 准确度持平到微胜，且带稳定的延迟 + token 成本优势"*——不是严格的准确度赢家。
- **Adaptive 层才是真正的新贡献。** 见下一节——用 −4.7pp 准确度换 −43% 平均延迟 + 27% 查询完全零 LLM 调用，且是三条流水线中 per-run 方差最稳的（0.76pp）。

一条命令复现（产出 Wave 3+G 的 artifact）：

```bash
bun run scripts/benchmark-hybrid-scale.ts \
  --runs=3 --with-body \
  --pipelines=llm-only,hybrid,adaptive \
  --queries-file=benchmarks/wave3f-generated-queries-2026-04-19.json
```

生成器 prompt 也 committed——审阅者可直接 audit 查询是怎么出的。

### 自适应层（Wave 3+G，2026-04-19 ship）✅

always-rerank 的 Hybrid 每 query 付 1 次 LLM 调用。但对相当大比例的 query，BM25 自身就已经置信给出 top-1——继续付 LLM 只加延迟不换准确度。**`createAdaptiveHybridProvider`** 引入 gap-ratio 门禁：若 `BM25 scores[0] / scores[1] >= 1.5`，信任 stage 1 并 **完全跳过 LLM**；否则走 stage 2。

**正式 972 次数据**（3 runs × 108 queries，`benchmarks/runs/wave3g-pipelines-2026-04-19T1652.md`）：

- 跳过率：**26.9%**（87/324）—— BM25 置信时跳过 stage 2 LLM 调用
- 跳过分支 top-1：**58.6%**（51/87）—— BM25 自信时单独上有约 59% 概率对
- 未跳过分支 top-1：**78.5%**（186/237）—— LLM 解决 BM25 模糊情况
- 整体 Adaptive top-1：**73.1%** —— 与内部 preliminary dogfood 精确吻合
- 延迟：**avg 2365 ms / p90 4376 ms**（vs always-rerank hybrid 3248 / 4669，vs llm-only 4139 / 6404）
- Per-run stddev：**0.76pp** —— 三条流水线中最稳的

**代价**：vs llm-only top-1 -4.7pp，换 **avg 延迟 -43%**。门禁是可调旋钮：`gapRatioThreshold: 1.3` 提升跳过率但准确度下降；`2.0` 则回到接近 Hybrid 的状态。

**对 EverOS 的定位**：填充 EverOS 已公开的 Fast 层（0 LLM 调用，200-600 ms）与 Agentic 层（1-3 LLM 调用，2-5 s）之间的空白——**Adaptive Hybrid 是 0 _或_ 1 次条件性 LLM 调用，且带用户可调门禁旋钮**。不在任何已公开的 EverOS / EverMemOS / HyperMem 设计覆盖范围内。

见 [`src/services/retrieval/providers/adaptiveHybridProvider.ts`](./src/services/retrieval/providers/adaptiveHybridProvider.ts) 以及 `adaptiveHybridProvider.test.ts` 中的 7 个单元测试。Shipped at [`86bb4ee`](https://github.com/Fearvox/Evensong/commit/86bb4ee)。**66/66 retrieval domain 测试通过。**

### Wave 3+H 预告 — 稠密 stage 1 + RRF 融合（初步，未进 headline）🟡

一条基于 BGE-M3（通过 Tailscale 到 ccr-droplet）的稠密检索分支和一个 k=10 的 Reciprocal Rank Fusion provider 已 ship 代码，但**没有**进上方 headline 总结。代码落在 [`5f2a646`](https://github.com/Fearvox/Evensong/commit/5f2a646)；Codex 对抗审查后的修复（availability probe 真查 /embeddings、RRF 加 timeout + skip-unavailable、smoke harness 改 sequential 消除 dense 自干扰）作为跟进 commit 落地。20q × 206-entry smoke 初步数据（手写参考 set）：BGE 单独 20/20 (100%)、BM25 单独 18/20 (90%)、RRF(BM25, BGE) 19/20 (95%)。初步 artifact：[`benchmarks/runs/wave3h-smoke-bge-rrf-*.md`](./benchmarks/runs)。**请勿将此组数字作为 production 证据引用** —— 完整 108q × 3-run 跨 LLM 重跑 + RRF k-sweep (Phase 4/5) 待做。

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
│                                 │                               │
│                     adaptiveHybridProvider                      │
│              (BM25 gap ≥ 1.5× → 跳过 stage 2 LLM)               │
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
import { createAdaptiveHybridProvider } from 'src/services/retrieval/providers/adaptiveHybridProvider'
import { buildVaultManifest } from 'src/services/retrieval/manifestBuilder'
import { vaultRetrieve } from 'src/services/retrieval/vaultRetrieve'

const manifest = await buildVaultManifest({ vaultRoot: '_vault', withBody: true })

// Always-rerank Hybrid —— 每 query 付 1 次 LLM 调用换最高准确度。
const hybrid = createHybridProvider({
  stage1: createBM25Provider(),
  stage2: createAtomicProvider(
    createLocalGemmaClient({ model: ATOMIC_MODELS.DEEPSEEK_V32 })
  ),
  stage1TopK: 50,
})

// 自适应变体 —— BM25 自信 top-1 时跳过 LLM。
// 代价：top-1 -4.7pp 换 avg 延迟 -67%。见上方自适应层表格。
const adaptive = createAdaptiveHybridProvider({
  stage2: createAtomicProvider(
    createLocalGemmaClient({ model: ATOMIC_MODELS.DEEPSEEK_V32 })
  ),
  gapRatioThreshold: 1.5,  // scores[0] / scores[1] >= 1.5 时跳过 stage 2
})

const result = await vaultRetrieve(
  { query: '超图记忆用于长期对话', manifest, topK: 5 },
  { providers: [hybrid] },  // 或 [adaptive] 启用门禁变体
)
```

**可用 provider**：`createAtomicProvider`、`createBM25Provider`、`createHybridProvider`、`createAdaptiveHybridProvider`。全部实现 `VaultRetrievalProvider` 契约——组合或互换皆自由。

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

- **稠密向量 stage 1** provider（BGE-M3 集成、与 BM25 的 RRF 融合）🔴
- **自适应门控阈值自校准** —— 当前 1.5× gap-ratio 默认值是手选保守值；欢迎 PR 基于真实 query 分布 sweep 阈值（门禁本身已 ship 于 [`86bb4ee`](https://github.com/Fearvox/Evensong/commit/86bb4ee) ✅）
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

作者：**[Fearvox / 0xVox](https://github.com/Fearvox)**（朱恒源 / Hengyuan Zhu）。

CCR 运行时是对 Anthropic Claude Code CLI 的 clean-room 逆向工程研究。所有识别性字符串、遥测端点和内部 API 已 stub 或移除。本仓库不主张任何 Anthropic 商标或原始二进制设计的所有权。

上游沿袭：源自社区逆向工程基线 [github.com/claude-code-best/claude-code](https://github.com/claude-code-best/claude-code) (CCB)。CCR 在该基线上继续推进——新增基础设施、检索流水线、基准 harness 与打包工作。

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
