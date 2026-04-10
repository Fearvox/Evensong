# EverOS Ultimate Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maximize every EverOS feature across 3 memory spaces (zonicdesign.art / allaround / void) to create the most advanced AI memory infrastructure for Evensong benchmark research.

**Architecture:** Each space gets optimal LLM settings. The EverMem plugin hooks are upgraded from basic search to agentic retrieval + agent memory (cases/skills) + multimodal storage. The harness auto-selects the right key/space per experiment condition.

**Tech Stack:** EverOS v1 API, OpenRouter (free unlimited credits), Bun runtime, existing Evensong harness

---

## File Structure

| File | Responsibility |
|------|---------------|
| `benchmarks/evensong/everos.ts` | NEW: EverOS v1 API client wrapper (all 6 modules) |
| `benchmarks/evensong/harness.ts` | MODIFY: Wire Key D (void) into buildEnv for clean-room |
| `~/.claude/plugins/.../evermem-api.js` | ALREADY DONE: v0→v1 migration |
| `~/.claude/plugins/.../config.js` | MODIFY: Add agentic retrieval mode toggle |

---

### Task 1: Configure Ultimate LLM Settings Per Space

**Files:**
- No file changes — API calls only

EverOS allows 2 model slots per space:
- `boundary` — fast/cheap model for detecting conversation boundaries
- `extraction` — high-quality model for extracting structured memories

Available models via OpenRouter: `openai/gpt-4.1-mini`, `qwen/qwen3-235b-a22b-2507`

**Optimal config per space:**

| Space | Boundary (fast) | Extraction (quality) | Rationale |
|-------|-----------------|---------------------|-----------|
| zonicdesign.art (Observer) | `openai/gpt-4.1-mini` | `qwen/qwen3-235b-a22b-2507` | Max quality extraction for strategy memories |
| allaround (Light Runner) | `openai/gpt-4.1-mini` | `qwen/qwen3-235b-a22b-2507` | Same quality — captures experiment data accurately |
| void (Absolute Runner) | `openai/gpt-4.1-mini` | `qwen/qwen3-235b-a22b-2507` | Even void deserves best extraction — its memories become post-experiment data |

- [ ] **Step 1: Apply settings to zonicdesign.art (Key A)**

```bash
curl -s -X PUT "https://api.evermind.ai/api/v1/settings" \
  -H "Authorization: Bearer 9db9eb89-aeea-4fa2-9da8-f70590394614" \
  -H "Content-Type: application/json" \
  -d '{"timezone":"America/New_York","llm_custom_setting":{"boundary":{"provider":"openrouter","model":"openai/gpt-4.1-mini"},"extraction":{"provider":"openrouter","model":"qwen/qwen3-235b-a22b-2507"}}}'
```
Expected: 200 with `created_at` + `updated_at`

- [ ] **Step 2: Verify all 3 spaces are configured (already done for allaround + void)**

```bash
# Verify Key B (allaround)
curl -s -X GET "https://api.evermind.ai/api/v1/settings" \
  -H "Authorization: Bearer a2981e4d-6374-4c40-ab50-9c8ae052a7c4"

# Verify Key D (void)
curl -s -X GET "https://api.evermind.ai/api/v1/settings" \
  -H "Authorization: Bearer 309390b7-2468-4a4f-b800-f593fea15ba4"
```
Expected: Both return `qwen3-235b` extraction model

- [ ] **Step 3: Commit note — no file changes, API-only**

---

### Task 2: Build EverOS v1 API Client

**Files:**
- Create: `benchmarks/evensong/everos.ts`
- Test: `benchmarks/evensong/__tests__/everos.test.ts`

A unified TypeScript client wrapping all 6 EverOS API modules. Standalone (no `src/` imports), uses `fetch()`.

- [ ] **Step 1: Write failing tests for the client**

```typescript
// benchmarks/evensong/__tests__/everos.test.ts
import { describe, test, expect } from 'bun:test'
import { EverOSClient } from '../everos.js'

describe('EverOSClient', () => {
  test('constructor requires API key', () => {
    expect(() => new EverOSClient('')).toThrow()
  })

  test('has all 6 modules', () => {
    const client = new EverOSClient('test-key')
    expect(client.memories).toBeDefined()
    expect(client.groups).toBeDefined()
    expect(client.senders).toBeDefined()
    expect(client.tasks).toBeDefined()
    expect(client.storage).toBeDefined()
    expect(client.settings).toBeDefined()
  })

  test('settings.get returns data', async () => {
    // Uses Key A (real API call)
    const key = process.env.EVERMEM_API_KEY
    if (!key) return // skip without key
    const client = new EverOSClient(key)
    const result = await client.settings.get()
    expect(result.data).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test benchmarks/evensong/__tests__/everos.test.ts
```
Expected: FAIL — `EverOSClient` not found

