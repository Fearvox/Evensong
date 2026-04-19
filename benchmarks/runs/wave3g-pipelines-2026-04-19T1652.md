# Wave 3+ D' + G — Hybrid + Adaptive Scale Benchmark

- Manifest: **200 entries** (18 real + 182 junk)
- Queries: **108**
- Runs per (pipeline × query): **3**
- Pipelines: **llm-only** (deepseek-v3.2 over full manifest) · **hybrid** (BM25 top-50 → deepseek-v3.2) · **adaptive** (BM25 top-50, skip stage 2 when BM25 gap_ratio ≥ 1.5)
- Total calls: **972**

## Aggregated (all runs flattened)

| Pipeline | Top-1 | Top-5 | p50 latency | p90 latency | Avg latency | Avg manifest handed to LLM |
|----------|-------|-------|-------------|-------------|-------------|-----------------------------|
| llm-only | 252/324 (77.8%) | 295/324 (91.0%) | 3861ms | 6404ms | 4139ms | 200 |
| hybrid | 251/324 (77.5%) | 289/324 (89.2%) | 2919ms | 4669ms | 3248ms | 50 |
| adaptive | 237/324 (73.1%) | 292/324 (90.1%) | 2519ms | 4376ms | 2365ms | 50 on 73% of queries, 0 on 27% (skipped) |

## Adaptive gating stats

- Skip rate: **87/324 (26.9%)** — stage 2 LLM call avoided when BM25 gap_ratio ≥ 1.5
- Top-1 on skipped queries: **51/87 (58.6%)** — how often BM25 alone got it right on its confident picks
- Top-1 on invoked queries: **186/237 (78.5%)** — how often stage 2 LLM resolved the ambiguous BM25 cases
- Gate threshold: gap_ratio = scores[0] / scores[1] ≥ 1.5

## Per-run top-1 accuracy (variance inspection)

| Pipeline | run 0 | run 1 | run 2 | mean | stddev |
| --- | --- | --- | --- | --- | --- |
| llm-only | 76.9% | 78.7% | 77.8% | 77.78% | 0.76 pp |
| hybrid | 78.7% | 77.8% | 75.9% | 77.47% | 1.15 pp |
| adaptive | 73.1% | 72.2% | 74.1% | 73.15% | 0.76 pp |

## Per-query run-to-run consistency

| Pipeline | Queries w/ identical top-1 across all runs | Partial disagreement |
|----------|---------------------------------------------|----------------------|
| llm-only | 105/108 | 3/108 |
| hybrid | 94/108 | 14/108 |
| adaptive | 98/108 | 10/108 |

## Top-1 disagreements between pipelines (any run)

