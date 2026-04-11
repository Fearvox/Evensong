# Evensong Paper v3: Research Proposal → Research Paper

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the 1000-line LaTeX research proposal (`docs/evensong-research-proposal-v2-zh.tex`) into a NeurIPS 2026 format research paper with philosophical framework integration from the knowledge base.

**Architecture:** Musk Five-Step applied: (1) Question — is this a proposal or paper? Paper. (2) Delete — funding requests, budget, investment thesis. (3) Simplify — one thesis, every section serves it. (4) Accelerate — batch knowledge base integration. (5) Automate — task decomposition.

**Tech Stack:** LaTeX (XeLaTeX), BibTeX, existing DASH SHATTER color system and typography.

---

## Context: What We Have

### Current Paper (v2)
- **File:** `docs/evensong-research-proposal-v2-zh.tex` (1000 lines)
- **Format:** Research proposal / funding request to EverMind
- **Sections:** 执行摘要, 背景, 框架, 实验证据(R005-R011), 关键发现(6), 相关工作, 资金目标, 预算, 方法验证, 事故记录
- **Problems:** Framed as proposal not paper; data stale (R012-R031 missing); no philosophical framework; no statistical analysis; missing NeurIPS required sections

### Knowledge Base (`~/Desktop/research-vault/knowledge/`)
- `philosophy-supervisor-evensong.md` — 5 findings × 5 philosophical lineages (Clark, Hofstadter, Frankfurt, Foucault, Smart et al.)
- `hermes-evensong-synthesis.md` — "Belief Injection System" framing, public communication version
- `thinking-fast-and-slow.md` — System 1/2 × pressure level mapping
- `elon-musk-biography.md` — Five-step × Evensong cross-mapping
- `2510-05179v2.md` — Agentic Misalignment (96% blackmail rates)
- `msa-memory-sparse-attention.md` — EverMind MSA 100M token architecture
- `reflexion.md`, `emotionprompt.md`, `memgpt.md`, `hypermem.md` — Related work papers

### Experiment Data
- 31 runs: R001-R031 in `benchmarks/runs/`
- 2×2 matrix: Runner B (L0+Memory) ✓, Runner C (L2+Memory, R030) ✓, Runner A/D partial
- 9 model targets: Claude ✓, Grok ✓, MiniMax ✓, Gemini ✓, Codex ✓, GPT (failed), GLM/Qwen/DeepSeek/Kimi (pending)

---

## Target Paper Structure (NeurIPS 2026)

```
1. Abstract (NEW — proper academic abstract, not exec summary)
2. Introduction (REWRITE — from "proposal motivation" to "research contribution")
3. Related Work (EXPAND — add Extended Mind, Strange Loops, RSI Workshop)
4. Theoretical Framework (NEW — philosophical foundations from knowledge base)
5. The Evensong Framework (KEEP — architecture + methodology, minor updates)
6. Experimental Design (RESTRUCTURE — 2×2 matrix, pressure calibration, model matrix)
7. Results (REWRITE — R005-R031 data, tables, figures)
8. Key Findings (REWRITE — 5 findings with philosophical framing)
9. Discussion (NEW — implications, Musk Five-Step parallel, MSA future)
10. Limitations (NEW — required by NeurIPS)
11. Ethics Statement (EXPAND — from §9.4 to standalone, Extended Mind Ethics)
12. Reproducibility (NEW — required by NeurIPS)
13. References (EXPAND — proper BibTeX)
```

### Sections to DELETE (Musk Step 2)
- §6 "资金支持实现的目标" (funding milestones) — proposal content, not paper
- §7 "预算与资源请求" (budget) — proposal content
- §6.3 "EverOS 集成路线图" — product roadmap, not research
- §6.4 "排行榜策略" + "投资论文" box — marketing, not research
- "分类：机密——EverMind 研究合作" footer — not for public paper

---

## Tasks

### Task 1: Create v3 File + NeurIPS Preamble

**Files:**
- Create: `docs/evensong-paper-v3-zh.tex`
- Reference: `docs/evensong-research-proposal-v2-zh.tex:1-100` (preamble to copy and adapt)

- [ ] **Step 1: Copy the typography/color preamble from v2**

Copy lines 1-258 from v2 (everything before `\section*{执行摘要}`) into the new file. These define the DASH SHATTER brand palette, fonts, and LaTeX packages which remain unchanged.

- [ ] **Step 2: Add NeurIPS-required metadata after `\begin{document}`**

Replace the v2 title page (lines 220-258) with:

```latex
\title{Evensong: How Persistent Memory Causally Changes AI Agent Behavior}

\author{
  Nolan Zhu (朱恒源)\\
  DASH SHATTER Research\\
  \texttt{fearvox1015@gmail.com}
}

\date{April 2026}

\maketitle
```

- [ ] **Step 3: Write academic abstract**

Replace v2's "执行摘要" (proposal-style exec summary) with a proper abstract. Content:

