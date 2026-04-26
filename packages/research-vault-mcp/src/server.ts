// Research Vault MCP Server — stdio by default, SSE when explicitly requested
// MCP stdio: JSON-RPC 2.0 over stdin/stdout for command-launched MCP clients.
// MCP SSE: JSON-RPC 2.0 over SSE (server→client) + HTTP POST (client→server).
//
// Flow:
//   1. Client connects GET /sse
//   2. Server sends: event: endpoint\ndata: /messages?sessionId=<uuid>
//   3. Client POSTs JSON-RPC to /messages?sessionId=<uuid>
//   4. Server sends JSON-RPC response via SSE: event: message\ndata: {...}

import { vaultTools } from './vault'
import { vaultWriteTools } from './vault_write.js'
import { amplifyTools, configureAmplify } from './amplify'

const HOST = '0.0.0.0'
const TRANSPORT = process.env.MCP_TRANSPORT ?? 'stdio'
const PORT = parseInt(process.env.MCP_PORT ?? '8765')

// ─── MCP Protocol Types ──────────────────────────────────────────────────────

interface MCPRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: any
}

interface MCPResponse {
  jsonrpc: '2.0'
  id?: string | number
  result?: any
  error?: { code: number; message: string; data?: any }
}

interface Tool {
  name: string
  description: string
  inputSchema: any
  call: (params: any) => Promise<{ content: Array<{type: string; text: string}>; isError?: boolean }>
}

// ─── State ───────────────────────────────────────────────────────────────────

const allTools: Tool[] = [
  ...vaultTools,
  ...vaultWriteTools,
  ...amplifyTools
]

const toolMap = new Map(allTools.map(t => [t.name, t]))

// Session management: sessionId → SSE writer
interface Session {
  send: (data: string) => void
  heartbeat: ReturnType<typeof setInterval>
}

const sessions = new Map<string, Session>()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResponse(id: string | number | undefined, result?: any, error?: any): MCPResponse {
  return { jsonrpc: '2.0', id, result, error }
}

function generateSessionId(): string {
  return crypto.randomUUID()
}

// ─── MCP Handlers ─────────────────────────────────────────────────────────────

async function handleRequest(req: MCPRequest): Promise<MCPResponse | null> {
  const { method, id, params } = req

  // ── notifications (no id = no response expected)
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null
  }

  // ── initialize
  if (method === 'initialize') {
    return makeResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: 'research-vault-mcp',
        version: '1.0.0'
      }
    })
  }

  // ── tools/list
  if (method === 'tools/list') {
    return makeResponse(id, {
      tools: allTools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }))
    })
  }

  // ── tools/call
  if (method === 'tools/call') {
    const { name, arguments: args } = params
    console.error('[DEBUG] tools/call:', name, JSON.stringify(args))
    const tool = toolMap.get(name)
    if (!tool) {
      return makeResponse(id, undefined, { code: -32602, message: `Unknown tool: ${name}` })
    }
    try {
      const result = await tool.call(args || {})
      return makeResponse(id, { content: result.content, isError: result.isError })
    } catch (e: any) {
      return makeResponse(id, undefined, { code: -32603, message: `Tool error: ${e.message}` })
    }
  }

  // ── ping
  if (method === 'ping') {
    return makeResponse(id, {})
  }

  return makeResponse(id, undefined, { code: -32601, message: `Method not found: ${method}` })
}

// ─── STDIO Transport ──────────────────────────────────────────────────────────
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
      send({ jsonrpc: '2.0', error: { code: -32700, message: `Parse error: ${e instanceof Error ? e.message : String(e)}` } })
    }
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

let server: ReturnType<typeof Bun.serve> | undefined

if (TRANSPORT !== 'stdio') {
  server = Bun.serve({
  port: PORT,
  hostname: HOST,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // ── GET /sse — MCP SSE Transport: establish SSE stream + send endpoint
    if (url.pathname === '/sse' && req.method === 'GET') {
      const sessionId = generateSessionId()

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()

          const send = (data: string) => {
            try { controller.enqueue(encoder.encode(data)) } catch {}
          }

          // Step 1: Send the endpoint event (MCP SSE spec requirement)
          send(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`)

          // Heartbeat every 15s
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: heartbeat\n\n`))
            } catch {
              clearInterval(heartbeat)
              sessions.delete(sessionId)
            }
          }, 15000)

          // Register session
          sessions.set(sessionId, { send, heartbeat })

          console.error(`[SSE] Session ${sessionId} connected`)

          req.signal.addEventListener('abort', () => {
            clearInterval(heartbeat)
            sessions.delete(sessionId)
            console.error(`[SSE] Session ${sessionId} disconnected`)
          })
        }
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      })
    }

    // ── POST /messages?sessionId=xxx — MCP SSE Transport: receive JSON-RPC, respond via SSE
    if (url.pathname === '/messages' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId')

      if (!sessionId || !sessions.has(sessionId)) {
        return Response.json(
          { error: 'Invalid or missing sessionId' },
          { status: 400 }
        )
      }

      const session = sessions.get(sessionId)!

      try {
        const body = await req.json() as MCPRequest

        const result = await handleRequest(body)

        // Send response via SSE stream (MCP SSE spec)
        if (result) {
          session.send(`event: message\ndata: ${JSON.stringify(result)}\n\n`)
        }

        // Return 202 Accepted (MCP SSE spec: POST returns 202, response goes via SSE)
        return new Response(null, { status: 202 })
      } catch (e: any) {
        return Response.json(
          { jsonrpc: '2.0', error: { code: -32700, message: `Parse error: ${e.message}` } },
          { status: 400 }
        )
      }
    }

    // ── GET /health
    if (url.pathname === '/health' && req.method === 'GET') {
      return Response.json({
        status: 'ok',
        tools: allTools.length,
        vault_tools: vaultTools.length,
        amplify_tools: amplifyTools.length,
        sse_sessions: sessions.size,
        uptime: process.uptime()
      })
    }

    // ── POST /configure — set Amplify API key
    if (url.pathname === '/configure' && req.method === 'POST') {
      try {
        const { apiKey } = await req.json() as { apiKey: string }
        if (!apiKey) throw new Error('apiKey required')
        configureAmplify(apiKey)
        return Response.json({ status: 'configured' })
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 400 })
      }
    }

    // ── 404
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  })
}

// ─── Startup ─────────────────────────────────────────────────────────────────

if (TRANSPORT === 'stdio') {
  console.error('[MCP] Running in stdio mode (stdin/stdout JSON-RPC)')
  await handleStdioTransport()
  process.exit(0)
} else {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   Research Vault MCP Server — MCP SSE Transport     ║
╠══════════════════════════════════════════════════════╣
║  SSE:       http://${HOST}:${PORT}/sse                ║
║  Messages:  http://${HOST}:${PORT}/messages          ║
║  Health:    http://${HOST}:${PORT}/health            ║
╠══════════════════════════════════════════════════════╣
║  Tools:     ${String(allTools.length).padEnd(3)} (${vaultTools.length} vault, ${amplifyTools.length} amplify)     ║
╚══════════════════════════════════════════════════════╝
`)
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('\nShutting down...')
  for (const [id, session] of sessions) {
    clearInterval(session.heartbeat)
  }
  sessions.clear()
  server?.stop()
  process.exit(0)
})
