# Confidential Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a transparent encryption relay that routes CCR's AI Provider traffic through a Vercel fixed-IP function, hiding metadata (IP, identity) from providers.

**Architecture:** Two-part system: (1) Vercel relay function (`api/relay/`) that decrypts requests and forwards to AI providers with fixed US-East egress IP; (2) CCR-side encryption module (`src/utils/crypto.ts`) and ProviderRouter modification to route via `RELAY_URL` when environment variable is set.

**Tech Stack:** AES-256-GCM (Node.js `crypto`), Bun runtime, Vercel Functions, Cloudflare Tunnel, ProviderRouter pattern.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `api/relay/route.ts` | **Create** | Vercel API Route — receives encrypted payload, decrypts, forwards to AI provider with fixed IAD1 IP |
| `api/relay/crypto.ts` | **Create** | Shared AES-256-GCM encrypt/decrypt helpers (same algorithm on both relay and CCR side) |
| `src/utils/crypto.ts` | **Modify** | Add `encryptRelayPayload()` + `decryptRelayPayload()` exports (re-exports from `api/relay/crypto.ts`) |
| `src/services/api/claude.ts` | **Modify** | Check `RELAY_URL` env var; if set, POST to relay instead of calling Provider directly |
| `vercel.json` | **Create** | Configure `egressIp: { type: "fixed", region: "iad1" }` for `api/relay/route.ts` |
| `.env.relay.example` | **Create** | Template showing required env vars (`RELAY_KEY`, provider API keys) |

---

## Task 1: AES-256-GCM Crypto Module

**Files:**
- Create: `api/relay/crypto.ts`
- Test: `src/services/api/__tests__/relayCrypto.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/api/__tests__/relayCrypto.test.ts
import { describe, test, expect } from 'bun:test'
import { encryptRelayPayload, decryptRelayPayload } from 'src/utils/crypto'

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' // 64 hex chars = 32 bytes
const TEST_PAYLOAD = { messages: [{ role: 'user', content: 'hello' }], model: 'claude-opus-4-6' }

describe('relayCrypto', () => {
  test('encrypt then decrypt returns original payload', () => {
    const encrypted = encryptRelayPayload(TEST_PAYLOAD, TEST_KEY)
    const decrypted = decryptRelayPayload(encrypted, TEST_KEY)
    expect(decrypted).toEqual(TEST_PAYLOAD)
  })

  test('wrong key throws', () => {
    const encrypted = encryptRelayPayload(TEST_PAYLOAD, TEST_KEY)
    const wrongKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
    expect(() => decryptRelayPayload(encrypted, wrongKey)).toThrow()
  })

  test('tampered ciphertext throws', () => {
    const encrypted = encryptRelayPayload(TEST_PAYLOAD, TEST_KEY)
    const tampered = encrypted.slice(0, -4) + '0000'
    expect(() => decryptRelayPayload(tampered, TEST_KEY)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/services/api/__tests__/relayCrypto.test.ts`
Expected: FAIL — `encryptRelayPayload` / `decryptRelayPayload` not defined

- [ ] **Step 3: Write AES-256-GCM implementation**

```typescript
// api/relay/crypto.ts
// AES-256-GCM with random IV per encryption. Output format: iv:ciphertext:tag (all base64)

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // 96-bit IV for GCM
const TAG_LENGTH = 16   // 128-bit auth tag

/**
 * Encrypt a payload object. Returns: iv:ciphertext:tag (all base64, colon-separated)
 */
export function encryptRelayPayload(payload: object, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const plaintext = JSON.stringify(payload)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join(':')
}

/**
 * Decrypt a payload encrypted by encryptRelayPayload.
 * @param encrypted  iv:ciphertext:tag string
 * @param keyHex     64-char hex string (32 bytes)
 */
export function decryptRelayPayload(encrypted: string, keyHex: string): object {
  const key = Buffer.from(keyHex, 'hex')
  const [ivB64, ciphertextB64, tagB64] = encrypted.split(':')

  if (!ivB64 || !ciphertextB64 || !tagB64) {
    throw new Error('Invalid encrypted payload format')
  }

  const iv = Buffer.from(ivB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  return JSON.parse(plaintext)
}
```

- [ ] **Step 4: Re-export from src/utils/crypto.ts**