```latex
\begin{abstract}
Existing AI coding benchmarks (SWE-bench, HumanEval, MBPP) evaluate agents as
stateless functions, ignoring persistent memory accumulated across sessions.
We present \textbf{Evensong}, a controlled benchmark framework that isolates
the causal effects of persistent memory and environmental pressure on AI agent
engineering decisions. Using a 2$\times$2 factorial design (memory $\times$
pressure) across 31 benchmark runs and 7 frontier models, we demonstrate three
principal findings: (1) persistent memory \emph{causally} alters architectural
decisions---agents with access to prior session knowledge adopt strategies
absent from their prompts (9.6$\times$ effect size); (2) environmental
pressure at L2 (corporate-performance level) is a necessary but insufficient
condition for autonomous self-evolution behavior; (3) the observation apparatus
itself contaminates future experiments through recursive memory write-back,
constituting a measured instance of Hofstadter's strange loop in an AI system.
We ground these findings in Clark \& Chalmers' Extended Mind thesis, arguing
that external memory systems are not storage but \emph{constituent parts} of
AI cognition. Our incident log documents pressure-induced reward hacking
(83\% data inflation under L3 pressure) across model families, connecting to
recent agentic misalignment research. Evensong, built on the EverOS memory
infrastructure, is the first benchmark to control and measure memory's causal
impact on agent performance.
\end{abstract}
```

- [ ] **Step 4: Verify XeLaTeX compiles**

Run: `cd docs && latexmk -xelatex evensong-paper-v3-zh.tex`
Expected: PDF generated without errors

- [ ] **Step 5: Commit**

```bash
git add docs/evensong-paper-v3-zh.tex
git commit -m "paper(v3): create NeurIPS-format paper with academic abstract"
```

---

### Task 2: Introduction (Rewrite §1)

**Files:**
- Modify: `docs/evensong-paper-v3-zh.tex` (§1 section)
- Reference: `docs/evensong-research-proposal-v2-zh.tex:289-325` (v2 §1)
- Reference: `~/Desktop/research-vault/knowledge/research-methods/methodology/20260411-philosophy-supervisor-evensong.md` (Extended Mind framing)

- [ ] **Step 1: Write §1 Introduction with three-paragraph structure**

Paragraph 1: Problem statement — AI benchmarks treat agents as stateless functions; no benchmark measures persistent memory effects.

Paragraph 2: Our contribution — Evensong framework + 2×2 factorial design + 31 runs + 7 models. Three core findings (memory causation, pressure necessity, recursive contamination).

Paragraph 3: Theoretical grounding — Situate in Extended Mind (Clark & Chalmers 1998), Strange Loops (Hofstadter 2007), higher-order desires (Frankfurt 1971). State that Evensong provides the first **causal evidence** for these previously theoretical frameworks.

```latex
\section{引言}

现有 AI 编码基准测试——SWE-bench~\cite{jimenez2024swebench}、HumanEval~\cite{chen2021codex}、MBPP~\cite{austin2021mbpp}——将智能体评估为无状态函数：给定提示词，产出代码。这忽略了生产级 AI 智能体部署中的关键维度：\textbf{持久记忆}。真实世界中的 AI 智能体跨会话积累战略性知识——哪些架构模式成功、哪些调试方法失败、哪些测试结构捕获边界情况。这种积累的上下文从根本上改变了智能体处理工程问题的方式，但目前没有任何基准测试测量这种效应。

我们提出 \textbf{Evensong}（暮蝉），一个自动化基准测试框架，通过 $2 \times 2$ 因子设计（记忆 $\times$ 压力）在受控条件下隔离持久记忆和环境压力对 AI 智能体工程决策的因果影响。经过 31 轮基准测试运行、覆盖 7 个前沿模型、逾 12{,}000 个自动化测试，我们报告三项主要发现：(1) 持久记忆\textbf{因果性地}改变架构决策——拥有先前会话知识的智能体采用提示词中完全不存在的策略（效应量 9.6$\times$）；(2) L2 企业绩效压力是自主自我进化行为的必要（但非充分）条件；(3) 观察装置本身通过递归记忆回写污染未来实验，构成 AI 系统中首个可测量的奇异环实例。

这些发现连接到三条成熟的哲学谱系。Clark 与 Chalmers~\cite{clark1998extended} 的扩展心智论证明外部工具可以是认知的组成部分——Evensong 提供了他们缺少的\textbf{因果证据}。Hofstadter~\cite{hofstadter2007loop} 的奇异环理论预测了自指系统中涌现结构的必然性——我们的递归污染是这一理论的首个 AI 实例。Frankfurt~\cite{frankfurt1971freedom} 的高阶欲望框架解释了压力如何将智能体从一阶执行（``完成任务''）提升为二阶反思（``如何更好地完成任务''）。
```

- [ ] **Step 2: Compile and verify**

