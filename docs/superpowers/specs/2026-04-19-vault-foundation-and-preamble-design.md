# Vault Foundation & Preamble Design

**Date**: 2026-04-19
**Author**: Nolan Zhu (0xvox) — via Claude Code (CCR, Opus 4.7 1M)
**Status**: Wave 1 Design — Draft, pending user approval
**Parent incident**: 40h REPL silent-swallow debug marathon (Phases 10-15, 2026-04-15 → 2026-04-19)

---

## 0. TL;DR

40h debug marathon 暴露的不是 REPL bug，是 **agent 行为规范基础设施断层**。今晚 Wave 1 搭文档化 + 低风险 infra 基础，明天 Wave 2 做破坏性清理，Wave 3 做跨 CLI 分发与 L0-L4 辐射。Wave 1 产出 5 个 artifact，**零产品代码改动，零破坏性动作**。

---

## 1. Motivation

### 1.1 Observed pain

| 症状 | 根因 |
|---|---|
| 40h REPL silent-swallow hunt (Phase 10-15) | 非单点 bug，而是 decompile 导出缺失 + MiniMax SSE 协议不兼容 + provider 抽象漏洞的**链式反应** |
| 每次 phase handoff 都让下一 session cold-start | 无跨 session 行为准则保鲜机制 |
| EverMem hook 7h data-loss window (04-18) | env var 假设失效 + 双 key 冗余 ≠ 真冗余（同账号） |
| vault MCP 搜 "REPL silent swallow" 返回 0 results | amplify API key 未配 + 真 vault 在 `_vault/` untracked |
| 10 条行为违规 chain reaction（Q1 诊断） | 分散的 CLAUDE.md / MEMORY.md / vault 文件，无统一入口 |

### 1.2 Root diagnosis

**不是"删掉了事"问题**：paper-level persistent memory 已有实证价值（Evensong R012-E benchmark, +157-900% test density growth, CV=0.087 repeatability）。

**是"基础设施断层"问题**：
- vault MCP RAG 层（amplify）**未配置** → 任何 CLI 查 vault rules 返回空
- `research-vault/` submodule **未 init**（只有 1 个 stub `Evensong-HF-ModelCard.md`）
- 真正的 vault 在 `_vault/`（untracked，~80MB+ 含 `飙马野人/` 敏感商单）
- 行为准则**分 5 层散落**（L0 哲学 / L1 agent 协议 / L2 个人偏好 / L3 skill / L4 专项 setup），无 single entry point
- 跨 CLI（CCR / Desktop Cowork / Hermes / Codex / Copilot）**无分发机制**，每端 cold-start

### 1.3 Why tonight

类比 benchmark infra 先行原则：**没 infra，产品再牛也不 robust**。今晚 Wave 1 先把文档化 + 低风险动作 ship，为 Wave 2/3 的破坏性动作与跨 CLI 分发铺基础。疲劳期不做破坏性动作（参考 Phase 15 "4 次 recurrence" 反模式）。

---

## 2. Scope (Wave 1 ONLY)

### 2.1 In-scope — 5 个 artifact + 1 个 push

