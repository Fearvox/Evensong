# Wave 3+ D' — Hybrid Scale Benchmark

- Manifest: **200 entries** (18 real + 182 junk)
- Queries: **108**
- Runs per (pipeline × query): **3**
- Pipelines: **llm-only** (deepseek-v3.2 over full manifest) vs **hybrid** (BM25 top-50 → deepseek-v3.2)
- Total calls: **648**

## Aggregated (all runs flattened)

| Pipeline | Top-1 | Top-5 | p50 latency | p90 latency | Avg manifest handed to LLM |
|----------|-------|-------|-------------|-------------|-----------------------------|
| llm-only | 249/324 (76.9%) | 289/324 (89.2%) | 2056ms | 3595ms | 200 |
| hybrid | 257/324 (79.3%) | 287/324 (88.6%) | 1509ms | 2725ms | 50 |

## Per-run top-1 accuracy (variance inspection)

| Pipeline | run 0 | run 1 | run 2 | mean | stddev |
| --- | --- | --- | --- | --- | --- |
| llm-only | 76.9% | 76.9% | 76.9% | 76.85% | 0.00 pp |
| hybrid | 78.7% | 79.6% | 79.6% | 79.32% | 0.44 pp |

## Per-query run-to-run consistency

| Pipeline | Queries w/ identical top-1 across all runs | Partial disagreement |
|----------|---------------------------------------------|----------------------|
| llm-only | 100/108 | 8/108 |
| hybrid | 100/108 | 8/108 |

## Top-1 disagreements between pipelines (any run)