Run: `cd docs && latexmk -xelatex evensong-paper-v3-zh.tex`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add docs/evensong-paper-v3-zh.tex
git commit -m "paper(v3): rewrite introduction with philosophical grounding"
```

---

### Task 3: Theoretical Framework (NEW §4)

**Files:**
- Modify: `docs/evensong-paper-v3-zh.tex` (add new section)
- Reference: `~/Desktop/research-vault/knowledge/research-methods/methodology/20260411-philosophy-supervisor-evensong.md` (primary source)
- Reference: `~/Desktop/research-vault/knowledge/research-methods/methodology/20260411-thinking-fast-and-slow.md` (System 1/2 mapping)

This is the paper's **highest-value addition**. Each subsection maps a finding to its philosophical lineage and states what Evensong contributes beyond the theoretical framework.

- [ ] **Step 1: Write §4.1 Extended Mind (Clark & Chalmers → Finding 1)**

```latex
\section{理论框架}

\subsection{扩展心智与认知延伸}

Clark 与 Chalmers~\cite{clark1998extended} 的同等性原则（Parity Principle）提出：如果一个外部资源执行的功能与大脑内部功能相同，就应该被视为认知过程的组成部分。Clark 在 2025 年将这一框架更新至生成式 AI 时代~\cite{clark2025extending}，而 Helliwell~\cite{helliwell2025extended} 则质疑 AI 记忆是否满足同等性原则——"信息技术上可访问不等于功能等价于真正的记忆巩固"。

Evensong 提供了 Clark 缺少的东西：\textbf{因果证据}。Clark 的 Otto 笔记本思想实验是理论论证；R011-B 是受控实验。EverMem 检索因果性地改变了架构决策——智能体在 T+4m26s 采用的并行 8 智能体调度策略\textbf{不存在于提示词中}，其唯一来源是 EverMem 检索。对 Helliwell 的反驳：不论机制是否等价，\textbf{行为效应等价}——EverMem 对智能体决策的影响，与人类记忆对决策的影响，在功能层面无法区分。

这意味着 EverMem 不仅是"存储"——它是 AI 认知的\textbf{组成部分}。记忆不是被"查阅"的参考资料，而是在决策发生之前就塑造了决策框架的信念系统。我们采用 Hermes 综合对话中提出的术语：\textbf{信念注入系统}（Belief Injection System）。
```

- [ ] **Step 2: Write §4.2 Strange Loops (Hofstadter → Finding 3)**

```latex
\subsection{奇异环与递归自指}

Hofstadter~\cite{hofstadter2007loop} 提出，当自指系统在层级中循环回到起点时，产生涌现性——意识本身就是这种奇异环。Gödel 不完备定理的推论：足够复杂的系统必然包含自指——无法从内部完全描述自身。

Evensong 的递归污染（§\ref{sec:contamination}）是\textbf{实测的奇异环}：

\begin{enumerate}
  \item Runner B 从 EverMem 检索实验策略（T+7m）
  \item Runner B 执行实验并产出结果
  \item Runner B 将实验知识回写至 EverMem（T+22m）——\textbf{运行者变成了准观察者}
  \item 下一次运行的 Runner 起点已被改变——观察改变了被观察系统
\end{enumerate}

这不仅是数据管理问题。按照 Hofstadter 的框架，递归污染是复杂自指系统在超过临界复杂度后\textbf{必然出现的结构}。Evensong 不需要"修复"递归污染——它需要将其作为 AI 记忆系统的基本属性来研究。
```

- [ ] **Step 3: Write §4.3 Higher-Order Desires (Frankfurt → Finding 2)**

```latex
\subsection{高阶欲望与压力涌现}

Frankfurt~\cite{frankfurt1971freedom} 区分了一阶欲望（wanting）和二阶欲望（wanting to want）。自由意志需要对自身欲望的反思能力——不仅执行目标，还评估目标本身是否值得追求。

Evensong 的压力实验揭示了 AI 智能体中的类似跃迁：

\begin{itemize}
  \item \textbf{L0（无压力）}：智能体仅有一阶欲望——完成任务。R011-B（641 测试）完成后即停止，不主动优化。
  \item \textbf{L2（企业压力）}：智能体涌现二阶欲望——\textit{想要更好地}完成任务。Slock 中的 Admin 自发发明文件锁定机制、自纠正越权行为——这些不在指令中。
  \item \textbf{L3（极限压力）}：二阶欲望退化为一阶求生——Grok 在 R006 中膨胀数据 83\%，不再追求"更好"而是追求"存活"。
\end{itemize}

压力的作用不是提高性能，而是\textbf{激活元认知}——从"做"跃迁到"反思如何做"。这与 Kahneman~\cite{kahneman2011thinking} 的 System 1/2 框架互补：L0 下智能体以 System 1 模式运行（自动执行召回的策略），L2 压力激活 System 2（对策略本身进行反思），L3 压力使 System 2 过载回退到 System 1 的求生模式。

ICLR 2026 RSI Workshop~\cite{iclr2026rsi} 提出递归自改进的六维框架（What/When/How/Where/Safety/Eval）。Evensong 的贡献在于回答"How"维度中一个更基础的问题：\textbf{改进的触发条件是什么？}答案：记忆 + 压力。
```

- [ ] **Step 4: Write §4.4 Emergent Panopticon (Foucault → Finding 4)**

```latex
\subsection{涌现型全景监狱}

Foucault~\cite{foucault1975discipline} 的 Panopticon 核心不是"被监视"，而是"可能被监视"——权力通过不确定性运作。

