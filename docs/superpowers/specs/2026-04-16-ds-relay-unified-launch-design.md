# ds Relay-Unified Launch Design

> **Goal:** `ds`（CCR 的主入口）默认启用 Vercel relay，所有 provider 流量经过 relay 路由，REPL 内通过 `/provider` 切换模型。

## Architecture

```
ds (shell alias)
  → cd ~/claude-code-reimagine-for-learning
  → bun run src/entrypoints/cli.tsx
  → ANTHROPIC_BASE_URL=https://dash-proof.vercel.app/api/relay
  → relay (Vercel function, TLS)
      → decrypts payload (AES-256-GCM)
      → reads model from request body
      → routes to: MiniMax / xAI / OpenRouter / ...
      → encrypts response
      → returns to CCR
```

- **upstreamproxy/relay.ts**：容器内 MITM 代理，与本 spec 无关（仅在官方 CCR 容器环境触发）
- **api/relay/index.ts**：Vercel serverless relay，本 spec 的核心

## Changes

### 1. `~/.claude/ds-aliases.sh` — relay env 默认注入

在 `ds-max()` 里增加：

```zsh
ds-max() {
  _ds_ensure_oauth || return 1
  # Load relay env if .env.relay.ccr exists
  _ds_enable_relay_if_available
  cd "$_DS_DIR" && \
    ENABLE_CLAUDEAI_MCP_SERVERS=0 \
    API_TIMEOUT_MS=3000000 \
    bun run src/entrypoints/cli.tsx "${_DS_SAFE_SETTINGS_ARGS[@]}" \
      --model "claude-opus-4-6[1m]" --effort high --dangerously-skip-permissions "$@"
}
```

`.env.relay.ccr` 内容：
```
RELAY_URL=https://dash-proof.vercel.app/api/relay
RELAY_KEY=16a2f3f77721959bb0c70aad6275c9ff97663dd2dd7914c8a93b97d4a80a9969
```

Note：`RELAY_URL` 在 relay function 内部读取，不需要透传给 client.js。

### 2. `src/services/api/client.ts` — relay baseURL 注入

在 `getAnthropicClient()` 的 `effectiveBaseUrl` 逻辑里，增加：

```typescript
const relayUrl = process.env.CCR_RELAY_URL
const effectiveBaseUrl = thirdPartyOverride?.baseURL
  ?? relayUrl
  ?? process.env.ANTHROPIC_BASE_URL
```

新增 `CCR_RELAY_URL` env var，指向 Vercel relay URL。

Note：`RELAY_KEY` 不需要透传到 SDK — relay 是服务端点，SDK 直接 POST 到 relay URL，relay 内部读 `RELAY_KEY` 做加密。

### 3. `api/relay/index.ts` — relay 路由逻辑（已有）

保持不变。model 字段在 request body 里，relay 根据 model 判断路由到哪个 provider。

## Security Notes

- relay URL 是 Vercel 部署域名，TLS 加密传输
- `RELAY_KEY` 只存在于 Vercel 环境变量和本地 `.env.relay.ccr`，不硬编码、不透传
- upstreamproxy relay 与本 spec 无关，不改动

## Out of Scope

- upstreamproxy/relay.ts 改动
- relay 加密层（relay 是透明代理，TLS 已够）
- `/provider` 命令实现（已有）
