# Phase 09 — Claude Opus 4.7 Model Adaptation

**Goal**: 让 CCR 通过已有 OAuth 流程使用 Claude Opus 4.7（1M context），不动 OAuth 本身。

**Scope (Approach T2, 24 @[MODEL LAUNCH] 点)**: Tier-1 必改 (9) + Tier-2 增强 (15)，长尾 Tier-3 (ant-only / 文档 example / hook schema) defer。

## 元数据（hard-coded）

| 字段 | 值 | 来源 |
|---|---|---|
| canonical model ID | `claude-opus-4-7` | Opus 4.6 模式（无 date snapshot）|
| provider mapping | `firstParty: claude-opus-4-7`, `bedrock: us.anthropic.claude-opus-4-7-v1`, `vertex: claude-opus-4-7`, `foundry: claude-opus-4-7` | 对齐 4.6 |
| pricing | `COST_TIER_5_25`（与 Opus 4.5/4.6 同档）| modelCost.ts 现状 |
| knowledge cutoff | `January 2026` | env metadata |
| 1M context | 支持（我自己 env 显示 `[1m]`）| 直接 enable |
| beta headers | 沿用 Opus 4.6（`context-1m-2025-08-07` 等）| 无新增 |
| fast-mode tier | 暂不配置（fast mode 是 4.6 特殊路径，4.7 用默认 `COST_TIER_5_25` 即可）| 简化 |

## 24 点改动清单

**Tier-1 必改 (9)**
1. `configs.ts` — `CLAUDE_OPUS_4_7_CONFIG` 常量
2. `configs.ts` — `ALL_MODEL_CONFIGS` register `opus47`
3. `model.ts` L224 `firstPartyNameToCanonical` — 识别 `claude-opus-4-7`
4. `model.ts` L582 `getMarketingNameForModel` — `Opus 4.7` 标签
5. `model.ts` L347 `getPublicModelDisplayName` — display name case
6. `validateModel.ts` L149 — 3P fallback chain `opus-4-7 → opus46`
7. `modelCost.ts` L101 — MODEL_COSTS 加 4.7 映射 `COST_TIER_5_25`
8. `modelOptions.ts` — `getOpus47Option` + `getOpus47_1MOption`
9. `modelOptions.ts` L378 — family pattern 加 `claude-opus-4-7`

**Tier-2 增强 (15)**
10. `model.ts` L289 `getClaudeAiUserDefaultModelDescription` — Opus 4.7 描述（Max/Team Premium）
11. `context.ts` L49 `modelSupports1M` — 加 `opus-4-7`
12. `betas.ts` L141 `modelSupportsStructuredOutputs` — 加 `opus-4-7`
13. `betas.ts` L159 `modelSupportsAutoMode` — 加 `opus-4-7`
14. `thinking.ts` L112 `modelSupportsAdaptiveThinking` — 加 `opus-4-7`
15. `effort.ts` L22 `modelSupportsEffort` — 加 `opus-4-7`
16. `effort.ts` L51 `modelSupportsMaxEffort` — 加 `opus-4-7`
17. `effort.ts` L278 `getDefaultEffortForModel` — Opus 4.7 Pro/Max default medium
18. `commitAttribution.ts` L149 `sanitizeModelName` — 加 `opus-4-7`
19. `attribution.ts` L70 — fallback `Claude Opus 4.7`
20. `prompts.ts` L117 `FRONTIER_MODEL_NAME` — `Claude Opus 4.7`
21. `prompts.ts` L121 `CLAUDE_4_5_OR_4_6_MODEL_IDS` — `opus: claude-opus-4-7`（family 最新）
22. `prompts.ts` L712 `getKnowledgeCutoff` — `claude-opus-4-7 → January 2026`
23. `model.ts` L104 `getDefaultOpusModel` — 保持 opus46 default（稳健不切），留 env 覆盖
24. `model.ts` L288 default description — 同上保持 4.6

## Default 策略

**不切换 default**：保留 `getDefaultOpusModel` 返回 opus46。理由：Opus 4.7 需要后端权限验证，先让用户 `/model opus-4-7` 显式切换，稳定后再升默认。

## 风险

- Opus 4.7 若 Anthropic 后端未开放，API 会 404/400 → validateModel fallback 兜底
- Pricing 占位 `COST_TIER_5_25`，真实价位若不同需后续调整
- Family pattern 在 `CLAUDE_4_5_OR_4_6_MODEL_IDS` 改为 4.7 可能影响 system prompt model reference（T2 接受此副作用）

## 验证

- `bun run build` 通过
- `bun test tests/` + `services/` 零回归
- CLI `--version` + `/model opus-4-7` 切换不崩

## Rollback

改动均在 src/ 跟 git tracked 文件中；`git checkout -- src/utils/model/ src/utils/betas.ts ...` 可回滚。feature-flags.json 未动。
