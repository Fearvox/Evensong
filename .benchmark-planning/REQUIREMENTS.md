# Requirements: Evensong x EverMind Benchmark Integration

**Defined:** 2026-04-22
**Core Value:** 在 SEED-001 触发前完成所有可独立准备的 benchmark 适配工作

## v1 Requirements

### LOCOMO Integration

- [ ] **LOCOMO-01**: BGE-M3 dense retriever wrapper 实现 `init_context_model('hybrid')` 和 `init_query_model('hybrid')` 接口
- [ ] **LOCOMO-02**: 实现 `get_embeddings('hybrid', texts, mode)` 返回 np.ndarray，支持 BM25 fallback
- [ ] **LOCOMO-03**: 实现 `get_context_embeddings('hybrid', data, tokenizer, encoder)` 兼容 LOCOMO 格式
- [ ] **LOCOMO-04**: 修复 dragon embedding 兼容性层（normalization 不一致问题）
- [ ] **LOCOMO-05**: LOCOMO RAG eval 跑通，对比 BGE-M3 dense vs dragon baseline（F1 + Recall）
- [ ] **LOCOMO-06**: Per-category 精度分析（5 categories: Personal Facts/Temporal/Inferences/Explanations/Adversarial）

### MTEB Integration

- [ ] **MTEB-01**: 实现 `SearchProtocol` 接口（`index()` + `search()` 方法）
- [ ] **MTEB-02**: BGE-M3 dense index 构建（FAISS）
- [ ] **MTEB-03**: MTEB RetrievalEvaluator 对比：BM25 vs dense vs adaptive-hybrid
- [ ] **MTEB-04**: MTEB 指标输出：MRR@K, NDCG@K, Recall@K（K=1,3,5,10,100）

### Resource Metrics (or-shot.ts 扩展)

- [ ] **RESOURCE-01**: or-shot.ts 新增 `memory_mb` 字段（`process.memoryUsage().heapUsed`）
- [ ] **RESOURCE-02**: or-shot.ts 新增 `disk_mb` 字段（输出文件大小）
- [ ] **RESOURCE-03**: 修复 `finish_reason=length` 问题（max_tokens 16000 上限）

### BGE-M3 Endpoint 修复

- [ ] **BGE-01**: 修复 Atomic Chat v1.1.44 `--embedding` flag 缺失问题
- [ ] **BGE-02**: 修复 `maxChars: 1000` 超出 `-b 512` batch 限制问题

### Visualization

- [ ] **VIZ-01**: Benchmark 结果可视化 dashboard（给 EverMind 算法组看）
- [ ] **VIZ-02**: LOCOMO per-category 柱状图
- [ ] **VIZ-03**: MTEB MRR/Recall 雷达图
- [ ] **VIZ-04**: 资源消耗对比表（Latency/Token/Memory/Disk）

## v2 Requirements

- **MTEB-05**: MemoryAgentBench 四维度（AR/TTL/LRU/CR）集成
- **LOCOMO-07**: HotpotQA multi-hop 对比测试
- **RESOURCE-04**: 实时资源监控（非事后采样）

## Out of Scope

| Feature | Reason |
|---------|--------|
| EverOS PR #196 merge | 依赖 EverMind 侧，SEED-001 trigger |
| 非 OpenRouter 模型 | or-shot 只覆盖 OR 模型 |
| RRF fusion | Wave 3H 验证 dense 69.4% > RRF 61.1% |
| Learned sparse (ColBERT) | BGE-M3 ColBERT 是 reranker，非 first-stage retrieval |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOCOMO-01 | Phase 1 | Pending |
| LOCOMO-02 | Phase 1 | Pending |
| LOCOMO-03 | Phase 1 | Pending |
| LOCOMO-04 | Phase 1 | Pending |
| LOCOMO-05 | Phase 2 | Pending |
| LOCOMO-06 | Phase 2 | Pending |
| MTEB-01 | Phase 2 | Pending |
| MTEB-02 | Phase 2 | Pending |
| MTEB-03 | Phase 3 | Pending |
| MTEB-04 | Phase 3 | Pending |
| RESOURCE-01 | Phase 3 | Pending |
| RESOURCE-02 | Phase 3 | Pending |
| RESOURCE-03 | Phase 3 | Pending |
| BGE-01 | Phase 1 | Pending |
| BGE-02 | Phase 1 | Pending |
| VIZ-01 | Phase 4 | Pending |
| VIZ-02 | Phase 4 | Pending |
| VIZ-03 | Phase 4 | Pending |
| VIZ-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-04-22*
*Last updated: 2026-04-22 after roadmap creation (LOCOMO-03 corrected to Phase 1)*