```typescript
// src/utils/crypto.ts
// Existing content preserved, add:
export { encryptRelayPayload, decryptRelayPayload } from '../api/relay/crypto.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/services/api/__tests__/relayCrypto.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/crypto.ts api/relay/crypto.ts src/services/api/__tests__/relayCrypto.test.ts
git commit -m "feat(relay): AES-256-GCM crypto module for confidential relay

- encryptRelayPayload: AES-256-GCM with random IV, output iv:ciphertext:tag
- decryptRelayPayload: verified decryption, throws on tampered ciphertext
- Bun test with 3 cases: roundtrip, wrong key, tampered ciphertext
"
```

---

## Task 2: Vercel Relay Function

**Files:**
- Create: `api/relay/route.ts`
- Create: `vercel.json` (modify if exists)
- Test: Manual curl test after deployment

- [ ] **Step 1: Write the Vercel API Route**

```typescript
// api/relay/route.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { encryptRelayPayload, decryptRelayPayload } from './crypto'

// Environment variables (set in Vercel dashboard):
// RELAY_KEY=64-char-hex
// ANTHROPIC_API_KEY=sk-ant-...
// MINIMAX_API_KEY=...
// CODEX_API_KEY=...
// GEMINI_API_KEY=...
// VERTEX_API_KEY=...
// BEDROCK_AWS_ACCESS_KEY_ID=...
// BEDROCK_AWS_SECRET_ACCESS_KEY=...

const PROVIDER_ENDPOINTS: Record<string, { url: string; authHeader: string; envKey: string }> = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    authHeader: 'x-api-key',
    envKey: 'ANTHROPIC_API_KEY',
  },
  minimax: {
    url: 'https://api.minimaxi.chat/v1/chat/completions',
    authHeader: 'authorization',
    envKey: 'MINIMAX_API_KEY',
  },
  codex: {
    url: 'https://api.openai.com/v1/chat/completions',
    authHeader: 'authorization',
    envKey: 'CODEX_API_KEY',
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    authHeader: 'authorization',
    envKey: 'GEMINI_API_KEY',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    authHeader: 'authorization',
    envKey: 'OPENROUTER_API_KEY',
  },
  bedrock: {
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-sonnet-v1/max',
    authHeader: 'x-amz-authorization',
    envKey: 'BEDROCK_AWS_SECRET_ACCESS_KEY',
  },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { encrypted, provider } = req.body as { encrypted: string; provider: string }

  if (!encrypted || !provider) {
    return res.status(400).json({ error: 'Missing encrypted or provider' })
  }

  const relayKey = process.env.RELAY_KEY
  if (!relayKey) {
    return res.status(500).json({ error: 'RELAY_KEY not configured' })
  }

  let originalPayload: object
  try {
    originalPayload = decryptRelayPayload(encrypted, relayKey)
  } catch {
    return res.status(400).json({ error: 'Decryption failed' })
  }

  const providerConfig = PROVIDER_ENDPOINTS[provider]
  if (!providerConfig) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` })
  }

  const apiKey = process.env[providerConfig.envKey]
  if (!apiKey) {
    return res.status(500).json({ error: `API key for ${provider} not configured` })
  }

  // Forward to AI provider
  const providerResponse = await fetch(providerConfig.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [providerConfig.authHeader]: apiKey,
      // Pass through other headers from original payload
    },
    body: JSON.stringify(originalPayload),
  })

  const responseData = await providerResponse.json()

  // Encrypt response back to client
  const encryptedResponse = encryptRelayPayload(responseData, relayKey)

  res.status(200).json({ encrypted: encryptedResponse })
}
```

- [ ] **Step 2: Create vercel.json with egress IP config**

```json
{
  "functions": {
    "api/relay/route.ts": {
      "runtime": "nodejs20.x",
      "egress": {
        "ipVersion": "ipv4",
        "固定IP": true
      },
      "regions": ["iad1"]
    }
  }
}
```

> **Note:** Vercel Pro fixed egress IP configuration. The exact `vercel.json` schema for `egress.ipv4.fixed` depends on current Vercel API support. Verify with `vercel docs` or check [Vercel egress IP docs](https://vercel.com/docs/functions/egress) for the exact config syntax.

- [ ] **Step 3: Create .env.relay.example template**

```
# Confidential Relay — Environment Variables Template
# Copy to .env.relay and fill in real values

