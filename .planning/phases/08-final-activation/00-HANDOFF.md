# Phase 08 Handoff — 给下一个 Claude Code session

**From:** elegant-tinkering-rainbow + claude/friendly-allen-ed16ee (2026-04-16 20:00-20:10)
**To:** 下一个 Claude Code session (macOS 桌面端，根目录 `~/claude-code-reimagine-for-learning`)
**Prev milestone:** Phase 07 Evensong→DS Integration + 08.1 Phase-07 Cleanup — **全部完成**

---

## 怎么用这份 handoff（给下一个 Claude）

1. 开 session 后，先读本文件全部
2. 再读 [`07-VALIDATION.md`](../07-evensong-ds-integration/07-VALIDATION.md) 和 [`07-CONTEXT.md`](../07-evensong-ds-integration/07-CONTEXT.md) 的 summary
3. 再读 `~/.claude/CLAUDE.md` 顶部的 "DS Repo Map" 段（authoritative 架构）
4. **不要重跑 Discovery** — 本文件已经把当天的盘点结果写死

**用户惯用开 prompt**（他会 paste，你照做）：
```
继续 Phase 08 的 sprint。读 .planning/phases/08-final-activation/00-HANDOFF.md，
按里面的下一步开工。别重新 Discovery，数据都在文件里。
```

---

## 状态快照

### ✅ 已完成（今日，分散于 2 个 session）

**Phase 07 Evensong→DS Integration**（claude/friendly-allen-ed16ee branch，8 commits，已 merge 到 main）
- `packages/research-vault-mcp/` — MCP server 迁入 CCR workspace（修了硬编码 VAULT_ROOT）
- `research-vault/` — submodule → `Fearvox/ds-research-vault` (PRIVATE, 82MB, 敏感 `.gitignore`)
- `benchmarks/data/` — optional submodule → `Fearvox/ds-benchmark-data` (PRIVATE, 73MB, opt-in via `--init benchmarks/data`)
- Syncthing path fix (Desktop → Documents) + `.stignore` 隔离 git 和 Syncthing
- `CLAUDE.md` + `~/.claude/CLAUDE.md` 修正 CCR/CCB 叙事 + 新增 DS Repo Map
- `cost-tracker.ts` + 10 个文件 null-guard for `usage.(input|output)_tokens`（防 MiniMax relay 崩）
- 3 个孤儿 submodule gitlinks (`.claude/plugins/evermem`, `.worktrees/phase-09`, `skills/dash-research-vault`) 已 `git rm --cached` 清理

**Phase 08.1 Phase 07 收尾**（不需要 commit，运行时 + 文件系统改动）
- 老 MCP server PID 72535（60h uptime）已 kill
- 新 MCP server PID **6755** 在跑（cwd: `CCR/packages/research-vault-mcp`，VAULT_ROOT → `~/Documents/Evensong/research-vault`）
- `/health` 返回 `{tools:9, vault_tools:4, amplify_tools:5}`
- SSE + JSON-RPC 真调用验证：initialize + tools/list 都 OK，VAULT_ROOT 真读到 knowledge/ai-agents/ 等数据
- `~/Documents/Evensong/research-vault-mcp/` (7.7M) 归档为 `.archive-research-vault-mcp-2026-04-16/`（保留 30 天，不删）
- Syncthing 状态：`state: idle, error: empty, inSyncFiles: 369`

### ⏳ 待做（Phase 08.2/08.3/08.4）— 见下文"下一步动作"

---

## 活运行时（不要误杀）

| 进程 | PID | Port | 用途 |
|------|-----|------|------|
| research-vault-mcp (新版) | **6755** | 8765 | MCP server from CCR/packages/research-vault-mcp |
| Syncthing (主) | 93853 | 8384 (GUI) | vault 双设备同步 |
| Syncthing (子) | 75785 | - | Syncthing 内部 |

**健康检查命令**：
```bash
curl -s http://127.0.0.1:8765/health   # MCP
apikey=$(grep -oE '<apikey>[^<]+</apikey>' "$HOME/Library/Application Support/Syncthing/config.xml" | sed 's/<[^>]*>//g')
curl -s -H "X-API-Key: $apikey" "http://127.0.0.1:8384/rest/db/status?folder=researchvault"
```

---

## 关键发现 — **memory-reality drift，必读**

### 发现 1：实际激活 flag ≠ memory 声称的

| 源 | active 数 |
|---|---|
| `~/.claude/feature-flags.json` (source of truth) | **40 active + 1 explicit false** |
| memory `project_hybrid_alignment_plan.md`（2026-04-15） | 声称 "65 active (GREEN+全 YELLOW)" |
| 代码里 `feature('XXX')` 总调用点 | 92 unique flags |

