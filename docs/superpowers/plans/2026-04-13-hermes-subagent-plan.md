# Hermes Subprocess Agent — Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** CCR can dispatch a task to Hermes via `agent: hermes [task]` and receive Hermes's stdout as the result, with CCR owning causal memory merge via EverOS.

**Architecture:** Hermes is a CLI subprocess (not API-based). Unlike all existing agents that route through `runAgent()` → `query()` → Anthropic API, Hermes requires its own execution path: detect `agentType === 'hermes'` in `AgentTool.call()`, spawn `~/.local/bin/hermes -q "{prompt}" --directory {cwd}` via `LocalShellTask`-equivalent infrastructure, capture stdout, yield as messages.

**Tech Stack:** Bun, TypeScript, LocalShellTask patterns, EverOS SDK (already installed)

---

## File Map

| File | Role |
|------|------|
| `src/tools/AgentTool/built-in/hermesAgent.ts` | **Create** — Hermes agent definition (BuiltInAgentDefinition) |
| `src/tools/AgentTool/builtInAgents.ts` | **Modify** — Add HERMES_AGENT to getBuiltInAgents() |
| `src/tools/AgentTool/AgentTool.tsx` | **Modify** — Detect `agentType === 'hermes'`, route to subprocess path |
| `src/tools/AgentTool/runHermesSubagent.ts` | **Create** — Spawn Hermes CLI, yield stdout as messages |
| `src/services/evermem/index.ts` | **Read** — Understand existing EverOS integration |
| `src/services/evermem/proxy.ts` | **Read** — Understand EverOS API call pattern |

---

## Task 1: Define Hermes Agent Definition

**Files:**
- Create: `src/tools/AgentTool/built-in/hermesAgent.ts`

- [ ] **Step 1: Write the Hermes agent definition**

```typescript
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

export const HERMES_AGENT: BuiltInAgentDefinition = {
  agentType: 'hermes',
  whenToUse:
    'Dispatch a task to the Hermes (NousResearch) subprocess agent. Use when the task benefits from Hermes's specialized context, skills, or model configuration. Hermes runs independently with its own memory.',
  source: 'built-in',
  baseDir: 'built-in',
  // No tools — Hermes is a CLI subprocess, not an API agent
  tools: [],
  // No maxTurns — subprocess handles its own lifecycle
  // CCR waits for stdout and yields it as the result
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/AgentTool/built-in/hermesAgent.ts
git commit -m "feat(AgentTool): add hermes agent definition

Phase 1: Hermes as subprocess agent via LocalShellTask.
No API routing — direct CLI spawn.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Register Hermes in getBuiltInAgents()

**Files:**
- Modify: `src/tools/AgentTool/builtInAgents.ts:45-72`

- [ ] **Step 1: Add HERMES_AGENT import and push to agents array**

Add to the import block:
```typescript
import { HERMES_AGENT } from './built-in/hermesAgent.js'
```

In `getBuiltInAgents()`, add to the agents array (line ~45):
```typescript
const agents: AgentDefinition[] = [
  GENERAL_PURPOSE_AGENT,
  STATUSLINE_SETUP_AGENT,
  HERMES_AGENT,  // <-- add this
]
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/AgentTool/builtInAgents.ts
git commit -m "feat(AgentTool): register hermes agent in getBuiltInAgents()

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Create runHermesSubagent (Subprocess Spawn)

**Files:**
- Create: `src/tools/AgentTool/runHermesSubagent.ts`

- [ ] **Step 1: Write the Hermes subprocess runner**