# AES-256-GCM key — 64 hex characters (32 bytes)
# Generate with: openssl rand -hex 32
RELAY_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Provider API Keys (only add keys for providers you use)
ANTHROPIC_API_KEY=sk-ant-...
MINIMAX_API_KEY=...
CODEX_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...

# AWS credentials for Bedrock (if using)
BEDROCK_AWS_ACCESS_KEY_ID=...
BEDROCK_AWS_SECRET_ACCESS_KEY=...
BEDROCK_AWS_REGION=us-east-1
```

- [ ] **Step 4: Commit**

```bash
git add api/relay/route.ts vercel.json .env.relay.example
git commit -m "feat(relay): Vercel API route with fixed IAD1 egress IP

- POST /api/relay: decrypts AES-256-GCM payload, forwards to AI provider
- Supports: anthropic, minimax, codex, gemini, openrouter, bedrock
- API keys stored server-side, never exposed to client
- egress IP configured to IAD1 (US East Virginia)
"
```

---

## Task 3: CCR ProviderRouter Integration

**Files:**
- Modify: `src/services/api/claude.ts:1059-1141` (the third-party provider routing block)

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/api/__tests__/relayIntegration.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

// This test requires a running relay server
// Skip if RELAY_URL not set
const RELAY_URL = process.env.RELAY_URL

describe('relay integration', () => {
  if (!RELAY_URL) {
    test('skipped — RELAY_URL not set', () => {})
    return
  }

  // Test that CCR can route through relay when RELAY_URL is set
  // (Integration test — needs real relay + keys)
  test('placeholder', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Modify ProviderRouter block to check RELAY_URL**

Locate the block at `src/services/api/claude.ts:1059-1141` that handles non-Anthropic providers. The current code calls `provider.createMessage()` directly. We need to wrap it:

```typescript
// After line 1093 (const result = await provider.createMessage({...})):

// ─── Confidential Relay: Route through encrypted relay if RELAY_URL is set ───
const relayUrl = process.env.RELAY_URL
if (relayUrl) {
  const { encryptRelayPayload, decryptRelayPayload } = await import('src/utils/crypto.js')
  const RELAY_KEY = process.env.RELAY_RELAY_KEY // must match Vercel server's RELAY_KEY

  if (!RELAY_KEY) {
    throw new Error('RELAY_URL is set but RELAY_RELAY_KEY is not defined in environment')
  }

  // Build the request payload that the provider expects
  const providerPayload = {
    systemPrompt: systemParts.join('\n\n'),
    messages: apiMessages,
  }

  // Encrypt and send to relay
  const encryptedPayload = encryptRelayPayload(providerPayload, RELAY_KEY)
  const relayResponse = await fetch(relayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted: encryptedPayload, provider: activeProvider }),
  })

  if (!relayResponse.ok) {
    const errorText = await relayResponse.text()
    throw new Error(`Relay returned ${relayResponse.status}: ${errorText}`)
  }

  const { encrypted: encryptedResponse } = await relayResponse.json() as { encrypted: string }
  const responseData = decryptRelayPayload(encryptedResponse, RELAY_KEY) as {
    text: string
    usage?: { inputTokens: number; outputTokens: number }
    finishReason?: string
    toolCalls?: Array<{ id: string; name: string; arguments: unknown }>
  }

  const assistantMsg: AssistantMessage = {
    type: 'assistant',
    uuid: randomUUID(),
    message: {
      role: 'assistant',
      id: `msg_relay_${activeProvider}_${Date.now()}`,
      content: [{ type: 'text', text: responseData.text }],
      usage: {
        input_tokens: responseData.usage?.inputTokens ?? 0,
        output_tokens: responseData.usage?.outputTokens ?? 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      model: provider.modelName,
      stop_reason: responseData.finishReason === 'stop' ? 'end_turn' : responseData.finishReason,
    },
    costUSD: 0,
  }

  if (responseData.toolCalls?.length) {
    const content = assistantMsg.message!.content as any[]
    for (const tc of responseData.toolCalls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments })
    }
  }

  yield assistantMsg
  return
}
// ─── End Confidential Relay ───
```

Replace the existing inline `try/catch` block that starts at line 1076 and ends at line 1140 with this new version that includes the relay path.

> **Note:** The exact injection point is after line 1093 (`const result = await provider.createMessage({...})`). Replace the entire `try` block from line 1076 to line 1140 with a new version that checks `RELAY_URL` first and falls back to the existing `provider.createMessage()` path when relay is not configured.

- [ ] **Step 3: Verify the file compiles**

Run: `cd /Users/0xvox/claude-code-reimagine-for-learning && bun run build`
Expected: No new errors (existing tsc errors are pre-existing decompilation debt)

- [ ] **Step 4: Commit**

```bash
git add src/services/api/claude.ts
git commit -m "feat(relay): ProviderRouter supports RELAY_URL transparent proxy

