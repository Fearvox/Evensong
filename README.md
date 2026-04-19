<h1 align="center">Evensong</h1>

<p align="center">
  <em>Reverse-engineered Claude Code. Hybrid memory retrieval that actually scales.<br/>
  <strong>Two formal artifacts (648 + 972 trials). Cross-LLM design. All raw data committed.</strong></em>
</p>

<p align="center">
  <a href="./README.md">🇺🇸 English</a> · <a href="./README-zh.md">🇨🇳 中文</a>
</p>

<p align="center">
  <a href="https://github.com/Fearvox/Evensong"><img src="https://img.shields.io/badge/Evensong-161A1D?style=for-the-badge&logo=github&logoColor=white" alt="Evensong"/></a>
  <a href="./LICENSE-APACHE"><img src="https://img.shields.io/badge/Code-Apache_2.0-3B82F6?style=for-the-badge&logo=apache&logoColor=white" alt="Code: Apache 2.0"/></a>
  <a href="./LICENSE-CC-BY-NC-ND"><img src="https://img.shields.io/badge/Research-CC_BY--NC--ND_4.0-6B7280?style=for-the-badge&logo=creative-commons&logoColor=white" alt="Research: CC BY-NC-ND 4.0"/></a>
  <a href="./README-zh.md"><img src="https://img.shields.io/badge/Bilingual-EN%20%2B%20ZH-FF6B35?style=for-the-badge&logo=translate&logoColor=white" alt="Bilingual"/></a>
</p>

<p align="center">
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Runtime-Bun-F472B6?style=for-the-badge&logo=bun&logoColor=white" alt="Bun"/></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-100%25-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
  <a href="./benchmarks/runs"><img src="https://img.shields.io/badge/Benchmark-972%2B648_trials-F59E0B?style=for-the-badge&logo=lightning&logoColor=white" alt="972+648-trial benchmark"/></a>
  <a href="https://github.com/EverMind-AI/EverOS"><img src="https://img.shields.io/badge/Dialogs_with-EverOS-00D4AA?style=for-the-badge&logo=brain&logoColor=white" alt="Dialogs with EverOS"/></a>
</p>

<p align="center">
  <a href="#-the-headline-result">📊 <strong>Headline benchmark</strong></a>
  &nbsp;·&nbsp;
  <a href="#-quick-start">⚡ Quick start</a>
  &nbsp;·&nbsp;
  <a href="#-architecture">🏗 Architecture</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Fearvox/Evensong/discussions">💬 Discussions</a>
</p>

---

## 目录