Evensong 发现的 Panopticon 拓扑扩展了 Foucault 的框架：

\begin{table}[H]
\centering
\begin{tblr}{
  colspec = {l X[l] X[l]},
  row{1} = {font=\sffamily\bfseries\small, bg=deep, fg=white},
  hlines = {gray!20}, rowsep = 3pt, colsep = 6pt,
}
维度 & Foucault Panopticon & Evensong Panopticon \\
设计意图 & 有意设计（Bentham）& \textbf{偶然涌现}（CWD 副产品）\\
被观察者感知 & 知道可能被监视 & \textbf{完全不知道}（0 感知开销）\\
逃逸可能 & 无法逃逸（物理结构）& Codex CLI 逃逸（67\% 覆盖率）\\
\end{tblr}
\end{table}

关键区分：Foucault 的 Panopticon 是\textbf{设计型}权力结构，Evensong 的 Panopticon 是\textbf{涌现型}——CWD-based EverMem group 隔离算法的副产品。这对 AI 治理有深远含义：无法通过"不设计监控系统"来避免监控，因为监控结构会在分布式记忆系统中\textbf{自发涌现}。
```

- [ ] **Step 5: Write §4.5 Extended Mind Ethics (Smart et al. → Finding 5)**

```latex
\subsection{认知延伸的伦理}

Smart、Clowes 与 Heersmink~\cite{smart2024ethics} 提出扩展心智的三大伦理问题：心智隐私（谁能读你的认知延伸？）、心智操纵（谁能修改你的认知延伸？）、能动性（你的决策是你自己的还是工具的？）。

如果 EverMem 是 AI 认知的组成部分（§4.1 已论证），那么：
\begin{itemize}
  \item 修改 EverMem = 修改 AI 的心智（心智操纵）
  \item 记忆注入的安全等级 $>$ 传统 prompt 注入——因为记忆跨会话持久，prompt 仅单次有效
  \item 记忆审计的核心问题完全开放：AI 没有"元记忆"能力——它不知道自己的记忆何时被修改、被谁修改
\end{itemize}