**差距 ~25 个 flag**。memory 记录的 T3 网络 (8) + T4 硬件 (2) YELLOW Blitz 激活，**在 feature-flags.json 里没条目**（即运行时仍返回 false）。

**未激活的（应该激活但 drift 掉的）例**：
- T1: BASH_CLASSIFIER, BUDDY, BG_SESSIONS, TEAMMEM, TRANSCRIPT_CLASSIFIER, ...
- T2 KAIROS: KAIROS_BRIEF, KAIROS_CHANNELS, KAIROS_DREAM, KAIROS_PUSH_NOTIFICATION, KAIROS_GITHUB_WEBHOOKS (主 KAIROS ✅ 已激活)
- T3 网络: AGENT_TRIGGERS, CCR_MIRROR, CCR_AUTO_CONNECT, CCR_REMOTE_SETUP, CHICAGO_MCP, DIRECT_CONNECT, UDS_INBOX
- T4: DAEMON, VOICE_MODE

**已激活的 40 个**（截至 2026-04-16 20:00）— 覆盖主要 GREEN + 部分 YELLOW：
```
ABLATION_BASELINE AGENT_MEMORY_SNAPSHOT AUTO_THEME BREAK_CACHE_COMMAND
BUILDING_CLAUDE_APPS BUILTIN_EXPLORE_PLAN_AGENTS CACHED_MICROCOMPACT
COMMIT_ATTRIBUTION COMPACTION_REMINDERS CONTEXT_COLLAPSE COORDINATOR_MODE
DYNAMIC_PERMISSION_ESCALATION EXPERIMENTAL_SKILL_SEARCH EXTRACT_MEMORIES
FILE_PERSISTENCE FORK_SUBAGENT HISTORY_PICKER HISTORY_SNIP HOOK_PROMPTS
KAIROS MCP_RICH_OUTPUT MCP_SKILLS MESSAGE_ACTIONS NEW_INIT PROACTIVE
QUICK_SEARCH REACTIVE_COMPACT REVIEW_ARTIFACT SHOT_STATS SKILL_IMPROVEMENT
SLOW_OPERATION_LOGGING STREAMLINED_OUTPUT TERMINAL_PANEL TOKEN_BUDGET
TREE_SITTER_BASH ULTRAPLAN ULTRATHINK VERIFICATION_AGENT WEB_BROWSER_TOOL
tengu_passport_quail
```

### 发现 2：Relay SSE 真修已在 main（我不用做）

隔壁 session 已经：
- commit `6080393` — `feat(relay): transform OpenAI/MiniMax response to Anthropic format`（加了 `transformToAnthropicFormat()` at `api/relay/index.ts:196`）
- commit `2cb3d6c` — `fix(relay): force non-streaming for MiniMax to avoid SSE parse failure`（L272 `stream: false` 强制）

**现状**：MiniMax relay 走 non-streaming 路径，一次性 JSON → transform → Anthropic format 返回。work。

**Phase 08.3 "Relay SSE 真改造" 的优先级降级**：
- 原目标：让 relay 做真 SSE event-by-event 翻译（MiniMax SSE → Anthropic SSE）
- 现状：non-streaming 已经能让 CCR 调 MiniMax 不崩
- 损失：**MiniMax 输出不再逐字显示**（失去 streaming UX），但 CLI 功能正常
- 新优先级：**only if UX 重要** → 真 streaming；否则留着

---

## 下一步动作（你选哪个 phase 做）

### Phase 08.2 — Flag Drift 修复（推荐，2-4h）

**Owner 意识：memory 错的要对齐**

**做法**（3 步）：
1. **盘点**：run下述命令生成"应激活清单"
   ```bash
   python3 -c "
   import json
   active = set(k for k,v in json.load(open('$HOME/.claude/feature-flags.json')).items() if v)
   referenced = set(open('/tmp/all-flags.txt').read().strip().split()) if __import__('os').path.exists('/tmp/all-flags.txt') else set()
   print('Not yet active:', sorted(referenced - active))
   "
   ```
   （可能要先重跑 `grep -rohE \"feature\\('[A-Z_]+'\\)\" src/ | sort -u | sed \"s/feature('//;s/')//\" > /tmp/all-flags.txt`）

2. **分类 + 激活**（根据 memory `project_hybrid_alignment_plan.md` 的 RED 规则）：
   - 31 个 RED（telemetry/测试/platform/云同步/Windows）→ 保持 false
   - 剩余候选（约 20 个）逐一评估 → GREEN/YELLOW
   - 批量写入 `~/.claude/feature-flags.json`（备份原文件先！）

