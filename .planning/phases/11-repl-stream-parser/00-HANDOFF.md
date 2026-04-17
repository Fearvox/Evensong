# Phase 11 Handoff — REPL Stream Parser & Final-Render Hunt

**From:** `claude-code-reimagine-for-learning` / branch `main` (2026-04-17 ~06:20 EDT)
**To:** next Claude Code session (same machine)
**User state:** awake since 2026-04-16 17:00 EDT (~13.5h continuous). Just landed two silent-swallow fixes. Plans to sleep after this. Resume cold.

---

## 怎么用这份 handoff

1. **先读 [Phase 10 handoff](../10-silent-swallow-hunt/00-HANDOFF.md)**（pipe-mode silent swallow / commit 45bf1ad）
2. **再读 commit `06ee4f4`** message（REPL silent-swallow / 本 phase 起点）
3. **跑 sanity** — 确认两个 fix 还在工作（命令在第 §6 节）
4. **直接进 §3 "立即开工"**

---

## 今晚 (Phase 10 → 11) 完成的事

### Pipe mode (commit `45bf1ad`)
- `udsMessaging.ts` 加 noop exports `setOnEnqueue` + `getUdsMessagingSocketPath`
- `print.ts` UDS_INBOX block 包 try/catch + typeof guard
- `tests/pipe-mode-timeout.test.ts` 回归测试

### REPL mode (commit `06ee4f4` ← 今晚)
- `processUserInput.ts` 加 `import { logForDebugging } from '../debug.js'`
  - 修了 hook timeout path 抛 ReferenceError 的 silent swallow
- `handlePromptSubmit.ts` 在 `await processUserInput(...)` 外包 try/catch + log
  - 防御性，未来同类 silent swallow 会在 debug.log 出 message 而非沉默
- `HelpV2/Commands.tsx` sort callback 加 null-safety
  - 修了右键 Help 触发 `TypeError: undefined.localeCompare` 整个 Ink 树挂掉
- `tests/decompile-imports.test.ts` 守门
  - 任何回归（删了 import / 删了 export）会 CI 抓住

### 一句话总结
**两个 silent-swallow bug 同一种 pattern**：decompile 留下函数调用但删了 import/export，边缘路径 (UDS_INBOX flag / hook timeout) 触发 ReferenceError/TypeError，async wrapper 静默吞掉。30 小时 spinner 蒸发噩梦终结。

---

## 未结案件（按优先级）

### 🔴 P0 — REPL stream parser / final-render

**症状**：commit 06ee4f4 之后，REPL 发 `say hi`：
- ✅ handlePromptSubmit → processUserInput → onQuery → API SENT → 200 OK
- ✅ FIRST CHUNK = `message_start` 收到
- ✅ Thinking UI block 显示 LLM 的 thinking content（"The user wants me to say hi..."）
- ❌ **assistant 的 final text reply 永远不渲染**
- ❌ `caffeinate` 在 FIRST CHUNK 之后 277ms 就 `Stopped`，但 stream 应该还在流

`/effort low` 切换后，仍然只显示 Thinking 不出 final text。说明不是 thinking_delta 处理问题，更底层。

**可能根因**（按概率）：

1. **CCR 的 SSE stream parser 把 MiniMax 的 `message_start` 误判成结束信号** —— MiniMax 的 SSE 协议跟 Anthropic 可能有差异（chunk type / signature_delta 格式 / message_stop 触发条件不同）
2. **某个 React state 在 message_start 后立刻 set isLoading=false** —— 触发 caffeinate stop，UI 切换到 idle 状态但 stream reader 还在 background 跑（reader 没人订阅 chunk events）
3. **stream reader 在 message_start 后 abort** —— 被某个 abortController 误触发（比如 hook timeout 的 5s timer 到了之后 abort 整条 turn）

**关键文件**：
- `src/services/api/claude.ts` — SSE stream 解析（pipe mode 测过 work）
- `src/screens/REPL.tsx` — `onQuery` 后的 stream consumption
- `src/QueryEngine.ts` — `query()` 的 chunk → message reducer

**立即开工方案** — 同 Phase 10 的 bisection：
1. 在 `claude.ts` 的 stream chunk loop 里 plant log，记录每个收到的 chunk type
2. 在 REPL.tsx onQuery 后处理 chunk 的 `for await` 也 plant log
3. 发 say hi 看 log：是 chunk 没继续来（API/parser bug）还是 chunk 来了但 UI 没消费（state bug）

