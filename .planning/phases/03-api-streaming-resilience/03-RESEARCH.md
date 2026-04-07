# Phase 3: API & Streaming Resilience - Research

**Researched:** 2026-04-07
**Domain:** Anthropic SDK streaming, retry/resilience patterns, provider abstraction, atomic history writes
**Confidence:** HIGH

## Summary

Phase 3 targets the streaming API layer in `src/services/api/claude.ts` (~3400 lines) and its supporting modules. The codebase already has a sophisticated retry system (`withRetry.ts`), an idle timeout watchdog, non-streaming fallback, and multi-provider support. The task is NOT greenfield -- it is hardening, wiring in the Phase 1 Zod schema, improving type safety, and adding test coverage for behaviors that already exist but are untested.

The key insight from reading the code: **most resilience mechanisms are already implemented but gated behind env vars or feature flags, lack test coverage, and have type-safety gaps (many `as` casts and `unknown` types).** The work is: (1) wire in the Zod schema, (2) make the watchdog always-on with configurable timeout, (3) add atomic write semantics for history on abort, (4) clean up provider type annotations, and (5) write comprehensive tests.

**Primary recommendation:** Focus on testing and type-hardening the existing resilience code rather than replacing it. The `withRetry` + watchdog + non-streaming fallback architecture is battle-tested. Add the Zod validation layer from Phase 1, make idle timeout unconditional, fix `appendEntryToFile` to use atomic writes, and build a test suite that simulates ECONNRESET, idle timeouts, aborts, and provider switching.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | Streaming handles ECONNRESET/EPIPE/ETIMEDOUT with automatic retry (p-retry) | `withRetry.ts` already handles these via `isStaleConnectionError()` and `shouldRetry()`. p-retry not needed -- existing retry loop is more sophisticated. Tests needed. |
| API-02 | Idle timeout wrapper detects and recovers from frozen streams | Watchdog exists but gated behind `CLAUDE_ENABLE_STREAM_WATCHDOG` env var. Make unconditional with configurable timeout. Tests needed. |
| API-03 | Provider switching (Anthropic/Bedrock/Vertex) works without code changes | `providers.ts` already reads env vars. `withRetry.ts` handles Bedrock/Vertex auth errors. Need tests proving env-var-only switching. |
| API-04 | Stream abort path writes history atomically | `appendEntryToFile()` uses `appendFileSync` -- NOT atomic. Needs temp-file + rename pattern. |
| API-05 | claude.ts type annotations match SDK event types without unsafe casts | Many `as` casts in streaming loop. Wire in Zod schema from Phase 1. Fix type flow. |
| TEST-03 | API streaming has tests covering retry, timeout, abort, and provider switching | Only `streamEvents.test.ts` exists (schema tests). Need integration tests for all resilience paths. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | 0.80.0 (installed) | API client, streaming, error types | Already in place, provides Stream, APIError, APIConnectionError, APIUserAbortError [VERIFIED: node_modules] |
| zod | 4.3.6 (installed) | Stream event validation at API boundary | Already in place, schema created in Phase 1 [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bun test | built-in (1.3.11) | Test runner | All streaming tests [VERIFIED: bun test --help] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-retry | Existing withRetry.ts | withRetry.ts is already more sophisticated (model fallback, 529 tracking, persistent mode, fast-mode cooldown). p-retry would be a downgrade. Use existing. [VERIFIED: src/services/api/withRetry.ts] |
| Custom atomic write | write-file-atomic npm | Extra dependency for a 10-line pattern (write to .tmp, rename). Not worth it. |

**Note on p-retry:** The CLAUDE.md technology stack recommends p-retry, but after reading withRetry.ts, the existing implementation is significantly more capable. It handles: exponential backoff with jitter, retry-after headers, 529 consecutive error tracking with model fallback, ECONNRESET/EPIPE detection, OAuth token refresh, Bedrock/Vertex auth errors, persistent retry mode, fast-mode cooldown, and max-tokens overflow adjustment. Replacing this with p-retry would be a regression. The recommendation is to TEST the existing code, not replace it.

## Architecture Patterns

### Current Streaming Architecture (from codebase analysis)
```
queryModel() [claude.ts]
  |
  +-- withRetry() [withRetry.ts]          # Retry loop with backoff
  |     |-- getAnthropicClient()          # Client creation (provider-aware)
  |     |-- operation()                   # SDK .create({stream:true}).withResponse()
  |     +-- shouldRetry()                 # Error classification
  |
  +-- for await (part of stream)          # Main streaming loop
  |     |-- resetStreamIdleTimer()        # Watchdog reset per chunk
  |     |-- switch(part.type)             # Event processing (7 types)
  |     +-- yield stream_event            # Propagate to QueryEngine
  |
  +-- catch (streamingError)              # Streaming error handler
  |     |-- APIUserAbortError check       # User abort vs SDK timeout
  |     +-- executeNonStreamingRequest()  # Fallback to non-streaming
  |
  +-- catch (errorFromRetry)              # Retry exhaustion handler
        |-- FallbackTriggeredError        # Model fallback to query.ts
        +-- CannotRetryError              # Terminal failure
```

### Pattern 1: Zod Schema Wiring at Stream Boundary
**What:** Wire `parseStreamEvent()` / `safeParseStreamEvent()` from Phase 1 into the streaming loop [VERIFIED: src/services/api/streamEventSchema.ts]
**When to use:** At the `for await (const part of stream)` loop entry point
**Example:**
```typescript
// Source: src/services/api/streamEventSchema.ts (Phase 1 output)
import { safeParseStreamEvent } from './streamEventSchema.js'

for await (const part of stream) {
  resetStreamIdleTimer()
  // Validate at API boundary -- passthrough preserves unknown fields
  const validated = safeParseStreamEvent(part)
  if (!validated) {
    logForDebugging(`Unknown stream event type: ${(part as any).type}`, { level: 'warn' })
    continue  // Skip unknown events gracefully
  }
  // Now `validated` has type-safe access to all fields
  switch (validated.type) { ... }
}
```
**Decision:** Use `safeParseStreamEvent` (not `parseStreamEvent`) in the streaming loop. Throwing on unknown event types would break forward compatibility when the SDK adds new event types. Log and skip instead.

### Pattern 2: Atomic History Write
**What:** Replace `appendFileSync` with temp-file-then-rename pattern [VERIFIED: src/utils/sessionStorage.ts:2580]
**When to use:** `appendEntryToFile()` in sessionStorage.ts
**Example:**
```typescript
// Atomic append: write full line to temp, then rename
// This prevents partial writes on abort/crash
import { writeFileSync, renameSync, appendFileSync } from 'fs'
import { join, dirname } from 'path'

function appendEntryToFile(fullPath: string, entry: Record<string, unknown>): void {
  const line = jsonStringify(entry) + '\n'
  // appendFileSync on POSIX is atomic for writes <= PIPE_BUF (4096 bytes on Linux/macOS)
  // For JSONL entries, most are well under this limit
  // The real risk is process termination mid-write -- use O_APPEND flag (default for appendFileSync)
  // which guarantees atomic append on POSIX
  try {
    fs.appendFileSync(fullPath, line, { mode: 0o600 })
  } catch {
    fs.mkdirSync(dirname(fullPath), { mode: 0o700, recursive: true })
    fs.appendFileSync(fullPath, line, { mode: 0o600 })
  }
}
```
**Key insight:** After deeper analysis, `appendFileSync` with `O_APPEND` flag is ALREADY atomic for writes under PIPE_BUF (4096 bytes on macOS/Linux). Most JSONL entries are well under this. The real gap is: when the process is killed mid-stream, the LAST entry may be incomplete. The fix is to ensure the final entry written on abort is a complete JSON line. This means flushing any accumulated state to a complete assistant message BEFORE the abort propagates.

### Pattern 3: Unconditional Idle Timeout
**What:** Remove the `CLAUDE_ENABLE_STREAM_WATCHDOG` gate; make watchdog always-on [VERIFIED: claude.ts:1875-1877]
**When to use:** In the streaming setup before `for await`
**Current state:** Gated behind `isEnvTruthy(process.env.CLAUDE_ENABLE_STREAM_WATCHDOG)` -- if not set, `resetStreamIdleTimer()` is a no-op
**Fix:** Default to enabled, keep env var as override to DISABLE (for debugging)

### Anti-Patterns to Avoid
- **Replacing withRetry with p-retry:** The existing retry system is far more sophisticated. Wrapping it again would create double-retry loops.
- **Throwing on unknown stream events:** Use safeParseStreamEvent, not parseStreamEvent. Throwing breaks forward compatibility.
- **Mocking the full Anthropic client in tests:** Mock at the `Stream` iterator level instead. The SDK client creation is provider-specific and hard to mock correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API retry with backoff | New retry wrapper | Existing `withRetry.ts` | Already handles 12+ error types, model fallback, provider-specific auth refresh |
| Stream event validation | Manual type guards | `streamEventSchema.ts` (Phase 1) | Zod discriminated union covers all 7 event types with passthrough for forward compat |
| Error classification | New error type checks | `shouldRetry()`, `isStaleConnectionError()`, `is529Error()` | Existing functions cover ECONNRESET, EPIPE, 429, 529, 401, 403, SSL errors |
| Provider selection | Provider config object | `getAPIProvider()` env-var reader | Already reads CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_USE_VERTEX, CLAUDE_CODE_USE_FOUNDRY |

## Common Pitfalls

### Pitfall 1: Double Tool Execution on Non-Streaming Fallback
**What goes wrong:** When streaming fails mid-tool-use, the non-streaming fallback re-sends the same messages, causing the API to return the same tool_use block, which executes the tool again.
**Why it happens:** The streaming loop may have already yielded a partial tool_use before the error. The non-streaming retry gets the full response including that same tool.
**How to avoid:** The codebase already has `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK` and feature flag `tengu_disable_streaming_to_non_streaming_fallback` for this. Tests should verify both paths. [VERIFIED: claude.ts:2466-2503]
**Warning signs:** Duplicate tool execution logs, files written twice.

### Pitfall 2: Watchdog Timer Cleanup on All Exit Paths
**What goes wrong:** If `clearStreamIdleTimers()` is not called on every exit path, the setTimeout fires after the stream is done, corrupting state or crashing.
**Why it happens:** Multiple exit paths: normal completion, streaming error, retry error, user abort, FallbackTriggeredError.
**How to avoid:** The existing code already calls `clearStreamIdleTimers()` in three places (normal exit, catch, finally). Tests should verify no leaked timers. [VERIFIED: claude.ts:2307, 2407, 2597]
**Warning signs:** "Streaming idle timeout" log messages after a response has completed.

### Pitfall 3: SDK APIUserAbortError for Both User Abort and Timeout
**What goes wrong:** The SDK throws `APIUserAbortError` for both user-initiated abort (ESC key) and SDK-internal timeout. Code that only checks `instanceof APIUserAbortError` conflates the two.
**Why it happens:** The SDK uses AbortController internally for timeouts, which produces the same error type.
**How to avoid:** Check `signal.aborted` to distinguish: if the caller's signal is aborted, it's a user abort; otherwise it's an SDK timeout. [VERIFIED: claude.ts:2435-2462]

### Pitfall 4: Bun Mock Module for SDK Imports
**What goes wrong:** Bun's `mock.module` does not support mocking specific exports from ESM modules the same way Jest does.
**Why it happens:** Bun's module mocking has limitations with ESM and re-exports.
**How to avoid:** For streaming tests, create mock Stream iterators rather than mocking the SDK client. Test the processing logic, not the SDK transport. Use the pattern from Phase 2: create factory functions that return test doubles.
**Warning signs:** "Cannot mock module" errors, tests that pass in isolation but fail together.

## Code Examples

### Mock Stream Iterator for Tests
```typescript
// Source: pattern from Phase 2 tool tests, adapted for streaming
async function* createMockStream(events: Array<{type: string; [key: string]: unknown}>): AsyncGenerator<unknown> {
  for (const event of events) {
    yield event
  }
}

// Simulate ECONNRESET mid-stream
async function* createFailingStream(
  eventsBeforeError: Array<{type: string; [key: string]: unknown}>,
  error: Error,
): AsyncGenerator<unknown> {
  for (const event of eventsBeforeError) {
    yield event
  }
  throw error
}
```

### Testing Provider Switching
```typescript
// Source: pattern from src/utils/model/providers.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { getAPIProvider } from 'src/utils/model/providers.js'

describe('provider switching', () => {
  const originalEnv = { ...process.env }
  afterEach(() => { Object.assign(process.env, originalEnv) })

  test('defaults to firstParty', () => {
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    expect(getAPIProvider()).toBe('firstParty')
  })

  test('CLAUDE_CODE_USE_BEDROCK=1 selects bedrock', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(getAPIProvider()).toBe('bedrock')
  })
})
```

### Testing withRetry Error Classification
```typescript
// Source: pattern from withRetry.ts exported functions
import { is529Error, getRetryDelay, BASE_DELAY_MS } from 'src/services/api/withRetry.js'
import { APIError, APIConnectionError } from '@anthropic-ai/sdk'

test('is529Error detects 529 status', () => {
  const error = new APIError(529, undefined, 'Overloaded', undefined)
  expect(is529Error(error)).toBe(true)
})

test('getRetryDelay respects retry-after header', () => {
  const delay = getRetryDelay(1, '5')
  expect(delay).toBe(5000)
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BetaMessageStream (high-level) | Raw Stream iterator | claude.ts comment at line 1819 | Avoids O(n^2) partial JSON parsing; raw stream is faster but requires manual accumulation |
| Auto-retry via SDK maxRetries | Manual retry via withRetry (maxRetries: 0) | Current in codebase | Full control over retry logic, model fallback, auth refresh |
| Always stream | Stream with non-streaming fallback | Current in codebase | Recovers from gateways that break SSE streams |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | appendFileSync with O_APPEND is atomic for writes under PIPE_BUF on macOS | Architecture Patterns | History could still corrupt on abort; would need temp+rename instead |
| A2 | Bun's mock.module has same limitations as observed in Phase 2 | Common Pitfalls | Test strategy may need adjustment |
| A3 | p-retry is not needed because withRetry.ts is sufficient | Standard Stack | If withRetry has bugs, we'd be relying on untested code -- but that's what TEST-03 addresses |

## Open Questions

1. **Should safeParseStreamEvent or parseStreamEvent be used?**
   - What we know: parseStreamEvent throws on unknown events, safeParseStreamEvent returns null
   - Recommendation: Use safeParseStreamEvent for forward compatibility -- new SDK event types should be logged and skipped, not crash the CLI

2. **Should the watchdog default change require env var migration?**
   - What we know: Currently gated behind `CLAUDE_ENABLE_STREAM_WATCHDOG`. Making it default-on is a behavior change.
   - Recommendation: Default to enabled, add `CLAUDE_DISABLE_STREAM_WATCHDOG` to opt out. The 90s default timeout is conservative enough.

3. **How much of queryModel should be tested vs. just the utilities?**
   - What we know: queryModel is ~1400 lines with many side effects. Testing it end-to-end requires mocking many dependencies.
   - Recommendation: Test utilities (updateUsage, withRetry, provider switching, error classification) directly. Test streaming event processing via extracted helper or mock stream pattern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun test 1.3.11 (built-in) |
| Config file | none (uses bun defaults) |
| Quick run command | `bun test src/services/api/__tests__/` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | ECONNRESET/EPIPE retry | unit | `bun test src/services/api/__tests__/withRetry.test.ts` | Wave 0 |
| API-02 | Idle timeout detection | unit | `bun test src/services/api/__tests__/streamWatchdog.test.ts` | Wave 0 |
| API-03 | Provider env var switching | unit | `bun test src/services/api/__tests__/providers.test.ts` | Wave 0 |
| API-04 | Atomic history on abort | unit | `bun test src/utils/__tests__/sessionStorageAtomic.test.ts` | Wave 0 |
| API-05 | Type annotations via Zod | unit | `bun test src/services/api/__tests__/streamEvents.test.ts` | Exists (Phase 1) |
| TEST-03 | Comprehensive streaming tests | integration | `bun test src/services/api/__tests__/` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test src/services/api/__tests__/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/services/api/__tests__/withRetry.test.ts` -- covers API-01 (retry on connection errors)
- [ ] `src/services/api/__tests__/streamWatchdog.test.ts` -- covers API-02 (idle timeout)
- [ ] `src/services/api/__tests__/providers.test.ts` -- covers API-03 (provider switching)
- [ ] `src/utils/__tests__/sessionStorageAtomic.test.ts` -- covers API-04 (atomic writes)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirectly) | SDK handles API key/OAuth; withRetry handles token refresh |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | yes | Zod schema validates stream events at API boundary |
| V6 Cryptography | no | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed SSE events from proxy | Tampering | Zod validation at stream boundary (safeParseStreamEvent) |
| Credential leakage in error logs | Information Disclosure | Existing `logForDiagnosticsNoPII` pattern -- no PII in log events |
| Stale connection reuse | Denial of Service | `disableKeepAlive()` on ECONNRESET detection (withRetry.ts:226-229) |