3. **验证**：`bun run build` 通过 + `bun test` 全绿 + CLI 启动不崩

**完成标志**：feature-flags.json 和 memory 对齐，或 memory 更新成真实状态。

### Phase 08.3 — Relay SSE 真改造（可选，2-3h）

只有在**你想让 MiniMax 逐字流式输出**时做。现在 non-streaming 已经工作。如果做：

**做法**：
1. 改 `api/relay/index.ts` 的 `forwardToProvider`：
   - 移除 `stream: false` 强制
   - 向 MiniMax 保留 `stream: true`
   - 边读 OpenAI SSE events 边翻译成 Anthropic SSE events 返回 client
2. 映射：
   - OpenAI `[DONE]` → Anthropic `message_stop`
   - OpenAI `choices[0].delta.content` → Anthropic `content_block_delta.text`
   - OpenAI `usage` → Anthropic `message_delta.usage`（重命名字段）
3. Deploy + E2E `echo "说三遍你好" | ds-minimax -p` 看是否逐字打印

### Phase 08.4 — RED 31 Flags 终审（可选，1h）

diff `referenced - active` 和 memory 的 RED 分类。可能有 3-5 个被误分类的 flag（可以 promote）。出一份新 RED 清单写回 memory。

---

## 别碰 list（user directive）

**主仓 main 有未 commit 改动**（今天 merge 之后，用户在 main 上还有工作）：

```
M  .gitignore
D  api/relay/route.ts          ← 旧 relay handler，被 index.ts 取代（这是 intentional delete）
M  docs/evensong-paper-v3-en.tex / zh.tex   ← 论文修订
M  src/components/messages/SystemAPIErrorMessage.tsx
M  src/query.ts
M  src/services/api/__tests__/withRetry.test.ts
M  src/services/api/errors.ts
M  src/services/api/withRetry.ts
M  src/skills/loadSkillsDir.ts
M  vercel.json
?? .agents/
?? .claude/plugins/
?? .claude/skills/ult-evo/
?? .claude/worktrees/
```

**下次你开 session 不要 `git restore`, `git clean -fd`, 或 `git add -A`**。这些是用户别的工作。问清后再动。

**sibling 项目不准碰**（已在 CLAUDE.md 声明）：
- `~/dash-verse/`
- `~/.dashpersona/`
- `~/workspace/dash-shatter-vault/`

---

## 3 个 GitHub repo（PRIVATE）

- [Fearvox/Evensong](https://github.com/Fearvox/Evensong) ← CCR 主仓（main HEAD 587353a merge commit）
- [Fearvox/ds-research-vault](https://github.com/Fearvox/ds-research-vault) ← vault submodule (HEAD 42ecd14)
- [Fearvox/ds-benchmark-data](https://github.com/Fearvox/ds-benchmark-data) ← data submodule (HEAD 7f6eff1, opt-in)

---

## yuze-mac 端验证（user action，未完成）

在 yuze-mac 上打开 `http://127.0.0.1:8384` Syncthing GUI：
- Research Vault folder 应 "Up to Date" (绿)
- Local State 应 ~369 files
- 如果它还指向 `/Users/.../Desktop/research-vault`（老路径），需要同样 PATCH 配置到 `/Users/.../Documents/Evensong/research-vault`

**如果 yuze-mac 还出问题，下个 session 帮用户诊断**（可能需要 TailScale / SSH 远程看 yuze 的 config.xml）。

---

## 关键文件 pointer（按 session 开头读序）

```
~/.claude/CLAUDE.md                              ← DS Repo Map (authoritative)
~/claude-code-reimagine-for-learning/CLAUDE.md   ← CCR 架构 + integrated assets
.planning/phases/07-evensong-ds-integration/07-VALIDATION.md  ← 最近 milestone 证据
.planning/phases/08-final-activation/00-HANDOFF.md            ← 本文件
~/.claude/feature-flags.json                     ← 真实 flag 状态 (40 active)
~/.claude/projects/-Users-0xvox-claude-code-reimagine-for-learning/memory/
  projects/project_phase07_evensong_integration.md   ← 今日 project memory
  projects/project_hybrid_alignment_plan.md          ← flag blitz 历史（有 drift！现实查 feature-flags.json）
```

---

## 开 session 第一句话

> 我是 Claude Code，读了 Phase 08 handoff。Phase 07 + 08.1 已 close。今晚你要我做 08.2 (flag drift 修复) / 08.3 (relay SSE 真改造) / 08.4 (RED flags 终审) / 还是别的？
