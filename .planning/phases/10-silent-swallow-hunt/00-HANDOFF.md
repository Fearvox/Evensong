# Phase 10 Handoff — Silent-Swallow Hunt

**From:** claude-code-reimagine-for-learning / worktree `dreamy-mccarthy-a22317` (2026-04-17 ~02:20 EDT)
**To:** next Claude Code session (same machine)
**User state:** up since 4/15 evening, has been debugging this ~30h. Told user to sleep. Handoff so you can resume cold.

---

## 怎么用这份 handoff (给下一个 Claude)

1. 读本文件全部
2. 读 `.planning/POST-MORTEM-REPL-HANG-2026-04-16.md`（前晚同一 bug 的 4h 调查，已解决 vibe-island-bridge 一条，**当前这次是新一轮**）
3. 读 **Fearvox/DS-EverOS-RR** repo 的 `REPRO.md`（今晚 14h 调查终稿，公开版本）
4. **不要重跑** 今晚所有已排除项 (见下面 "Already Ruled Out")
5. 按 "立即开工" 直接 plant 8 checkpoint，15 分钟定位根因

---

## 今天 session 成果（11 commits on main + 3 commits on DS-EverOS-RR）

### Main (`claude-code-reimagine-for-learning`, branch `main`)

```
ce7ea73 fix(effort): accept 'xhigh' in --effort CLI flag + /effort slash help
b2155de feat(model): defineModel() DSL + registry invariant tests (Wave 1 Tasks 6+7)
4b9d2d7 refactor(modelCost): rename COST_TIER_5_25 → COST_OPUS_FRONTIER (Wave 1 Task 5)
b1b5aba refactor(prompts): read getKnowledgeCutoff from CAPABILITY_REGISTRY (Wave 1 Task 4)
3de19c8 refactor(model): route thinking/betas/context through CAPABILITY_REGISTRY (Wave 1 Task 3)
15f36d9 refactor(effort): route modelSupports{Effort,MaxEffort,XHigh} through registry
684d824 refactor(model): add CAPABILITY_REGISTRY single-source-of-truth (Wave 1 Task 1)
a7f045f docs(plans): Wave 1 tech-debt cleanup — CCR model capability registry
ae55487 feat(model): adapt Claude Opus 4.7 (Phase 09, T2 scope)
a5bbc0f feat(relay): translate OpenAI SSE to Anthropic SSE (Phase 08.3)
07f7e3c docs(planning): archive Phase 08 final activation HANDOFF
```

Regression: 1286/1286 pass through Phase 09. Since then two UNCOMMITTED instrumentation edits (for this hunt):

- `src/utils/handlePromptSubmit.ts:528` — `[executeUserInput] processUserInput done` log (never fires in repros — confirms downstream).
- `src/services/api/claude.ts:1973` / `1997` / `2105` — `[api] request SENT` / `response HEADERS` / `FIRST CHUNK` (none fire — confirms API client never invoked).

### DS-EverOS-RR (`https://github.com/Fearvox/DS-EverOS-RR`, PUBLIC)

```
2aac291 docs(repro): 14h debug complete — hang localized to main.tsx:2389-3200 async boundary
a5b5267 docs(repro): narrow silent-swallow to UserPromptSubmit hook iterator timeout
6a6e914 Initial sanitized sandbox: CCR + silent-swallow investigation artifacts
```

Pushed. Anyone on the EverMind team (or others) can clone, `bun install`, run repro from the README.

---

## 今晚 15h 调查总结 — The One Paragraph

CCR REPL 和 pipe (`-p`) 发完 `say OK` 后 spinner 持续 2–3 分钟不消失，`/tmp/ccr-live.log` 在打印 `Found N plugins (M enabled, K disabled)` 后**再无任何新 log**。同时 `lsof` 显示 CCR 已建立 HTTPS ESTABLISHED 连接到 MiniMax (`47.252.72.253:443`)，但 HTTP 请求体从未发出 / 响应从未到来。直接 curl MiniMax 同 URL 返回正常（TTFB 1-3s）。6 个 `UserPromptSubmit` hook 已清空，所有 MCP 已关，311-skill attachment 已 suppress，bare mode 已开，Vercel plugin 已在 project scope 禁 — **全部无效**。Hang 位置被缩到 `src/main.tsx` 第 2389 行 (`[STARTUP] MCP configs resolved`) 和 `src/utils/plugins/pluginLoader.ts:3200` 打印的 `Found N plugins` log 之间的 ~50 行 async 边界内。我这个 session 的 instrumentation（`claude.ts` 3 条、`handlePromptSubmit.ts` 1 条）在 repro 中都不触发，确认根因在 API client 被调用之前。