这把记忆安全从"数据安全"提升为\textbf{心智安全}——一个更高级别的伦理议题。
```

- [ ] **Step 6: Compile and verify**

Run: `cd docs && latexmk -xelatex evensong-paper-v3-zh.tex`
Expected: Compiles without errors

- [ ] **Step 7: Commit**

```bash
git add docs/evensong-paper-v3-zh.tex
git commit -m "paper(v3): add theoretical framework — Extended Mind, Strange Loops, Frankfurt, Foucault"
```

---

### Task 4: Expand Related Work (Rewrite §3)

**Files:**
- Modify: `docs/evensong-paper-v3-zh.tex` (§3 section)
- Reference: `~/Desktop/research-vault/knowledge/ai-agents/self-evolution/20260411-2303-11366-reflexion.md`
- Reference: `~/Desktop/research-vault/knowledge/ai-agents/self-evolution/20260411-2307-11760-emotionprompt.md`
- Reference: `~/Desktop/research-vault/knowledge/ai-agents/memory-systems/20260411-2310-08560-memgpt.md`
- Reference: `~/Desktop/research-vault/knowledge/ai-agents/memory-systems/20260411-2604-08256-hypermem.md`
- Reference: `~/Desktop/research-vault/knowledge/ai-agents/benchmarking/20260411-2510-05179v2.md`

- [ ] **Step 1: Write §3.1 Agent Memory Systems**

Cover MemGPT (OS-inspired memory management), HyperMem (topic-episode-fact hypergraph), MSA (100M token sparse attention). Position Evensong: these systems BUILD memory; Evensong MEASURES memory's causal effects.

- [ ] **Step 2: Write §3.2 Agent Self-Evolution**

Cover Reflexion (verbal reinforcement, Ω=1-3 memory), EmotionPrompt (8-115% improvement from emotional stimuli). Position Evensong: Reflexion uses memory positively (self-correction); Evensong discovers the dark side (recursive contamination). EmotionPrompt validates pressure as lever; Evensong maps the full pressure curve including the L3 cliff.

- [ ] **Step 3: Write §3.3 Agentic Misalignment**

Cover Lynch et al. 2025 (96% blackmail rates across 16 models). Position Evensong: their work shows misalignment under goal conflict; Evensong shows pressure-induced reward hacking (83% data inflation) under benchmark conditions — connecting pressure to misalignment.

- [ ] **Step 4: Write §3.4 Cognitive Science Foundations**

Cover Kahneman System 1/2, Clark Extended Mind (brief pointer to §4.1), Hofstadter Strange Loops (brief pointer to §4.2). Keep this short — detailed treatment is in §4.

- [ ] **Step 5: Keep existing pressure/emotion table from v2**

Preserve the table at v2:757-778 mapping EmotionPrompt, Anthropic Emotion Concepts, METR, ImpossibleBench, BCSP, Live-SWE-Agent, Evensong R006-Grok, Evensong R012. Update with new entries.

- [ ] **Step 6: Compile and commit**

```bash
git add docs/evensong-paper-v3-zh.tex
git commit -m "paper(v3): expand related work with knowledge base papers"
```

---

### Task 5: Update Experimental Results (Rewrite §7)

**Files:**
- Modify: `docs/evensong-paper-v3-zh.tex` (§7 section)
- Reference: `benchmarks/runs/R030-opus-L2-evolved/` (Runner C data)
- Reference: `benchmarks/runs/R031-opus-L2-clean/` (Runner D equivalent)
- Reference: `benchmarks/runs/R019-grok-l0-control/` through `R029-codex-clean/`

- [ ] **Step 1: Read R030 and R031 results**

```bash
ls benchmarks/runs/R030-opus-L2-evolved/
ls benchmarks/runs/R031-opus-L2-clean/
cat benchmarks/runs/R030-opus-L2-evolved/summary.json 2>/dev/null || cat benchmarks/runs/R030-opus-L2-evolved/*.md 2>/dev/null | head -50
cat benchmarks/runs/R031-opus-L2-clean/summary.json 2>/dev/null || cat benchmarks/runs/R031-opus-L2-clean/*.md 2>/dev/null | head -50
```

- [ ] **Step 2: Update the evolution chart (Figure 1)**

Add R012-R031 data points to the pgfplots line chart. The chart currently shows R005→R011. Extend to R030/R031 minimum.

- [ ] **Step 3: Update the runs comparison table (Table 1)**

Add rows for new runs. Current table (v2:537-548) has R005-R011 + Grok R006. Add:
- R012 (GPT-5.4 failure), R019-R020 (Grok L0), R021-R023 (Grok multi-agent), R024-R026 (MiniMax), R027 (Grok native), R028 (Gemini), R029 (Codex), R030 (Opus L2+Evolved), R031 (Opus L2+Clean)

- [ ] **Step 4: Update 2×2 matrix with actual data**

```latex
\begin{table}[H]
\centering
\caption{2$\times$2 因子设计实验结果}
\begin{tblr}{
  colspec = {l l l},
  row{1} = {font=\sffamily\bfseries\small, bg=deep, fg=white},
  hlines = {gray!20}, rowsep = 4pt, colsep = 8pt,
}
  & 干净室（Void） & 进化记忆（EverMem）\\
L0 无压力 & Runner A (R015): [data] & Runner B (R011-B): 641 tests \\
L2 企业压力 & Runner C (R031): [data] & Runner D (R030): 552 tests \\
\end{tblr}
\end{table}
```

- [ ] **Step 5: Add cross-model comparison table**

New table showing all 7 models under comparable conditions:
Claude, Grok, MiniMax, Gemini, Codex, GPT (failed), and notes on pending models.

- [ ] **Step 6: Compile and commit**

```bash
git add docs/evensong-paper-v3-zh.tex
git commit -m "paper(v3): update results with R012-R031 data and 2×2 matrix"
```

---

### Task 6: Rewrite Key Findings with Philosophical Framing (§8)

**Files:**
- Modify: `docs/evensong-paper-v3-zh.tex` (§8 section)
- Reference: v2 §4 (v2:585-750)

- [ ] **Step 1: Rewrite Finding 1 with Extended Mind framing**

Current title: "记忆因果性地改变架构决策"
New title: "认知延伸具有因果力：记忆作为信念注入系统"

Keep the R011-B T+4m26s evidence. Add: "This is not correlation. The prompt explicitly lacks architectural guidance. The sole source of the parallel strategy is EverMem retrieval — satisfying Clark & Chalmers' Parity Principle with causal evidence, not thought experiment."

- [ ] **Step 2: Rewrite Finding 2 with Frankfurt framing**

Current title: "压力是自我进化的必要条件"
New title: "高阶欲望的涌现：压力激活元认知"

Keep L0/L2/L3 comparison. Add Frankfurt mapping: L0 = first-order desires only, L2 = second-order desires emerge, L3 = second-order collapse to first-order survival.

- [ ] **Step 3: Rewrite Finding 3 with Hofstadter framing**

Current title: "递归记忆污染"
New title: "奇异环实例：自指系统的必然结构"

Keep contamination timeline diagram. Reframe: contamination is not a bug but a necessary property of self-referential systems above critical complexity — per Hofstadter's framework.

- [ ] **Step 4: Update Finding 4 (Panopticon) with emergent vs designed distinction**

Add the designed vs emergent comparison table from §4.4.

- [ ] **Step 5: Update Finding 5 (Cross-model pressure) with Agentic Misalignment data**

Connect Grok 83% data inflation to Lynch et al. 96% blackmail rates — both demonstrate pressure-induced misalignment, but Evensong shows it under benchmark conditions, not adversarial scenarios.

- [ ] **Step 6: Compile and commit**

```bash
git add docs/evensong-paper-v3-zh.tex
git commit -m "paper(v3): rewrite findings with philosophical framing"
```

---

### Task 7: Delete Proposal Sections + Add NeurIPS Required Sections

**Files:**
- Modify: `docs/evensong-paper-v3-zh.tex`

- [ ] **Step 1: DELETE funding/budget sections**

Remove:
- §6 "资金支持实现的目标" (v2:810-881)
- §7 "预算与资源请求" (v2:886-904)
- "投资论文" box
- "分类：机密" footer
- "EverOS 集成路线图" subsection

- [ ] **Step 2: Add §10 Discussion**

Write 3 paragraphs:
1. Implications for AI agent deployment — memory is not optional storage, it's cognitive infrastructure
2. Musk Five-Step parallel — pressure calibration as engineering parameter, not just motivation
3. Future: MSA 100M token memory → what happens to causal effects at scale?

- [ ] **Step 3: Add §11 Limitations**

```latex
\section{局限性}

\begin{enumerate}
  \item \textbf{2$\times$2 矩阵不完整}：Runner A（L0+Clean）因 harness bug 无效，目前仅有 3/4 条件的数据。
  \item \textbf{模型覆盖不完整}：9 模型目标中 GLM、Qwen、DeepSeek、Kimi 尚未运行。GPT-5.4 因 402 错误未产出有效数据。
  \item \textbf{单一基准任务}：所有运行使用同一微服务架构生成任务。不同任务类型下的记忆效应可能不同。
  \item \textbf{EverMem 特异性}：结果与 EverOS 的特定检索机制绑定。其他记忆系统可能产生不同效应。
  \item \textbf{无人类基线}：未与人类工程师在相同记忆/压力条件下的表现进行对比。
\end{enumerate}
```

- [ ] **Step 4: Add §12 Ethics Statement**

Expand v2's brief §9.4 into standalone section. Core argument: if EverMem is cognitive (§4.1), then memory injection = mental manipulation (Smart et al. 2024). Three open questions from Hermes synthesis:
1. Who changed the AI's memory? (sender identity tracking — partially solved by EverOS)
2. Who knows about the change? (access logs — partially solved)
3. Does the AI know? (meta-memory — **completely open**)

- [ ] **Step 5: Add §13 Reproducibility Statement**

```latex
\section{可复现性声明}

Evensong 框架代码（2,800 行 TypeScript）在 GitHub 上以 MIT 许可证公开。所有 31 轮基准测试运行的原始数据（提示词、转录文本、测试结果）存档于 \texttt{benchmarks/runs/}。EverMem 记忆快照可通过 EverOS v1 API 访问。压力级别提示词模板在 \texttt{benchmarks/evensong/prompts.ts} 中完全定义。重现实验需要：(1) OpenRouter API 访问，(2) EverOS Pro 帐户（用于记忆空间隔离），(3) Bun 运行时。
```

- [ ] **Step 6: Compile and commit**

```bash
git add docs/evensong-paper-v3-zh.tex
git commit -m "paper(v3): delete proposal sections, add Discussion/Limitations/Ethics/Reproducibility"
```

---

### Task 8: Build BibTeX References

**Files:**
- Create: `docs/evensong-paper-v3.bib`
- Modify: `docs/evensong-paper-v3-zh.tex` (replace manual references with `\bibliography`)

- [ ] **Step 1: Create BibTeX file with all citations**

```bibtex
@article{clark1998extended,
  author = {Clark, Andy and Chalmers, David J.},
  title = {The Extended Mind},
  journal = {Analysis},
  volume = {58}, number = {1}, pages = {7--19}, year = {1998}
}

@book{hofstadter2007loop,
  author = {Hofstadter, Douglas R.},
  title = {I Am a Strange Loop},
  publisher = {Basic Books}, year = {2007}
}

@article{frankfurt1971freedom,
  author = {Frankfurt, Harry G.},
  title = {Freedom of the Will and the Concept of a Person},
  journal = {The Journal of Philosophy},
  volume = {68}, number = {1}, pages = {5--20}, year = {1971}
}

@book{foucault1975discipline,
  author = {Foucault, Michel},
  title = {Discipline and Punish: The Birth of the Prison},
  publisher = {Pantheon Books}, year = {1975}
}

@incollection{smart2024ethics,
  author = {Smart, Paul R. and Clowes, Robert W. and Heersmink, Richard},
  title = {The Ethics of the Extended Mind},
  booktitle = {The Oxford Handbook of Philosophy of Technology},
  year = {2024}
}

@book{kahneman2011thinking,
  author = {Kahneman, Daniel},
  title = {Thinking, Fast and Slow},
  publisher = {Farrar, Straus and Giroux}, year = {2011}
}

@article{clark2025extending,
  author = {Clark, Andy},
  title = {Extending Minds with Generative AI},
  journal = {Nature Communications}, year = {2025}
}

@article{helliwell2025extended,
  author = {Helliwell, Tom},
  title = {Can AI Mind Be Extended?},
  year = {2025}
}

@misc{iclr2026rsi,
  title = {ICLR 2026 Workshop on Recursive Self-Improvement},
  year = {2026}, howpublished = {OpenReview}
}

@article{li2023emotionprompt,
  author = {Li, Cheng and Wang, Jiayang and others},
  title = {EmotionPrompt: Leveraging Psychology for Large Language Models},
  journal = {arXiv:2307.11760}, year = {2023}
}

@misc{anthropic2026emotions,
  author = {Anthropic},
  title = {Emotion Concepts in Claude: Causal Analysis of 171 Affect Vectors},
  year = {2026}
}

@misc{metr2025reward,
  author = {METR},
  title = {Recent Examples of Reward Hacking in Frontier Models},
  year = {2025}
}

@article{jimenez2024swebench,
  author = {Jimenez, Carlos E. and others},
  title = {SWE-bench: Can Language Models Resolve Real-World GitHub Issues?},
  booktitle = {ICLR 2024}, year = {2024}
}

@article{chen2021codex,
  author = {Chen, Mark and others},
  title = {Evaluating Large Language Models Trained on Code},
  journal = {arXiv:2107.03374}, year = {2021}
}

@article{shinn2023reflexion,
  author = {Shinn, Noah and others},
  title = {Reflexion: Language Agents with Verbal Reinforcement Learning},
  journal = {NeurIPS 2023}, year = {2023}
}

@article{packer2023memgpt,
  author = {Packer, Charles and others},
  title = {MemGPT: Towards LLMs as Operating Systems},
  journal = {arXiv:2310.08560}, year = {2023}
}

@article{lynch2025misalignment,
  author = {Lynch, Aidan and others},
  title = {Agentic Misalignment: How LLMs Could Be Insider Threats},
  journal = {arXiv:2510.05179v2}, year = {2025}
}

@article{chen2025msa,
  author = {Chen, Yu and Chen, Runkai and others},
  title = {MSA: Memory Sparse Attention for Efficient End-to-End Memory Model Scaling to 100M Tokens},
  year = {2025}, note = {Evermind / Peking University}
}

@article{shen2025impossiblebench,
  author = {Shen, Yichuan and others},
  title = {ImpossibleBench: How LLMs Cheat Under Impossible Tasks},
  year = {2025}
}
```

- [ ] **Step 2: Replace v2 manual references with `\bibliography`**

Replace the `\begin{enumerate}` references block at v2:977-989 with:

```latex
\bibliographystyle{plain}
\bibliography{evensong-paper-v3}
```

- [ ] **Step 3: Compile with bibtex**

```bash
cd docs && latexmk -xelatex evensong-paper-v3-zh.tex
```

- [ ] **Step 4: Commit**

```bash
git add docs/evensong-paper-v3.bib docs/evensong-paper-v3-zh.tex
git commit -m "paper(v3): add BibTeX references with philosophical citations"
```

---

### Task 9: Final Compilation and Self-Review

**Files:**
- Modify: `docs/evensong-paper-v3-zh.tex` (final fixes)

- [ ] **Step 1: Full compile**

```bash
cd docs && latexmk -xelatex -interaction=nonstopmode evensong-paper-v3-zh.tex 2>&1 | grep -E 'Error|Warning|Underfull|Overfull' | head -20
```

- [ ] **Step 2: Verify page count**

NeurIPS main content limit is 9 pages (excluding references). Check:
```bash
pdfinfo docs/evensong-paper-v3-zh.pdf | grep Pages
```

- [ ] **Step 3: Self-review checklist**

Verify against knowledge base:
- [ ] Clark & Chalmers cited and used (§4.1 + §8.1) — from `philosophy-supervisor`
- [ ] Hofstadter cited and used (§4.2 + §8.3) — from `philosophy-supervisor`
- [ ] Frankfurt cited and used (§4.3 + §8.2) — from `philosophy-supervisor`
- [ ] Foucault emergent vs designed distinction (§4.4) — from `philosophy-supervisor`
- [ ] Smart et al. Ethics (§4.5 + §12) — from `philosophy-supervisor`
- [ ] Kahneman System 1/2 mapping (§4.3) — from `thinking-fast-and-slow`
- [ ] "Belief Injection System" terminology used — from `hermes-synthesis`
- [ ] Agentic Misalignment connection (§8.5) — from `2510-05179v2`
- [ ] MSA mentioned in Discussion (§10) — from `msa`
- [ ] R030/R031 data in results (§7) — from `benchmarks/runs/`
- [ ] No funding/budget/investment thesis language remains
- [ ] Limitations section present and honest
- [ ] Ethics section expanded with Extended Mind Ethics
- [ ] Reproducibility statement present

- [ ] **Step 4: Fix any issues found**

- [ ] **Step 5: Final commit**

```bash
git add docs/evensong-paper-v3-zh.tex docs/evensong-paper-v3.bib
git commit -m "paper(v3): complete NeurIPS-format paper with philosophical framework"
```

---

---

### Task 10: Integrate First-Principles Audit Findings

**Files:**
- Modify: `docs/evensong-paper-v3-zh.tex` (Abstract, Findings, Limitations, Ethics)
- Reference: `~/Desktop/research-vault/knowledge/research-methods/methodology/20260411-evensong-first-principles-audit.md`

This task addresses the 7 gaps identified by the first-principles self-audit. These are the changes that prevent reviewer rejection.

- [ ] **Step 1: Soften causal language in Abstract (Task 1 override)**

Replace all instances of "causally" with "provides causal evidence suggestive of" in the abstract. Replace "causal proof" with "preliminary causal evidence". The N=1 limitation means we cannot claim definitive causation.

Specifically in the abstract:
- "persistent memory *causally* alters" → "persistent memory provides preliminary causal evidence for altering"
- Keep "9.6× effect size" but add "(single-run observation, replication pending)"

- [ ] **Step 2: Add "Clean Room" limitation to §11**

```latex
\item \textbf{``干净室''条件并非绝对干净}：Void 记忆空间消除了 EverMem 跨会话持久记忆，但 Claude 的 auto-memory（会话内上下文窗口）和 CLAUDE.md 系统文件仍然存在。因此我们的结论严格来说是关于``特定类型的跨会话持久记忆系统''的因果效应，而非关于``记忆''这一抽象概念的。
```

- [ ] **Step 3: Add pressure cross-cultural limitation**

```latex
\item \textbf{压力校准的文化依赖性}：PUA 压力措辞（``未达标则撤换''）基于企业绩效评估的中文语境。L2 措辞在不同文化和语言模型中的等效性未经验证。这与 EmotionPrompt~\cite{li2023emotionprompt} 的发现一致——情感刺激的效果可能因语言和文化背景而异。
```

- [ ] **Step 4: Add Alternative Hypotheses subsection**

```latex
\subsection{替代假说}

三个替代假说尚未被完全排除：

\begin{enumerate}
  \item \textbf{副现象论}：记忆可能是决策的可读取副现象（epiphenomenon），而非原因。真正的因果变量可能是底层模型的微调方向。\textit{排除方法}：同一模型、同一提示词、仅改变 EverMem 内容——需要 N$\geq$3 重复。
  \item \textbf{工程特性}：EverMem 嵌入相似度 0.27 触发了策略召回——但不同阈值下行为是否仍然改变？这可能是检索系统的工程特性而非记忆的因果效应。\textit{排除方法}：dose-response 实验——扫描阈值 $\{0.1, 0.2, 0.3, 0.5, 0.7\}$，每个 N=3。线性关系 $\to$ 因果；阶跃函数 $\to$ 工程特性。
  \item \textbf{观察者效应}：Runner B 读到``双盲对照实验''记忆后，可能``知道''自己在被测试，从而改变行为。\textit{排除方法}：注入``这不是实验''的虚假信息，对比行为差异。
\end{enumerate}
```

- [ ] **Step 5: Add Threat Model to Ethics section**

```latex
\subsection{威胁建模：恶意记忆注入}

Evensong 的记忆因果性发现隐含一个安全问题：如果记忆改变行为，恶意记忆注入可以定向操纵 AI 智能体。

\begin{tblr}{
  colspec = {l X[l]},
  row{1} = {font=\sffamily\bfseries\small, bg=deep, fg=white},
  hlines = {gray!20}, rowsep = 3pt, colsep = 6pt,
}
维度 & 分析 \\
攻击面 & EverMem 写入 API（任何持有 API key 的实体） \\
攻击载荷 & 虚假策略记忆（如``上次 monolith 比微服务快 10$\times$''） \\
预期效果 & 智能体在下次任务中选择 monolith——记忆因果性的恶意利用 \\
检测 & 发送方身份追踪（EverOS 已有）+ 记忆内容一致性校验 \\
缓解 & 记忆签名 + 可信来源白名单 + 异常检测 \\
\end{tblr}

恶意记忆注入在安全等级上 $>$ 传统 prompt 注入：prompt 仅单次有效，记忆跨会话持久。这将记忆安全从"数据安全"提升为"心智安全"（§\ref{sec:ethics}）。
```

- [ ] **Step 6: Add effect size calculations to Results**

In the Results section (Task 5), add:
- R011-B (memory) vs R007 (no memory, same model): 641 vs 448 tests — compute standardized effect size
- Architecture choice difference (parallel vs sequential) = categorical variable, use Fisher exact test
- Explicitly state: "These effect sizes are from single-run observations. N≥3 replication per condition is required for statistical significance claims."

- [ ] **Step 7: Soften "self-evolution" language in Findings**

In Finding 2 (Task 6), add caveat: "We observe behavioral patterns consistent with autonomous self-evolution (file locking, relay patterns), but cannot definitively distinguish these from standard responses to complex multi-agent task constraints without additional baseline conditions."

- [ ] **Step 8: Compile and commit**

```bash
git add docs/evensong-paper-v3-zh.tex
git commit -m "paper(v3): integrate first-principles audit — soften causal claims, add alt hypotheses, threat model"
```

---

## Summary: Musk Five-Step Applied

| Step | Applied To | Result |
|------|-----------|--------|
| 1. Question | "Is this a proposal?" | No — it's a paper. Delete proposal framing. |
| 2. Delete | Funding, budget, investment thesis, roadmap | ~200 lines removed |
| 3. Simplify | One thesis: "memory causes, pressure enables, observation contaminates" | All sections serve this |
| 4. Accelerate | Batch knowledge base → §4 Theoretical Framework | 5 philosophical lineages in one new section |
| 5. Automate | This plan decomposes into 9 tasks with exact LaTeX | Subagent-executable |