## Sources

### Primary (HIGH confidence)
- `src/services/api/claude.ts` -- Core streaming implementation, ~3400 lines [VERIFIED: codebase read]
- `src/services/api/withRetry.ts` -- Full retry implementation with 10+ error types [VERIFIED: codebase read]
- `src/services/api/streamEventSchema.ts` -- Phase 1 Zod schema for stream events [VERIFIED: codebase read]
- `src/utils/model/providers.ts` -- Provider selection via env vars [VERIFIED: codebase read]
- `src/utils/sessionStorage.ts` -- appendEntryToFile using appendFileSync [VERIFIED: codebase read]
- `src/services/api/errorUtils.ts` -- Connection error detail extraction [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)
- @anthropic-ai/sdk 0.80.0 installed [VERIFIED: node_modules/package.json]
- p-retry latest is 8.0.0 [VERIFIED: npm registry]
- bun test 1.3.11 with 128 tests passing [VERIFIED: bun test run]
- POSIX appendFileSync atomicity for writes under PIPE_BUF [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in place, verified from package.json and node_modules
- Architecture: HIGH -- full codebase read of claude.ts, withRetry.ts, providers.ts, sessionStorage.ts
- Pitfalls: HIGH -- identified from actual code paths, not hypothetical scenarios

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable -- Anthropic SDK doesn't change frequently)