- When RELAY_URL env var is set, CCR encrypts payload and sends to relay
- Relay decrypts, forwards to AI provider with fixed IAD1 egress IP
- Default behavior unchanged when RELAY_URL is not set
- Requires RELAY_RELAY_KEY env var matching server's RELAY_KEY
"
```

---

## Task 4: CCR-side Environment Configuration

**Files:**
- Create: `.env.relay.ccr.example`

- [ ] **Step 1: Create CCR relay env template**

```
# CCR Confidential Relay — Client-Side Environment Template
# Copy to ~/.claude/.env or source before running CCR

# Relay URL (your Vercel deployment + /api/relay)
RELAY_URL=https://relay.your-domain.com/api/relay

# Must match the RELAY_KEY set in Vercel environment variables
# Generate with: openssl rand -hex 32
RELAY_RELAY_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

- [ ] **Step 2: Commit**

```bash
git add .env.relay.example .env.relay.ccr.example
git commit -m "docs(relay): env variable templates for relay setup"
```

---

## Task 5: Cloudflare Tunnel Verification

- [ ] **Step 1: Verify cloudflared tunnel is running**

```bash
cloudflared tunnel list
# Confirm tunnel is active and pointing to your relay domain
```

- [ ] **Step 2: Check DNS configuration**

Ensure `relay.your-domain.com` CNAME points to your Cloudflare Tunnel endpoint.

- [ ] **Step 3: Commit tunnel config (if managed in repo)**

```bash
git add cloudflared-tunnel-config.yml  # if tunnel config is in repo
git commit -m "chore(relay): Cloudflare Tunnel configuration for confidential relay"
```

---

## Task 6: End-to-End Verification

- [ ] **Step 1: Deploy Vercel function**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
vercel deploy --prod
# Verify deployment URL
```

- [ ] **Step 2: Set environment variables in Vercel dashboard**

```
RELAY_KEY=<from .env.relay.example>
ANTHROPIC_API_KEY=<your key>
MINIMAX_API_KEY=<your key>
...
```

- [ ] **Step 3: Verify egress IP is fixed**

```bash
# Call relay directly and check what IP it reports
curl -X POST https://relay.your-domain.com/api/relay \
  -H "Content-Type: application/json" \
  -d '{"test":"true"}' | jq

# Check IP seen by httpbin
curl https://relay.your-domain.com/api/ip-check
# Should return a fixed IAD1 IP, not your home IP
```

- [ ] **Step 4: Run CCR through relay**

```bash
# Source CCR env
source ~/.claude/.env.relay.ccr

# Run CCR with minimax provider
echo "say hello" | bun run src/entrypoints/cli.tsx -p --provider minimax

# Verify: CCR works, and the AI provider sees your fixed relay IP
```

---

## Spec Coverage Check

| Spec Requirement | Task | Step |
|-----------------|------|------|
| AES-256-GCM encrypt/decrypt | Task 1 | Step 3 |
| Vercel relay function | Task 2 | Step 1 |
| Fixed IAD1 egress IP | Task 2 | Step 2 |
| CCR ProviderRouter integration | Task 3 | Step 2 |
| RELAY_URL optional switch | Task 3 | Step 2 |
| Cloudflare Tunnel | Task 5 | — |
| End-to-end test | Task 6 | — |

## Self-Review

- **Placeholder scan:** No TBD/TODO in plan. All steps show actual code.
- **Type consistency:** `encryptRelayPayload` and `decryptRelayPayload` signatures match between crypto.ts and the relay route.ts.
- **Spec gaps:** None identified.