- **Q9** "What are the stats for AI Day 2026 event attendance and sess"  ideal=`20260411-garnet-ai-digest-division-of-it-at-usc.md`  llm→`20260411-garnet-ai-digest-division-of-it-at-usc.md`  hybrid→`20260411-garnet-ai-digest-division-of-it-at-usc.md`
- **Q17** "I'm not looking for AI benefits, but risks of autonomous AI "  ideal=`20260411-2510-05179v2.md`  llm→`20260411-evensong-paper-zh.md`  hybrid→`20260411-evensong-paper-zh.md`
- **Q30** "What are innovative memory models for AI conversation system"  ideal=`20260411-2604-08256-hypermem.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2604-08256-hypermem.md`
- **Q36** "What are the effects of memory systems on autonomous technol"  ideal=`20260411-evensong-paper-zh.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2310-08560-memgpt.md`
- **Q38** "What methods allow AI agents to learn from past mistakes usi"  ideal=`20260411-2303-11366-reflexion.md`  llm→`20260411-2303-11366-reflexion.md`  hybrid→`20260411-evensong-paper-zh.md`
- **Q39** "What are the results of language agents on HumanEval Python "  ideal=`20260411-2303-11366-reflexion.md`  llm→`20260411-2303-11366-reflexion.md`  hybrid→`20260411-2303-11366-reflexion.md`
- **Q42** "Can AI systems get better at coding tasks through memory tec"  ideal=`20260411-2303-11366-reflexion.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-evensong-paper-zh.md`
- **Q44** "What approach helps language models manage memory across mul"  ideal=`20260411-2310-08560-memgpt.md`  llm→`20260411-2310-08560-memgpt.md`  hybrid→`20260411-msa-memory-sparse-attention.md`
- **Q47** "I'm not looking for basic AI chatbots, but advanced memory m"  ideal=`20260411-2310-08560-memgpt.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-competitor-landscape.md`
- **Q48** "What are innovative ways to handle memory in AI systems?"  ideal=`20260411-2310-08560-memgpt.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2604-08256-hypermem.md`
- **Q56** "How can engineering be approached using fundamental scientif"  ideal=`20260411-elon-musk-biography.md`  llm→`20260411-elon-musk-biography.md`  hybrid→`20260411-leo-harness-engineering-3d.md`
- **Q57** "What is the Idiot Index and how is it calculated for rockets"  ideal=`20260411-elon-musk-biography.md`  llm→`20260411-elon-musk-biography.md`  hybrid→`20260411-elon-musk-biography.md`
- **Q59** "I'm not looking for general biographies but specific methods"  ideal=`20260411-elon-musk-biography.md`  llm→`20260411-elon-musk-biography.md`  hybrid→`20260411-leo-harness-engineering-3d.md`
- **Q60** "Can you explain innovative approaches to production efficien"  ideal=`20260411-elon-musk-biography.md`  llm→`20260411-elon-musk-biography.md`  hybrid→`20260411-1803-03635-lottery-ticket-hypothesis.md`
- **Q65** "I'm not looking for general psychology but specifically dual"  ideal=`20260411-thinking-fast-and-slow.md`  llm→`20260411-thinking-fast-and-slow.md`  hybrid→`20260411-2307-11760-emotionprompt.md`
- **Q67** "How can attention mechanisms handle extremely large token co"  ideal=`20260411-msa-memory-sparse-attention.md`  llm→`20260411--1706-03762-attention-is-all-you-need.md`  hybrid→`20260411-msa-memory-sparse-attention.md`
- **Q69** "Can a 4B parameter model outperform a 235B model in question"  ideal=`20260411-msa-memory-sparse-attention.md`  llm→`20260411-1803-03635-lottery-ticket-hypothesis.md`  hybrid→`20260411--1706-03762-attention-is-all-you-need.md`
- **Q77** "I'm not looking for basic AI storage info, but how memory sh"  ideal=`20260411-hermes-evensong-synthesis.md`  llm→`20260411-evensong-paper-zh.md`  hybrid→`20260411-hermes-evensong-synthesis.md`
- **Q78** "What are the latest findings on how AI processes memory and "  ideal=`20260411-hermes-evensong-synthesis.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-evensong-paper-zh.md`
- **Q81** "Can you find information on the Parity Principle in AI cogni"  ideal=`20260411-philosophy-supervisor-evensong.md`  llm→`20260411-thinking-fast-and-slow.md`  hybrid→`20260411-evensong-paper-zh.md`
- **Q84** "What are the latest theories connecting philosophy and artif"  ideal=`20260411-philosophy-supervisor-evensong.md`  llm→`20260411-philosophy-supervisor-evensong.md`  hybrid→`20260411-philosophy-supervisor-evensong.md`
- **Q87** "What is the parity principle in cognitive science discussion"  ideal=`20260411-clark-chalmers-extended-mind.md`  llm→`20260411-thinking-fast-and-slow.md`  hybrid→`20260411-clark-chalmers-extended-mind.md`
- **Q88** "外部工具如何成为认知的一部分？"  ideal=`20260411-clark-chalmers-extended-mind.md`  llm→`20260411-2310-08560-memgpt.md`  hybrid→`20260411-clark-chalmers-extended-mind.md`
- **Q89** "I'm not looking for internal memory theories, but for ideas "  ideal=`20260411-clark-chalmers-extended-mind.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2310-08560-memgpt.md`
- **Q90** "Can objects outside us influence how we think and believe?"  ideal=`20260411-clark-chalmers-extended-mind.md`  llm→`20260411-evensong-paper-zh.md`  hybrid→`20260411-clark-chalmers-extended-mind.md`
- **Q92** "What are effective methods to critically analyze foundationa"  ideal=`20260411-evensong-first-principles-audit.md`  llm→`20260411-elon-musk-biography.md`  hybrid→`20260411-evensong-first-principles-audit.md`
- **Q93** "Can you explain the impact of cultural differences on stress"  ideal=`20260411-evensong-first-principles-audit.md`  llm→`20260411-elon-musk-biography.md`  hybrid→`20260411-thinking-fast-and-slow.md`
- **Q96** "What are some strategies for identifying flaws in AI memory "  ideal=`20260411-evensong-first-principles-audit.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-competitor-landscape.md`
- **Q99** "What is the SSOT routing table in AI agent engineering?"  ideal=`20260411-leo-harness-engineering-3d.md`  llm→`20260411-2310-08560-memgpt.md`  hybrid→`20260411-msa-memory-sparse-attention.md`
- **Q101** "I'm not looking for basic AI tutorials but specific scaling "  ideal=`20260411-leo-harness-engineering-3d.md`  llm→`20260411-leo-harness-engineering-3d.md`  hybrid→`20260411-leo-harness-engineering-3d.md`
- **Q104** "How does memory influence the actions of artificial intellig"  ideal=`20260411-competitor-landscape.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2310-08560-memgpt.md`
- **Q106** "智能代理的记忆如何影响其行为表现？"  ideal=`20260411-competitor-landscape.md`  llm→`20260411-evensong-paper-zh.md`  hybrid→`20260411-evensong-paper-zh.md`
- **Q108** "Can you show me the latest research on AI memory systems and"  ideal=`20260411-competitor-landscape.md`  llm→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-competitor-landscape.md`

