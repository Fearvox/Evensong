# Changelog

## Unreleased

### Added

- HTTP transport now supports Streamable HTTP at `POST /mcp`, while keeping the legacy `/sse` + `/messages` endpoints.
- Added a Streamable HTTP regression test that initializes a session and lists MCP tools through `/mcp`.

## 1.1.2 — 2026-04-26

### Changed

- Default MCP transport is now `stdio`, matching command-launched MCP clients.
- The npm bin is a Node-compatible launcher that delegates server execution to Bun.
- Published package includes `dist/server.js` via `prepack` build and `files` allowlist.
- README now documents Evensong hub vs Research Vault module, install commands, Claude config, Bun runtime requirement, and explicit SSE mode.
- Package metadata now uses Evensong module wording and Apache-2.0 package license.

### Verified

- `bun --filter @syndash/research-vault-mcp test`
- `bun --filter @syndash/research-vault-mcp build`
- `npm pack --dry-run --json`
- stdio smoke returning 13 MCP tools