```typescript
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import type { Message } from '../../types/message.js'
import { createUserMessage } from '../../utils/messages.js'
import { getProjectRoot } from '../../bootstrap/state.js'
import { logForDebugging } from '../../utils/debug.js'

const HERMES_BIN = '/Users/0xvox/.local/bin/hermes'

export interface HermesSubagentOptions {
  prompt: string
  cwd?: string
  signal?: AbortSignal
}

/**
 * Spawn Hermes as a CLI subprocess and yield its stdout as messages.
 *
 * Hermes is NOT an API-based agent — it runs as:
 *   hermes -q "{prompt}" --directory {cwd}
 *
 * This function bridges the CLI subprocess to the agent message interface.
 */
export async function* runHermesSubagent({
  prompt,
  cwd,
  signal,
}: HermesSubagentOptions): AsyncGenerator<Message> {
  const taskId = randomUUID()
  const workingDir = cwd ?? getProjectRoot()

  logForDebugging(`[Hermes subagent] spawning: ${HERMES_BIN} -q "${prompt}" --directory ${workingDir}`)

  // Yield a progress message indicating Hermes has been dispatched
  yield {
    type: 'progress',
    uuid: randomUUID(),
    message: {
      type: 'progress',
      description: `Dispatching to Hermes...`,
    },
  } as any

  // Spawn Hermes CLI
  const child = spawn(HERMES_BIN, ['-q', prompt, '--directory', workingDir], {
    cwd: workingDir,
    signal,
    // Capture stdout and stderr
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  })

  let stdout = ''
  let stderr = ''

  // Collect stdout
  for await (const chunk of child.stdout) {
    stdout += chunk.toString()
  }

  // Collect stderr (log only)
  for await (const chunk of child.stderr) {
    stderr += chunk.toString()
  }

  // Wait for process to exit
  const exitCode = await new Promise<number>(resolve => {
    child.on('close', code => resolve(code ?? 1))
  })

  if (stderr) {
    logForDebugging(`[Hermes subagent] stderr: ${stderr}`)
  }

  logForDebugging(`[Hermes subagent] exited with code ${exitCode}`)

  if (exitCode !== 0) {
    // Yield error as a user message with error content
    yield {
      type: 'user',
      uuid: randomUUID(),
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `[Hermes error: exited with code ${exitCode}]\n${stderr || stdout}`,
          },
        ],
      },
    } as any
    return
  }

  // Yield Hermes stdout as a user message (acts as the "result")
  // This gets recorded in the agent transcript and returned to CCR
  yield {
    type: 'user',
    uuid: randomUUID(),
    message: {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `[Hermes result]\n${stdout}`,
        },
      ],
    },
  } as any
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tools/AgentTool/runHermesSubagent.ts
git commit -m "feat(AgentTool): add runHermesSubagent — CLI spawn for Hermes

AsyncGenerator that spawns hermes -q via child_process,
yields stdout as messages matching the agent message interface.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Route hermes agentType to subprocess path in AgentTool.call()

**Files:**
- Modify: `src/tools/AgentTool/AgentTool.tsx`

This is the key integration point. Find where `selectedAgent` is resolved (~line 345) and `runAgent` is called (~line 846). Add a special case for `agentType === 'hermes'` that bypasses `runAgent()`.

- [ ] **Step 1: Add import for runHermesSubagent**

Add near the top of the file with other imports (~line 80):
```typescript
import { runHermesSubagent } from './runHermesSubagent.js'
```

- [ ] **Step 2: Replace `const agentIterator = runAgent(...)` with a branch**

In the sync agent block (around line 846), replace:
```typescript
const agentIterator = runAgent({...})[Symbol.asyncIterator]()
```
with:
```typescript
// HERMES SPECIAL CASE: Hermes is a CLI subprocess — bypass runAgent().
let agentIterator: AsyncIterator<Message | StreamEvent | RequestStartEvent | ToolUseSummaryMessage | TombstoneMessage>
if (selectedAgent.agentType === 'hermes') {
  agentIterator = (runHermesSubagent({
    prompt,
    cwd: cwdOverridePath ?? worktreeInfo?.worktreePath,
    signal: toolUseContext.abortController.signal,
  }))[Symbol.asyncIterator]()
} else {
  agentIterator = runAgent({
    ...runAgentParams,
    override: {
      ...runAgentParams.override,
      agentId: syncAgentId,
    },
    onCacheSafeParams: summaryTaskId && getSdkAgentProgressSummariesEnabled() ? (params: CacheSafeParams) => {
      const { stop } = startAgentSummarization(summaryTaskId, syncAgentId, params, rootSetAppState)
      stopForegroundSummarization = stop
    } : undefined,
  })[Symbol.asyncIterator]()
}
```

**Why this works:** The outer while loop (line 868) iterates over `agentIterator.next()` and pushes messages to `agentMessages`. Hermes's user messages enter `agentMessages` identically. `finalizeAgentTool(agentMessages, syncAgentId, metadata)` is called after the loop (line 1235) — it handles both API agent messages and Hermes's user messages the same way.
```

