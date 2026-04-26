# research-vault-mcp stdio transport — Hermes 集成handoff

**日期：** 2026-04-22
**状态：** ✅ 完成，commit `d713975`
**目标：** 让 Hermes 通过 stdio transport 连接 research-vault-mcp

---

## 1. 问题根因

### 1.1 Hermes 报告 HTTP 400

Hermes `config.yaml` 里配置的是：
```yaml
mcp_servers:
  research_vault:
    url: http://localhost:8765   # ← plain HTTP local endpoint
```

CCR 能工作是因为 CCR 的 `.mcp.json` 用 `mcp-remote` 包装了 private network SSE URL：
```json
"args": ["-y", "mcp-remote", "http://<PRIVATE_NETWORK_HOST>:8765/sse", "--allow-http"]
```

Hermes 直连 `localhost:8765`，而 MCP server 当时跑在 private network host 上，所以 Hermes 连不上。

### 1.2 stdio transport 的实现 bug

`src/server.ts` 原始实现用了：
```typescript
const reader = Bun.stdin.getReader()   // ❌ Bun.stdin 是 Blob，不是 Web Stream
```

Bun 的 stdin 是 `Blob` 类型，`Bun.stdin.getReader()` 不存在。需要改用 Node.js readline。

---

## 2. 修复内容

### 2.1 server.ts — stdio transport 重写

**文件：** `packages/research-vault-mcp/src/server.ts`

```typescript
// 旧代码（不工作）：
async function handleStdioTransport() {
  const reader = Bun.stdin.getReader()  // TypeError: Bun.stdin.getReader is not a function
  ...
}

// 新代码（工作正常）：
async function handleStdioTransport() {
  const rl = await import('readline')
  const rli = rl.createInterface({ input: process.stdin as any, crlfDelay: Infinity })
  const writer = Bun.stdout.writer()

  const send = (obj: MCPResponse) => {
    writer.write(JSON.stringify(obj) + '\n')
    writer.flush()
  }

  for await (const line of rli) {
    if (!line.trim()) continue
    try {
      const req = JSON.parse(line) as MCPRequest
      const result = await handleRequest(req)
      if (result) send(result)
    } catch (e: unknown) {
      send({ jsonrpc: '2.0', error: { code: -32700, message: `Parse error: ...` } })
    }
  }
}
```

Bun 完全支持 Node.js `readline` 模块。

### 2.2 Hermes config — stdio 启动方式

**文件：** `~/.hermes/config.yaml`

```yaml
mcp_servers:
  research_vault:
    connect_timeout: 60
    timeout: 120
    command: bun
    args:
      - run
      - <REPO_ROOT>/packages/research-vault-mcp/bin/research-vault-mcp.mjs
      - --transport=stdio
```

**注意：** 不能用 `env: { MCP_TRANSPORT: stdio }`，因为 Hermes 的 `_build_safe_env()` 只传 `_SAFE_ENV_KEYS`（PATH, HOME, USER, LANG, LC_ALL, TERM, SHELL, TMPDIR），自定义 env 变量会被过滤掉。必须用命令行参数 `--transport=stdio`。

---

## 3. 验证结果

smoke test（已通过）：
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' \
  | bun run bin/research-vault-mcp.mjs --transport=stdio

# 返回完整 13 工具列表（4 vault_write + 4 vault_read + 5 amplify）
```

---

## 4. Hermes 侧需要做什么

1. **更新** `~/.hermes/config.yaml` 中 `mcp_servers.research_vault` 的配置（见 2.2）
2. **重启 Hermes** 或执行 `/mcp refresh`，让 Hermes 重新发现工具
3. 如果有缓存问题：`hermes mcp disconnect research_vault` 然后重启

---

## 5. 涉及的文件

| 文件 | 变化 |
|------|------|
| `packages/research-vault-mcp/src/server.ts` | 重写 `handleStdioTransport()` 用 readline |
| `packages/research-vault-mcp/dist/server.js` | rebuild 结果 |
| `~/.hermes/config.yaml` | 更新 stdio 启动参数 |

**commit：** `d713975` — `fix(server): replace Bun.stdin.getReader with Node.js readline for stdio transport`
