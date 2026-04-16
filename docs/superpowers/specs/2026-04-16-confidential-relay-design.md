# Confidential Relay Design — 消息混淆层设计

## 1. 背景与目标

**问题**：CCR（Claude Code Reimagine）与 AI Provider 通信时，存在两层泄露风险：
- **元数据暴露**：AI Provider 看到企业客户的真实出口 IP、组织身份、使用模式
- **链路窃听**：网络层中间人可窃听通信内容

**解决目标**：
- 通信链路加密（端到端，内容不可读）
- 元数据隐藏（出口 IP 固定为 US East Virginia IAD1，永不波动）
- CCR 代码零改动（透明代理方案）

---

## 2. 架构

```
┌─────────────────────────────────────────────────────────────┐
│  终端                                                        │
│  ┌──────────────┐                                           │
│  │  CCR CLI     │  (ProviderRouter → /api/relay)           │
│  └──────┬───────┘                                           │
│         │ HTTPS (TLS)                                        │
└─────────┼───────────────────────────────────────────────────┘
          │
          ↓
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Tunnel — your-domain.com                        │
│  · 源站 IP 隐藏                                              │
│  · TLS 终止 + 转发                                           │
└─────────┬───────────────────────────────────────────────────┘
          │
          ↓
┌─────────────────────────────────────────────────────────────┐
│  Vercel Function — US East (iad1)固定出口 IP              │
│  api/relay/route.ts                                        │
│  · 接收加密请求体 { encrypted: string }                    │
│  · AES-256-GCM 解密                                         │
│  · 替换 Authorization header                                │
│  · 转发到真实 AI Provider (固定出口 IP)                      │
│  · AI 响应加密返回                                           │
└─────────┬───────────────────────────────────────────────────┘
          │
          ↓
┌─────────────────────────────────────────────────────────────┐
│  AI Provider — 看到固定 IAD1 IP                              │
│  Anthropic / MiniMax / Codex / Gemini / Vertex              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 组件规格

### 3.1 Vercel Relay 函数

**文件**：`api/relay/route.ts`

**输入**：
```typescript
{
  encrypted: string  // Base64 AES-256-GCM 加密 payload
  provider: string   // 'anthropic' | 'minimax' | 'codex' | ...
}
```

**处理流程**：
1. 用 `RELAY_KEY`（环境变量）解密 `encrypted` → 原始请求体（messages, model, etc.）
2. 根据 `provider` 字段查到目标 API URL
3. 构造新的 HTTP 请求，替换 `Authorization: Bearer <API_KEY>`
4. 发送请求（出口 IP 固定为 IAD1）
5. 把 AI 响应加密后返回

**环境变量**：
- `RELAY_KEY`：AES-256-GCM 对称密钥（32 bytes hex）
- `ANTHROPIC_API_KEY`：Anthropic API 密钥
- `MINIMAX_API_KEY`：MiniMax API 密钥
- 其他 Provider 同理

**Vercel 配置**：
```json
// vercel.json
{
  "functions": {
    "api/relay/route.ts": {
      "egressIp": {
        "type": "fixed",
        "region": "iad1"
      }
    }
  }
}
```

### 3.2 终端侧加密模块

**文件**：`src/utils/crypto.ts`（新增）

```typescript
// AES-256-GCM 加密
export function encryptRelayPayload(payload: object, key: string): string

// 解密（Relay 响应）
export function decryptRelayPayload(encrypted: string, key: string): object
```

**ProviderRouter 改动（最小化）**：

在 `src/services/api/claude.ts` 中，当检测到环境变量 `RELAY_URL` 时：

```typescript
// 原来
const result = await provider.createMessage({ ... })

// 改为
const result = await fetch(RELAY_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    encrypted: encryptRelayPayload(payload, RELAY_KEY),
    provider: activeProvider
  })
})
```

> 注意：这是**可选配置**，通过环境变量开启，不改默认行为。

### 3.3 Cloudflare Tunnel

**目的**：隐藏 Vercel 源站真实 IP，流量经过 CF 节点

已有 `cloudflared tunnel`，确保：
- Tunnel 指向 `your-relay.your-domain.com`
- DNS CAA 记录指向 CF
- SSL/TLS 模式：Full（严格）

---

## 4. 密钥管理

| 密钥 | 存储位置 | 轮换 |
|------|---------|------|
| `RELAY_KEY` | Vercel 环境变量 + 终端 `.env` | 90 天轮换 |
| Provider API Keys | Vercel 环境变量 | 随用随换 |

---

## 5. 安全特性

| 特性 | 实现 |
|------|------|
| 端到端加密 | AES-256-GCM（一次一密，无法重放） |
| 出口 IP 固定 | Vercel Pro Egress IP — IAD1 |
| 源站 IP 隐藏 | Cloudflare Tunnel |
| 链路加密 | TLS 1.3（全路径） |
| 密钥隔离 | API Keys 永远不离开 Vercel，终端只有 Relay Key |
| 零 CCR 改动 | 默认行为不变，通过环境变量激活 Relay |

---

## 6. 实施步骤

1. [ ] Vercel Function `api/relay/route.ts` 编写完成
2. [ ] `RELAY_KEY` 生成并写入 Vercel 环境变量
3. [ ] `vercel.json` 配置 `egressIp: { type: "fixed", region: "iad1" }`
4. [ ] Cloudflare Tunnel 确认指向 Relay 域名
5. [ ] 终端侧 `.env` 写入 `RELAY_URL` + `RELAY_KEY`
6. [ ] ProviderRouter 支持 `RELAY_URL` 环境变量（可选开关）
7. [ ] 端到端联调测试（IP 固定性验证）

---

## 7. 不在范围内

- AI Provider 本身的数据政策（Provider 侧如何处理数据）
- 企业内网的进一步隔离（物理网络隔离）
- 消息内容审计/日志（Relay 本身不存储消息内容）