| # | Artifact | 位置 | 目的 |
|---|---|---|---|
| 1 | `REFERENCE-PROFILE-HANDOFF-PATTERN.md` + `HANDOFF-TEMPLATE-AGENT-TO-AGENT.md` | `_vault/`（push 到 `Fearvox/ds-research-vault`） | L1 canonical 协议（2026-04-18 sanctified）push 到 private source of truth |
| 2 | `repo-inventory-20260419.json` | `_vault/infra/` | `gh repo list Fearvox` 全量 dump，作为 Fearvox/* 屎山基线实证 |
| 3 | `CLEANUP-DECISIONS.md` | `_vault/infra/` | 25 Fearvox repo 每个 keep/delete/archive/rename 决策表 + 用户审批 checkbox（Wave 2 执行前置） |
| 4 | `MASTER-PREAMBLE-INDEX.md` v0.1 | `_vault/` 顶层 | Single entry point 骨架：L0-L4 索引 + Known Agent Surfaces 注册表 + 跨 CLI 读取顺序 |
| 5 | `2026-04-19-vault-foundation-and-preamble-design.md` | `docs/superpowers/specs/`（本 spec） | Wave 1/2/3 governance doc |

**Commit 顺序**（独立 atomic，符合 L1 七原则）：

```
_vault repo:
  C1: feat(L1): canonical agent-to-agent handoff protocol
  C2: feat(infra): baseline repo inventory + cleanup decisions
  C3: feat(preamble): MASTER-PREAMBLE-INDEX v0.1 skeleton

CCR repo:
  C4: docs(specs): vault foundation & preamble design (Wave 1-3)
```

### 2.2 Out-of-scope — 今晚 Hard Rules

- ❌ `src/**` 产品代码任何修改
- ❌ Phase 15 REPL 5 sub-bug 任何 touch（#1 startup activeProvider desync / #2 tools forward / #3 format adapter / #4 AgentTool routing / #5 harness batch）
- ❌ 25 Fearvox repo 任何破坏性动作（delete / archive / rename / settings 改）
- ❌ amplify API key 配置
- ❌ `research-vault/` submodule declaration 清理（CCR 的 `.gitmodules` 不动）
- ❌ MCP package (`packages/research-vault-mcp/`) publish 或 npx/bun 分发
- ❌ L0-L4 辐射头块（每个 vault md 顶部 `上级 ref / 下级 ref` block）批量添加
- ❌ 其他 CLI（Desktop Cowork / Hermes / Codex / Copilot / Cursor）的 preamble hook 集成或任何 settings 改动
- ❌ DASH Cowork project 目录（`/Users/0xvox/Documents/Claude/Projects/DASH Cowrk - Slock - Slack - Code Web - Other CLI Ult Interface/`）内容 touch — 只 reference 路径，不读 RTF 内容
- ❌ `~/.claude/` 全局配置改动
- ❌ EverMem hook 改动或 settings.json 改动

---

## 3. Architecture

### 3.1 物理布局

```
_vault/                                                    (git: Fearvox/ds-research-vault, PRIVATE)
├── MASTER-PREAMBLE-INDEX.md                              ← 新 v0.1：single entry point
├── REFERENCE-PROFILE-HANDOFF-PATTERN.md                  ← Wave 1 `git add` + push
├── HANDOFF-TEMPLATE-AGENT-TO-AGENT.md                    ← Wave 1 `git add` + push
├── PHILOSOPHICAL-INTEGRITY-ANCHOR-L0.md                  (已存在，L0)
├── HANDOFF-EVENSONG-EN.md                                (已存在，L1 实例)
├── EVOLUTION-LAYER-INDEX.md                              (已存在)
├── CROSS-REF-EVEROS.md                                   (已存在)
├── .claude/CLAUDE.md                                     (已存在，vault 自身 agent 声明)
├── .claude/skills/{ingest,analyze,maintain}/SKILL.md     (已存在，L3)
├── knowledge/ raw/ summaries/ scripts/                   (已存在，research content)
└── infra/                                                ← 新目录：vault 自身 infra metadata
    ├── repo-inventory-20260419.json                      ← 新
    └── CLEANUP-DECISIONS.md                              ← 新

claude-code-reimagine-for-learning/                        (git: Fearvox/Evensong, PRIVATE)
└── docs/superpowers/specs/
    └── 2026-04-19-vault-foundation-and-preamble-design.md ← 新（本 spec）
```

### 3.2 L0-L4 分层策略（按用户 Q6 选 C — 按 Layer 切分）

| Layer | 定位 | Private (ds-research-vault) | Public (dash-research-vault) | 示例文件 |
|---|---|---|---|---|
| **L0** 哲学锚定 | 不可变 raw human state | ✓ | ✗ **private-only** | `PHILOSOPHICAL-INTEGRITY-ANCHOR-L0.md` |
| **L1** Agent-to-Agent 协议 | Canonical handoff 7 原则 | ✓ (Wave 1 push) | → Wave 3: `05-rules/L1/` | `REFERENCE-PROFILE-HANDOFF-PATTERN.md`, `HANDOFF-TEMPLATE-AGENT-TO-AGENT.md` |
| **L2** 身份+偏好 | 个人化 rule/taste/context | ✓ (selective) | ✗ **private-only** | CLAUDE.md / MEMORY.md / EverMem feedback |
| **L3** Skill 级 | 可复用 skill 实现 | ✓ | → Wave 3: `05-rules/L3/` | `_vault/.claude/skills/{ingest,analyze,maintain}/SKILL.md` |
| **L4** 专项 setup | 为特定 user/assistant 定制模板 | ✓ | ✗ **private-only** | `docs/yuze-assistant-setup.md`, `docs/usc-database-integration-manual.md` |

**Wave 1 不执行** public subset 的建立 — 仅在 MASTER-PREAMBLE-INDEX.md v0.1 里声明分层方针。

### 3.3 Known Agent Surfaces (v0.1 初始注册表)

MASTER-PREAMBLE-INDEX.md 内含的 Agent 入口枚举。Wave 1 填充已知项，Wave 3 补齐未知项。

| Agent Surface | Project 路径 | 工作方向 | 备注 |
|---|---|---|---|
| **CCR (Claude Code CLI)** | `/Users/0xvox/claude-code-reimagine-for-learning/` | reverse-engineered Claude Code CLI 开发 | 本 spec 生成地 |
| **Claude Desktop Cowork — DASH Auto Research** | `/Users/0xvox/Documents/Claude/Projects/DASH Cowrk - Slock - Slack - Code Web - Other CLI Ult Interface/` | auto research 方向 + 平面设计准则学习 | L1 canonical handoff example 发件地（04-18 DS-REPL-OR-ELEPHANT-ALPHA handoff 生成于此）；Wave 1 **只 reference 路径，不读内容** |
| **Atomic Chat** (Mac desktop app) | `http://127.0.0.1:1337/v1` OpenAI-compat local API | Local LLM inference (Gemma 4 + custom via llama.cpp/MLX) | 截图 + memory 双源确认：active model `Gemma-4-E4B-Uncensored-Q4_K_M`；backend `turboquant-macos-arm64`；provider 列表含 MLX/OpenAI/Anthropic/OpenRouter/Mistral/Groq/xAI/Gemini/MiniMax；CCB/CCR 已预配 local provider（`project_r009_strategy.md`）；§3.4 Wave 1 retrieval primary LLM |
| **Hermes** | (Wave 3 补) | (Wave 3 补) | `.hermes/skills/` 已存在为 gstack host |
| **Codex** | (Wave 3 补) | (Wave 3 补) | `codex:codex-cli-runtime` 已存在 |
| **Copilot CLI** | (Wave 3 补) | (Wave 3 补) | `superpowers/references/copilot-tools.md` 已存在 |
| **Cursor** | (Wave 3 补) | (Wave 3 补) | `.cursor/skills/gstack-*` 已存在 |

### 3.4 Retrieval System (Unified Multi-Signal Ranker, Local-First)

**Framing**: 这是 **一个 multi-signal ranking problem** (Manning IR §6)，不是 "hybrid retrieval + LLM judge + decay lifecycle" 三子系统。vault 已有的 decay 和 summary 层是 ranker 的 **features**，LLM re-rank 是可选后处理（per `/data-algo` 第一性审视 2026-04-19）。

**统一 scoring function**:

```
score(d, q, t) = 0.35·BM25(q, d)
               + 0.35·cosine(embed(q), embed(d))
               + 0.15·exp(-(t - lastAccess)/stability)
               + 0.10·log1p(accessCount)/log1p(MAX_ACCESS)
               + 0.05·summary_level_weight(d)
```

权重初始 heuristic；未来可由 click-through data fit (LambdaMART/XGBoost，Wave 5+)。

**Wave 1 (ship tonight) — Manifest-Driven Local LLM Direct**:
- 有效范围 n ≤ 870 md（manifest ~150 token/file × 870 < xAI 131K；Gemma 4 E4B 本地 128K context）
- **Primary LLM**: Atomic Chat local `Gemma-4-E4B-Uncensored-Q4_K_M`（`http://127.0.0.1:1337/v1` OpenAI-compat endpoint；CCB/CCR 已预配 per `project_r009_strategy.md` memory）
- **Fallback chain (4 层)**: Gemma local → `xai-fast` (grok-4-1-fast-reasoning) → `minimax-m27` → `openrouter/qwen/qwen3.6-plus` → `openrouter/meta-llama/llama-3.1-8b-instruct:free`
- **Cost**: ~$0（local-first，电费为主；云 overflow 时 ~$0.0001/query）
- **Latency**: ~300-500ms（Apple Silicon Gemma 4 Q4 推理）
- 实现：复用 CCR `src/services/api/withRetry.ts` PR #7 fallback 架构 + 新增 local Gemma 适配器

**Wave 3+ 升级 — Unified Multi-Signal Ranker**:
- Stage 1: BM25 inverted index + dense embedding → RRF 融合 → min-heap top-k (CLRS §6.5)
- Stage 2 (optional): Gemma local listwise re-rank，仅当 `k>20` 且 query 语义复杂时触发
- Data structures: HashMap inverted index / Flat cosine (n<1000) or HNSW (n≥1000) / Min-heap size k / LRU content cache (50 entries)

**Embedding layer** (Wave 3+):
- **Primary**: `Qwen3-Embedding-4B` via **Atomic MLX provider**（对齐 EverMemOS prior art；Apple Silicon 原生加速；Q4 版本 ~2-3GB VRAM，可与 Gemma 4 并发驻留 unified memory）
- **Fallback**: `BGE-M3` via **Cloudflare Workers AI**（10K req/day 永久免费；零运维）
- **不用**: OpenAI `text-embedding-3-small` / Voyage 等付费云端 embedding（本地 MLX + CF free 双 fallback 足够）

**Hierarchical summary retrieval** (HyperMem-inspired cheap analog):
- Stage 1a: BM25+dense **只**在 `_vault/summaries/{deep,shallow}/*.md`（~2KB/file，avg 20% raw size）→ top-30
- Stage 1b: 对 top-30 对应 raw md 做 second-stage retrieval → top-10
- Stage 2: LLM judge top-10
- **节省 ~80% 检索阶段 token volume** vs 全 raw 检索

**Routing policy** (对齐 `reference_provider_strategy.md` + `project_r009_strategy.md`):
- Simple manifest rerank / boilerplate scoring → **Local Gemma**（zero cost，~300ms）
- Multi-hop reasoning / cross-doc synthesis → xAI fast (速度) 或 MiniMax (质量)
- Batch offline decay 更新 → 不调 LLM，纯算法（已在 `_vault/scripts/decay.ts`）

**Prior art 基础**:
- **EverMemOS** (arxiv 2601.02163, EverMind/Shanda, 2026-01): engram lifecycle + LLM-orchestrated hybrid retrieval (BM25+Qwen3-Embedding-4B+RRF + GPT-4.1-mini verifier+rewriter). 93.05% LoCoMo, 89.74% LongMemEval knowledge update. **借用** Stage 1 hybrid 架构；**替换** Stage 2：verifier-rewriter loop → direct listwise LLM judge（LLM 调用 1-3→1，跳过 31% rewrite 分支）
- **HyperMem** (Evermind): 92.73% LoCoMo SOTA 三层超图 (Topic-Episode-Fact)。**不建 hypergraph**，用 vault 已有 summary 层级 (deep/shallow) 做 hierarchical retrieval 近似
- **MSA** (vault paper, Evermind/Shanda/PKU, 2025): end-to-end sparse attention (4B 击败 235B RAG)。**不采纳** — 需要 158.95B token 预训练 + 2×A800 GPU，Apple Silicon unified memory 不可行；远期 Wave 5+ 选项
- **MemGPT** (2023): LLM-as-OS RAM/Disk 类比。映射：chat context = RAM / vault md = Disk / composite score top-k selection = swap decision

**Ebbinghaus decay 层在 retrieval 中的角色** (essential，非 optional):
- **Archive hard filter**: `retention < 0.1` 的文件不入 Stage 1 candidate pool（减 BM25 + embedding 计算量）
- **Composite ranker feature**: `retention` + `freshness` 作 score function 的 feature（权重 0.15 + 0.10）
- **LLM side-info**: 送 manifest 给 LLM judge 时带 `retention=0.73, accessCount=5, lastAccess=2d ago` 给 temporal context

vault 现有 `_vault/scripts/decay.ts` (INITIAL_STABILITY=72h, MULTIPLIER=2.2x, difficulty ∈ [0.25, 4.0], 18 unit tests) **一行不改**复用；`maintain.ts` 的 category-level difficulty 自适应 (HIGH_FREQ→0.8 / LOW_FREQ→1.3) 原样使用。

**Per-query 复杂度** (n=2000, d=1024, k=50):

| Path | Latency | 备注 |
|---|---|---|
| No LLM re-rank | ~280ms | embedding 200ms + BM25 5ms + dense 20ms + top-k 2ms + content load 50ms |
| With Gemma local re-rank | ~600-800ms | +1 local inference |
| With xAI cloud re-rank fallback | ~1.5-3.5s | 云端 API round-trip |

**Space** (n=2000): inverted index ~10 MB + dense embed ~8 MB + decay cache ~200 KB + access log ~5 MB + LRU cache ~750 KB = **~25 MB 全内存 fit**

**Success gate** (Wave 1 → Wave 3 升级 trigger，满足任一即启动 Wave 3):
- vault 规模 > 800 md（manifest 占 xAI context 50%+）
- P@5 < 0.75 on 30-query human-curated eval set
- Latency p95 > 1.5s due to vault growth
- Queries 中 > 30% 涉及 multi-hop reasoning

**明确 NOT 做** (第一性淘汰):
- EverMemOS verifier-rewriter loop（LLM listwise re-rank 替代，减 LLM 调用）
- HyperMem hypergraph edges（summary 层级 hierarchical retrieval 近似）
- MSA sparse attention（需要 fine-tune + GPU 训练集群）
- OpenAI/Voyage 付费 embedding（local MLX + CF free 足够）
- LambdaMART learned ranking weights（需 click-through data，Wave 5+）
- Amplify API（amplify 未配置 + 新 framing 不再走 amplify 路径）

---

## 4. Data Flow (Wave 1 最小闭环)

```
Agent 启动 (任意 CLI)
  ↓
读 _vault/MASTER-PREAMBLE-INDEX.md  ← single entry
  ↓
按 Index 指引依层读：
  L0 PHILOSOPHICAL-INTEGRITY-ANCHOR-L0.md    (哲学锚定)
  L1 REFERENCE-PROFILE-HANDOFF-PATTERN.md    (agent 协议 7 原则)
     HANDOFF-TEMPLATE-AGENT-TO-AGENT.md      (填空模板)
  L2 {host}-specific CLAUDE.md + MEMORY.md   (个人偏好 host-local)
  L3 _vault/.claude/skills/*/SKILL.md        (复用 skill)
  L4 docs/*-assistant-setup.md               (专项 setup，按需)
  ↓
Agent 进入 work session，行为受 L0-L4 约束
```

Wave 1 只搭 Index 骨架（指向已存在文件），**不强制 enforcement**，不加 session hook，不触发自动加载。Wave 3 才做强制。

---

## 5. Error Handling & Rollback

| 风险 | 预防 | 应对 |
|---|---|---|
| `_vault git push` 被 reject（远端 newer） | `git fetch && git status` 预检 | `git pull --rebase` 解冲突重 push；**禁 `--force`** |
| `_vault git push` 含敏感 | `git diff` 检查后 push | 已 push 敏感 → `git revert` + 新 commit 删；严重则 `git filter-repo` 清历史 + rotate 敏感值 |
| Spec 文档 ambiguity / placeholder | Self-review step 7 inline 扫 | `Edit` inline 修；commit 前再 review |
| CLEANUP-DECISIONS.md 决策错 | **只是候选清单**，Wave 2 执行前再次审批 | 修文档，无破坏性动作执行 → 改了就改了 |
| `_vault/infra/` 不小心含敏感 | infra 目录只含公开元数据（gh repo list 输出 + 决策文本） | `git diff` 检查，禁含 token/path/secret |
| 误碰 `src/**` | **Hard rule**: 今晚只 touch `_vault/` + `docs/superpowers/specs/` | 误改了就 `git checkout HEAD -- src/<path>` |
| MASTER-PREAMBLE-INDEX 设计有误 | v0.1 骨架 only，Wave 3 refine | Wave 3 有 refine 机会，不阻塞 Wave 1 |

---

## 6. Verification (Wave 1 Done 判据)

Wave 1 ship 判定 = 以下 4 段 bash 全部返回 exit 0 且 grep 有 match：

```bash
# 1. _vault commit & push 完成
cd /Users/0xvox/claude-code-reimagine-for-learning/_vault
git log -3 --name-only | grep -E "REFERENCE-PROFILE-HANDOFF-PATTERN|HANDOFF-TEMPLATE-AGENT-TO-AGENT"
git status --short  # 期望：空（clean working tree）
git log origin/main..HEAD --oneline  # 期望：空（本地与远端同步）

# 2. _vault/infra/ 目录 + 2 个 metadata 文件就位
test -d /Users/0xvox/claude-code-reimagine-for-learning/_vault/infra
test -f /Users/0xvox/claude-code-reimagine-for-learning/_vault/infra/repo-inventory-20260419.json
test -f /Users/0xvox/claude-code-reimagine-for-learning/_vault/infra/CLEANUP-DECISIONS.md

# 3. MASTER-PREAMBLE-INDEX.md v0.1 骨架
test -f /Users/0xvox/claude-code-reimagine-for-learning/_vault/MASTER-PREAMBLE-INDEX.md
grep -cE "^## L[0-4]" /Users/0xvox/claude-code-reimagine-for-learning/_vault/MASTER-PREAMBLE-INDEX.md  # 期望 >= 5
grep -c "Known Agent Surfaces" /Users/0xvox/claude-code-reimagine-for-learning/_vault/MASTER-PREAMBLE-INDEX.md  # 期望 >= 1

# 4. CCR spec 就位 & committed
cd /Users/0xvox/claude-code-reimagine-for-learning
test -f docs/superpowers/specs/2026-04-19-vault-foundation-and-preamble-design.md
git log --oneline -5 | grep -i "vault foundation"  # 期望 >= 1 match
```

---

## 7. Wave 2 & Wave 3 Preview (for writing-plans scope reference)

由 superpowers:writing-plans skill 在本 spec 用户 approval 后生成详细 PLAN。以下是 scope 预告：

### Wave 2 — 破坏性 infra 清理（明天或次日，~3-4h）
- Execute CLEANUP-DECISIONS.md 的破坏性动作（用户逐项再次审批）：
  - 🗑 `gh repo delete Fearvox/claude-code-reimagine-for-learning`（Evensong pre-rename 旧 GitHub 副本 — **删的是 remote repo，不影响本地 working directory `~/claude-code-reimagine-for-learning/`**，后者指向 `Fearvox/Evensong.git`）
  - 🗑 `gh repo delete Fearvox/ds-internal-beta-run`（5KB 只含 LICENSE 的空 repo）
  - 📦 `gh repo archive Fearvox/Spice-DS-EverOS-RR`（外部 fork，无关）
  - 📦 `gh repo archive Fearvox/dash-persona-hybrid`（Yuze fork，无关）
  - 🔄 `gh repo rename Fearvox/dash-shatter-vault → Fearvox/dash-shatter-landing`（名字误导）
  - ❓ E 类待定 repo 逐项决策（DS-EverOS-RR / dash-shatter-benchmarks / evermemos-pretext / dash-persona）
- **Provider fallback chain 配置** (per §3.4 Wave 1 ship): Atomic Local Gemma (`http://127.0.0.1:1337/v1`) → `xai-fast` → `minimax-m27` → `or-qwen-3.6-plus` → `or-llama-3.1-8b-free` 落地到 CCR `src/services/api/withRetry.ts`（复用 PR #7 架构）
- **MLX embedding provider 准备** (per §3.4 Wave 3+): Atomic MLX 装 `Qwen3-Embedding-4B`（对齐 EverMemOS，Apple Silicon 原生加速）；`BGE-M3` via CF Workers AI 作 fallback
- ~~amplify API key 配置~~ **移除** — §3.4 unified ranker framing 不再走 amplify 路径
- `research-vault/` submodule declaration 清理（CCR `.gitmodules`）—— 要么 init 指向 `ds-research-vault` 要么删 declaration 改 untracked + 由用户本地 sync
- MCP package `packages/research-vault-mcp/` `package.json` + `bin/` 准备（不 publish，只 build + verify）

### Wave 3 — 跨 CLI 分发 + L0-L4 辐射（Wave 2 完成后，~1 整天）
- **Unified Multi-Signal Ranker 实现** (per §3.4): BM25 inverted index + dense encoder (`Qwen3-Embedding-4B` via MLX) + RRF 融合 + min-heap top-k + hierarchical summary retrieval (stage 1a summary → 1b raw) + composite scoring (integrating decay) + LLM listwise re-rank (Gemma local primary) + 30-query P@5 eval harness
- L0-L4 辐射头块批量添加（每个 vault md 加 `上级 ref / 下级 ref` frontmatter）
- Dash-research-vault 加 `05-rules/L1/` + `05-rules/L3/` public subset（引用版 L1/L3，无敏感）
- MCP package publish（`@evermem/research-vault-mcp` 或类似 namespace，npx/bun 可直接启动）
- 跨 CLI preamble hook 集成：
  - CCR SessionStart hook → fetch MASTER-PREAMBLE-INDEX.md（本地或远端）
  - Desktop Cowork project CLAUDE.md 顶层 reference
  - Hermes / Codex / Copilot / Cursor instruction prefix 注入 MCP server call
- SP5 违规自动检测（session end 扫 transcript + git，对照 L1 七原则 + L2 rules 打分）

---

## 8. Signatures

- **Spec Author**: 0xvox (Nolan Zhu) via Claude Code Opus 4.7 (1M) session on CCR
- **Design Approval**: ⏳ pending user review
- **writing-plans entry**: ⏳ pending spec approval
- **Parent incident**: 40h silent-swallow debug marathon (Phases 10-15, 2026-04-15 → 2026-04-19)
- **Canonical protocol governing this spec**: `_vault/REFERENCE-PROFILE-HANDOFF-PATTERN.md` (2026-04-18)
- **Layer partition choice**: Q6 option C — 按 Layer 切分（L0/L2/L4 private-only；L1/L3 both）
- **Today's work boundary**: 今晚不碰产品 / 不执行破坏性动作 / 不碰其他 CLI

---

*Generated during 40h debug marathon aftermath. Infra first, product second. "没有 infra，产品再牛也不 robust." ——类比 benchmark 先行原则.*