预期：3-5 个 checkpoint 内定位（同 Phase 10/11 套路）。

### 🟡 P1 — Plugin 自愈机制 (29 orphan registry)

**症状**：`mv ~/.claude/plugins ~/.claude/plugins.disabled-*` 后重启 CCR，CCR 的 `initializeVersionedPlugins` 自动**重建** `~/.claude/plugins/` 目录从 marketplaces clone。`installed_plugins.json` 里 29 条 orphan entry 触发 plugin loader 报 `Plugin directory does not exist`，但不致命。

**修复**：
- 短期：永久 disable plugin auto-rebuild（找 `initializeVersionedPlugins` 加一个 `CLAUDE_CODE_NO_PLUGIN_REBUILD=1` env gate）
- 长期：让 `installed_plugins.json` 的 entry 在 cache 缺失时自动 GC（而不是保留 orphan 引用）

### 🟡 P1 — claude.ai MCP 9 个 connector 永久 disable

**症状**：用户用 MiniMax token 但 CCR 默认尝试连接 9 个 Anthropic claude.ai MCP proxy（Google Calendar / Exa / Slack / Zoom / Gmail / Airtable / Zapier / Notion / Figma）。auth fail → retry 3 次 × 30s timeout = 9 分钟事件循环骚扰。

**workaround**：每次启动加 `ENABLE_CLAUDEAI_MCP_SERVERS=0`。

**永久修复**：
- `~/.claude/settings.json` 加 `"enableClaudeaiMcpServers": false`
- 或者修 `src/services/mcp/claudeai.ts` 让它检测 token = MiniMax 时自动跳过

### 🟡 P1 — Vibe Island UserPromptSubmit hook 注入 PUA 内容

**症状**：`/Users/0xvox/.vibe-island/bin/vibe-island-bridge --source claude` 作为 UserPromptSubmit hook 跑，stdout 输出 `<EXTREMELY_IMPORTANT>[PUA ACTIVATED 🟠 — User Frustration Detected] ...` 被 CCR 注入到 system context。

不影响功能，但每次 prompt 都有 PUA 上下文。

**修复**：
- 用户 update Vibe Island binary 让它 stdout 输出 `{}`（空 JSON）就不会被 inject
- 或者在 settings.json 把 UserPromptSubmit hook 改成空数组（已做过一次但 reverted？）

### 🟢 P2 — 239 skills 作为 attachment

**症状**：log 里 `Sending 239 skills via attachment (initial, 231 total sent)`。每次 prompt 提交 → 239 个 skill 被序列化送到 LLM 的 system context。MiniMax sysSize=30843B (30KB) 就有这些。Token 浪费严重。

**修复**：
- `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`（pipe 测过 work）
- 或者 skill registry 加 selective load（只加载用户 enable 的）

### 🟢 P2 — `cancelSignal` deprecation

**症状**：`[FileIndex] git ls-files error: The "signal" option has been renamed to "cancelSignal" instead.`

Bun/Node 24+ 改了 AbortSignal 选项名。CCR 用旧 API。fallback 到 ripgrep 成功，不致命。

**修复**：grep `signal:` in fs/child_process callers，改成 `cancelSignal:`。

---

## 立即开工 — REPL stream parser 调查

### Step 1: Plant chunk type log

```bash
cd ~/claude-code-reimagine-for-learning
# 找 SSE chunk loop
grep -n "for await\|message_start\|content_block_delta\|stream" src/services/api/claude.ts | head -20
```

预期在 `claude.ts` 的 `query()` 函数里找到一个 `for await (const event of stream)` 循环。在循环开头加：
```ts
logForDebugging(`[stream] chunk type=${event.type}`)
```

### Step 2: Plant REPL onQuery 消费侧 log

在 `REPL.tsx:2883` `[onQuery] ENTERED` log 之后找 stream 消费循环（应该是 `for await (const message of query(...))`），开头加：
```ts
logForDebugging(`[REPL] consume chunk: type=${message.type}`)
```

### Step 3: 重启 REPL，发 say hi，等 30s

