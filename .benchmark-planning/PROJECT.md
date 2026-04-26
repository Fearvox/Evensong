# Evensong × EverMind Benchmark Integration

## What This Is

为 EverMind 算法组跑行业标准 retrieval/memory benchmarks，验证 Nolan's hybrid retriever（BGE-M3 dense + BM25）在行业标准评估体系下的性能优势，并输出模型资源消耗对比数据（Latency / Token cost / Memory / Disk）。

两层目标：
1. **学术验证**：用 LOCOMO ET（ACL 2024）和 MTEB 等标准 benchmark 证明 hybrid 优势
2. **工程扩展**：给 or-shot.ts 补 Memory/Disk 资源消耗采集能力

## Core Value

在 EverMind 算法组正式 benchmark collaboration 通道打开（SEED-001 trigger: EverOS PR #196 merged）前，完成所有可独立准备的 benchmark 适配和验证工作。

## Requirements

### Active

- [ ] LOCOMO eval 集成 BGE-M3 dense retriever（替换 dragon/Contriever）
- [ ] MTEB RetrievalEvaluator 适配 — 对比 BM25 vs dense vs hybrid
- [ ] or-shot.ts 扩展：memory_mb + disk_mb 资源字段
- [ ] MemoryAgentBench 深度调研（ICLR 2026, 25K 下载）
- [ ] Benchmark 数据可视化 dashboard（给 EverMind 算法组看）

### Out of Scope

- EverOS PR #196 的 merge 工作（依赖 EverMind 侧）
- 实际跑 benchmark（需要 SEED-001 触发后）
- 非 OpenRouter 模型支持（or-shot 只覆盖 OR 模型）

## Context

**合作背景**：EverMind 算法组两个需求：
1. 测试学术 benchmark（LOCOMO ET）评估记忆系统
2. 对比新增模型排序的资源消耗（Latency / Token / Memory / Disk）

**Nolan's Hybrid 优势**（Wave 3 验证）：
- BGE-M3 dense top-1: 69.4%
- RRF fusion: 61.1%
- BM25 alone: 38.9%
- 在 title-paraphrase/concept/negation/chinese 全线碾压

**当前 benchmark 状态**：
- `benchmarks/evensong/or-shot.ts` — Nolan's 自建 harness，测软件工程能力
- `benchmarks/evensong/registry.jsonl` — 108 条 run 记录（R066-R070 全 finish_reason=length）
- LOCOMO repo: snap-research/locomo（ACL 2024, 795 stars）
- MTEB: 56 数据集，8 任务类型，支持 custom retriever 注入

**HuggingFace Benchmarks（已调研）**：
- MTEB/NQ, MTEB/MS MARCO — 支持 custom retriever 注入
- HotpotQA — 78K/月下载，multi-hop QA
- MemoryAgentBench — ICLR 2026, AR/TTL/LRU/CR 四维度
- LOCOMO — ACL 2024, 4 categories, dragon/Contriever retriever

## Constraints

- **Runtime**: Bun（or-shot.ts 已是 bun script）
- **API**: OpenRouter（or-shot 通过它调用各模型）
- **Retrieval**: BGE-M3 dense endpoint via private embedding host private network（已在 Wave 3 验证）
- **Timeline**: SEED-001 触发前完成所有准备，触发后直接开跑

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LOCOMO 先于 MTEB | EverMind 点名 LOCOMO，优先级最高 | — Pending |
| or-shot 资源扩展先于 MTEB | 2 行代码，当天可完成 | — Pending |
| Hybrid vs Dense 选 dense | Wave 3H Phase 4 验证 dense 69.4% 完胜 RRF 61.1% | — Pending |

---
*Last updated: 2026-04-22 after P10 strategic planning*