---

## Already Ruled Out (别再测)

| Layer | 证据 |
|---|---|
| MiniMax endpoint | `curl https://api.minimax.io/anthropic/v1/messages`: TTFB 2.9s non-stream, 1.1s stream, HTTP 200, full SSE |
| Network / DNS / TLS | `lsof -p <pid>` shows ESTABLISHED 10.6.3.196:X → 47.252.72.253:https |
| OAuth expiry / bad token | `settings.json.env.ANTHROPIC_AUTH_TOKEN` valid 125 chars, curl succeeds |
| PUA UserPromptSubmit hook | `~/.claude/plugins/cache/pua-skills/pua/3.1.0/hooks/hooks.json` + marketplace copy both `UserPromptSubmit: []`; `.bak-20260417-*` backups in same dirs |
| EverMem/Vercel/Hookify UserPromptSubmit hooks | Same treatment; 6 files total neutralized |
| claude.ai plugin MCP (Zoom/Zapier/Tavily/Airtable/Exa/Notion/Slack/Harvey/Figma/GCal/Gmail) | `ENABLE_CLAUDEAI_MCP_SERVERS=0` gate at `src/services/mcp/claudeai.ts:42` |
| Local MCP servers | `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` |
| Vercel plugin hooks (PreToolUse / PostToolUse / SessionStart / SubagentStart/Stop / SessionEnd) | `plugins.vercel@claude-plugins-official: false` in project `.claude/settings.json` |
| 311-skill attachment | `CLAUDE_CODE_DISABLE_ATTACHMENTS=1` early-returns at `src/utils/attachments.ts:752-761`; verified `Sending 311 skills` log no longer fires |
| `installPluginsForHeadless` (marketplace git pulls) | `CLAUDE_CODE_SIMPLE=1` (bare) skips it; same hang |
| REPL-only code path (React/Ink tree) | Pipe mode `-p` hangs identically |
| Hook iterator 5s timeout (`HOOK_TIMEOUT_MS`) | Past 5s now; no `Hook UserPromptSubmit timed out` log |
| Thinking-only response parse bug | API client never invoked — MiniMax response not even requested |

---

## 立即开工 (next session 15 分钟计划)

### Step 1 — Plant 8 numbered checkpoints

In `src/main.tsx` between lines 2389 and 3200, add at each major `await` or `void fn()`:

```ts
logForDebugging('[STARTUP] checkpoint 1 at main.tsx:2400')
logForDebugging('[STARTUP] checkpoint 2 at main.tsx:2500')
...
logForDebugging('[STARTUP] checkpoint 8 at main.tsx:3150')
```

Distribute across these known boundaries:
1. Before `isNonInteractiveSession` branch (~L2400 after MCP configs resolved log)
2. After `hooksPromise` construction (~L2450)
3. After `mcpPromise` (`Promise.all([localMcpPromise, claudeaiMcpPromise]).then(...)`)
4. After `processSessionStartHooks('startup', ...)` null-check / construction
5. After `logSessionTelemetry()` (fire-and-forget `void loadAllPluginsCacheOnly().then(...)`)
6. After `apiPreconnect` decision (grep `preconnectAnthropicApi`)
7. After `logPluginsEnabledForSession` callback
8. Right before dispatch to `runHeadless` or interactive render

### Step 2 — Rebuild & run the canonical repro

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
bun run build
: > /tmp/ccr-live.log
CLAUDE_CODE_DISABLE_ATTACHMENTS=1 \
ENABLE_CLAUDEAI_MCP_SERVERS=0 \
CLAUDE_CODE_SIMPLE=1 \
bun run dist/cli.js -p \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --debug-file /tmp/ccr-live.log \
  --output-format text <<< "say OK" &
