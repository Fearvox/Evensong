# @syndash/research-vault-mcp

Research Vault is the memory/search module inside **Evensong**. This package exposes it as an MCP server for agents that speak the Model Context Protocol.

It is not the whole Evensong product. Evensong is the hub: runtime, benchmark evidence, handoff pages, and modules. Research Vault MCP is the installable knowledge-base module.

## Install

```bash
# MCP clients usually launch the package for you.
# The npm shim still delegates runtime execution to Bun.
npx @syndash/research-vault-mcp --transport=stdio

# Bun direct launch:
bunx @syndash/research-vault-mcp --transport=stdio
```

Default transport is `stdio`, because command-launched MCP servers are expected to speak JSON-RPC over stdin/stdout. Install [Bun](https://bun.sh) before using either `npx` or `bunx`; the server itself is Bun-native.

**Runtime note:** `@syndash/research-vault-mcp` is Bun-native. `npx` is supported as an install/launch shim, but the target machine must have `bun` available on `PATH`. If you need a pure Node runtime, treat that as a separate compatibility track rather than assuming this package already provides it.

Use SSE only when you explicitly want a long-running HTTP server:

```bash
MCP_PORT=8765 npx @syndash/research-vault-mcp --transport=sse
# health: http://127.0.0.1:8765/health
# sse:    http://127.0.0.1:8765/sse
```

## Configure an MCP client

Claude Desktop / Claude Code style config:

```json
{
  "mcpServers": {
    "research_vault": {
      "command": "npx",
      "args": ["-y", "@syndash/research-vault-mcp", "--transport=stdio"]
    }
  }
}
```

Bun variant:

```json
{
  "mcpServers": {
    "research_vault": {
      "command": "bunx",
      "args": ["--bun", "@syndash/research-vault-mcp", "--transport=stdio"]
    }
  }
}
```

Local monorepo development:

```json
{
  "mcpServers": {
    "research_vault_dev": {
      "command": "bun",
      "args": ["run", "packages/research-vault-mcp/src/server.ts", "--transport=stdio"]
    }
  }
}
```

## Configure the vault root

Set the vault location with an environment variable before launching your MCP client:

```bash
export VAULT_ROOT=/path/to/research-vault
```

The package is designed for markdown-based knowledge bases. Keep private vault contents outside the public Evensong repo.

## Tools exposed

Current MCP contract:

- `vault_search` — search analyzed knowledge-base entries
- `vault_status` — registry, retention, and decay health
- `vault_taxonomy` — category tree and item counts
- `vault_batch_analyze` — raw queue status and preview
- `vault_note_save` — persist a markdown note into the vault
- `vault_get` — retrieve a saved vault item by id
- `vault_delete` — delete a saved vault item
- `vault_raw_ingest` — queue a raw URL/text ingest job
- `amplify_*` — optional remote RAG query layer when Amplify credentials are configured

## Package mechanics

Published packages include:

- `bin/research-vault-mcp.mjs`
- `dist/server.js`
- `src/**/*.ts` for source inspection
- `README.md`
- `package.json`

The bin prefers `dist/server.js`. In a monorepo checkout without `dist`, it falls back to `bun run src/server.ts` so development remains fast without a separate compile step.

## Architecture

Research Vault MCP uses a multi-signal ranker for candidate retrieval:

```text
score(d, q, t) = lexical(q,d)
               + semantic(embed(q), embed(d))
               + recency/stability(d,t)
               + access frequency(d)
               + summary-level weight(d)
```

The Evensong benchmark evidence for hybrid retrieval and Dense RAR lives in the parent repo under `benchmarks/`.

## Node compatibility status

The package is intentionally Bun-native today because the server uses Bun APIs and the parent Evensong repo is Bun-only. The npm bin is Node-compatible only as a launcher: it locates `dist/server.js` or `src/server.ts`, then delegates execution to `bun`. This keeps package installation convenient while avoiding a misleading claim that the MCP server itself runs under plain Node.js.

## License

Apache-2.0 for package code. Research artifacts in the parent repo may use separate licenses; check the repository root license files.