- **Q9** "What are the stats for AI Day 2026 event attendance and sess"  ideal=`20260411-garnet-ai-digest-division-of-it-at-usc.md`  llm-only→` | 20260411-garnet-ai-digest-division-of-it-at-usc.md`  hybrid→` | 20260411-garnet-ai-digest-division-of-it-at-usc.md`  adaptive→` | 20260411-garnet-ai-digest-division-of-it-at-usc.md`
- **Q13** "How can language models become security risks within compani"  ideal=`20260411-2510-05179v2.md`  llm-only→`20260411-2510-05179v2.md`  hybrid→`20260411-2510-05179v2.md`  adaptive→`20260411-2307-11760-emotionprompt.md`
- **Q17** "I'm not looking for AI benefits, but risks of autonomous AI "  ideal=`20260411-2510-05179v2.md`  llm-only→`20260411-2510-05179v2.md`  hybrid→`20260411-evensong-paper-zh.md`  adaptive→`20260411-garnet-ai-digest-division-of-it-at-usc.md`
- **Q20** "What theory explains why some small subnetworks perform as w"  ideal=`20260411-1803-03635-lottery-ticket-hypothesis.md`  llm-only→`20260411-1803-03635-lottery-ticket-hypothesis.md`  hybrid→`20260411-1803-03635-lottery-ticket-hypothesis.md`  adaptive→`20260411-2310-08560-memgpt.md`
- **Q25** "What’s the latest approach for storing extended chat histori"  ideal=`20260411-2604-08256-hypermem.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2604-08256-hypermem.md`  adaptive→`20260411-philosophy-supervisor-evensong.md`
- **Q26** "How can complex relationships in conversations be modeled be"  ideal=`20260411-2604-08256-hypermem.md`  llm-only→`20260411-2604-08256-hypermem.md | 20260411-msa-memory-sparse-attention.md`  hybrid→`20260411-2604-08256-hypermem.md`  adaptive→`20260411-2307-11760-emotionprompt.md`
- **Q30** "What are innovative memory models for AI conversation system"  ideal=`20260411-2604-08256-hypermem.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2604-08256-hypermem.md | 20260411-competitor-landscape.md`  adaptive→`20260411-2604-08256-hypermem.md | 20260411-competitor-landscape.md`
- **Q36** "What are the effects of memory systems on autonomous technol"  ideal=`20260411-evensong-paper-zh.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2310-08560-memgpt.md | 20260411-msa-memory-sparse-attention.md`  adaptive→`20260411-2310-08560-memgpt.md`
- **Q38** "What methods allow AI agents to learn from past mistakes usi"  ideal=`20260411-2303-11366-reflexion.md`  llm-only→`20260411-2303-11366-reflexion.md`  hybrid→`20260411-evensong-paper-zh.md`  adaptive→`20260411-evensong-paper-zh.md`
- **Q39** "What are the results of language agents on HumanEval Python "  ideal=`20260411-2303-11366-reflexion.md`  llm-only→`20260411-2510-05179v2.md`  hybrid→`20260411-2510-05179v2.md | 20260411-2303-11366-reflexion.md`  adaptive→`20260411-2303-11366-reflexion.md`
- **Q42** "Can AI systems get better at coding tasks through memory tec"  ideal=`20260411-2303-11366-reflexion.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-competitor-landscape.md`  adaptive→`20260411-garnet-ai-digest-division-of-it-at-usc.md`
- **Q43** "How can language models function like computer systems?"  ideal=`20260411-2310-08560-memgpt.md`  llm-only→`20260411-2310-08560-memgpt.md`  hybrid→`20260411-2310-08560-memgpt.md`  adaptive→`20260411-2307-11760-emotionprompt.md`
- **Q45** "How does the virtual context management mechanism work in la"  ideal=`20260411-2310-08560-memgpt.md`  llm-only→`20260411-2310-08560-memgpt.md`  hybrid→`20260411-2310-08560-memgpt.md | 20260411-2604-08256-hypermem.md`  adaptive→`20260411-2310-08560-memgpt.md`
- **Q47** "I'm not looking for basic AI chatbots, but advanced memory m"  ideal=`20260411-2310-08560-memgpt.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-competitor-landscape.md`  adaptive→`20260411-competitor-landscape.md`
- **Q48** "What are innovative ways to handle memory in AI systems?"  ideal=`20260411-2310-08560-memgpt.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2310-08560-memgpt.md | 20260411-2604-08256-hypermem.md`  adaptive→`20260411-2604-08256-hypermem.md`
- **Q51** "What is the impact of EmotionPrompt on BIG-Bench scores?"  ideal=`20260411-2307-11760-emotionprompt.md`  llm-only→`20260411-2307-11760-emotionprompt.md`  hybrid→` | 20260411-2307-11760-emotionprompt.md`  adaptive→`20260411-2307-11760-emotionprompt.md`
- **Q53** "I’m not looking for technical AI tuning, but how emotions af"  ideal=`20260411-2307-11760-emotionprompt.md`  llm-only→`20260411-2307-11760-emotionprompt.md`  hybrid→`20260411-2307-11760-emotionprompt.md | 20260411-evensong-paper-zh.md`  adaptive→`20260411-2307-11760-emotionprompt.md`
- **Q56** "How can engineering be approached using fundamental scientif"  ideal=`20260411-elon-musk-biography.md`  llm-only→`20260411-elon-musk-biography.md`  hybrid→`20260411-leo-harness-engineering-3d.md`  adaptive→`20260411-leo-harness-engineering-3d.md`
- **Q57** "What is the Idiot Index and how is it calculated for rockets"  ideal=`20260411-elon-musk-biography.md`  llm-only→`(none)`  hybrid→` | 20260411-elon-musk-biography.md`  adaptive→` | 20260411-elon-musk-biography.md`
- **Q59** "I'm not looking for general biographies but specific methods"  ideal=`20260411-elon-musk-biography.md`  llm-only→`20260411-elon-musk-biography.md`  hybrid→`20260411-leo-harness-engineering-3d.md`  adaptive→`20260411-garnet-ai-digest-division-of-it-at-usc.md`
- **Q60** "Can you explain innovative approaches to production efficien"  ideal=`20260411-elon-musk-biography.md`  llm-only→`20260411-elon-musk-biography.md`  hybrid→`20260411-1803-03635-lottery-ticket-hypothesis.md`  adaptive→`20260411-2307-11760-emotionprompt.md`
- **Q65** "I'm not looking for general psychology but specifically dual"  ideal=`20260411-thinking-fast-and-slow.md`  llm-only→`20260411-thinking-fast-and-slow.md`  hybrid→`20260411-clark-chalmers-extended-mind.md | 20260411-2307-11760-emotionprompt.md`  adaptive→`20260411-clark-chalmers-extended-mind.md | 20260411-2307-11760-emotionprompt.md`
- **Q66** "What are some theories about how the mind makes quick decisi"  ideal=`20260411-thinking-fast-and-slow.md`  llm-only→`20260411-thinking-fast-and-slow.md`  hybrid→`20260411-thinking-fast-and-slow.md`  adaptive→`20260411-philosophy-supervisor-evensong.md`
- **Q67** "How can attention mechanisms handle extremely large token co"  ideal=`20260411-msa-memory-sparse-attention.md`  llm-only→`20260411--1706-03762-attention-is-all-you-need.md`  hybrid→`20260411-msa-memory-sparse-attention.md`  adaptive→`20260411-msa-memory-sparse-attention.md`
- **Q69** "Can a 4B parameter model outperform a 235B model in question"  ideal=`20260411-msa-memory-sparse-attention.md`  llm-only→`20260411-1803-03635-lottery-ticket-hypothesis.md`  hybrid→`20260411-msa-memory-sparse-attention.md | 20260411--1706-03762-attention-is-all-you-need.md`  adaptive→`20260411-msa-memory-sparse-attention.md | 20260411--1706-03762-attention-is-all-you-need.md`
- **Q74** "How does artificial intelligence transform memory into a sys"  ideal=`20260411-hermes-evensong-synthesis.md`  llm-only→`20260411-evensong-paper-zh.md`  hybrid→`20260411-hermes-evensong-synthesis.md`  adaptive→`20260411-hermes-evensong-synthesis.md`
- **Q77** "I'm not looking for basic AI storage info, but how memory sh"  ideal=`20260411-hermes-evensong-synthesis.md`  llm-only→`20260411-evensong-paper-zh.md`  hybrid→`20260411-hermes-evensong-synthesis.md`  adaptive→`20260411-hermes-evensong-synthesis.md`
- **Q78** "What are the latest findings on how AI processes memory and "  ideal=`20260411-hermes-evensong-synthesis.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-evensong-paper-zh.md | 20260411-hermes-evensong-synthesis.md`  adaptive→`20260411-evensong-paper-zh.md | 20260411-hermes-evensong-synthesis.md`
- **Q81** "Can you find information on the Parity Principle in AI cogni"  ideal=`20260411-philosophy-supervisor-evensong.md`  llm-only→`20260411-thinking-fast-and-slow.md`  hybrid→`20260411-evensong-paper-zh.md`  adaptive→`20260411-evensong-paper-zh.md`
- **Q83** "I'm not looking for basic AI concepts, but specifically phil"  ideal=`20260411-philosophy-supervisor-evensong.md`  llm-only→`20260411-philosophy-supervisor-evensong.md`  hybrid→`20260411-philosophy-supervisor-evensong.md`  adaptive→`20260411-garnet-ai-digest-division-of-it-at-usc.md`
- **Q87** "What is the parity principle in cognitive science discussion"  ideal=`20260411-clark-chalmers-extended-mind.md`  llm-only→`20260411-thinking-fast-and-slow.md`  hybrid→`20260411-clark-chalmers-extended-mind.md`  adaptive→`20260411-clark-chalmers-extended-mind.md`
- **Q88** "外部工具如何成为认知的一部分？"  ideal=`20260411-clark-chalmers-extended-mind.md`  llm-only→`20260411-2310-08560-memgpt.md | 20260411-2604-08256-hypermem.md`  hybrid→`20260411-clark-chalmers-extended-mind.md`  adaptive→`20260411-clark-chalmers-extended-mind.md`
- **Q89** "I'm not looking for internal memory theories, but for ideas "  ideal=`20260411-clark-chalmers-extended-mind.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2310-08560-memgpt.md`  adaptive→`20260411-clark-chalmers-extended-mind.md | 20260411-2310-08560-memgpt.md`
- **Q90** "Can objects outside us influence how we think and believe?"  ideal=`20260411-clark-chalmers-extended-mind.md`  llm-only→`20260411-clark-chalmers-extended-mind.md`  hybrid→`20260411-clark-chalmers-extended-mind.md`  adaptive→`20260411-clark-chalmers-extended-mind.md | 20260411-thinking-fast-and-slow.md`
- **Q92** "What are effective methods to critically analyze foundationa"  ideal=`20260411-evensong-first-principles-audit.md`  llm-only→`20260411-elon-musk-biography.md`  hybrid→`20260411-evensong-first-principles-audit.md`  adaptive→`20260411-evensong-first-principles-audit.md`
- **Q93** "Can you explain the impact of cultural differences on stress"  ideal=`20260411-evensong-first-principles-audit.md`  llm-only→`20260411-elon-musk-biography.md`  hybrid→`20260411-thinking-fast-and-slow.md`  adaptive→`20260411-thinking-fast-and-slow.md`
- **Q96** "What are some strategies for identifying flaws in AI memory "  ideal=`20260411-evensong-first-principles-audit.md`  llm-only→`20260411-evensong-first-principles-audit.md`  hybrid→`20260411-competitor-landscape.md`  adaptive→`20260411-competitor-landscape.md`
- **Q99** "What is the SSOT routing table in AI agent engineering?"  ideal=`20260411-leo-harness-engineering-3d.md`  llm-only→`20260411-leo-harness-engineering-3d.md`  hybrid→`20260411-competitor-landscape.md`  adaptive→`20260411-leo-harness-engineering-3d.md`
- **Q104** "How does memory influence the actions of artificial intellig"  ideal=`20260411-competitor-landscape.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2310-08560-memgpt.md | 20260411-msa-memory-sparse-attention.md`  adaptive→`20260411-2310-08560-memgpt.md`
- **Q106** "智能代理的记忆如何影响其行为表现？"  ideal=`20260411-competitor-landscape.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-evensong-paper-zh.md`  adaptive→`20260411-competitor-landscape.md | 20260411-evensong-paper-zh.md`
- **Q107** "I'm not looking for memory accuracy in AI, but how it impact"  ideal=`20260411-competitor-landscape.md`  llm-only→`20260411-evensong-paper-zh.md`  hybrid→`20260411-evensong-paper-zh.md`  adaptive→`20260411-garnet-ai-digest-division-of-it-at-usc.md`
- **Q108** "Can you show me the latest research on AI memory systems and"  ideal=`20260411-competitor-landscape.md`  llm-only→`20260411-2604-08256-hypermem.md`  hybrid→`20260411-2604-08256-hypermem.md | 20260411-competitor-landscape.md`  adaptive→`20260411-2604-08256-hypermem.md | 20260411-competitor-landscape.md`

