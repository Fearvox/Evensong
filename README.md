<div align="center">

# Evensong

### Reverse-engineered Claude Code · Hybrid memory retrieval research · Open benchmarks

[![License: Apache 2.0](https://img.shields.io/badge/code-Apache%202.0-blue.svg)](./LICENSE-APACHE)
[![License: CC BY-NC-ND 4.0](https://img.shields.io/badge/research-CC%20BY--NC--ND%204.0-lightgrey.svg)](./LICENSE-CC-BY-NC-ND)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)
[![Language: TypeScript](https://img.shields.io/badge/lang-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests: 84 passing](https://img.shields.io/badge/tests-84%20passing-brightgreen.svg)](./src)
[![Benchmarks: 648-trial](https://img.shields.io/badge/benchmarks-648%20trial-orange.svg)](./benchmarks/runs)

English · [中文](./README-zh.md)

</div>

---

## What this is

A **reverse-engineered, modifiable** implementation of Anthropic's Claude Code
CLI plus a **production-grade hybrid retrieval benchmark suite** for agent
memory systems.

This repository exists to:

1. **Study** how Claude Code works at the source level, without the closed binary
2. **Extend** it with custom agent tooling, retrieval pipelines, and telemetry
3. **Benchmark** retrieval-and-rerank architectures against EverMemOS §3.4 and
   similar memory-system designs, with publishable, reproducible evidence

## The headline result

On a 200-entry knowledge vault, across **648 trials** (108 generated queries
× 2 pipelines × 3 runs), with a **cross-LLM** design to rule out
self-correlation bias:

| Pipeline | Top-1 accuracy | p50 latency | p90 latency | Prompt token cost |
|----------|----------------|-------------|-------------|-------------------|
| LLM-only judge | 76.9% (249/324) | 2056 ms | 3595 ms | 100% (200 entries) |
| **Hybrid BM25 + LLM rerank** | **79.3%** (257/324) | **1509 ms** | **2725 ms** | **25%** (50 entries) |

Hybrid **+2.5pp top-1, −27% p50 latency, −24% p90 latency, −75% prompt cost**.
Per-run stddev 0.00–0.44pp means the difference is well outside noise.

Reproduce in one command:

```bash
bun run scripts/benchmark-hybrid-scale.ts \
  --runs=3 --with-body \
  --queries-file=benchmarks/wave3f-generated-queries-2026-04-19.json
```

Raw results are committed under [`benchmarks/runs/`](./benchmarks/runs) as
JSONL and Markdown summaries. The generator prompt is committed too, so
reviewers can audit exactly how queries were produced.

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  CCR — the reverse-engineered Claude Code runtime               │
│  src/entrypoints/cli.tsx → src/main.tsx → src/screens/REPL.tsx  │
└────────────────┬────────────────────────────────────────────────┘
                 │ uses
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Retrieval pipeline (Wave 3+ — this release)                    │
│                                                                 │
│   manifestBuilder   BM25 index      atomicProvider              │
│   (reads vault →    (tokenize,      (LLM rerank via             │
│   VaultManifest)    score, topK)    Atomic Chat gateway)        │
│         │              │                    │                   │
│         └──────────────┴────────┬───────────┘                   │
│                                 ▼                               │
│                         hybridProvider                          │
│                    (stage1 → narrow → stage2)                   │
│                                 ▼                               │
│                         vaultRetrieve                           │
│                    (fallback chain orchestrator)                │
└─────────────────────────────────────────────────────────────────┘
                 │ backed by
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Atomic Chat gateway (http://127.0.0.1:1337/v1) —               │
│  unified OpenAI-compatible endpoint proxying:                   │
│    • deepseek/deepseek-v3.2 (primary judge)                     │
│    • grok-3, grok-4-*-fast-reasoning (xAI)                      │
│    • MiniMax-M2.7, qwen/qwen3.6-plus, openrouter/auto:free      │
│    • local Gemma-4-E4B via llama.cpp (offline fallback)         │
└─────────────────────────────────────────────────────────────────┘
```

See [`AGENTS.md`](./AGENTS.md) and [`CLAUDE.md`](./CLAUDE.md) for detailed
developer notes.

## Quick start

```bash
# 1. Install dependencies (Bun required, Node.js not supported)
bun install

# 2. Run the CCR CLI in dev mode
bun run dev
# or: bun run src/entrypoints/cli.tsx

# 3. Build the single-file bundle (~27MB, Bun target)
bun run build
# outputs: dist/cli.js

# 4. Run the retrieval test suite
bun test src/services/retrieval src/services/api

# 5. Fire off a real-vault retrieval from the CLI
bun run scripts/vault-recall.ts "hypergraph memory for conversations"

# 6. Replay the 648-trial hybrid vs LLM-only benchmark
bun run scripts/benchmark-hybrid-scale.ts --runs=3 --with-body \
  --queries-file=benchmarks/wave3f-generated-queries-2026-04-19.json
```

## Directory layout

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

## Retrieval API surface (library usage)

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
  { query: 'hypergraph memory for long-term conversations', manifest, topK: 5 },
  { providers: [hybrid] },
)
```

## Research notes

This project dialogs with recent published work on agentic memory systems:

- **EverMemOS** (arxiv 2601.02163) — reference hybrid-retrieval architecture
  from EverMind / Shanda. We adopt their §3.4 staging model with a simplified
  direct listwise judge in place of the sufficiency-verifier loop.
- **HyperMem** — three-layer hypergraph memory; cited as related art.
- **MemGPT**, **MSA (Memory Sparse Attention)**, **Reflexion**,
  **Clark & Chalmers — The Extended Mind**.

See [`benchmarks/wave3f-generated-queries-2026-04-19.json`](./benchmarks/wave3f-generated-queries-2026-04-19.json)
for the full 108-query test corpus used in the headline benchmark.

## Contributing

We welcome PRs, especially around:

- Dense-vector stage 1 providers (BGE-M3 integration, RRF fusion)
- Adaptive gating (skip stage 2 when BM25 confidence is high — calibration
  data already present in `benchmarks/runs/`)
- Additional model connectors via the `atomicProvider` factory
- New benchmark query categories, vault-size scaling experiments

Please file an issue first for non-trivial contributions so we can align on
shape. All PRs are accepted under the code-portion license (Apache 2.0) —
see [LICENSING.md](./LICENSING.md) for the full contribution licensing story.

## License

**Dual-licensed**. See [LICENSING.md](./LICENSING.md) for the full per-directory
mapping and compatibility matrix.

- Code, tests, benchmarks, scripts, configs, developer docs → **Apache License 2.0**
- Research paper text and long-form narrative → **CC BY-NC-ND 4.0**

All code in this repository is Apache 2.0 and can be freely incorporated into
other Apache-compatible open-source projects.

## Attribution

Created by **[Fearvox / 0xVox](https://github.com/Fearvox)** (Hengyuan Zhu).

The CCR runtime is a clean-room reimplementation / reverse-engineered study
of Anthropic's Claude Code CLI. This repository makes no claims to ownership
over Anthropic's trademarks or original binary design; all identifying
strings, telemetry endpoints, and internal APIs have been stubbed or removed.

The hybrid retrieval architecture, benchmark harness, and all original code
in `src/services/retrieval/`, `scripts/benchmark-*.ts`, and
`benchmarks/wave3*` are original work, independently inspired by the
EverMemOS published design.

---

<div align="center">

**If you build an agent memory system on top of this, we'd love to hear about it.**

Open an issue · Star the repo · Fork and ship

</div>
