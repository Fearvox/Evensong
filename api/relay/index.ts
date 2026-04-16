import type { VercelRequest, VercelResponse } from '@vercel/node'
import { encryptRelayPayload, decryptRelayPayload } from './crypto.js'

// Environment variables (set in Vercel dashboard):
// RELAY_KEY=64-char-hex
// ANTHROPIC_API_KEY=sk-ant-...
// MINIMAX_API_KEY=...
// CODEX_API_KEY=...
// GEMINI_API_KEY=...
// VERTEX_API_KEY=...
// BEDROCK_AWS_ACCESS_KEY_ID=...
// BEDROCK_AWS_SECRET_ACCESS_KEY=...

const PROVIDER_ENDPOINTS: Record<string, {
  url: string
  authHeader: string
  envKey: string
  bodyFormat?: 'anthropic' | 'openai'
}> = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    authHeader: 'x-api-key',
    envKey: 'ANTHROPIC_API_KEY',
    bodyFormat: 'anthropic',
  },
  minimax: {
    url: 'https://api.minimaxi.chat/v1/chat/completions',
    authHeader: 'authorization',
    envKey: 'MINIMAX_API_KEY',
    bodyFormat: 'openai',
  },
  codex: {
    url: 'https://api.openai.com/v1/chat/completions',
    authHeader: 'authorization',
    envKey: 'CODEX_API_KEY',
    bodyFormat: 'openai',
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    authHeader: 'authorization',
    envKey: 'GEMINI_API_KEY',
    bodyFormat: 'openai',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    authHeader: 'authorization',
    envKey: 'OPENROUTER_API_KEY',
    bodyFormat: 'openai',
  },
  vertex: {
    url: 'https://vertexai.googleapis.com/v1beta1/publishers/google/models',
    authHeader: 'authorization',
    envKey: 'VERTEX_API_KEY',
    bodyFormat: 'openai',
  },
  bedrock: {
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-sonnet-v1/max',
    authHeader: 'x-amz-authorization',
    envKey: 'BEDROCK_AWS_SECRET_ACCESS_KEY',
    bodyFormat: 'openai',
  },
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // DEBUG: check env state
  if (req.query['debug'] === 'env') {
    const k = process.env['RELAY_KEY'] ?? ''
    res.json({
      RELAY_KEY_len: k.length,
      RELAY_KEY_hex: k.match(/^[0-9a-f]{64}$/) ? 'VALID' : 'INVALID',
      RELAY_KEY_chars: [...k].slice(0,8).map(c=>c.charCodeAt(0)),
      hasMinimax: !!process.env['MINIMAX_API_KEY'],
    })
    return
  }

  // DEBUG: test decryption step-by-step (POST with body containing encrypted)
  if (req.query['debug'] === 'decrypt') {
    const { encrypted, relayKey: clientKey } = req.body as { encrypted?: string; relayKey?: string }
    const serverKey = process.env['RELAY_KEY'] ?? ''
    try {
      if (!encrypted) {
        res.json({ error: 'no encrypted field', body_keys: Object.keys(req.body ?? {}) })
        return
      }
      const parts = encrypted.split(':')
      res.json({
        debug: true,
        encrypted_len: encrypted.length,
        encrypted_preview: encrypted.slice(0, 40) + '...',
        parts_count: parts.length,
        parts_preview: parts.map(p => p.slice(0, 20)),
        server_key_len: serverKey.length,
        server_key_valid: /^[0-9a-f]{64}$/.test(serverKey) ? 'VALID' : 'INVALID',
        client_key_len: (clientKey ?? '').length,
        client_key_valid: clientKey ? /^[0-9a-f]{64}$/.test(clientKey) ? 'VALID' : 'INVALID' : 'NOT_PROVIDED',
        key_match: serverKey === (clientKey ?? ''),
      })
    } catch(e: any) {
      res.json({ error: e.message })
    }
    return
  }

  // DEBUG: full decrypt test (POST with body containing encrypted + relayKey)
  if (req.query['debug'] === 'full-decrypt') {
    const { encrypted, relayKey: clientKey } = req.body as { encrypted?: string; relayKey?: string }
    const serverKey = process.env['RELAY_KEY'] ?? ''
    try {
      const { decryptRelayPayload } = await import('./crypto.js')
      const result = decryptRelayPayload(encrypted!, clientKey ?? serverKey)
      res.json({ ok: true, payload: result })
    } catch(e: any) {
      res.json({
        error: e.message,
        stack: e.stack?.split('\n').slice(0, 3),
        server_key_len: serverKey.length,
        encrypted_len: encrypted?.length,
      })
    }
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { encrypted, provider, model } = req.body as {
    encrypted?: string
    provider?: string
    model?: string
  }

  // Mode 1: Encrypted payload (existing protocol)
  if (encrypted && provider) {
    const relayKey = process.env.RELAY_KEY
    if (!relayKey) {
      res.status(500).json({ error: 'RELAY_KEY not configured' })
      return
    }
    let originalPayload: object
    try {
      originalPayload = decryptRelayPayload(encrypted, relayKey)
    } catch {
      res.status(400).json({ error: 'Decryption failed' })
      return
    }
    const providerConfig = PROVIDER_ENDPOINTS[provider]
    if (!providerConfig) {
      res.status(400).json({ error: `Unknown provider: ${provider}` })
      return
    }
    const apiKey = process.env[providerConfig.envKey]
    if (!apiKey) {
      res.status(500).json({ error: `API key for ${provider} not configured` })
      return
    }
    await forwardToProvider(res, providerConfig, apiKey, originalPayload, true)
    return
  }

  // Mode 2: Plain JSON with model field (CCR SDK direct path)
  if (model) {
    // Infer provider from model name
    const inferredProvider = inferProviderFromModel(model)
    if (!inferredProvider) {
      res.status(400).json({ error: `Cannot infer provider for model: ${model}` })
      return
    }
    const providerConfig = PROVIDER_ENDPOINTS[inferredProvider]
    if (!providerConfig) {
      res.status(400).json({ error: `Unknown provider: ${inferredProvider}` })
      return
    }
    const apiKey = process.env[providerConfig.envKey]
    if (!apiKey) {
      res.status(500).json({ error: `API key for ${inferredProvider} not configured` })
      return
    }
    // Forward the full body as payload
    await forwardToProvider(res, providerConfig, apiKey, req.body, false)
    return
  }

  res.status(400).json({ error: 'Missing encrypted/provider or model field' })
}

