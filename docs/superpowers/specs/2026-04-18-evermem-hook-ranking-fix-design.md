# EverMem Hook Ranking Fix — Design

**Author:** Claude Opus 4.7 (1M)
**Date:** 2026-04-18
**Status:** DESIGN — pre-plan, approved Section 1 scope
**Target file:** `~/.claude/hooks/evermem-multi-inject.mjs`
**Predecessor:** `.claude/verify/20260418-104244-evermem-hook-drift-diagnosis.md`

---

## Problem

UserPromptSubmit hook 持续注入"当日其它 session 叙事快照"，与当前 prompt topic 零相关。Verify scratch §Probes 定位到 4 个根因：

1. `MIN_SCORE = 0.05` + 兜底条件 `|| merged.length <= MAX_INJECT` → 阈值事实上失效
2. score 相同按 timestamp 排序 → 当天新写入的记忆系统性优先
3. `memory_types: ['episodic_memory']` 硬编码 → EverMem server 端 `/memories/search` 支持的 `agent_memory` 学习层被关在门外
4. filter fan-out 不做权重区分 → `group_id`（当前项目）和 `user_id`（全局 Nolan）平起平坐

---

## Scope

**In:**
- Scoring 层三处修复（阈值 / 兜底 / group_id 加权）
- `memory_types` 白名单扩展到 `['episodic_memory', 'agent_memory']`（`/memories/search` 端点实际支持的学习层类型；`agent_case`/`agent_skill` 仅 `/memories/get` 支持，非本 hook 端点）
- 注入格式加 memory_type / project 徽章（可观察性）

**Out（独立后续设计）：**
- 本地 `~/Documents/Evensong/research-vault/*.md` 文件读取（新 I/O + 索引策略 + 排除规则）
- LLM topic-lock 二次过滤（等 Tier A 实测不够再上）
- research-vault MCP 查询（用户否决，MCP 不稳定）

**Delta 体量：** 单文件 `evermem-multi-inject.mjs`，约 15 行改动。

---

## Changes

### Change 1 — `memory_types` 白名单扩展

**Location:** `evermem-multi-inject.mjs:78`

```diff
  body: JSON.stringify({
    query,
    method: 'hybrid',
    top_k: PER_FILTER_LIMIT,
-   memory_types: ['episodic_memory'],
+   memory_types: ['episodic_memory', 'agent_memory'],
    filters,
  }),
```

**Effect:** 每路 query 同时拉 episodic + agent_memory。单路 top_k=8 不变；server hybrid 排序决定混合比例。**注：** `/memories/search` 端点强制枚举为 `{agent_memory, episodic_memory, profile, raw_message}`——与 `/memories/get` 支持的 `{episodic_memory, profile, agent_case, agent_skill}` 不同。选 `agent_memory` 作为学习层入口；`profile` 噪声风险大暂不加；`raw_message` 太原始排除。

### Change 2 — `MIN_SCORE` 阈值提升

**Location:** `evermem-multi-inject.mjs:17`

```diff
- const MIN_SCORE = 0.05;
+ const MIN_SCORE = 0.35;
```

**Effect:** 过滤"共现词触发"的低关联结果（hybrid 典型 0.2–0.8 区间）。

### Change 3 — 移除兜底禁用阈值

**Location:** `evermem-multi-inject.mjs:134`

```diff
- const scored = merged.filter(m => (m.score ?? 0) >= MIN_SCORE || merged.length <= MAX_INJECT);
+ const scored = merged.filter(m => (m.score ?? 0) >= MIN_SCORE);
```

**Effect:** pool 整体低质量时宁可注入 0 条也不灌噪音。

### Change 4 — `group_id` 命中加权 +0.2

**Location:** `evermem-multi-inject.mjs:94-141`（`mergeEpisodes` + `rankAndTrim`）

