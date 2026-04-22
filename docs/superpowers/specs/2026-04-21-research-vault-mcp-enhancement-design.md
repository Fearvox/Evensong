# research-vault-mcp Enhancement Design

**Date:** 2026-04-21
**Status:** Draft — pending user review
**Stack:** Bun, MCP SSE/stdio, TypeScript

---

## 1. Overview

Enhance `packages/research-vault-mcp` with three capability tiers:
1. **Vault read/write tools** — `vault_raw_ingest`, `vault_note_save`, `vault_get`, `vault_delete`
2. **amplify_chat dual-mode streaming** — `stream: true` yields incremental chunks via MCP SDK `onProgress`
3. **Transport abstraction (Plan C)** — stdio child process primary, Tailscale SSE fallback

---

## 2. Architecture

```
CCR (cli.tsx)
  ├─ MCP client (transport: auto-detect)
  │   ├─ stdio: Bun.spawn research-vault-mcp, stdin/stdout
  │   └─ fallback: Tailscale SSE http://100.127.140.74:8765/sse
  └─ research-vault-mcp (Bun)
      ├─ vault tools (8 total)
      │   ├─ vault_search      [existing]
      │   ├─ vault_status      [existing]
      │   ├─ vault_batch_analyze [existing]
      │   ├─ vault_taxonomy    [existing]
      │   ├─ vault_raw_ingest  [NEW]
      │   ├─ vault_note_save   [NEW]
      │   ├─ vault_get         [NEW]
      │   └─ vault_delete      [NEW]
      └─ amplify tools (5 total)
          ├─ amplify_list_models    [existing]
          ├─ amplify_chat           [ENHANCED: dual-mode streaming]
          ├─ amplify_files_query     [existing]
          ├─ amplify_files_list     [existing]
          └─ amplify_assistants_list [existing]
```

### Transport Strategy (Plan C)

```typescript
// MCP_TRANSPORT env: "stdio" | "tailscale" | "auto" (default "auto")
// Auto-detection order:
//   1. If MCP_TRANSPORT=stdio, use child process
//   2. If MCP_TRANSPORT=tailscale, use Tailscale SSE
//   3. Auto: try stdio first; if spawn fails or MCP_TRANSPORT=auto&stdio exits, fall back to Tailscale
```

**stdio mode:**
- CCR spawns: `bun run /path/to/packages/research-vault-mcp/src/server.ts`
- Communicates via MCP stdio (JSON-RPC over stdin/stdout)
- Logs go to CCR stderr (easy debugging)

**Tailscale mode (fallback):**
- `GET http://100.127.140.74:8765/sse` → SSE stream
- `POST http://100.127.140.74:8765/messages?sessionId=<uuid>` → JSON-RPC

---

## 3. New Vault Tools

### 3.1 `vault_raw_ingest`

**Purpose:** Fire-and-forget raw content ingestion with async parse job.

**Input:**
```typescript
{
  source: "url" | "file" | "arxiv",
  value: string,                    // URL / absolute file path / ArXiv ID or URL
  category?: string,                 // subdirectory under raw/, default "inbox" → raw/inbox/
  priority?: "high" | "low",        // default "low"
  arxivMetadata?: boolean            // ArXiv only: prefetch metadata before storing, default true
}
```

**Output:**
```typescript
{
  jobId: string,                   // UUID — poll vault_raw_status for progress
  status: "queued" | "fetching" | "parsing",
  rawPath: string | null,           // absolute path (null if fetch still in progress)
  metadata: {
    title: string | null,
    authors: string[] | null,
    abstract: string | null,
    arxivId: string | null
  } | null
}
```

**Flow:**
```
1. Validate source / value
2. category defaults to "inbox" → raw path = RAW_DIR/<category>/
3. If source === "arxiv":
   a. Parse ID from value (handle https://arxiv.org/abs/XXXXX, abs/XXXXX, XXXXX forms)
   b. Call ArXiv API: GET https://export.arxiv.org/api/query?id_list=<id>
   c. Extract title/authors/abstract/categories
   d. Store metadata to raw/<category>/arxiv-<id>.meta.json
4. Write raw file to raw/<category>/<timestamp>--<normalized-name>
5. Create job record in .meta/ingest-jobs.json
6. Queue async parse job (non-blocking)
7. Return jobId immediately
```

**Async parse job (background):**
- PDF: `markitdown` or `pandoc --to markdown` → markdown
- HTML: `bun process` (no external dep) or fetch + sanitize
- ArXiv: metadata already fetched; parse PDF if not already markdown
- Output written to `knowledge/<category>/<id>.md`
- Job status written to `.meta/ingest-jobs.json`

### 3.2 `vault_note_save`

**Purpose:** Write a structured note to the knowledge layer.