/** Infer provider from model name */
function inferProviderFromModel(model: string): string | null {
  const m = model.toLowerCase()
  if (m.includes('minimax')) return 'minimax'
  if (m.includes('grok') || m.includes('xai')) return 'xai'
  if (m.includes('claude') || m.includes('anthropic')) return 'anthropic'
  if (m.includes('gpt') || m.includes('openai')) return 'codex'
  if (m.includes('gemini') || m.includes('google')) return 'gemini'
  if (m.includes('deepseek')) return 'openrouter'
  if (m.includes('openrouter')) return 'openrouter'
  // fallback: check if it's an OpenRouter model path
  if (m.includes('/')) return 'openrouter'
  return null
}

async function forwardToProvider(
  res: VercelResponse,
  providerConfig: (typeof PROVIDER_ENDPOINTS)['minimax'],
  apiKey: string,
  payload: object,
  encryptResponse: boolean,
): Promise<void> {
  let providerResponse: Response
  try {
    providerResponse = await fetch(providerConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [providerConfig.authHeader]: providerConfig.authHeader === 'authorization' ? `Bearer ${apiKey}` : apiKey,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    res.status(502).json({ error: `Upstream fetch failed: ${err}` })
    return
  }

  const responseData = await providerResponse.json().catch(() => ({
    error: `Non-JSON response: ${providerResponse.status}`,
  }))

  if (encryptResponse) {
    const relayKey = process.env.RELAY_KEY ?? ''
    try {
      const encryptedResponse = encryptRelayPayload(responseData, relayKey)
      res.status(200).json({ encrypted: encryptedResponse })
    } catch {
      res.status(500).json({ error: 'Response encryption failed' })
    }
  } else {
    // Plain JSON mode: return response directly (CCR SDK expects direct JSON)
    res.status(200).json(responseData)
  }
}