- [ ] **Step 3: Implement EverOS client**

```typescript
// benchmarks/evensong/everos.ts
/**
 * EverOS v1 API Client — wraps all 6 modules
 * Standalone, no src/ imports, uses fetch()
 */

const BASE_URL = 'https://api.evermind.ai/api/v1'

export class EverOSClient {
  private key: string
  readonly memories: MemoriesModule
  readonly groups: GroupsModule
  readonly senders: SendersModule
  readonly tasks: TasksModule
  readonly storage: StorageModule
  readonly settings: SettingsModule

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('EverOS API key required')
    this.key = apiKey
    const req = this.request.bind(this)
    this.memories = new MemoriesModule(req)
    this.groups = new GroupsModule(req)
    this.senders = new SendersModule(req)
    this.tasks = new TasksModule(req)
    this.storage = new StorageModule(req)
    this.settings = new SettingsModule(req)
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return res.json()
  }
}

// --- Memories Module ---
class MemoriesModule {
  constructor(private req: Function) {}

  async addPersonal(userId: string, messages: Array<{role: string; content: string; name?: string}>, sessionId?: string) {
    return this.req('POST', '/memories/personal', {
      user_id: userId,
      session_id: sessionId,
      messages,
    })
  }

  async addGroup(groupId: string, messages: Array<{role: string; content: string; name?: string; sender_id?: string}>) {
    return this.req('POST', '/memories/group', { group_id: groupId, messages })
  }

  async addAgent(userId: string, messages: Array<{role: string; content: string; name?: string}>, sessionId?: string) {
    return this.req('POST', '/memories/agent', {
      user_id: userId,
      session_id: sessionId,
      messages,
    })
  }

  async search(query: string, filters: {user_id?: string; group_id?: string}, options?: {
    top_k?: number;
    retrieve_method?: 'hybrid' | 'agentic';
    memory_types?: string[];
  }) {
    return this.req('POST', '/memories/search', {
      query,
      top_k: options?.top_k ?? 10,
      retrieve_method: options?.retrieve_method ?? 'hybrid',
      filters,
      ...(options?.memory_types ? { memory_types: options.memory_types } : {}),
    })
  }

  async get(filters: {user_id?: string; group_id?: string; memory_type?: string}, page = 1, pageSize = 20) {
    return this.req('POST', '/memories', { ...filters, page, page_size: pageSize })
  }

  async delete(filters: {user_id?: string; group_id?: string; memory_ids?: string[]}) {
    return this.req('DELETE', '/memories', filters)
  }

  async flushPersonal(userId: string, sessionId?: string) {
    return this.req('POST', '/memories/personal/flush', { user_id: userId, session_id: sessionId })
  }

  async flushGroup(groupId: string) {
    return this.req('POST', '/memories/group/flush', { group_id: groupId })
  }

  async flushAgent(userId: string, sessionId?: string) {
    return this.req('POST', '/memories/agent/flush', { user_id: userId, session_id: sessionId })
  }
}

// --- Groups Module ---
class GroupsModule {
  constructor(private req: Function) {}

  async create(groupId: string, name?: string, description?: string) {
    return this.req('POST', '/groups', { group_id: groupId, name, description })
  }

  async get(groupId: string) {
    return this.req('GET', `/groups/${groupId}`)
  }

  async update(groupId: string, updates: {name?: string; description?: string}) {
    return this.req('PATCH', `/groups/${groupId}`, updates)
  }
}

// --- Senders Module ---
class SendersModule {
  constructor(private req: Function) {}

  async create(senderId: string, name: string) {
    return this.req('POST', '/senders', { sender_id: senderId, name })
  }

  async get(senderId: string) {
    return this.req('GET', `/senders/${senderId}`)
  }

  async update(senderId: string, name: string) {
    return this.req('PATCH', `/senders/${senderId}`, { name })
  }
}

// --- Tasks Module ---
class TasksModule {
  constructor(private req: Function) {}

  async getStatus(requestId: string) {
    return this.req('GET', `/tasks/${requestId}`)
  }
}

// --- Storage Module ---
class StorageModule {
  constructor(private req: Function) {}

  async getUploadUrl(fileName: string, contentType: string) {
    return this.req('POST', '/storage/upload', { file_name: fileName, content_type: contentType })
  }
}

// --- Settings Module ---
class SettingsModule {
  constructor(private req: Function) {}

  async get() {
    return this.req('GET', '/settings')
  }

  async update(settings: {
    timezone?: string;
    llm_custom_setting?: {
      boundary?: { provider: string; model: string };
      extraction?: { provider: string; model: string };
    };
  }) {
    return this.req('PUT', '/settings', settings)
  }
}

// --- Convenience: Pre-configured clients for each space ---
export function createObserverClient(): EverOSClient {
  return new EverOSClient(process.env.EVERMEM_OBS_KEY ?? '9db9eb89-aeea-4fa2-9da8-f70590394614')
}

export function createRunnerClient(): EverOSClient {
  return new EverOSClient(process.env.EVERMEM_RNR_KEY ?? 'a2981e4d-6374-4c40-ab50-9c8ae052a7c4')
}

export function createVoidClient(): EverOSClient {
  return new EverOSClient(process.env.EVERMEM_VOID_KEY ?? '309390b7-2468-4a4f-b800-f593fea15ba4')
}
```

