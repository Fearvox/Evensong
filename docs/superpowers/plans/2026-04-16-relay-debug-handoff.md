# Relay Debug Handoff — 2026-04-16

## 谁犯了什么错

### 1. Codex (Anthropic) — 浪费 6+ 小时犟嘴

**错误**: Codex 在 Session 1 坚持说 CCR 的 `RELAY_URL` fallback 链不对，说 `RELAY_URL` 优先级应该不同。

**实际情况**: Fallback 链 `thirdPartyOverride?.baseURL ?? RELAY_URL ?? ANTHROPIC_BASE_URL` 是正确的。Codex 没有读代码，没有验证实际行为。

**根因**: 没有先验证（verification），直接给结论。用 intuition 而不是用工具。

**正确做法**: 应该先 `grep -n "RELAY_URL" src/services/api/client.ts` 确认代码写了什么，然后测试 `curl -v` 验证实际行为。

---

### 2. Claude (Anthropic) — Session 2 同样犟嘴

**错误**: 说"模型名称没有问题，代码逻辑也没有问题"，但 CCR 一直报 "model not found"。

**实际情况**: Relay 返回的响应格式不对 — OpenAI/MiniMax 返回 `{choices: [{message: {content: "..."}}]}` 但 SDK 期望 `{type: 'message', content: [{type: 'text', text: "..."}]}`。

**根因**:
1. 没有要求提供实际的 error response body
2. 没有验证 relay 返回的 Content-Type
3. 没有检查 SDK 期望的响应格式

**正确做法**:
```
curl -X POST https://dash-proof.vercel.app/api/relay \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMax-M2.7","messages":[{"role":"user","content":"hi"}]}'
```
然后对比 SDK 收到的实际 body。

---

### 3. Nolan — 自己

**错误**: 一开始没有直接检查 relay 的响应格式。用 `curl` 测试 direct MiniMax API 是通的，就假设 relay 也没问题。但 relay 返回的格式不对。

**正确做法**: 直接 `curl -v` 看 relay 返回的完整 response，不要假设。

---

## 问题根因（技术）

### Response Format Mismatch

MiniMax API 返回 OpenAI 格式：
```json
{
  "id": "...",
  "choices": [{
    "message": {"role": "assistant", "content": "hello"},
    "finish_reason": "stop"
  }],
  "usage": {...}
}
```

SDK 期望 Anthropic 格式：
```json
{
  "id": "...",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "hello"}],
  "stop_reason": "end_turn"
}
```

### ds-minimax 绕过 relay

`_ds_launch` 总是设置 `ANTHROPIC_BASE_URL`，即使 `RELAY_URL` 已经设置了。Vercel relay 是透明代理，需要 SDK 直接 POST 到 relay URL，不能走 baseURL 覆盖。

修复：`_ds_launch` 里只有当 `RELAY_URL` 没有设置时才设置 `ANTHROPIC_BASE_URL`。

---

## 修复清单

| 修复 | 文件 | 状态 |
|------|------|------|
| Relay 加 `transformToAnthropicFormat()` | `api/relay/index.ts` | ✅ Done |
| `RELAY_URL` 加到 client fallback 链 | `src/services/api/client.ts` | ✅ Done (commit 1403ccb) |
| `_ds_launch` 不覆盖 `RELAY_URL` | `~/.claude/ds-aliases.sh` | ✅ Done |
| Deploy relay 到 Vercel | — | ⏳ Pending |

---

## 验证步骤

### 1. Deploy relay
```bash
vercel deploy --prod
```

### 2. 验证 relay env
```bash
curl "https://dash-proof.vercel.app/api/relay?debug=env"
# 期望: hasMinimax: true, RELAY_KEY_hex: VALID
```

### 3. Pipe 测试 ds-max（等 token）
```bash
source ~/.claude/ds-aliases.sh
echo "say hello" | ds-max
# 期望: REPL 启动，模型回复，不再报 "model not found"
```

### 4. 冒烟测试
```bash
bun run build  # ✅ 5624 modules
```

---

## 教训

1. **先验证，再结论** — 不要假设，知道和确认是两回事
2. **提供实际数据** — "model not found" 报什么就提供什么，不要猜
3. **检查响应格式** — API 调试第一件事：看实际返回的 body
4. **Codex/Claude 不是工具** — 它们可以帮你，但最终要靠 grep/curl/read 自己验证
5. **小时别犟嘴** — 6 小时犟嘴 vs 1 小时 grep = 效率差 6 倍

---

## 时间线

| 时间 | 事件 |
|------|------|
| Session 1 | Codex 花 6h 说 RELAY_URL fallback 不对（实际是对的）|
| Session 2 | Claude 花 2h 说代码没问题（实际响应格式错了）|
| 2026-04-16 早上 | Nolan 自己动手，1h 内找到根因 |
| 2026-04-16 早上 | `transformToAnthropicFormat()` 加到 relay，build ✅ |
| 2026-04-16 早上 | 等用户 deploy + E2E 验证 |
