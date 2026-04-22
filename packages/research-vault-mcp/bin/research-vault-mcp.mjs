#!/usr/bin/env node
/**
 * CLI entry point for @syndash/research-vault-mcp.
 * Invoked via `npx @syndash/research-vault-mcp` or `bunx @syndash/research-vault-mcp`.
 * Delegates to src/server.ts (compiled or via bun direct).
 *
 * Part of DASH SHATTER (Fearvox/Evensong repo, SynDASH org).
 * See packages/research-vault-mcp/README.md for MCP client config.
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgRoot = join(__dirname, '..')

// Prefer compiled JS if available (post-build); fall back to bun direct execution of TS source.
const compiledServer = join(pkgRoot, 'dist', 'server.js')
const sourceServer = join(pkgRoot, 'src', 'server.ts')

async function main() {
  const args = process.argv.slice(2)
  let transport = 'sse'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--transport' && args[i + 1]) {
      transport = args[i + 1]
    } else if (args[i].startsWith('--transport=')) {
      transport = args[i].split('=')[1]
    }
  }
  process.env.MCP_TRANSPORT = transport

  if (existsSync(compiledServer)) {
    await import(compiledServer)
  } else if (existsSync(sourceServer)) {
    await import(sourceServer)
  } else {
    console.error('research-vault-mcp: neither dist/server.js nor src/server.ts found')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('research-vault-mcp fatal:', err)
  process.exit(1)
})
