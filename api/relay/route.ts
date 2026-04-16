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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { encrypted, provider } = req.body as { encrypted?: string; provider?: string }

  if (!encrypted || !provider) {
    res.status(400).json({ error: 'Missing encrypted or provider' })
    return
  }

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

  // Forward to AI provider
  let providerResponse: Response
  try {
    providerResponse = await fetch(providerConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [providerConfig.authHeader]: providerConfig.authHeader === 'authorization' ? `Bearer ${apiKey}` : apiKey,
      },
      body: JSON.stringify(originalPayload),
    })
  } catch (err) {
    res.status(502).json({ error: `Upstream fetch failed: ${err}` })
    return
  }

  const responseData = await providerResponse.json().catch(() => ({
    error: `Non-JSON response: ${providerResponse.status}`,
  }))

  // Encrypt response back to client
  let encryptedResponse: string
  try {
    encryptedResponse = encryptRelayPayload(responseData, relayKey)
  } catch {
    res.status(500).json({ error: 'Response encryption failed' })
    return
  }

  res.status(200).json({ encrypted: encryptedResponse })
}