BUN_PID=$!
sleep 25
kill -9 $BUN_PID 2>/dev/null
pkill -9 -f "dist/cli.js" 2>/dev/null
grep "\[STARTUP\] checkpoint" /tmp/ccr-live.log
```

### Step 3 — Read the failing 100-line block

First missing checkpoint number narrows the hang to a 100-line window. Read it word-by-word.

### Step 4 — Surgical fix

Likely either:
- An `await` that never resolves (wrap in `Promise.race` with timeout, log then continue)
- A `void fn()` that silently throws and chokes a shared cache the next await reads
- An `apiPreconnect` side effect (opens the ESTABLISHED socket we see)

### Step 5 — Regression test

`tests/pipe-mode-timeout.test.ts`: spawn `bun run dist/cli.js -p` with `echo "say OK"`, assert completion within 10s.

### Step 6 — Commit + push

Commit to main. If fix is sound, backport to DS-EverOS-RR by rebuilding/updating `/tmp/DS-EverOS-RR` and pushing commit 4.

---

## 关键文件 (按阅读顺序)

```
~/claude-code-reimagine-for-learning/
  .planning/
    POST-MORTEM-REPL-HANG-2026-04-16.md        ← 前晚同一 bug 第一轮调查
    phases/10-silent-swallow-hunt/00-HANDOFF.md ← 本文件
  src/main.tsx:2389-3200                        ← 真凶 50-line 窗口
  src/cli/print.ts                              ← pipe-mode entry, runHeadless
  src/utils/plugins/pluginLoader.ts:3200        ← 最后可见 log "Found N plugins"
  src/services/api/claude.ts:1973/1997/2105     ← 我 instrument，未触发
  src/utils/handlePromptSubmit.ts:528           ← 我 instrument，未触发
  src/utils/attachments.ts:752-761              ← CLAUDE_CODE_DISABLE_ATTACHMENTS gate (已验证)
  src/services/mcp/claudeai.ts:42               ← ENABLE_CLAUDEAI_MCP_SERVERS gate (已验证)
```

Fearvox/DS-EverOS-RR (public) 上 `REPRO.md` 是对外版本，内容与本文件对应的 "调查总结" 一致但脱敏。

---

## 警告 — 安全 (明天处理，不紧急)

`~/.claude/settings.json` 的 `env` 段 **inline 明文** 泄漏两个 key：

1. `EVERMEM_API_KEY=9db9eb89-aeea-4fa2-9da8-f70590394614` (EverMind plugin) — 已在 Fearvox/Evensong git history 5 commits 里
2. `ANTHROPIC_AUTH_TOKEN=sk-cp-yEiN...` (MiniMax token, 125 chars) — 同上 5 commits

`Fearvox/Evensong` 是 **private** repo，公众未暴露。但：
- 不要把这 repo 转 public
- **在把 repo 转 public 之前**：rotate 两个 key + `git filter-repo` 清历史 + force push origin
- `.gitignore` 没 ignore `.claude/settings.json` — 建议将 secret 挪到 `.claude/settings.local.json`（已 gitignored）

`DS-EverOS-RR` (public) 打包时用 whitelist 只复制 src/api/tests/etc，**没带 `.claude/` 目录**，token 未泄露到公开 repo。

---

## 别碰 list (user directive，今晚未 commit 的 main 工作)

这些 main 上有 M/未追踪改动是 user 的别的工作：

```
M  .gitignore
D  api/relay/route.ts (intentional)
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
```

今晚 session 新增的**未 commit**改动（属于本次 hunt，可以和下次 fix 一起 commit）：

```
M  src/utils/handlePromptSubmit.ts  (L528 debug log)
M  src/services/api/claude.ts       (L1973/1997/2105 debug log)
??  .planning/phases/10-silent-swallow-hunt/00-HANDOFF.md (本文件)
```

`~/.claude/` 不在 git，但 user 全局配置文件有今晚改动：

```
~/.claude/plugins/cache/pua-skills/pua/3.1.0/hooks/hooks.json              (UserPromptSubmit: [])
~/.claude/plugins/marketplaces/pua-skills/hooks/hooks.json                 (UserPromptSubmit: [])
~/.claude/plugins/cache/evermem/evermem/0.1.3/hooks/hooks.json             (UserPromptSubmit: [])
~/.claude/plugins/marketplaces/evermem/hooks/hooks.json                    (UserPromptSubmit: [])
~/.claude/plugins/cache/claude-plugins-official/vercel/b95178c7d8df/hooks/hooks.json   (UserPromptSubmit: [])
~/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/hooks/hooks.json (UserPromptSubmit: [])
```

Backup 文件 `hooks.json.bak-20260417-*` 都在原目录里，需要 rollback 就 `mv` 回来。

---

## 开 session 第一句话（复制给下一个 Claude）

> 我是 Claude Code，读了 Phase 10 handoff。昨晚 14h 把 silent swallow 缩到 main.tsx:2389-3200 的 50 行 async 窗口。今早直接 plant 8 个 `[STARTUP] checkpoint N` log，rebuild，一次 pipe repro，定位到具体函数。然后 surgical fix + 回归 test。不重跑已排除项。

就这样。go.