```bash
kill $(pgrep -f "cli.tsx" | head -1) 2>/dev/null; sleep 1
: > /tmp/ccr-live.log
cd ~/claude-code-reimagine-for-learning
ENABLE_CLAUDEAI_MCP_SERVERS=0 bun run src/entrypoints/cli.tsx \
  --debug --debug-file /tmp/ccr-live.log --verbose
# REPL 里发 say hi，等 30s

# 另一终端
grep -E "stream\] chunk|REPL\] consume" /tmp/ccr-live.log | head -50
```

### 解读表

| stream] log 数 | REPL] consume 数 | 诊断 |
|---|---|---|
| 1 (只有 message_start) | 0-1 | **API client 提前关 stream**（reader 没继续 read） |
| 多个 | 0 | **REPL 没消费**（subscription / state bug） |
| 多个 | 多个 | **UI 渲染 bug**（最终 text 收到但没 push 到 message list） |
| 0 | 0 | API client 整条 stream 死掉（HTTP side） |

---

## 关键文件 (按阅读顺序)

```
.planning/phases/
  10-silent-swallow-hunt/00-HANDOFF.md       ← Phase 10 (pipe mode)
  11-repl-stream-parser/00-HANDOFF.md        ← 本文件

src/utils/processUserInput/processUserInput.ts:55  ← 今晚加的 import
src/utils/handlePromptSubmit.ts:476-512            ← 今晚加的 try/catch
src/components/HelpV2/Commands.tsx:49,80           ← 今晚加的 null-safety
tests/decompile-imports.test.ts                    ← 守门 test
tests/pipe-mode-timeout.test.ts                    ← Phase 10 守门 test

src/services/api/claude.ts                         ← 下一战场（stream parser）
src/screens/REPL.tsx:2883                          ← onQuery ENTERED + 消费侧
src/QueryEngine.ts                                 ← chunk → message reducer
```

---

## Sanity 检查（开始 debug 前先跑这两条确认基础没退化）

```bash
cd ~/claude-code-reimagine-for-learning

# 1. 回归 test 全绿
bun test tests/decompile-imports.test.ts tests/pipe-mode-timeout.test.ts

# 2. 真 round-trip pipe（应该秒回 OK）
echo "say OK in 2 words" | ENABLE_CLAUDEAI_MCP_SERVERS=0 \
  bun run dist/cli.js -p \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --output-format text
```

两条都 pass = 今晚的 fix 还在工作。然后开始挖 stream parser。

---

## 顺手的 go-test demo（如果时间充裕）

User 今晚装了 Go 想试新发现的 `/go-test` skill（TDD email validator demo）。建议：
- demo 在 `/tmp/go-test-demo/` 里跑，不污染 CCR
- 5 步：define interface → table-driven test → go test (RED) → implement (GREEN) → coverage
- 跑完反馈 skill 是否易用

---

## 别碰 list (user directive)

main 上已 modified 但**不属于今晚 fix** 的文件，下一 session **不要顺手 commit**：

```
M  .claude/settings.json
M  .gitignore
D  api/relay/route.ts
M  docs/evensong-paper-v3-{en,zh}.tex
M  src/components/messages/SystemAPIErrorMessage.tsx
M  src/query.ts
M  src/services/api/{__tests__/withRetry.test.ts,errors.ts,withRetry.ts}
M  src/skills/loadSkillsDir.ts
M  vercel.json
??  .agents/ .claude/plugins/ .claude/skills/ult-evo/ .claude/worktrees/
??  .env.vercel_check
??  .planning/STACK-RESEARCH.md
??  .planning/debug/
... (全部 untracked 都是 user 的别的工作 / 大文件 / 实验目录)
```

---

## 开 session 第一句话（复制给下一个 Claude）

> 我是 Claude Code，读了 Phase 11 handoff。今晚（Phase 10 + 11）已 commit 两个 silent-swallow fix（commits 45bf1ad + 06ee4f4），REPL 现在能跑通到 API + 收到 message_start，但 stream 之后 final assistant text 不渲染。直接进 §3 "立即开工"，给 `claude.ts` SSE chunk loop + REPL.tsx onQuery 消费侧各 plant 一个 chunk-type log，重启 REPL 发 say hi，看 chunk 流向哪一层断了。不重跑已排除项。

就这样。go.