```diff
  function mergeEpisodes(results) {
    const byId = new Map();
    for (const r of results) {
      for (const ep of r.episodes) {
        if (!ep.id) continue;
        const sourceTag = `${r.key}@${filterTag(r.filters)}`;
+       const matchedGroup = Boolean(r.filters?.group_id);
        const existing = byId.get(ep.id);
        if (!existing) {
-         byId.set(ep.id, { ep, sources: new Set([sourceTag]), keys: new Set([r.key]) });
+         byId.set(ep.id, { ep, sources: new Set([sourceTag]), keys: new Set([r.key]), matchedGroup });
        } else {
          existing.sources.add(sourceTag);
          existing.keys.add(r.key);
+         if (matchedGroup) existing.matchedGroup = true;  // sticky OR
          const prevScore = existing.ep.score ?? 0;
          const newScore = ep.score ?? 0;
          if (newScore > prevScore) existing.ep = ep;
        }
      }
    }
-   return [...byId.values()].map(({ ep, sources, keys }) => ({
+   return [...byId.values()].map(({ ep, sources, keys, matchedGroup }) => ({
      id: ep.id,
      text: ep.episode || ep.summary || '',
      subject: ep.subject || '',
+     memory_type: ep.memory_type || ep.type || 'episodic_memory',
      timestamp: ep.timestamp || '',
      score: ep.score ?? 0,
+     weighted_score: (ep.score ?? 0) + (matchedGroup ? 0.2 : 0),
      user_id: ep.user_id,
      group_id: ep.group_id,
      sources: [...sources],
      keys: [...keys],
+     matchedGroup,
      verified: keys.size >= 2,
    }));
  }

  function rankAndTrim(merged) {
-   const scored = merged.filter(m => (m.score ?? 0) >= MIN_SCORE || merged.length <= MAX_INJECT);
+   const scored = merged.filter(m => (m.score ?? 0) >= MIN_SCORE);
    scored.sort((a, b) => {
-     const s = (b.score ?? 0) - (a.score ?? 0);
-     if (s !== 0) return s;
+     const ws = (b.weighted_score ?? 0) - (a.weighted_score ?? 0);
+     if (ws !== 0) return ws;
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });
    return scored.slice(0, MAX_INJECT);
  }
```

**Effect:** 当前项目 scope 命中的记忆获 +0.2 分数优势；全局噪音需高出 0.2 才超过。score 相同时仍按 timestamp tiebreak（避免引入新 regression）。

### Change 5 — 注入格式加 memory_type / project 徽章

**Location:** `evermem-multi-inject.mjs:143-155`（`formatContext`）

```diff
  function formatContext(memories) {
    if (!memories.length) return null;
    const lines = ['## Relevant Memories from EverMem'];
    for (const m of memories) {
      const when = m.timestamp ? m.timestamp.slice(0, 10) : 'unknown';
      const badge = m.verified ? ' ✓' : '';
      const src = m.sources.length > 1 ? ` [${m.sources.length}src]` : '';
+     const typeTag = m.memory_type === 'agent_skill' ? ' [skill]'
+                   : m.memory_type === 'agent_case' ? ' [case]'
+                   : '';
+     const groupTag = m.matchedGroup ? ' [project]' : '';
-     lines.push(`\n**${m.subject || '(untitled)'}** — ${when}${badge}${src}`);
+     lines.push(`\n**${m.subject || '(untitled)'}** — ${when}${badge}${src}${typeTag}${groupTag}`);
      const snippet = (m.text || '').slice(0, 500).replace(/\s+/g, ' ').trim();
      if (snippet) lines.push(snippet + (m.text.length > 500 ? '…' : ''));
    }
    return lines.join('\n');
  }
```

**Effect:** 每条注入记忆显示 `[agent]` / `[project]` 徽章，主会话一眼看出来源类型（学习层 vs episodic）与项目范围命中。`[agent]` 现阶段 dormant（服务器返回 `memory_type: null`），未来 flush-agent-memories 触发后自动生效。`[project]` 立即生效。

---

## Verification Plan

### Pre-fix baseline
Verify scratch §Probe 6 已记录：今天 7 条注入全部是"其它 session 叙事"，0 条 `agent_skill`/`agent_case`，0 条当前项目 topic。

### Post-fix probes

**P1 — API 层确认学习层有数据**
```bash
curl -s -X POST https://api.evermind.ai/api/v1/memories/search \
  -H "Authorization: Bearer $(cat ~/.openclaw/credentials/evermem-claude-v0.key)" \
  -H "Content-Type: application/json" \
  -d '{"query":"evermem hook 排序算法","method":"hybrid","top_k":8,
       "memory_types":["episodic_memory","agent_memory"],
       "filters":{"user_id":"nolan"}}' \
  | jq '.data.episodes | map({id, memory_type, score}) | .[0:5]'
```
**Pass:** HTTP 200 + non-empty episodes。理想还能看到 `memory_type` 有 `"agent_memory"` 标签；但当前服务器返回 `memory_type: null`（2026-04-18 Task 0 实测），所以 pass 条件放宽为"非空 episodes 返回"。