**Input:**
```typescript
{
  title: string,
  content: string,          // markdown
  category: string,         // knowledge/ subdirectory path
  tags?: string[],
  summaryLevel?: "deep" | "shallow" | "none"
}
```

**Output:**
```typescript
{
  id: string,               // normalized ID
  path: string,             // absolute path
  writtenAt: string         // ISO timestamp
}
```

**Flow:**
```
1. Generate ID from title + timestamp
2. Validate category path (realpath must stay within KNOWLEDGE_DIR)
3. Write content to KNOWLEDGE_DIR/<category>/<id>.md
4. Update .meta/decay-scores.json entry
5. Return id + path
```

### 3.3 `vault_get`

**Purpose:** Read full content of a vault entry.

**Input:** `{ id: string }` or `{ path: string }`

**Output:**
```typescript
{
  id: string,
  title: string,
  category: string,
  content: string,         // full markdown
  modified: string,         // ISO
  size: number
}
```

### 3.4 `vault_delete`

**Purpose:** Delete a vault entry (raw or knowledge).

**Input:** `{ id: string }` or `{ path: string }`

**Output:**
```typescript
{ deleted: true, path: string }
```

**Flow:**
```
1. Resolve id → path or validate path
2. realpath check — must be within VAULT_ROOT
3. Delete file + corresponding .meta/decay-scores.json entry
4. Return path
```

---

## 4. amplify_chat Dual-Mode Streaming

**Changes to input schema:** Add optional `stream?: boolean` (default `false`).

**`stream: false` (default):** Behavior unchanged — accumulate full response, return `content[0].text`.

**`stream: true`:** Use MCP SDK `onProgress` callback to yield chunks incrementally.

```typescript
// In amplify_chat server-side handler:
call: async ({ message, stream = false, ... }) => {
  // ... SSE reader as before ...
  if (stream) {
    // Yield partial chunks via onProgress (passed by MCP SDK)
    for (const chunk of parseSSEChunk(chunk)) {
      yield { type: "progress", chunk }  // MCP SDK translates to onProgress callback
    }
  }
}
```

CCR side: `StreamingToolExecutor` already handles `type: 'mcp_progress'` messages with `status: 'progress' | 'completed' | 'failed'` — no CCR changes needed.

---

## 5. Multi-User Write Safety

| Concern | Mitigation |
|---------|------------|
| Path traversal | `realpath(value)` must equal or be under `VAULT_ROOT` |
| Write-write conflict | Last-write-wins (timestamp to ms precision) |
| Content corruption | SHA-256 of written file → `.meta/checksums.json` (format: `Record<relativePath, {sha256: string, writtenAt: string}>`) |
| Checksum verification | On read, recompute hash; warn if mismatch |

No auth layer in v1 scope (MVP scaffold only).

---

## 6. File Structure

```
packages/research-vault-mcp/
  src/
    server.ts          # [ENHANCED] transport abstraction + MCP handlers
    vault.ts           # [ENHANCED] vault tools (search/status/batch_analyze/taxonomy)
    vault_write.ts     # [NEW] vault_raw_ingest / vault_note_save / vault_get / vault_delete
    vault_jobs.ts      # [NEW] async job queue + ingest-jobs.json management
    amplify.ts         # [ENHANCED] amplify_chat dual-mode
    ingest/
      arxiv.ts         # [NEW] ArXiv API fetch + metadata parse
      html.ts          # [NEW] HTML fetch + sanitize to markdown
      pdf.ts           # [NEW] markitdown/pandoc PDF→markdown wrapper
    types.ts           # [NEW] shared VaultEntry, IngestJob, DecayScore types
  bin/
    research-vault-mcp.mjs  # [ENHANCED] transport CLI flag: --transport stdio|tailscale
  package.json         # [UPDATED] version bump to 1.1.0
```

---

## 7. Testing Strategy

- `bun test` unit tests for each new tool function
- Smoke test: `vault_raw_ingest` + `vault_note_save` + `vault_get` + `vault_delete` round-trip
- ArXiv mock: intercept network calls with `bun test` mock
- Transport test: stdio spawn → JSON-RPC round-trip via node test
- Amplify streaming test: mock SSE response, verify `onProgress` call count

---

## 8. Out of Scope (v1)

- Auth key / multi-user authentication
- MCP resource subscriptions
- Webhook callbacks on job completion
- CCR-side content-type detection auto-routing (future CCR layer)

---

## 9. Dependencies

| Dep | Purpose | Version |
|-----|---------|---------|
| `@anthropic-ai/sdk` | MCP protocol client | `^0.80.0` |
| `markitdown` | PDF → markdown | latest |
| `pandoc` | fallback PDF/HTML converter | system dep |
| `typescript` | type checking | `^6.0.2` |

No new runtime deps introduced.
