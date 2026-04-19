# Wave 2B — Local Gemma Provider + Vault Retrieval Chain

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Local Gemma (Atomic Chat at `http://127.0.0.1:1337/v1`) as a provider client module + a vault-retrieval module with Gemma-primary fallback chain per spec §3.4, **without modifying `src/services/api/withRetry.ts`** (its PR #7 chain serves main Anthropic-compat flow, not vault retrieval).

**Architecture:** Two new modules in new namespaces:
1. `src/services/api/localGemma.ts` — OpenAI-compat fetch-based client for Atomic local endpoint + health probe
2. `src/services/retrieval/vaultRetrieve.ts` — retrieval function using 4-level fallback: Gemma local → xai-fast → minimax-m27 → or-qwen-3.6-plus → or-llama-3.1-8b-free

Keeps `withRetry.ts` untouched. Reuses its error-classification patterns via a new error utility.

**Tech Stack:** TypeScript, Bun runtime + test runner, native `fetch`, existing `src/services/api/errorUtils.ts`.

**Parent spec:** `docs/superpowers/specs/2026-04-19-vault-foundation-and-preamble-design.md` §3.4 + §7 Wave 2
**Blast radius:** All new files under `src/services/api/localGemma.ts` + `src/services/retrieval/` (new dir). Zero existing file modifications.
**Risk:** touches src/ product code (deliberate; Wave 2 scope per spec).

---

## File Map

| File | Role | Change |
|---|---|---|
| `src/services/api/localGemma.ts` | **NEW** — fetch-based OpenAI-compat client + health probe | Create |
| `src/services/api/__tests__/localGemma.test.ts` | **NEW** — unit tests (mock globalThis.fetch) | Create |
| `src/services/retrieval/types.ts` | **NEW** — types for manifest + request/response | Create |
| `src/services/retrieval/vaultRetrieve.ts` | **NEW** — fallback chain orchestrator | Create |
| `src/services/retrieval/__tests__/vaultRetrieve.test.ts` | **NEW** — unit tests | Create |
| `src/services/retrieval/providers/localGemmaProvider.ts` | **NEW** — wraps Gemma client as VaultRetrievalProvider | Create |
| `src/services/retrieval/providers/__tests__/localGemmaProvider.test.ts` | **NEW** — unit tests | Create |

Zero existing file modifications. All new code isolated in new files / new dirs.

---

### Task 1: `createLocalGemmaClient()` factory — TDD

**Files:**
- Create: `src/services/api/__tests__/localGemma.test.ts`
- Create: `src/services/api/localGemma.ts`

- [ ] **Step 1: Write failing test for factory**

Create test file `src/services/api/__tests__/localGemma.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { createLocalGemmaClient, LOCAL_GEMMA_DEFAULT_BASE_URL, LOCAL_GEMMA_DEFAULT_MODEL } from '../localGemma.js'

describe('createLocalGemmaClient', () => {
  test('returns client with default baseURL http://127.0.0.1:1337/v1', () => {
    const client = createLocalGemmaClient()
    expect(client.baseURL).toBe(LOCAL_GEMMA_DEFAULT_BASE_URL)
    expect(LOCAL_GEMMA_DEFAULT_BASE_URL).toBe('http://127.0.0.1:1337/v1')
  })

  test('returns client with default model Gemma-4-E4B-Uncensored-Q4_K_M', () => {
    const client = createLocalGemmaClient()
    expect(client.model).toBe(LOCAL_GEMMA_DEFAULT_MODEL)
  })

  test('accepts baseURL override via options', () => {
    const client = createLocalGemmaClient({ baseURL: 'http://192.168.1.50:1337/v1' })
    expect(client.baseURL).toBe('http://192.168.1.50:1337/v1')
  })

  test('accepts model override via options', () => {
    const client = createLocalGemmaClient({ model: 'other-model.gguf' })
    expect(client.model).toBe('other-model.gguf')
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
bun test src/services/api/__tests__/localGemma.test.ts
```

Expected: FAIL — Cannot find module '../localGemma.js'.

- [ ] **Step 3: Implement factory**

Create `src/services/api/localGemma.ts`:

```ts
/**
 * Local Gemma client for Atomic Chat OpenAI-compat endpoint.
 * Primary LLM for vault retrieval per spec §3.4.
 * Default endpoint: http://127.0.0.1:1337/v1 (Atomic Chat local inference)
 * Default model: Gemma-4-E4B-Uncensored-Q4_K_M
 */

export const LOCAL_GEMMA_DEFAULT_BASE_URL = 'http://127.0.0.1:1337/v1'
export const LOCAL_GEMMA_DEFAULT_MODEL = 'Gemma-4-E4B-Uncensored-Q4_K_M'

export interface LocalGemmaClientOptions {
  baseURL?: string
  model?: string
  timeoutMs?: number
}

export interface LocalGemmaClient {
  baseURL: string
  model: string
  timeoutMs: number
}

export function createLocalGemmaClient(options: LocalGemmaClientOptions = {}): LocalGemmaClient {
  return {
    baseURL: options.baseURL ?? LOCAL_GEMMA_DEFAULT_BASE_URL,
    model: options.model ?? LOCAL_GEMMA_DEFAULT_MODEL,
    timeoutMs: options.timeoutMs ?? 30000,
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test src/services/api/__tests__/localGemma.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/api/localGemma.ts src/services/api/__tests__/localGemma.test.ts
git commit -m "feat(api): add createLocalGemmaClient factory for Atomic local endpoint"
```

---

### Task 2: `isLocalGemmaAvailable()` health probe — TDD

**Files:**
- Modify: `src/services/api/localGemma.ts` (add function)
- Modify: `src/services/api/__tests__/localGemma.test.ts` (add describe block)

- [ ] **Step 1: Write failing tests**

Append to test file — 4 scenarios: returns true on 200, false on connection throw, false on non-200, false on timeout. Use `globalThis.fetch` swap pattern in try/finally.

```ts
import { isLocalGemmaAvailable } from '../localGemma.js'

describe('isLocalGemmaAvailable', () => {
  test('returns true on 200 from /models', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = async () => new Response('{"data":[]}', { status: 200 })
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient())).toBe(true)
    } finally { globalThis.fetch = saved }
  })
  test('returns false on throw', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('ECONNREFUSED') }
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient())).toBe(false)
    } finally { globalThis.fetch = saved }
  })
  test('returns false on non-200', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = async () => new Response('', { status: 500 })
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient())).toBe(false)
    } finally { globalThis.fetch = saved }
  })
  test('returns false on timeout', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = async () => {
      await new Promise(r => setTimeout(r, 3000))
      return new Response('{}', { status: 200 })
    }
    try {
      expect(await isLocalGemmaAvailable(createLocalGemmaClient(), 100)).toBe(false)
    } finally { globalThis.fetch = saved }
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
bun test src/services/api/__tests__/localGemma.test.ts
```

Expected: FAIL — isLocalGemmaAvailable not exported.

- [ ] **Step 3: Implement health probe**

Append to `src/services/api/localGemma.ts`:

```ts
/**
 * Probe local Gemma endpoint health.
 * Short timeout (default 2s) so fallback kicks in fast when Atomic is not running.
 */
export async function isLocalGemmaAvailable(
  client: LocalGemmaClient,
  probeTimeoutMs = 2000,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), probeTimeoutMs)
  try {
    const response = await fetch(`${client.baseURL}/models`, {
      method: 'GET',
      signal: controller.signal,
    })
    return response.status === 200
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test src/services/api/__tests__/localGemma.test.ts
```

Expected: 8 tests PASS total.

- [ ] **Step 5: Commit**

```bash
git add src/services/api/localGemma.ts src/services/api/__tests__/localGemma.test.ts
git commit -m "feat(api): add isLocalGemmaAvailable health probe (2s timeout default)"
```

---

### Task 3: `chatCompletionLocalGemma()` + error class — TDD

**Files:**
- Modify: `src/services/api/localGemma.ts`
- Modify: `src/services/api/__tests__/localGemma.test.ts`

- [ ] **Step 1: Write failing tests**

Append 3 scenarios to test file: successful 200 returns parsed content, throws LocalGemmaConnectionError on fetch throw, throws on non-200.

```ts
import { chatCompletionLocalGemma, LocalGemmaConnectionError } from '../localGemma.js'

describe('chatCompletionLocalGemma', () => {
  test('returns content on 200', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'hello back' } }]
    }), { status: 200 })
    try {
      const r = await chatCompletionLocalGemma(createLocalGemmaClient(), {
        messages: [{ role: 'user', content: 'hi' }],
      })
      expect(r.content).toBe('hello back')
    } finally { globalThis.fetch = saved }
  })
  test('throws LocalGemmaConnectionError on fetch throw', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('fail') }
    try {
      await expect(
        chatCompletionLocalGemma(createLocalGemmaClient(), { messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toBeInstanceOf(LocalGemmaConnectionError)
    } finally { globalThis.fetch = saved }
  })
  test('throws LocalGemmaConnectionError on non-200', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = async () => new Response('err', { status: 503 })
    try {
      await expect(
        chatCompletionLocalGemma(createLocalGemmaClient(), { messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toBeInstanceOf(LocalGemmaConnectionError)
    } finally { globalThis.fetch = saved }
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
bun test src/services/api/__tests__/localGemma.test.ts
```

Expected: FAIL — symbols not exported.

- [ ] **Step 3: Implement**

Append to `src/services/api/localGemma.ts`:

```ts
export class LocalGemmaConnectionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'LocalGemmaConnectionError'
  }
}

export interface LocalGemmaChatRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
}

export interface LocalGemmaChatResponse {
  content: string
  raw: unknown
}

export async function chatCompletionLocalGemma(
  client: LocalGemmaClient,
  request: LocalGemmaChatRequest,
): Promise<LocalGemmaChatResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), client.timeoutMs)
  let response: Response
  try {
    response = await fetch(`${client.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: client.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 1024,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    throw new LocalGemmaConnectionError(
      `Local Gemma connection failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    )
  } finally {
    clearTimeout(timer)
  }

  if (response.status !== 200) {
    const body = await response.text().catch(() => '')
    throw new LocalGemmaConnectionError(
      `Local Gemma returned HTTP ${response.status}: ${body.slice(0, 200)}`,
    )
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content ?? ''
  return { content, raw: data }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test src/services/api/__tests__/localGemma.test.ts
```

Expected: 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/api/localGemma.ts src/services/api/__tests__/localGemma.test.ts
git commit -m "feat(api): chatCompletionLocalGemma request fn + LocalGemmaConnectionError"
```

---

### Task 4: Retrieval types

**Files:**
- Create: `src/services/retrieval/types.ts`

- [ ] **Step 1: Create types file**

Create `src/services/retrieval/types.ts`:

```ts
export interface VaultManifestEntry {
  path: string
  title: string
  retentionScore: number
  accessCount: number
  lastAccess: string
  summaryLevel: 'deep' | 'shallow' | 'none'
  excerpt?: string
}

export interface VaultRetrievalRequest {
  query: string
  manifest: VaultManifestEntry[]
  topK?: number
}

export interface VaultRetrievalResult {
  rankedPaths: string[]
  provider: string
  latencyMs: number
}

export interface VaultRetrievalProvider {
  name: string
  available: () => Promise<boolean>
  retrieve: (request: VaultRetrievalRequest) => Promise<VaultRetrievalResult>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/retrieval/types.ts
git commit -m "feat(retrieval): types for vault manifest + retrieval request/result"
```

---

### Task 5: `vaultRetrieve()` orchestrator — TDD

**Files:**
- Create: `src/services/retrieval/__tests__/vaultRetrieve.test.ts`
- Create: `src/services/retrieval/vaultRetrieve.ts`

- [ ] **Step 1: Write failing test for primary success path**

Create `src/services/retrieval/__tests__/vaultRetrieve.test.ts`:

```ts
import { describe, test, expect, mock } from 'bun:test'
import type { VaultManifestEntry } from '../types.js'
import { vaultRetrieve, AllProvidersFailedError } from '../vaultRetrieve.js'

const sample: VaultManifestEntry[] = [
  { path: 'knowledge/msa.md', title: 'MSA', retentionScore: 0.9, accessCount: 5, lastAccess: '2026-04-18', summaryLevel: 'deep' },
]

describe('vaultRetrieve', () => {
  test('uses primary when available', async () => {
    const retrieve = mock(async () => ({ rankedPaths: ['knowledge/msa.md'], provider: 'local-gemma', latencyMs: 300 }))
    const result = await vaultRetrieve(
      { query: 'msa', manifest: sample, topK: 1 },
      { providers: [{ name: 'local-gemma', available: async () => true, retrieve }] },
    )
    expect(result.provider).toBe('local-gemma')
    expect(retrieve).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
bun test src/services/retrieval/__tests__/vaultRetrieve.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement orchestrator**

Create `src/services/retrieval/vaultRetrieve.ts`:

```ts
import type { VaultRetrievalProvider, VaultRetrievalRequest, VaultRetrievalResult } from './types.js'

export interface VaultRetrieveOptions {
  providers: VaultRetrievalProvider[]
}

export class AllProvidersFailedError extends Error {
  constructor(public readonly attempts: Array<{ provider: string; error: string }>) {
    super(`All vault retrieval providers failed: ${attempts.map(a => `${a.provider}(${a.error})`).join(', ')}`)
    this.name = 'AllProvidersFailedError'
  }
}

export async function vaultRetrieve(
  request: VaultRetrievalRequest,
  options: VaultRetrieveOptions,
): Promise<VaultRetrievalResult> {
  const attempts: Array<{ provider: string; error: string }> = []
  for (const provider of options.providers) {
    let available: boolean
    try {
      available = await provider.available()
    } catch (err) {
      attempts.push({ provider: provider.name, error: `available() threw: ${err instanceof Error ? err.message : String(err)}` })
      continue
    }
    if (!available) {
      attempts.push({ provider: provider.name, error: 'available()=false' })
      continue
    }
    try {
      return await provider.retrieve(request)
    } catch (err) {
      attempts.push({ provider: provider.name, error: err instanceof Error ? err.message : String(err) })
      continue
    }
  }
  throw new AllProvidersFailedError(attempts)
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test src/services/retrieval/__tests__/vaultRetrieve.test.ts
```

Expected: 1 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/retrieval/vaultRetrieve.ts src/services/retrieval/__tests__/vaultRetrieve.test.ts
git commit -m "feat(retrieval): vaultRetrieve orchestrator + AllProvidersFailedError"
```

---

### Task 6: Fallback chain behavior tests

**Files:**
- Modify: `src/services/retrieval/__tests__/vaultRetrieve.test.ts`

- [ ] **Step 1: Append 3 fallback scenarios**

Append to test file:

```ts
describe('vaultRetrieve fallback', () => {
  test('skips unavailable provider to next', async () => {
    const a = mock(async () => ({ rankedPaths: [], provider: 'a', latencyMs: 0 }))
    const b = mock(async () => ({ rankedPaths: ['x.md'], provider: 'b', latencyMs: 100 }))
    const result = await vaultRetrieve({ query: 'q', manifest: sample }, {
      providers: [
        { name: 'a', available: async () => false, retrieve: a },
        { name: 'b', available: async () => true, retrieve: b },
      ],
    })
    expect(result.provider).toBe('b')
    expect(a).toHaveBeenCalledTimes(0)
    expect(b).toHaveBeenCalledTimes(1)
  })

  test('falls through 3 providers when first 2 throw', async () => {
    const a = mock(async () => { throw new Error('conn') })
    const b = mock(async () => { throw new Error('5xx') })
    const c = mock(async () => ({ rankedPaths: ['x.md'], provider: 'c', latencyMs: 200 }))
    const result = await vaultRetrieve({ query: 'q', manifest: sample }, {
      providers: [
        { name: 'a', available: async () => true, retrieve: a },
        { name: 'b', available: async () => true, retrieve: b },
        { name: 'c', available: async () => true, retrieve: c },
      ],
    })
    expect(result.provider).toBe('c')
  })

  test('throws AllProvidersFailedError when every provider fails', async () => {
    await expect(vaultRetrieve({ query: 'q', manifest: sample }, {
      providers: [
        { name: 'x', available: async () => false, retrieve: mock(async () => ({ rankedPaths: [], provider: 'x', latencyMs: 0 })) },
        { name: 'y', available: async () => true, retrieve: mock(async () => { throw new Error('boom') }) },
      ],
    })).rejects.toBeInstanceOf(AllProvidersFailedError)
  })
})
```

- [ ] **Step 2: Run tests (implementation already handles all paths)**

```bash
bun test src/services/retrieval/__tests__/vaultRetrieve.test.ts
```

Expected: 4 PASS (1 from Task 5 + 3 new).

- [ ] **Step 3: Commit**

```bash
git add src/services/retrieval/__tests__/vaultRetrieve.test.ts
git commit -m "test(retrieval): fallback chain — skip/throw/all-fail paths"
```

---

### Task 7: Wire LocalGemma as VaultRetrievalProvider — TDD

**Files:**
- Create: `src/services/retrieval/providers/localGemmaProvider.ts`
- Create: `src/services/retrieval/providers/__tests__/localGemmaProvider.test.ts`

- [ ] **Step 1: Write failing tests**

Create test file:

```ts
import { describe, test, expect } from 'bun:test'
import { createLocalGemmaProvider } from '../localGemmaProvider.js'
import { createLocalGemmaClient } from '../../../api/localGemma.js'

describe('createLocalGemmaProvider', () => {
  test('returns VaultRetrievalProvider shape', () => {
    const p = createLocalGemmaProvider(createLocalGemmaClient())
    expect(p.name).toBe('local-gemma')
  })
  test('parses JSON array from LLM output as rankedPaths', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (url: any) => {
      if (url.toString().endsWith('/models')) return new Response('{"data":[]}', { status: 200 })
      return new Response(JSON.stringify({
        choices: [{ message: { content: '["a.md","b.md"]' } }]
      }), { status: 200 })
    }) as any
    try {
      const p = createLocalGemmaProvider(createLocalGemmaClient())
      const r = await p.retrieve({
        query: 'q',
        manifest: [{ path: 'a.md', title: 'A', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' }],
      })
      expect(r.rankedPaths).toEqual(['a.md', 'b.md'])
    } finally { globalThis.fetch = saved }
  })
  test('heuristic parse extracts .md paths from prose output', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = (async (url: any) => {
      if (url.toString().endsWith('/models')) return new Response('{"data":[]}', { status: 200 })
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Most relevant: a.md and b.md.' } }]
      }), { status: 200 })
    }) as any
    try {
      const p = createLocalGemmaProvider(createLocalGemmaClient())
      const r = await p.retrieve({
        query: 'q',
        manifest: [
          { path: 'a.md', title: 'A', retentionScore: 0.9, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
          { path: 'b.md', title: 'B', retentionScore: 0.8, accessCount: 1, lastAccess: '2026-01-01', summaryLevel: 'deep' },
        ],
      })
      expect(r.rankedPaths).toContain('a.md')
      expect(r.rankedPaths).toContain('b.md')
    } finally { globalThis.fetch = saved }
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
bun test src/services/retrieval/providers/__tests__/localGemmaProvider.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement provider**

Create `src/services/retrieval/providers/localGemmaProvider.ts`:

```ts
import { chatCompletionLocalGemma, isLocalGemmaAvailable, type LocalGemmaClient } from '../../api/localGemma.js'
import type { VaultRetrievalProvider, VaultRetrievalRequest, VaultRetrievalResult } from '../types.js'

const SYSTEM_PROMPT = `You are a document retrieval judge. Given a query and a manifest of vault files (each with path, title, retention, access count, summary level), return a JSON array of the file paths most relevant to the query, ordered by relevance.

Rules:
- Output ONLY a valid JSON array of strings. No prose, no code fence.
- Return at most topK paths if provided, else up to 10.
- Use retention score + summary level as prior; use title and excerpt for relevance.
- Return [] if no files are relevant (do not fabricate).`

function buildUserPrompt(req: VaultRetrievalRequest): string {
  const topK = req.topK ?? 10
  const manifestJson = req.manifest.map(e => ({
    path: e.path,
    title: e.title,
    retention: e.retentionScore,
    accessCount: e.accessCount,
    lastAccess: e.lastAccess,
    summaryLevel: e.summaryLevel,
    excerpt: e.excerpt,
  }))
  return `Query: ${req.query}\n\ntopK: ${topK}\n\nManifest:\n${JSON.stringify(manifestJson, null, 2)}\n\nReturn JSON array of up to ${topK} relevant paths.`
}

function parseRankedPaths(content: string, manifest: VaultRetrievalRequest['manifest']): string[] {
  const trimmed = content.trim()
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) return parsed
  } catch {}
  const knownPaths = new Set(manifest.map(m => m.path))
  const found: string[] = []
  const regex = /[a-zA-Z0-9/_\-.]+\.md/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    if (knownPaths.has(match[0]) && !found.includes(match[0])) found.push(match[0])
  }
  return found
}

export function createLocalGemmaProvider(client: LocalGemmaClient): VaultRetrievalProvider {
  return {
    name: 'local-gemma',
    available: () => isLocalGemmaAvailable(client),
    retrieve: async (req: VaultRetrievalRequest): Promise<VaultRetrievalResult> => {
      const start = Date.now()
      const response = await chatCompletionLocalGemma(client, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(req) },
        ],
        temperature: 0.1,
        maxTokens: 1024,
      })
      const rankedPaths = parseRankedPaths(response.content, req.manifest)
      return { rankedPaths, provider: 'local-gemma', latencyMs: Date.now() - start }
    },
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test src/services/retrieval/providers/__tests__/localGemmaProvider.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/retrieval/providers/localGemmaProvider.ts src/services/retrieval/providers/__tests__/localGemmaProvider.test.ts
git commit -m "feat(retrieval): localGemmaProvider — LLM listwise judge with JSON/heuristic parse"
```

---

### Task 8: Full CCR regression + type check

**Files:** none

- [ ] **Step 1: Run all CCR tests**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
bun test 2>&1 | tail -5
```

Expected: baseline (pre-Wave-2B) test count + 18 new tests passing (Task 1: 4, Task 2: 4, Task 3: 3, Task 5: 1, Task 6: 3, Task 7: 3). Per Phase 12 PR #7, baseline was 1971 → now ~1989.

- [ ] **Step 2: Run type check filtered to new files**

```bash
bun run tsc --noEmit 2>&1 | grep -E "src/services/(api/localGemma|retrieval/)" | head -20
```

Expected: 0 errors. If any: fix inline (new files are our responsibility).

- [ ] **Step 3: Build**

```bash
bun run build 2>&1 | tail -5
```

Expected: single-file bundle builds clean.

---

### Task 9: Update STATE.md + final commit

**Files:**
- Modify: `.planning/STATE.md`

- [ ] **Step 1: Append Wave 2B entry**

Add to `.planning/STATE.md` under "Off-milestone Work (2026-04-19)":

```markdown
**Wave 2B — Local Gemma Provider + Vault Retrieval Chain**:
- 3 new src modules: api/localGemma.ts (159 LOC), retrieval/vaultRetrieve.ts (40 LOC), retrieval/providers/localGemmaProvider.ts (60 LOC)
- 3 new test files — 18 new tests, all pass
- Zero modifications to withRetry.ts (explicit design: main API fallback untouched)
- Spec §3.4 Wave 1 ship (Atomic Gemma primary) now actually wired for retrieval path
- Plan: docs/superpowers/plans/2026-04-19-wave2b-provider-fallback-chain.md
- Next (Wave 3+): add xAI/MiniMax/OR providers as fallback + manifest-building pipeline + integrate into retrieval entry point
```

- [ ] **Step 2: Commit**

```bash
git add .planning/STATE.md
git commit -m "docs(planning): Wave 2B — Local Gemma provider + retrieval chain shipped"
```

---

## Post-implementation Verification

```bash
# 1. All 7 new files exist
for f in \
  src/services/api/localGemma.ts \
  src/services/api/__tests__/localGemma.test.ts \
  src/services/retrieval/types.ts \
  src/services/retrieval/vaultRetrieve.ts \
  src/services/retrieval/__tests__/vaultRetrieve.test.ts \
  src/services/retrieval/providers/localGemmaProvider.ts \
  src/services/retrieval/providers/__tests__/localGemmaProvider.test.ts; do
  test -f "$f" && echo "✅ $f" || echo "❌ $f"
done

# 2. withRetry.ts unchanged (per our design)
git log --all --oneline -- src/services/api/withRetry.ts | head -3
# Expected: last commit before Wave 2B

# 3. New tests pass
bun test src/services/api/__tests__/localGemma.test.ts \
         src/services/retrieval/__tests__/vaultRetrieve.test.ts \
         src/services/retrieval/providers/__tests__/localGemmaProvider.test.ts 2>&1 | tail -5
# Expected: 18 pass / 0 fail

# 4. Full regression holds
bun test 2>&1 | tail -3
# Expected: ~1989 pass / 0 fail

# 5. Build clean
bun run build 2>&1 | tail -3

# 6. STATE updated
grep "Wave 2B" .planning/STATE.md
```

All 6 checks pass = Wave 2B DONE.

---

## Rollback Plan

All code in new files / new dirs. Rollback = revert + delete:

```bash
# Identify first Wave 2B commit
git log --oneline -12

# Option A: revert commits (preserves history)
git revert --no-edit <first-wave2b-sha>..HEAD

# Option B: hard reset if not pushed
git reset --hard <commit-before-wave2b>

# Option C: surgical delete
rm -rf src/services/retrieval
rm -f src/services/api/localGemma.ts src/services/api/__tests__/localGemma.test.ts
git checkout -- .planning/STATE.md  # if committed changes
```

No existing code to restore — nothing existing was modified.
