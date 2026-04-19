# HANDOFF — DS REPL 添加 OpenRouter · Elephant Alpha Provider

**收件人**: CC CLI agent (当前在修 DS REPL 的那个 session)
**发件人**: Vox 的 Cowork (已完成 cc-switch GUI 侧的同等改动)
**日期**: 2026-04-18
**目标仓库**: `~/claude-code-reimagine-for-learning/` (CCR / DS 主产品线,GitHub `Fearvox/Evensong.git`)

---

## 0. 背景 (必读,30 秒)

- 上游官方 Claude Code 那边我已经通过 cc-switch GUI (`~/.cc-switch/cc-switch.db`) 把 4 个 OpenRouter profile 的 key 换成新的 `sk-or-v1-50010e...88288`,并把 `OR China #1` 的 `ANTHROPIC_MODEL` + `ANTHROPIC_DEFAULT_HAIKU_MODEL` 两个槽位替换成了 `openrouter/elephant-alpha` (OpenRouter 盲测期的 stealth 模型,100B,256K ctx,免费,强项: code completion / debugging / 轻量代理)。
- 现在要给 DS 自身的 REPL `/provider` 命令加一个等价选项,这样 `bun run dev` → `/provider or-elephant-alpha` 就能直接切过去。
- CCR `.env` 里 `OPENROUTER_API_KEY=sk-or-v1-50010e...88288` **已经就位**,不用再改。

---

## 1. 范围 (做什么)

在 `src/services/providers/ProviderRouter.ts` 追加一个新 preset `or-elephant-alpha`,并把它接进 `keyMap`。仅此两处,不碰其他文件。

**不做**:
- 不复制 cc-switch 的"4 profile × 5 slot (MODEL/OPUS/SONNET/HAIKU/REASONING)"结构。那是官方 CC 的 Anthropic 适配层概念,DS 的 `/provider` 是单模型切换,平铺即可。
- 不碰 `src/commands/provider/provider.tsx`,它从 `PROVIDER_PRESETS` 自动枚举,加完 preset 会自动显示。
- 不改 `.env`,不改 `fallbackChain`,不改 `defaultProvider`。EA 是实验性的,放进可选池就行。

---

## 2. 精确 diff

**文件**: `src/services/providers/ProviderRouter.ts`

### 改动 A — 追加 PROVIDER_PRESETS 条目

在 `'or-minimax'` 条目之后、闭合的 `};` 之前 (大约 L152 附近) 加入:

```typescript
  // OpenRouter stealth / blind-test 模型 (盲测期免费,256K ctx)
  // 用途: 单步推理 + 轻量代理,不适合重 reasoning 任务
  'or-elephant-alpha': {
    name: 'or-elephant-alpha',
    providerClass: 'openai-compatible',
    modelName: 'openrouter/elephant-alpha',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
```

### 改动 B — keyMap 注册

在 `fromEnvironment()` 方法里,`keyMap` 对象内,紧跟其他 `or-*` 条目 (大约 L245 `'or-minimax'` 行附近) 加入一行:

```typescript
      'or-elephant-alpha': process.env.OPENROUTER_API_KEY,
```

**就这两处**。其他地方 (`availableProviders` / `/provider` 列表 / `providers.json` 回退) 全部自动生效。

---

## 3. 验证清单 (必跑)

```bash
cd ~/claude-code-reimagine-for-learning

# 1. 编辑完先看语法
bun run build 2>&1 | tail -20
# 期望: dist/cli.js 输出,~25MB,无 error (tsc 的 unknown/never 警告可忽略)

# 2. 启动 REPL
bun run dev

# 3. REPL 内:
/provider
# 期望输出里能看到一行: ○ or-elephant-alpha — openrouter/elephant-alpha

/provider or-elephant-alpha
# 期望: "Switched to or-elephant-alpha provider — model: openrouter/elephant-alpha"

# 4. 发一条简短消息试下
hello, say "pong" only
# 期望: 模型回 "pong" (或类似)。如果拿到 401/403,检查 OPENROUTER_API_KEY 加载路径。

# 5. 切回默认,确保没搞坏别的
/provider xai-fast
# 期望: 正常切回 grok-4-1-fast-reasoning
```