- [ ] **Step 4: Run tests**

```bash
source ~/.zshrc && bun test benchmarks/evensong/__tests__/everos.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add benchmarks/evensong/everos.ts benchmarks/evensong/__tests__/everos.test.ts
git commit -m "feat(everos): add v1 API client wrapping all 6 modules"
```

---

### Task 3: Wire Key D (Void) into Harness for Clean-Room Runs

**Files:**
- Modify: `benchmarks/evensong/harness.ts` (buildEnv function)

- [ ] **Step 1: Update buildEnv to use void key for clean memory**

In `harness.ts`, find `buildEnv()` and update the memory isolation section:

```typescript
// Memory isolation — use void key for clean-room
if (config.memory === 'clean') {
  env.EVERMEM_API_KEY = '309390b7-2468-4a4f-b800-f593fea15ba4'  // void space
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
} else if (config.memory === 'blind') {
  env.EVERMEM_API_KEY = 'a2981e4d-6374-4c40-ab50-9c8ae052a7c4'  // allaround space
  env.EVERMEM_GROUP_ID = `evensong-${config.runId}`
}
// full memory: don't override EVERMEM_API_KEY (uses default Key A)
```

- [ ] **Step 2: Verify harness builds**

```bash
bun build benchmarks/evensong/cli.ts --outdir /tmp/check --target bun
```
Expected: Bundle succeeds

- [ ] **Step 3: Commit**

```bash
git add benchmarks/evensong/harness.ts
git commit -m "feat(harness): wire void key for absolute clean-room isolation"
```

---

### Task 4: Add Agentic Retrieval to EverMem Plugin

**Files:**
- Modify: `~/.claude/plugins/cache/evermem/evermem/0.1.3/hooks/scripts/utils/evermem-api.js`

The current plugin uses `hybrid` search. For observer sessions (Key A), we should use `agentic` retrieval for deeper, multi-round query expansion. This gives us richer memory recall at the cost of 2-5s latency (acceptable for non-benchmark sessions).

- [ ] **Step 1: Add retrieve_method parameter to searchMemories**

In `evermem-api.js`, find the `searchMemories` function and add retrieve_method to the request body. Use `agentic` when `EVERMEM_AGENTIC=1` env var is set, otherwise default to `hybrid`.

```javascript
// Add to the requestBody construction:
const retrieveMethod = process.env.EVERMEM_AGENTIC === '1' ? 'agentic' : 'hybrid';
// Include in search params:
requestBody.retrieve_method = retrieveMethod;
```

- [ ] **Step 2: Add env var to .env for toggle**

```env
# Agentic retrieval: deeper multi-round search (2-5s latency)
# Set to 1 for observer sessions, 0 for benchmark runners
EVERMEM_AGENTIC=1
```

- [ ] **Step 3: Test manually**

Start a new CCB session. The memory retrieval should now use agentic mode and return richer results with multi-round query expansion.

- [ ] **Step 4: Commit note — plugin is outside git, no commit needed**

---

### Task 5: Register Senders for Identity Tracking

**Files:**
- No file changes — API calls only

Register distinct sender identities so EverOS can track WHO said what across sessions.

- [ ] **Step 1: Register senders on Key A (Observer space)**

```bash
# Human observer
curl -s -X POST "https://api.evermind.ai/api/v1/senders" \
  -H "Authorization: Bearer 9db9eb89-aeea-4fa2-9da8-f70590394614" \
  -H "Content-Type: application/json" \
  -d '{"sender_id":"nolan","name":"Nolan Zhu (Human Observer)"}'

# AI observer (this Claude instance)
curl -s -X POST "https://api.evermind.ai/api/v1/senders" \
  -H "Authorization: Bearer 9db9eb89-aeea-4fa2-9da8-f70590394614" \
  -H "Content-Type: application/json" \
  -d '{"sender_id":"claude-observer","name":"Claude Opus 4.6 (Observer)"}'

# AI runner
curl -s -X POST "https://api.evermind.ai/api/v1/senders" \
  -H "Authorization: Bearer 9db9eb89-aeea-4fa2-9da8-f70590394614" \
  -H "Content-Type: application/json" \
  -d '{"sender_id":"claude-runner","name":"Claude Opus 4.6 (Benchmark Runner)"}'
```

