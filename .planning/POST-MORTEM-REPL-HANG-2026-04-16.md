# POST-MORTEM: CCR REPL 消息挂起事故 — 2026-04-16

## 影响
- 持续时间：~4 小时 debug（00:00 - 04:00 EDT）
- 症状：REPL 模式发消息后永不响应，pipe 模式正常
- 影响范围：所有 provider（MiniMax, xAI, Anthropic OAuth）

## 根因链（按发现顺序）
| # | 阻塞源 | 耗时 | 修复 |
|---|--------|------|------|
| 1 | MonitorTool inputSchema shorthand | 启动 crash | getter + async prompt() |
| 2 | USER_TYPE=ant 环境泄漏 | 启动 crash | cli.tsx 强制 external |
| 3 | resolveAntModel 全局未定义 | 13 test fail | typeof guard |
| 4 | BRIDGE_MODE=true → remote WebSocket | 消息走 WS 不走本地 | 关闭 flag |
| 5 | remoteControlAtStartup=true | 同上 | .claude.json 置 false |
| 6 | OAuth token 过期 27h | Anthropic 401 | ds-aliases 自动检测 |
| 7 | SDK authToken 模式忽略 ANTHROPIC_BASE_URL | MiniMax 请求到 Anthropic | client.ts 显式传 baseURL |
| 8 | isClaudeAISubscriber() 覆盖第三方 apiKey | null apiKey → 401 | isThirdParty guard |
| 9 | GrowthBook HTTP init 30s 超时 | 首消息延迟 30s | DISABLE_TELEMETRY=1 |
| 10 | checkAndRefreshOAuthTokenIfNeeded hang | 每次 API call 阻塞 | 完全禁用 |
| 11 | 39 plugins / 311 skills 加载 | 14s 处理时间 | 砍到 6 plugins |
| **12** | **vibe-island-bridge UserPromptSubmit hook** | **无限 hang** | **删除 hook** |

## 真正的根因
**#12 是唯一的真正阻塞**。#1-#11 都是额外的延迟/crash，但即使全修了，#12 也会让 REPL 永远 hang。

vibe-island-bridge 在 REPL 模式的 `processUserInput` → `executeUserPromptSubmitHooks` 里被调用。pipe 模式走不同路径（直接 `query()`），所以 pipe 一直正常。

## 优化方向

### P0: Hook 超时机制（防止任何 hook 卡死 REPL）
- `executeUserPromptSubmitHooks` 应该有硬超时（5s）
- 超时后跳过 hook，打 warning，继续发消息
- 当前：hook hang → 整个 REPL 死锁，用户无法操作
- 参考：`PreToolUse` hooks 有 timeout 字段但 `UserPromptSubmit` 没有

### P0: 第三方 Provider 路径完全隔离
- 当 `ANTHROPIC_BASE_URL` 非 Anthropic 域名时：
  - 跳过 OAuth refresh ✅ (已做)
  - 跳过 GrowthBook init ✅ (已做)
  - 跳过 bridge/remote control ✅ (已做)
  - 跳过 claude.ai MCP connector ✅ (已做)
  - 直接用 API key，不查 keychain
- 目标：第三方 provider 路径零 Anthropic 依赖

### P1: Plugin Lazy Loading
- 311 skills 在首次消息时全量加载 = 14s
- 改为按需加载：只在用户输入 `/skill-name` 时加载对应 skill
- system prompt 只发 skill 名字列表（不发完整 SKILL.md 内容）
- 预估收益：14s → <1s

### P1: OAuth Token 管理
- CCR 当前无法自行 refresh OAuth token
- 依赖官方 CC 的 `/login` 手动刷新
- 目标：实现独立的 token refresh（调 Anthropic OAuth endpoint）
- 或：keychain watcher 自动检测官方 CC 刷新后的新 token

### P2: ds-aliases 健壮性
- 当前 `--mcp-config` JSON 参数在 zsh 展开时 break
- 改用 env var 控制（`ENABLE_CLAUDEAI_MCP_SERVERS=0`）✅ (已做)
- xAI base URL 需要 `/v1` 但 SDK 也加 `/v1` → 双重路径
- 每个 provider 应有独立的 URL 格式测试

### P2: REPL vs Pipe 路径统一
- pipe 模式不走 `handlePromptSubmit` → `processUserInput` → hooks
- REPL 模式走完整路径包含 hooks
- 两条路径行为差异大 → debug 困难
- 考虑统一或至少共享核心 query 逻辑

### P3: Debug 可观测性
- 当前 `--debug-file` 不记录 query checkpoint
- `queryCheckpoint` 的输出去了内部 profiler 不在 debug log
- 添加：hook 执行开始/结束时间戳
- 添加：processUserInput 各阶段时间戳
- 添加：API client 创建参数（baseURL, apiKey 存在性, authToken 存在性）

## 教训
1. **用户说能用就先验证**——不要基于推理下"不支持"的结论
2. **Hook 必须有超时**——任何外部进程都可能 hang
3. **pipe 正常 ≠ REPL 正常**——两条路径差异巨大
4. **Plugin 数量直接影响性能**——39 plugins = 14s 首消息延迟
5. **OAuth in CCR 是个雷区**——多处代码假设 OAuth 可用但 CCR 的 OAuth 不完整
