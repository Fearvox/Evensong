# @syndash/research-vault-mcp

MCP (Model Context Protocol) server for [Nolan's research vault](https://github.com/Fearvox/dash-research-vault) — semantic search + memory persistence over 200+ markdown documents via local Gemma (Atomic Chat) or cloud LLM fallback.

**Part of**: DASH SHATTER / SynDASH ecosystem.
**Home**: [github.com/Fearvox/Evensong](https://github.com/Fearvox/Evensong) — `packages/research-vault-mcp/`
**Status**: Wave 3+ — not yet published to npm. Plan: `docs/superpowers/plans/2026-04-19-wave2d-submodule-mcp-package-prep.md`.

## Install & Run (future, post-publish)

```bash
# Via bun (recommended — native TS execution)
bunx @syndash/research-vault-mcp

# Via Node
npx @syndash/research-vault-mcp
```

## Configure Claude Code / Claude Desktop

Add to `~/.claude/settings.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "research-vault": {
      "command": "bunx",
      "args": ["@syndash/research-vault-mcp"]
    }
  }
}
```

For direct local dev from this monorepo:

```json
{
  "mcpServers": {
    "research-vault-dev": {
      "command": "bun",
      "args": ["run", "packages/research-vault-mcp/src/server.ts"]
    }
  }
}
```

## Tools Exposed (MCP contract)

See `src/vault.ts` and `src/amplify.ts` for current tool definitions:

- `vault_search` — hybrid search over analyzed knowledge base
- `vault_status` — decay scores + retention health
- `vault_taxonomy` — category tree + item counts
- `vault_batch_analyze` — raw queue status + preview
- `amplify_*` — remote RAG query layer (currently requires Amplify API key — see `docs.evermind.ai`; Wave 3+ will add local Gemma fallback path via `@syndash/research-vault-mcp`'s built-in retrieval chain)

## Architecture

Per parent spec [2026-04-19 vault foundation & preamble design](https://github.com/Fearvox/Evensong/blob/main/docs/superpowers/specs/2026-04-19-vault-foundation-and-preamble-design.md) §3.4, retrieval uses a **unified multi-signal ranker** (not 3 separate subsystems):

```
score(d, q, t) = 0.35·BM25(q,d) + 0.35·cosine(embed(q), embed(d))
               + 0.15·exp(-(t - lastAccess)/stability)
               + 0.10·log1p(accessCount)/log1p(MAX_ACCESS)
               + 0.05·summary_level_weight(d)
```

**Primary LLM**: Atomic Chat local Gemma-4-E4B-Uncensored-Q4_K_M (`http://127.0.0.1:1337/v1`).
**Fallback chain**: xai-fast → minimax-m27 → openrouter/qwen3.6-plus → openrouter/llama-3.1-8b-free.

**Prior art**: EverMemOS (arxiv 2601.02163, EverMind/Shanda, 2026-01) — LLM-orchestrated hybrid retrieval. This package adopts their Stage-1 hybrid candidate generation but replaces Stage-2 verifier-loop with direct listwise LLM judge (simpler + more deterministic).

## License

`UNLICENSED` for now (pending org-level license decision). See parent repo LICENSE.