**P2 — Hook dry-run**
```bash
echo '{"prompt":"opencli-rs YAML adapter 怎么加 LLM arena","cwd":"/Users/0xvox/claude-code-reimagine-for-learning"}' \
| node ~/.claude/hooks/evermem-multi-inject.mjs
```
**Pass:** stdout 有 `additionalContext` JSON；stderr 出现 `keys=v0[,obs] ... merged=N injected=M verified=K`，且 `M < N`（阈值生效）。

**P3 — 三 prompt 回归**
- Prompt A: "R066-R070 benchmark 下一步怎么收敛" → 应注入 ≥1 条 Evensong/R066 相关；0 条完全无关 session
- Prompt B: "怎么搭 minecraft 服务器" → 应注入 0-1 条（理想 0，证明阈值能过滤共现词）
- Prompt C: "evermem hook 注入优化" → 应注入 ≥1 条带 `[skill]` 或 `[case]` 徽章（学习层接通；如 P1 显示账号无学习层数据则放宽）

**P4 — 今日注入回放对照**
对照今天 7 条历史注入 prompt（在 evermem debug log 里能找到），fix 后重跑同样 prompt，多数 session-narrative 噪音应消失。

### Regression gates
- `countWords(prompt) < MIN_WORDS` 过滤保持（短 prompt 不触发）
- 双 key 交叉验证 `verified: keys.size >= 2` 保持
- `deriveGroupId(cwd)` 保持当前 4 字符 prefix + 5 字符 hash 语义
- stderr 日志格式保持可 grep

---

## Risks & Mitigations

| 风险 | 触发条件 | 缓解 |
|------|----------|------|
| `agent_memory` 账号下为空 | 用户历史未触发 flush-agent-memories | 零副作用，typeTag 留白；未来 flush 后自动生效 |
| `memory_type` 字段当前全部返回 `null` | 服务器未落入具体 type 标签，Task 0 Step 3 probe 已确认 | Task 4 的 typeTag 分支 dormant（不出 `[skill]`/`[case]`），只影响可观察性非正确性；`[project]` 徽章正常工作 |
| `MIN_SCORE = 0.35` 太激进，注入率骤降 | 用户 prompt 普遍短/通用，hybrid 分偏低 | 观察 1-2 天；若 `injected=0` 比例 > 50%，调到 0.25 |
| `matchedGroup` sticky 语义错 | 同一 ep 从 group + user 两路都进 merge | 已处理（sticky OR：`if (matchedGroup) existing.matchedGroup = true`） |
| timestamp tiebreak 仍在 edge case 偏新 | weighted_score 完全相等（罕见） | 保留当前行为避免新 regression；未来如再次暴露问题再加第三级 sort key |
| EverMem server 不认识新 memory_type | API 对未知类型报错 | llms.txt 已确认 server 支持这三种；若真报错回退 Change 1 单独 revert |

---

## Rollback

单文件改动。rollback = 还原 `~/.claude/hooks/evermem-multi-inject.mjs` 到修改前版本。settings.json 不动。

---

## Out-of-scope Follow-ups

这轮之后可单开设计：

1. **本地 vault 文件 source**（next-up）：读取 `~/Documents/Evensong/research-vault/` 下 canonical `HANDOFF-*.md` / `EVOLUTION-LAYER-INDEX.md` / `PHILOSOPHICAL-INTEGRITY-ANCHOR-L0.md` 等，关键词 + 小 chunk 匹配后注入为第 4 类 source；排除 `.gstack/`、`飙马野人/`、`api key.md`、`.git/`、raw PDF。
2. **LLM topic-lock**：若 Tier A 后仍发现 noise，引入 xai-fast 做 200-token 二次相关性 gate。
3. **Hook observability dashboard**：把 stderr 的 `merged=N injected=M` 写成日志文件，每日汇总 hit 率。

---

**End of design.**