This block should be inserted just before line 846 (`const agentIterator = runAgent({...`).

**Why `yield msg` inside the for loop:** `runAgent` yields messages that get forwarded to the REPL. Hermes's stdout should be streamed the same way so the user sees it arrive in real-time.

- [ ] **Step 3: Commit**

```bash
git add src/tools/AgentTool/AgentTool.tsx
git commit -m "feat(AgentTool): route hermes agentType to runHermesSubagent

Detect agentType === 'hermes' before runAgent() call.
Hermes bypasses API entirely — yields stdout directly as messages.
Streaming via yield in the sync loop.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Verify build compiles

- [ ] **Step 1: Run build**

```bash
cd /Users/0xvox/claude-code-reimagine-for-learning
bun run build 2>&1 | tail -30
```

Expected: Build succeeds (CCR has ~1341 existing tsc errors from decompilation — those are pre-existing and unrelated to our changes). Our changes must not introduce new errors.

- [ ] **Step 2: If build fails, diagnose and fix**

Common issues:
- Missing import (runHermesSubagent not imported)
- Type mismatch in Message yield (use `as any` if needed to bridge)
- `cwdOverridePath` / `worktreeInfo` may be undefined at that point — use `?.` chaining

- [ ] **Step 3: Commit if build succeeds**

```bash
git add src/
git commit -m "fix: resolve any build errors from hermes integration

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Smoke test — manual verification

- [ ] **Step 1: Run CCR dev mode**

```bash
bun run dev
```

- [ ] **Step 2: In REPL, test Hermes dispatch**

```
/agent hermes Analyze the architecture of src/query.ts and summarize
```

Expected: CCR spawns Hermes subprocess, Hermes stdout appears in REPL output.

- [ ] **Step 3: Verify no new tsc errors from our changes**

```bash
bun run build 2>&1 | grep -E "^src/tools/AgentTool/(hermesAgent|runHermesSubagent|AgentTool\.tsx)" | head -20
```

Should show zero errors from our new files.

---

## Self-Review Checklist

- [ ] Spec coverage: All Phase 1 spec requirements have tasks
  - [x] Register hermes agent type — Task 1 + Task 2
  - [x] Spawn via CLI subprocess — Task 3 + Task 4
  - [x] stdout returned as tool result — Task 4 (yield in sync loop)
  - [ ] Memory flow (EverOS pull/merge) — **DEFERRED to Task 7** (not in Phase 1 spec, but logically should come next)
  - [ ] No Grok/Codex — confirmed by spec (Phase 1 only)
- [ ] Placeholder scan: No TBD/TODO in any step
- [ ] Type consistency: `runHermesSubagent` yields `Message` type (matches what `runAgent` yields)
- [ ] Build: All files compile under `bun run build`
- [ ] Existing functionality: All other agents (general-purpose, explore, plan, etc.) unchanged

---

## Deferred Items (Phase 1 Complete Without These)

- **EverOS memory integration**: CCR pulls before dispatch / merges after task — requires reading `src/services/evermem/` first
- **Async mode for Hermes**: `shouldRunAsync` path for hermes — currently only sync path implemented
- **Grok agent**: `grok --prompt "..." --directory $PWD --format json`
- **Codex agent**: `codex exec "..." --directory $PWD`
- **research-vault file output**: deferred per spec

---

**Execution choice:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, verify each build step

**2. Inline Execution** — Execute tasks in this session with checkpoints

**Which approach?**