- [What this is](#what-this-is)
- [📊 The headline result](#-the-headline-result)
- [🏗 Architecture](#-architecture)
- [⚡ Quick start](#-quick-start)
- [📁 Directory layout](#-directory-layout)
- [🧩 Retrieval API](#-retrieval-api)
- [📚 Research notes](#-research-notes)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [🙏 Attribution](#-attribution)

---

## What this is

A **reverse-engineered, modifiable** implementation of Anthropic's Claude Code CLI, plus a **production-grade hybrid retrieval benchmark suite** for agent memory systems.

This repository exists to:

| Purpose | What that means |
|---|---|
| **Study** | Read the Claude Code source without the closed binary |
| **Extend** | Custom agent tools, retrieval pipelines, telemetry — none of the blocks are glued shut |
| **Benchmark** | Retrieve-and-Rerank (RaR) architectures with reproducible evidence — the bar EverMemOS §3.4 set, measured with our numbers |

<p align="right"><a href="#目录">↑ back to top</a></p>

---

## 📊 The headline result

**Two independent formal artifacts**, same harness + same 108-query cross-LLM design (generator = `grok-3`, judge = `deepseek/deepseek-v3.2`) + same 200-entry manifest (18 real `_vault` entries + 182 synthetic junk). Both committed raw under [`benchmarks/runs/`](./benchmarks/runs). Run against the Atomic Chat gateway in different load windows.

### Wave 3+F — 648-call two-pipeline run ✅

| Pipeline | Top-1 accuracy | p50 latency | p90 latency | Prompt token cost |
|----------|----------------|-------------|-------------|-------------------|
| LLM-only judge | 76.9% (249/324) | 2056 ms | 3595 ms | 100% (200 entries) |
| **Hybrid BM25 + LLM rerank** | **79.3%** (257/324) | **1509 ms** | **2725 ms** | **25%** (50 entries) |

Raw: [`benchmarks/runs/wave3d-hybrid-scale-2026-04-19T1220.md`](./benchmarks/runs/wave3d-hybrid-scale-2026-04-19T1220.md). Per-run stddev 0.00–0.44pp.

### Wave 3+G — 972-call three-pipeline formal re-run ✅

| Pipeline | Top-1 | p50 | p90 | Avg latency | LLM calls |
|----------|-------|-----|-----|-------------|-----------|
| LLM-only judge | 77.8% (252/324) | 3861 ms | 6404 ms | 4139 ms | 100% (200 entries) |
| Hybrid BM25 + LLM rerank | 77.5% (251/324) | 2919 ms | 4669 ms | 3248 ms | 100% (50 entries) |
| **Adaptive Hybrid** | **73.1%** (237/324) | **2519 ms** | **4376 ms** | **2365 ms** | **73%** (27% skip) |

Raw: [`benchmarks/runs/wave3g-pipelines-2026-04-19T1652.md`](./benchmarks/runs/wave3g-pipelines-2026-04-19T1652.md). Wall time: **10.5 min**. Per-run stddev: llm-only 0.76pp · hybrid 1.15pp · adaptive 0.76pp.

### What holds across both runs

| Property | Wave 3+F (648 calls) | Wave 3+G (972 calls) | Verdict |
|----------|----------------------|----------------------|---------|
| Hybrid vs LLM-only **latency** (p50) | **−27%** | **−24%** | ✅ consistent latency edge |
| Hybrid **prompt token cost** | **−75%** | **−75%** | ✅ identical |
| Hybrid vs LLM-only **top-1 accuracy** | **+2.5pp** | **−0.3pp** (parity) | ⚠️ run-to-run variance — within 2σ of per-run stddev |
| Adaptive **skip rate** | — (not run) | **26.9%** | ✅ dead-on internal prelim 27% |
| Adaptive **top-1** | — | **73.1%** | ✅ dead-on internal prelim |

### Honest read

- **The latency + token-cost edges are the rock-solid win.** Both runs agree: BM25 stage 1 narrowing the LLM's pool saves 22-27% p50 latency and 75% prompt tokens. That's what ships.
- **The accuracy edge is noisier than first measured.** Wave 3+F caught Hybrid +2.5pp over LLM-only. Wave 3+G's 972-call re-run caught parity (−0.3pp). Per-run stddev (0.8-1.2pp) + API-load-window variance together cover the delta. Treat Hybrid as *"accuracy parity-to-slight-edge vs LLM-only, with a consistent latency + token-cost win"* — not a strict accuracy winner.
- **The Adaptive tier is the real new contribution.** See the next subsection — trading −4.7pp accuracy for −43% avg latency and 27% zero-LLM queries, with the most stable per-run variance of the three pipelines (0.76pp).

Reproduce with one command (produces Wave 3+G's artifact):

```bash
bun run scripts/benchmark-hybrid-scale.ts \
  --runs=3 --with-body \
  --pipelines=llm-only,hybrid,adaptive \
  --queries-file=benchmarks/wave3f-generated-queries-2026-04-19.json
```

Generator prompt is committed too — reviewers can audit exactly how queries were produced.

### Adaptive tier (Wave 3+G, shipped 2026-04-19) ✅

The always-rerank Hybrid pays 1 LLM call per query. For a large fraction of queries, BM25 alone is already confidently correct — paying for the LLM adds latency without changing the top-1. The **`createAdaptiveHybridProvider`** adds a gap-ratio gate: if `BM25 scores[0] / scores[1] >= 1.5`, trust stage 1 and **skip the LLM entirely**. Else fall through to stage 2.

**Formal 972-call numbers** (3 runs × 108 queries, `benchmarks/runs/wave3g-pipelines-2026-04-19T1652.md`):

- Skip rate: **26.9%** (87/324 queries) — stage 2 LLM call avoided when BM25 is confident
- Top-1 on skipped: **58.6%** (51/87) — BM25-alone is right ~59% on its confident picks
- Top-1 on invoked: **78.5%** (186/237) — LLM resolves the ambiguous BM25 cases
- Overall Adaptive top-1: **73.1%** — matches internal preliminary dogfood exactly
- Latency: **avg 2365 ms / p90 4376 ms** (vs always-rerank hybrid 3248 / 4669, vs llm-only 4139 / 6404)
- Per-run stddev: **0.76pp** — the most stable of the three pipelines

**Trade-off**: −4.7pp top-1 accuracy vs llm-only buys **−43% avg latency**. The gate is a tuning knob: `gapRatioThreshold: 1.3` raises skip rate and drops accuracy; `2.0` reverts toward Hybrid parity.

**Positioning vs EverOS**: this fills the gap between EverOS's published Fast tier (0 LLM calls, 200-600 ms) and Agentic tier (1-3 LLM calls, 2-5 s) — **Adaptive Hybrid is 0 _or_ 1 conditional LLM call, with a user-tunable gating knob**. Not covered by any published EverOS / EverMemOS / HyperMem design.

See [`src/services/retrieval/providers/adaptiveHybridProvider.ts`](./src/services/retrieval/providers/adaptiveHybridProvider.ts) and the 7 unit tests in `adaptiveHybridProvider.test.ts`. Shipped at [`86bb4ee`](https://github.com/Fearvox/Evensong/commit/86bb4ee). **66/66 retrieval-domain tests pass.**

### Wave 3+H preview — dense stage 1 + RRF fusion (preliminary, not summarized) 🟡

A dense-retrieval lane using BGE-M3 (via ccr-droplet over Tailscale) and a Reciprocal Rank Fusion provider (k=10) is committed but **not** summarized in the headline above. Code shipped at [`5f2a646`](https://github.com/Fearvox/Evensong/commit/5f2a646); Codex-adversarial-review fixes (availability probe, RRF timeout/skip, harness contention) shipped as a follow-up. Early signal on a 20q × 206-entry smoke (handwritten reference set): BGE alone 20/20 (100%), BM25 alone 18/20 (90%), RRF(BM25, BGE) 19/20 (95%). Preliminary artifact: [`benchmarks/runs/wave3h-smoke-bge-rrf-*.md`](./benchmarks/runs). **Do not cite these numbers as production evidence** — the full 108q × 3-run cross-LLM re-run + RRF k-sweep (Phase 4/5) is pending.

<p align="right"><a href="#目录">↑ back to top</a></p>

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CCR — the reverse-engineered Claude Code runtime               │
│  src/entrypoints/cli.tsx → src/main.tsx → src/screens/REPL.tsx  │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Retrieval pipeline (Wave 3+)                                   │
│                                                                 │
│   manifestBuilder   BM25 index      atomicProvider              │
│   (reads vault →    (tokenize,      (LLM rerank via             │
│   VaultManifest)    score, topK)    Atomic Chat gateway)        │
│         │              │                    │                   │
│         └──────────────┴────────┬───────────┘                   │
│                                 ▼                               │
│                         hybridProvider                          │
│                    (stage1 → narrow → stage2)                   │
│                                 │                               │
│                     adaptiveHybridProvider                      │
│              (BM25 gap ≥ 1.5× → skip stage 2 LLM)               │
│                                 ▼                               │
│                         vaultRetrieve                           │
│                    (fallback chain orchestrator)                │
└─────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Atomic Chat gateway (http://127.0.0.1:1337/v1)                 │
│  Unified OpenAI-compatible endpoint proxying:                   │
│    • deepseek/deepseek-v3.2 (primary judge)                     │
│    • grok-3, grok-4-*-fast-reasoning (xAI)                      │
│    • MiniMax-M2.7, qwen/qwen3.6-plus, openrouter/auto:free      │
│    • local Gemma-4-E4B via llama.cpp (offline fallback)         │
└─────────────────────────────────────────────────────────────────┘
```

See [`AGENTS.md`](./AGENTS.md) and [`CLAUDE.md`](./CLAUDE.md) for detailed developer notes.

<p align="right"><a href="#目录">↑ back to top</a></p>

---

## ⚡ Quick start

**Prerequisites**: [Bun](https://bun.sh) 1.3+ (Node.js not supported). Atomic Chat running on `127.0.0.1:1337` for retrieval features ([docs](https://atomicchat.io)).

```bash
# 1. Install
bun install

# 2. Dev mode REPL
bun run dev

# 3. Build single-file bundle (~27MB)
bun run build      # → dist/cli.js

# 4. Run the retrieval test suite
bun test src/services/retrieval src/services/api

# 5. Fire an ad-hoc vault retrieval
bun run scripts/vault-recall.ts "hypergraph memory for conversations"

# 6. Replay the 648-trial hybrid vs LLM-only benchmark
bun run scripts/benchmark-hybrid-scale.ts --runs=3 --with-body \
  --queries-file=benchmarks/wave3f-generated-queries-2026-04-19.json
```

<p align="right"><a href="#目录">↑ back to top</a></p>

---

## 📁 Directory layout

```
src/                 Reverse-engineered CCR core (CLI, REPL, tools, state)
src/services/
  api/localGemma.ts           Atomic Chat OpenAI-compat client + model registry
  retrieval/                  Hybrid RaR + manifest builder + BM25 + providers
packages/
  research-vault-mcp/         MCP server for the research vault (npx-ready)
scripts/
  benchmark-hybrid-scale.ts       Scale benchmark harness (--runs, --concurrency)
  benchmark-judge.ts              Single-pipeline judge benchmark
  generate-benchmark-queries.ts   Cross-LLM query generator (grok-3)
  vault-recall.ts                 CLI entrypoint for ad-hoc retrieval
  dogfood-wave2b.ts               Model-comparison harness
benchmarks/
  wave3f-generated-queries-*.json  108-query set, committed for reproducibility
  wave3-judge-queries.json         Original 20-query manual set
  runs/                            Raw JSONL + Markdown summaries
docs/                 Design specs, plans, debug notes
tests/                Regression + integration suites
services/             8-service microservice suite used inside benchmarks
api/                  HTTP relay / provider fallback chain
```

<p align="right"><a href="#目录">↑ back to top</a></p>

---

## 🧩 Retrieval API

Library usage — compose the hybrid pipeline manually for custom flows:

```ts
import { createLocalGemmaClient, ATOMIC_MODELS } from 'src/services/api/localGemma'
import { createAtomicProvider } from 'src/services/retrieval/providers/atomicProvider'
import { createBM25Provider } from 'src/services/retrieval/providers/bm25Provider'
import { createHybridProvider } from 'src/services/retrieval/providers/hybridProvider'
import { createAdaptiveHybridProvider } from 'src/services/retrieval/providers/adaptiveHybridProvider'
import { buildVaultManifest } from 'src/services/retrieval/manifestBuilder'
import { vaultRetrieve } from 'src/services/retrieval/vaultRetrieve'

const manifest = await buildVaultManifest({ vaultRoot: '_vault', withBody: true })

// Always-rerank Hybrid — pays 1 LLM call per query for max accuracy.
const hybrid = createHybridProvider({
  stage1: createBM25Provider(),
  stage2: createAtomicProvider(
    createLocalGemmaClient({ model: ATOMIC_MODELS.DEEPSEEK_V32 })
  ),
  stage1TopK: 50,
})

// Adaptive variant — skips the LLM when BM25 is confidently top-1.
// Trade-off: −4.7pp top-1 for −67% avg latency. See Adaptive tier above.
const adaptive = createAdaptiveHybridProvider({
  stage2: createAtomicProvider(
    createLocalGemmaClient({ model: ATOMIC_MODELS.DEEPSEEK_V32 })
  ),
  gapRatioThreshold: 1.5,  // skip stage 2 when scores[0] / scores[1] >= 1.5
})

const result = await vaultRetrieve(
  { query: 'hypergraph memory for long-term conversations', manifest, topK: 5 },
  { providers: [hybrid] },  // or [adaptive] for the gated variant
)
```

**Available providers**: `createAtomicProvider`, `createBM25Provider`, `createHybridProvider`, `createAdaptiveHybridProvider`. All implement the `VaultRetrievalProvider` contract — compose or swap freely.

<p align="right"><a href="#目录">↑ back to top</a></p>

---

## 📚 Research notes

This project dialogs with recent published work on agentic memory systems:

| Work | Reference | How we use it |
|---|---|---|
| **EverMemOS** | [arxiv 2601.02163](https://arxiv.org/abs/2601.02163) (EverMind / Shanda) | We adopt §3.4 two-stage pattern. Simplified stage 2 to direct listwise judge (no verifier loop). |
| **HyperMem** | arxiv 2604.08256 | Three-layer hypergraph memory — cited as related art. |
| **MemGPT** | arxiv 2310.08560 | LLM-as-OS paging; benchmark includes MemGPT query category. |
| **MSA** | arxiv 2604.08256 | Memory Sparse Attention — not integrated, benchmarked for comparison. |
| **Reflexion** | arxiv 2303.11366 | Self-reflective agents — query set includes Reflexion-style tasks. |
| **Extended Mind** | Clark & Chalmers 1998 | Philosophical grounding for external-memory-as-cognition. |

The full 108-query test corpus with provenance is at [`benchmarks/wave3f-generated-queries-2026-04-19.json`](./benchmarks/wave3f-generated-queries-2026-04-19.json).

<p align="right"><a href="#目录">↑ back to top</a></p>

---

## 🤝 Contributing

We welcome PRs — especially around:

- **Dense-vector stage 1** providers (BGE-M3 integration, RRF fusion with BM25) 🔴
- **Adaptive gating threshold auto-calibration** — the 1.5× gap-ratio default is a conservative hand-pick; PRs welcome to sweep thresholds against live query distributions (gate itself already shipped at [`86bb4ee`](https://github.com/Fearvox/Evensong/commit/86bb4ee) ✅)
- **Additional model connectors** via the `atomicProvider` factory
- **New benchmark categories** (adversarial queries, multi-intent, negation traps)
- **Vault-size scaling** experiments (100 / 500 / 1000+ entries)

Templates are in place for:

- 🐛 [Bug reports](.github/ISSUE_TEMPLATE/bug_report.yml)
- ✨ [Feature requests](.github/ISSUE_TEMPLATE/feature_request.yml)
- 📊 [Benchmark reports](.github/ISSUE_TEMPLATE/benchmark_report.yml)
- 🔀 [Pull request template](.github/PULL_REQUEST_TEMPLATE.md)
- 💬 [Discussions](https://github.com/Fearvox/Evensong/discussions) — ideas, Q&A, show-and-tell, benchmarks

File an issue before non-trivial PRs to align on shape.

<p align="right"><a href="#目录">↑ back to top</a></p>

---

## 📄 License

**Dual-licensed**. See [LICENSING.md](./LICENSING.md) for per-directory mapping and compatibility matrix.

| Applies to | License | File |
|---|---|---|
| Source code, tests, benchmarks, scripts, configs, developer docs | **Apache License 2.0** | [LICENSE-APACHE](./LICENSE-APACHE) |
| Research papers, long-form narrative | **CC BY-NC-ND 4.0** | [LICENSE-CC-BY-NC-ND](./LICENSE-CC-BY-NC-ND) |

All code is Apache 2.0 and can be freely incorporated into other Apache-compatible open-source projects (including [EverMind-AI/EverOS](https://github.com/EverMind-AI/EverOS)).

<p align="right"><a href="#目录">↑ back to top</a></p>

---

## 🙏 Attribution

Created by **[Fearvox / 0xVox](https://github.com/Fearvox)** (Hengyuan Zhu).

The CCR runtime is a clean-room reverse-engineered study of Anthropic's Claude Code CLI. All identifying strings, telemetry endpoints, and internal APIs have been stubbed or removed. This repository makes no claims over Anthropic's trademarks or original binary design.

Upstream lineage: derived from the community reverse-engineered baseline at [github.com/claude-code-best/claude-code](https://github.com/claude-code-best/claude-code) (CCB). CCR continues from that foundation with additional infrastructure, retrieval pipeline, benchmark harness, and packaging work.

The hybrid retrieval architecture, benchmark harness, and all original code in `src/services/retrieval/`, `scripts/benchmark-*.ts`, and `benchmarks/wave3*` are original work, independently inspired by the EverMemOS published design.

<p align="right"><a href="#目录">↑ back to top</a></p>

---

<p align="center">
  <strong>If you build an agent memory system on top of this, we'd love to hear about it.</strong>
</p>

<p align="center">
  <a href="https://github.com/Fearvox/Evensong/issues/new/choose">Open an issue</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Fearvox/Evensong/discussions">Start a discussion</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Fearvox/Evensong">⭐ Star the repo</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Fearvox/Evensong/fork">Fork and ship</a>
</p>