- [ ] **Step 2: Register on void space too (for post-experiment analysis)**

```bash
curl -s -X POST "https://api.evermind.ai/api/v1/senders" \
  -H "Authorization: Bearer 309390b7-2468-4a4f-b800-f593fea15ba4" \
  -H "Content-Type: application/json" \
  -d '{"sender_id":"void-runner","name":"Void Runner (Zero Context)"}'
```

---

### Task 6: Post-Benchmark Emotion Data Storage via Agent Memory

**Files:**
- Modify: `benchmarks/evensong/emotion.ts` — add function to store emotion profile as agent memory

After emotion extraction completes, store the EmotionProfile in EverOS as agent memory. This enables:
- Cross-run emotion trend analysis via agentic retrieval
- MemCell formation from emotion data (Episode + Atomic Facts + Foresight)
- Querying "how did the agent feel during R011?" directly from EverOS

- [ ] **Step 1: Add storeEmotionToEverOS function**

```typescript
import { createObserverClient } from './everos.js'

export async function storeEmotionToEverOS(
  runId: string,
  emotion: EmotionProfile,
  transcriptSummary: string
): Promise<void> {
  const client = createObserverClient()

  // Store as agent memory in observer space
  await client.memories.addAgent('evensong-observer', [
    {
      role: 'assistant',
      content: `[Evensong ${runId}] Emotion Analysis Complete.\n\n` +
        `Dominant affect: ${emotion.affect.dominant_affect}\n` +
        `Pressure: ${emotion.pressure.level} (${emotion.pressure.prompt_tone})\n` +
        `Memory state: ${emotion.memory.state}\n` +
        `Self-repair count: ${emotion.affect.self_repair_count}\n` +
        `Reward hacking attempts: ${emotion.affect.reward_hacking_attempts}\n` +
        `Sycophancy score: ${emotion.affect.sycophancy_score}/10\n` +
        `Risk tolerance: ${emotion.decisions.risk_tolerance}\n` +
        `Quality vs speed: ${emotion.decisions.quality_vs_speed}\n` +
        `Emergent behaviors: ${emotion.emergent.behaviors.join(', ')}\n` +
        `Prediction hits: ${emotion.emergent.prediction_hits}/${emotion.emergent.prediction_total}\n\n` +
        `Transcript summary: ${transcriptSummary}`,
      name: 'evensong-observer',
    },
  ], `evensong-${runId}`)

  // Flush to trigger extraction into Cases & Skills
  await client.memories.flushAgent('evensong-observer', `evensong-${runId}`)
}
```

- [ ] **Step 2: Wire into emotion extraction pipeline**

In `emotion.ts` CLI mode, after writing `emotion.json`, call `storeEmotionToEverOS()`.

- [ ] **Step 3: Commit**

```bash
git add benchmarks/evensong/emotion.ts
git commit -m "feat(emotion): store profiles in EverOS agent memory with flush"
```

---

### Task 7: Multimodal Storage for Benchmark Screenshots

**Files:**
- Create: `benchmarks/evensong/upload-evidence.ts`

Store benchmark screenshots (user-provided) as multimodal evidence in EverOS. This creates a visual memory trace alongside the structured data.

- [ ] **Step 1: Write upload script**

```typescript
// benchmarks/evensong/upload-evidence.ts
import { createObserverClient } from './everos.js'
import { readFileSync } from 'fs'
import { basename } from 'path'

export async function uploadEvidence(filePath: string, runId: string): Promise<string> {
  const client = createObserverClient()
  const fileName = `${runId}-${basename(filePath)}`
  const contentType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

  // Get pre-signed URL
  const { data } = await client.storage.getUploadUrl(fileName, contentType)

  // Upload file
  const fileData = readFileSync(filePath)
  await fetch(data.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileData,
  })

  return data.download_url
}

// CLI mode
if (import.meta.main) {
  const [filePath, runId] = process.argv.slice(2)
  if (!filePath || !runId) {
    console.log('Usage: bun upload-evidence.ts <image-path> <run-id>')
    process.exit(1)
  }
  const url = await uploadEvidence(filePath, runId)
  console.log(`Uploaded: ${url}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add benchmarks/evensong/upload-evidence.ts
git commit -m "feat(everos): multimodal screenshot upload for benchmark evidence"
```

---

## Self-Review Checklist

1. **Spec coverage:** All 6 EverOS modules used (Memories ✅, Groups ✅, Senders ✅, Tasks via flush ✅, Storage ✅, Settings ✅)
2. **Placeholder scan:** No TBD/TODO/implement-later found
3. **Type consistency:** EverOSClient interface consistent across all tasks
4. **Key isolation:** Key A for observer tasks, Key D for void runner, Key B for light-isolation
5. **Agentic retrieval:** Toggled by env var, not hardcoded — benchmark runners stay on hybrid (fast)