### 冒烟用的 curl 兜底 (如果 REPL 报错可以用这个定位问题出在哪层)

```bash
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openrouter/elephant-alpha","messages":[{"role":"user","content":"ping"}]}' \
  | head -50
```
200 → key+模型都活着,问题在 DS 路由层。401/404 → 先查 OpenRouter 控制台这个模型有没有在你的账号允许列表里。

---

## 4. 已验证的事实 (少走弯路)

我 Cowork 侧已经 grep 过了,下面这些都是 ground truth,agent 不用再验证:

- `ProviderRouter.ts` L223-251 的 `fromEnvironment()` 已经统一用 `process.env.OPENROUTER_API_KEY` 驱动所有 `or-*` preset — 加新 preset 时**不需要**在其他地方注入 key
- `/provider` 命令 (`src/commands/provider/provider.tsx` L9) 用 `Object.keys(PROVIDER_PRESETS)` 作为白名单,加到 PROVIDER_PRESETS 后自动出现在 `/provider` 列表和补全里
- `OpenAICompatibleClient.ts` 对任意 OpenAI-compatible baseUrl 都是透明的 (EA 就是走 OR 的 OpenAI 兼容层),**不需要**加新 client 类
- `setActiveProvider` → `queryModel in claude.ts` 的调用链已经处理了 `mainLoopModel` 同步,切换到 EA 时会自动把 `mainLoopModel` 刷成 `openrouter/elephant-alpha` (见 provider.tsx L75-78)

---

## 5. 可选扩展 (如果 Vox 确认要再加)

不在本次 handoff 范围内,但如果后续 Vox 说"也把别的 OR 盲测模型加进来"或者"把 cc-switch 那 4 profile 完整镜像进 DS",这里是前置情报:

**扩展 A — 再加几个 OR 盲测/新模型 preset** (预留位置):
- `or-sonoma` (如果还在线)
- `or-horizon-alpha/beta` (OpenAI stealth)
- `or-quasar-alpha` (DeepSeek stealth)
按改动 A+B 的两步模式即可,每个模型 +5 行代码。

**扩展 B — 多槽位 profile 模拟** (如果要完整复刻 cc-switch 的 5-slot 结构):
DS 现在 `activeProvider` 只管一个 `mainLoopModel`,没有 Opus/Sonnet/Haiku 分派概念。要上的话得碰 `src/utils/model/aliases.ts` + `AgentTool` 的 subagent 路由 — 这是大改动,先不做。

---

## 6. 回滚

两处改动全在一个文件 (`ProviderRouter.ts`),git 单文件 revert 即可。没有 DB 变动,没有 env 变动,没有 lock 文件动。

```bash
git diff src/services/providers/ProviderRouter.ts
# 确认只有新增的两段
git checkout -- src/services/providers/ProviderRouter.ts  # 回滚
```

---

## 7. Commit message 建议

```
feat(providers): add or-elephant-alpha preset for OpenRouter stealth model

Blind-test free stealth model (100B, 256K ctx) suited for code completion
and lightweight agent loops. Parity with cc-switch GUI's "OR China #1"
profile where EA now occupies MODEL + HAIKU slots.

No reasoning/vision support confirmed — do NOT add to default fallbackChain
or route heavy planning tasks to it.

Refs: cc-switch.db @ 0539a760 profile update 2026-04-18
```

---

**完**。 如果跑完 `/provider or-elephant-alpha` + 一条 hello 能正常 round-trip,就 ship。有 401/403 把错误粘给 Vox,他知道 OpenRouter 账号那边的 model access 怎么开。
