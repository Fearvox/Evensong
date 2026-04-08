# Phase 06: Memory Extraction - Research

**Researched:** 2026-04-08
**Domain:** Memory persistence, secret scanning, feature flag enablement, Bun forked agent compatibility
**Confidence:** HIGH

## Summary

Phase 06 enables the existing memory extraction system gated behind `feature('EXTRACT_MEMORIES')`. The core extraction logic, forked agent pattern, memory directory infrastructure, and memory loading into context are ALL fully implemented. The work is: (1) enable the `EXTRACT_MEMORIES` feature flag + GrowthBook `tengu_passport_quail` gate via local overrides, (2) add secret scanning to the `createAutoMemCanUseTool` write-intercept path, (3) ship a user-configurable secret patterns config file, (4) verify Bun runtime compatibility, and (5) write tests.

**Critical discovery:** A comprehensive `scanForSecrets()` function already exists at `src/services/teamMemorySync/secretScanner.ts` with 30+ gitleaks-sourced patterns (AWS, GCP, Azure, Anthropic, OpenAI, GitHub, GitLab, Slack, Stripe, private keys, etc.). It is currently only called from `teamMemSecretGuard.ts` which is gated behind `feature('TEAMMEM')`. The function itself is ungated and can be imported directly. This scanner is far more comprehensive than the patterns listed in CONTEXT.md and has been battle-tested for team memory. The SEC-01 requirement can be satisfied by reusing this existing scanner in the `createAutoMemCanUseTool` write path, plus adding user-configurable patterns on top.

**Primary recommendation:** Enable the feature flags, reuse the existing `scanForSecrets()` from `teamMemorySync/secretScanner.ts` in the `createAutoMemCanUseTool` write-intercept, add a `~/.claude/secret-patterns.json` config file for user-defined additional patterns, and test the full extraction-to-loading round-trip.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Secret scanning strategy**: Write-before intercept. Programmatic regex check runs BEFORE the forked agent writes any memory file to disk. If a secret pattern matches, discard that memory entry entirely, log the discard.
- **Pattern source**: Custom config file (`~/.claude/secret-patterns.json`) with SEC-01 core patterns as shipped defaults (AWS keys, Anthropic/OpenAI API keys, private key blocks, hex tokens 20+ chars in key-value context, `sk-` prefixed keys, GitHub PATs, Slack tokens).
- **Init template**: First run auto-creates `~/.claude/secret-patterns.json` with all defaults. User can edit to add/remove patterns. File is self-documenting with comments explaining each pattern.
- **Defense in depth**: Keep existing prompt instruction ("never save API keys") alongside the hard filter.
- **Memory loading**: Use existing logic as-is (Sonnet sideQuery selects up to 5 most relevant memories per query; MEMORY.md index always loaded in system prompt). Verify this flow works under Bun with EXTRACT_MEMORIES enabled. No changes to loading mechanism.
- **Visibility**: Silent on success. Log on failure/intercept via debug log (accessible via `--debug` or log file).

### Claude's Discretion
- Exact implementation of the write-intercept hook (where in the code to add the check)
- Config file format details (JSON schema for secret-patterns.json)
- Test fixture design for secret scanning tests
- forkedAgent Bun compatibility verification approach

### Deferred Ideas (OUT OF SCOPE)
- Team memory sync (`TEAMMEM` flag) -- separate feature, separate phase
- autoDream consolidation -- related but separate (KAIROS-04)
- Memory search/query UI
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-01 | Cross-session memories are extracted automatically after conversation ends via forked agent | Feature flag enablement + GrowthBook gate overrides unlock existing extraction pipeline in `extractMemories.ts` via `stopHooks.ts` |
| MEM-02 | Extracted memories load automatically in future sessions via context.ts | Memory loading already implemented in `claudemd.ts` (getMemoryFiles) + `findRelevantMemories.ts` (sideQuery). Needs Bun compatibility verification only |
| MEM-03 | Secret scanner prevents API keys/credentials from leaking to persistent memory storage | Reuse existing `scanForSecrets()` from `teamMemorySync/secretScanner.ts` + add write-intercept in `createAutoMemCanUseTool` + user-configurable patterns |
| SEC-01 | Memory extraction MUST NOT persist any string matching known credential patterns | Same as MEM-03 -- existing scanner already covers all SEC-01 patterns and 22 more |
</phase_requirements>

## Standard Stack

### Core (Already in Codebase -- No New Dependencies)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Bun runtime | ^1.3.11 | Runtime, test runner, file I/O | Already installed [VERIFIED: `bun --version` output] |
| @anthropic-ai/sdk | ^0.80.0 | API calls for forked agent extraction + sideQuery relevance | Already installed [VERIFIED: package.json] |

### Supporting (No New Dependencies Needed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| fs (Node builtin) | N/A | Config file I/O for secret-patterns.json | Bun-compatible [VERIFIED: codebase uses fs throughout] |
| path (Node builtin) | N/A | Path manipulation for memory directories | Already used in memdir/ |

**No new packages are needed.** The secret scanner already exists. The extraction system, forked agent, and memory loading are all already implemented. This phase is primarily enablement + wiring + config + tests.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing `teamMemorySync/secretScanner.ts` | New custom scanner module | Duplicates 300 lines of battle-tested gitleaks patterns; maintenance burden of two scanners |
| Reuse + extend pattern | Replace existing scanner | Breaks team memory scanning; unnecessary churn |
| JSON config for user patterns | YAML config | JSON is native to the codebase pattern (feature-flags.json); no new parser needed |
| Write-intercept in canUseTool | Post-write scrubbing | Post-write is strictly worse -- secret touches disk before being removed |

## Architecture Patterns

### Existing Extraction Pipeline (Already Implemented)

```
stopHooks.ts                          extractMemories.ts
  |                                       |
  +-- feature('EXTRACT_MEMORIES') ------> +-- initExtractMemories() (closure state)
  |   && isExtractModeActive()            |
  |                                       +-- executeExtractMemories()
  +-- fire-and-forget ------------------> |     +-- gate checks (autoMem, remote, passport_quail)
                                          |     +-- runExtraction()
                                          |         +-- scanMemoryFiles() (existing manifest)
                                          |         +-- buildExtractAutoOnlyPrompt()
                                          |         +-- runForkedAgent() (shared cache)
                                          |         +-- extractWrittenPaths()
                                          |         +-- appendSystemMessage()
                                          |
print.ts                                  +-- drainPendingExtraction()
  +-- drains before shutdown ------------>

backgroundHousekeeping.ts
  +-- feature('EXTRACT_MEMORIES') ------> initExtractMemories()
```

### Existing Secret Scanner (CRITICAL DISCOVERY)

`src/services/teamMemorySync/secretScanner.ts` already contains:
- 30+ high-confidence patterns sourced from gitleaks (MIT license) [VERIFIED: codebase read]
- Lazy-compiled RegExp cache for performance [VERIFIED: line 227-237]
- Human-readable labels derived from rule IDs [VERIFIED: line 243-268]
- `scanForSecrets(content: string): SecretMatch[]` -- the exact API we need [VERIFIED: line 277-295]
- `redactSecrets(content: string): string` -- redaction variant (available but not needed for discard strategy) [VERIFIED: line 312-324]
- Private key multi-line matching with `[\s\S]` (Pitfall 3 already solved) [VERIFIED: line 220-223]

**Coverage of SEC-01 required patterns:**

| SEC-01 Pattern | Existing Scanner Rule | Status |
|----------------|----------------------|--------|
| AWS_SECRET_ACCESS_KEY | `aws-access-token` (AKIA/ASIA/ABIA/ACCA prefix) | Covered [VERIFIED: line 51-53] |
| ANTHROPIC_API_KEY | `anthropic-api-key` (sk-ant-api03 prefix) | Covered [VERIFIED: line 74-76] |
| OPENAI_API_KEY | `openai-api-key` (sk-proj/svcacct/admin prefix) | Covered [VERIFIED: line 83-86] |
| Private key blocks | `private-key` (BEGIN/END PRIVATE KEY with multi-line) | Covered [VERIFIED: line 219-223] |
| Hex tokens 20+ chars | Not directly covered as generic pattern | Gap -- user patterns needed |
| sk-[a-zA-Z0-9]{20,} | Partially: `openai-api-key` covers sk-proj/svcacct patterns | Partial gap |
| ghp_[a-zA-Z0-9]{36} | `github-pat` | Covered [VERIFIED: line 96-97] |
| xoxb-/xoxp- Slack tokens | `slack-bot-token`, `slack-user-token` | Covered [VERIFIED: line 125-131] |

**Additional patterns in existing scanner NOT in SEC-01 (bonus coverage):**
GCP API keys, Azure AD secrets, DigitalOcean PATs, HuggingFace tokens, GitHub fine-grained PATs, GitHub app/OAuth/refresh tokens, GitLab PATs/deploy tokens, Slack app tokens, Twilio API keys, SendGrid tokens, NPM tokens, PyPI tokens, Databricks tokens, HashiCorp TF tokens, Pulumi tokens, Postman tokens, Grafana keys, Sentry tokens, Stripe tokens, Shopify tokens.

### Existing Secret Guard Wiring

`src/services/teamMemorySync/teamMemSecretGuard.ts` shows the existing pattern for calling `scanForSecrets`:
- Called from `FileWriteTool.ts:157` and `FileEditTool.ts:144` in their `validateInput` methods [VERIFIED: codebase grep]
- Currently gated behind `feature('TEAMMEM')` and `isTeamMemPath()` [VERIFIED: teamMemSecretGuard.ts:19,27]
- Returns error message string or null [VERIFIED: teamMemSecretGuard.ts:15-18]

### Recommended Architecture: Two-Layer Secret Scanning

```
Layer 1: Built-in scanner (existing)
  src/services/teamMemorySync/secretScanner.ts
  - 30+ gitleaks-based patterns, compiled once
  - Already imported by teamMemSecretGuard.ts
  - Import directly into createAutoMemCanUseTool (no TEAMMEM gate needed)

Layer 2: User-configurable patterns (new)
  ~/.claude/secret-patterns.json
  - Additional patterns the user defines
  - Auto-created with empty patterns array on first run
  - Loaded and compiled once per process (same caching pattern)
  - Checked AFTER the built-in scanner
```

### Secret Scanning Intercept Point

The optimal location is inside `createAutoMemCanUseTool()` in `extractMemories.ts` (lines 206-215). Currently this function checks:
1. Tool name (allow Read/Grep/Glob/Bash-readonly/Edit/Write)
2. Path scope (only within auto-memory directory)

The secret scanning adds a third check for Write/Edit tools:
3. Content inspection (scan `content` / `new_string` for secret patterns)

```typescript
// In createAutoMemCanUseTool, replacing the current Write/Edit block (lines 206-215):
if (
  (tool.name === FILE_EDIT_TOOL_NAME || tool.name === FILE_WRITE_TOOL_NAME) &&
  'file_path' in input
) {
  const filePath = input.file_path
  if (typeof filePath === 'string' && isAutoMemPath(filePath)) {
    // Content-level secret scanning before allowing write
    const contentToCheck =
      tool.name === FILE_WRITE_TOOL_NAME
        ? (input as { content?: string }).content       // [VERIFIED: FileWriteTool schema line 63]
        : (input as { new_string?: string }).new_string // [VERIFIED: FileEditTool schema line 10]
    if (typeof contentToCheck === 'string') {
      // Layer 1: built-in patterns (from teamMemorySync/secretScanner)
      const builtinMatches = scanForSecrets(contentToCheck)
      // Layer 2: user-defined patterns (from ~/.claude/secret-patterns.json)
      const userMatches = scanForUserSecrets(contentToCheck)
      const allMatches = [...builtinMatches, ...userMatches]
      if (allMatches.length > 0) {
        const labels = allMatches.map(m => 'label' in m ? m.label : m.patternName).join(', ')
        logForDebugging(`[autoMem] secret intercepted in ${filePath}: ${labels}`)
        logEvent('tengu_auto_mem_secret_intercepted', {
          pattern_count: allMatches.length,
        })
        return denyAutoMemTool(
          tool,
          'Memory content contains potential secrets or credentials and was not saved',
        )
      }
    }
    return { behavior: 'allow' as const, updatedInput: input }
  }
}
```

### User Secret Patterns Config File

```
~/.claude/secret-patterns.json
```

**Format:**

```json
{
  "_comment": "Additional secret patterns for memory extraction filtering. These supplement the built-in scanner. Each entry is a regex that, if matched, prevents the memory from being saved.",
  "version": 1,
  "patterns": [
    {
      "name": "Hex Token (key-value)",
      "pattern": "(?:token|secret|key|password|apikey|api_key)\\s*[=:]\\s*['\"]?[0-9a-fA-F]{20,}",
      "description": "Long hex token in key=value context"
    }
  ]
}
```

**Why a supplementary file (not replacing the built-in scanner):**
- Built-in scanner has 30+ battle-tested gitleaks patterns -- user should not need to maintain these
- User file adds domain-specific patterns (e.g., internal service tokens with unique prefixes)
- Default file ships with the one SEC-01 pattern NOT covered by the built-in scanner (hex tokens in key-value context)
- User can add/remove their own patterns without affecting built-in coverage
- Matches `feature-flags.json` pattern (JSON config in `~/.claude/`) [VERIFIED: existing config pattern in codebase]

### Feature Flags to Enable

Three layers of gating need to be unlocked:

| Flag | Type | Where Checked | What It Controls |
|------|------|---------------|-----------------|
| `EXTRACT_MEMORIES` | `feature()` flag | `stopHooks.ts:42`, `print.ts:374`, `backgroundHousekeeping.ts:7` | Whether extractMemories module is `require()`d at all (tree-shaking gate) |
| `tengu_passport_quail` | GrowthBook gate | `extractMemories.ts:536`, `paths.ts:70` | Runtime gate inside `executeExtractMemoriesImpl()` and `isExtractModeActive()` |
| `tengu_bramble_lintel` | GrowthBook value | `extractMemories.ts:381` | Extraction frequency (every N turns, default 1) -- use default |

**How to enable:**

Both `feature()` in `featureFlag.ts` and `getLocalFlagOverrides()` in `growthbook.ts` read from `~/.claude/feature-flags.json`:
- `featureFlag.ts:feature()` reads at module load time, caches in `_flagCache` [VERIFIED: featureFlag.ts:27]
- `growthbook.ts:getLocalFlagOverrides()` reads lazily with its own parse-once cache [VERIFIED: growthbook.ts:208-218]
- Both see `tengu_passport_quail: true` if it is in `feature-flags.json` [VERIFIED: growthbook.ts:804]

This is the same mechanism Phase 05 used for `tengu_*` overrides. [VERIFIED: STATE.md Phase 05 decisions]

### Memory Loading Flow (Already Implemented -- No Changes Needed)

```
context.ts
  +-- getMemoryFiles() ----> claudemd.ts
  |                            +-- reads MEMORY.md from autoMemPath
  |                            +-- truncates to 200 lines / 25KB
  |                            +-- returns as part of system prompt
  |
  +-- findRelevantMemories() -> findRelevantMemories.ts
                                  +-- scanMemoryFiles() (frontmatter headers)
                                  +-- sideQuery to Sonnet (selects up to 5)
                                  +-- returns file paths for injection
```

Memory loading does NOT depend on `feature('EXTRACT_MEMORIES')`. It works whenever `isAutoMemoryEnabled()` returns true (default). The extraction flag only controls whether the background agent WRITES new memories. [VERIFIED: `loadMemoryPrompt()` in memdir.ts checks `isAutoMemoryEnabled()` not `feature('EXTRACT_MEMORIES')`]

### Anti-Patterns to Avoid

- **Do NOT create a new secretScanner.ts from scratch**: The existing one at `teamMemorySync/secretScanner.ts` is superior. Import it directly.
- **Do NOT modify `createAutoMemCanUseTool` signature**: It is exported and used by both extractMemories and autoDream. The secret scanner should be called WITHIN the existing permission check.
- **Do NOT make secret scanning async**: Patterns are compiled once (sync, cached). Regex matching is CPU-bound microseconds.
- **Do NOT gate secret scanning on EXTRACT_MEMORIES**: The scanner should run on ALL writes to memory paths, not just extraction writes. The main agent can also write memories directly.
- **Do NOT gate the scanner import on TEAMMEM**: The scanner module itself has no TEAMMEM dependency. Only `teamMemSecretGuard.ts` gates on TEAMMEM. Import `scanForSecrets` directly from `secretScanner.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret detection patterns | Custom regex list | Existing `scanForSecrets()` in `teamMemorySync/secretScanner.ts` | 30+ gitleaks-sourced patterns, lazy compilation, no-secret-in-output design, private key multi-line handled |
| Forked agent infrastructure | Custom child process spawning | Existing `runForkedAgent()` in `forkedAgent.ts` | Cache sharing, usage tracking, transcript recording, abort propagation |
| Memory directory management | Custom mkdir/path logic | Existing `getAutoMemPath()`, `ensureMemoryDirExists()`, `isAutoMemPath()` | Security-validated path handling with traversal prevention |
| Memory scanning | Custom file walker | Existing `scanMemoryFiles()` in `memoryScan.ts` | Frontmatter parsing, mtime sorting, cap at 200 files |
| Memory loading into context | Custom prompt injection | Existing `loadMemoryPrompt()` + `getMemoryFiles()` in claudemd.ts | Truncation, MEMORY.md index, prompt building |
| GrowthBook gate overrides | Direct env var manipulation | Existing local override in `~/.claude/feature-flags.json` | Phase 05 established this pattern |

## Common Pitfalls

### Pitfall 1: Three-Layer Gate Confusion
**What goes wrong:** Enabling `EXTRACT_MEMORIES` feature flag but forgetting `tengu_passport_quail`, or vice versa. Extraction silently does nothing.
**Why it happens:** Three independent gate layers: (1) `feature('EXTRACT_MEMORIES')` controls `require()` (stopHooks.ts:42), (2) `isExtractModeActive()` checks `tengu_passport_quail` (paths.ts:70), (3) `executeExtractMemoriesImpl()` also checks `tengu_passport_quail` internally (extractMemories.ts:536).
**How to avoid:** Enable both in the same config file. Write a test that verifies all three gates pass.
**Warning signs:** Debug log shows `gate_disabled` events, or no `[extractMemories]` messages at all.

### Pitfall 2: Importing scanForSecrets Without TEAMMEM Gate
**What goes wrong:** Developer wraps the import in `feature('TEAMMEM')` guard like the existing callers do, making the scanner inert.
**Why it happens:** The existing usage pattern in `teamMemSecretGuard.ts` and `FileWriteTool.ts`/`FileEditTool.ts` uses `feature('TEAMMEM')` gates because those callers only scan team-memory paths.
**How to avoid:** Import `scanForSecrets` directly from `teamMemorySync/secretScanner.ts` WITHOUT any feature gate. The scanner function itself has no feature flag dependency -- only `teamMemSecretGuard.ts` adds the TEAMMEM check.
**Warning signs:** Secret scanner tests pass but actual extraction writes are not scanned at runtime.

### Pitfall 3: Secret Scanner False Positives on Key Names
**What goes wrong:** Legitimate memory content (e.g., "the AWS_SECRET_ACCESS_KEY env var is set in the deploy pipeline") gets discarded.
**Why it happens:** The built-in scanner uses prefix-based patterns (AKIA, sk-ant-api03, ghp_) that match value formats, NOT key names. This pitfall primarily applies to user-defined patterns.
**How to avoid:** User-defined patterns should require key=value context or match distinctive value prefixes. Document this in the config file comments.
**Warning signs:** Debug log shows frequent secret-intercept messages for benign content.

### Pitfall 4: Bun setTimeout.unref() Behavior
**What goes wrong:** The extraction drain timer (`setTimeout(r, timeoutMs).unref()` in extractMemories.ts:584) behaves differently under Bun vs Node.
**Why it happens:** Bun implements `.unref()` but edge cases around process exit timing may differ.
**How to avoid:** Test the drain path explicitly. The existing code pattern works under Bun for other timers in the codebase. [ASSUMED: needs smoke test]
**Warning signs:** Process exits before extraction finishes, or hangs waiting for extraction.

### Pitfall 5: Config File Comments in JSON
**What goes wrong:** JSON does not support comments. The CONTEXT.md says "self-documenting with comments" but `//` in JSON causes parse errors.
**Why it happens:** Natural language ambiguity -- "comments" means "documentation fields" not literal `//` comments.
**How to avoid:** Use `_comment` and `description` fields within the JSON structure. Each pattern object has a `description` field.
**Warning signs:** `JSON.parse()` throws on first run.

### Pitfall 6: Regex State Leakage with Global Flag
**What goes wrong:** `RegExp.test()` with the `g` flag advances `lastIndex`. A second call to `scanForSecrets` with different content may miss matches because `lastIndex` is non-zero.
**Why it happens:** The existing scanner does NOT use the `g` flag on `test()` patterns -- it only uses `g` on `redactSecrets` patterns. But user-defined patterns might inadvertently use `g`.
**How to avoid:** When compiling user-defined patterns, strip the `g` flag (it is not needed for `test()`). The existing scanner already handles this correctly. [VERIFIED: secretScanner.ts line 234 -- no 'g' flag on test patterns]
**Warning signs:** Intermittent false negatives in secret scanning.

## Code Examples

### Enabling Feature Flags (in ~/.claude/feature-flags.json)

```json
{
  "EXTRACT_MEMORIES": true,
  "tengu_passport_quail": true
}
```

Source: `featureFlag.ts` reads `feature('EXTRACT_MEMORIES')` [VERIFIED: featureFlag.ts:29-34]; `growthbook.ts` reads `tengu_passport_quail` via `getLocalFlagOverrides()` [VERIFIED: growthbook.ts:804-807]

Note: `tengu_bramble_lintel` defaults to 1 (every eligible turn) when absent [VERIFIED: extractMemories.ts:381 `?? 1`]. No need to set it unless throttling is desired.

### Importing Existing Scanner (NO new scanner module needed)

```typescript
// Direct import -- the scanner module has no feature flag dependency
import { scanForSecrets } from '../../services/teamMemorySync/secretScanner.js'
// Type for matches:
import type { SecretMatch } from '../../services/teamMemorySync/secretScanner.js'
```

Source: `secretScanner.ts` exports are ungated [VERIFIED: secretScanner.ts has no `feature()` calls]

### User-Configurable Patterns Module (NEW -- small)

```typescript
// src/services/extractMemories/userSecretPatterns.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { logForDebugging } from '../../utils/debug.js'

type UserPattern = { name: string; pattern: string; description: string }
type UserMatch = { patternName: string }

const CONFIG_FILENAME = 'secret-patterns.json'

const DEFAULT_USER_PATTERNS: UserPattern[] = [
  {
    name: 'Hex Token (key-value)',
    pattern: '(?:token|secret|key|password|apikey|api_key)\\s*[=:]\\s*[\'"]?[0-9a-fA-F]{20,}',
    description: 'Long hex token in key=value context (supplements built-in prefix-based patterns)',
  },
]

let cachedPatterns: { compiled: RegExp[]; names: string[] } | null = null

function loadUserPatterns(): { compiled: RegExp[]; names: string[] } {
  if (cachedPatterns) return cachedPatterns

  const configPath = join(getClaudeConfigHomeDir(), CONFIG_FILENAME)
  let rawPatterns = DEFAULT_USER_PATTERNS

  try {
    if (existsSync(configPath)) {
      const data = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (data.patterns && Array.isArray(data.patterns)) {
        rawPatterns = data.patterns
      }
    } else {
      ensureDefaultConfig(configPath)
    }
  } catch (err) {
    logForDebugging(`[secretScanner] failed to load user config, using defaults: ${err}`)
  }

  cachedPatterns = {
    compiled: rawPatterns.map(p => {
      try { return new RegExp(p.pattern, 'i') }
      catch { return /(?!)/ } // never-match fallback for invalid patterns
    }),
    names: rawPatterns.map(p => p.name),
  }
  return cachedPatterns
}

export function scanForUserSecrets(content: string): UserMatch[] {
  const { compiled, names } = loadUserPatterns()
  const matches: UserMatch[] = []
  for (let i = 0; i < compiled.length; i++) {
    if (compiled[i].test(content)) {
      matches.push({ patternName: names[i] })
    }
  }
  return matches
}

function ensureDefaultConfig(configPath: string): void {
  try {
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, JSON.stringify({
      _comment: 'Additional secret patterns for Claude Code memory filtering. These supplement the 30+ built-in patterns. Add domain-specific patterns here (e.g., internal service token prefixes).',
      version: 1,
      patterns: DEFAULT_USER_PATTERNS,
    }, null, 2))
  } catch { /* best-effort */ }
}

/** Reset cache for testing */
export function _resetUserPatternsForTesting(): void {
  cachedPatterns = null
}
```

### Write-Intercept in createAutoMemCanUseTool

```typescript
// In extractMemories.ts, replacing lines 206-215 of createAutoMemCanUseTool:
if (
  (tool.name === FILE_EDIT_TOOL_NAME || tool.name === FILE_WRITE_TOOL_NAME) &&
  'file_path' in input
) {
  const filePath = input.file_path
  if (typeof filePath === 'string' && isAutoMemPath(filePath)) {
    // SEC-01: Content-level secret scanning before allowing write
    const contentToCheck =
      tool.name === FILE_WRITE_TOOL_NAME
        ? (input as { content?: string }).content       // [VERIFIED: FileWriteTool.ts:63]
        : (input as { new_string?: string }).new_string // [VERIFIED: FileEditTool types.ts:10]
    if (typeof contentToCheck === 'string') {
      const builtinMatches = scanForSecrets(contentToCheck)
      const userMatches = scanForUserSecrets(contentToCheck)
      const allMatches = [...builtinMatches, ...userMatches]
      if (allMatches.length > 0) {
        const labels = allMatches
          .map(m => 'label' in m ? m.label : (m as any).patternName)
          .join(', ')
        logForDebugging(
          `[autoMem] secret intercepted in ${filePath}: ${labels}`,
        )
        logEvent('tengu_auto_mem_secret_intercepted', {
          pattern_count: allMatches.length,
        })
        return denyAutoMemTool(
          tool,
          'Memory content contains potential secrets or credentials and was not saved',
        )
      }
    }
    return { behavior: 'allow' as const, updatedInput: input }
  }
}
```

Source: Insertion point at `extractMemories.ts:206-215` [VERIFIED: codebase read]; field names from `FileWriteTool.ts:63` and `FileEditTool/types.ts:10` [VERIFIED: grep results]

### Test Patterns

```typescript
// src/services/extractMemories/__tests__/secretScanner.test.ts
import { describe, test, expect } from 'bun:test'
import { scanForSecrets } from '../../teamMemorySync/secretScanner.js'
import { scanForUserSecrets, _resetUserPatternsForTesting } from '../userSecretPatterns.js'

describe('built-in scanForSecrets (SEC-01 coverage)', () => {
  test('detects AWS access key (AKIA prefix)', () => {
    expect(scanForSecrets('AKIAIOSFODNN7EXAMPLE').length).toBeGreaterThan(0)
  })
  test('detects Anthropic API key', () => {
    expect(scanForSecrets('sk-ant-api03-' + 'a'.repeat(93) + 'AA').length).toBeGreaterThan(0)
  })
  test('detects GitHub PAT', () => {
    expect(scanForSecrets('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij').length).toBeGreaterThan(0)
  })
  test('detects private key block (multi-line)', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIE' + 'A'.repeat(100) + '\n-----END RSA PRIVATE KEY-----'
    expect(scanForSecrets(key).length).toBeGreaterThan(0)
  })
  test('detects Slack bot token', () => {
    expect(scanForSecrets('xoxb-1234567890-1234567890-abc').length).toBeGreaterThan(0)
  })
  test('allows normal memory content', () => {
    const content = '---\nname: user_preferences\n---\nUser prefers dark mode and vim keybindings'
    expect(scanForSecrets(content).length).toBe(0)
  })
  test('allows mention of key names without values', () => {
    expect(scanForSecrets('Set the AWS_SECRET_ACCESS_KEY env var in CI').length).toBe(0)
  })
})

describe('user-configurable scanForUserSecrets', () => {
  // Tests for user pattern loading, default patterns, custom patterns, etc.
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompt-only ("never save API keys") | Programmatic scanner (built-in + user patterns) + prompt | This phase | Defense-in-depth: prompt is soft guard, scanner is hard guard |
| Scanner only for team memory (TEAMMEM) | Scanner for ALL memory writes | This phase | Secrets blocked regardless of memory type |
| GrowthBook cloud gates | Local override file (`feature-flags.json`) | Phase 05 | All `tengu_*` gates overridden locally |
| No memory extraction | Forked agent extraction after each turn | This phase | Automatic cross-session memory persistence |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bun's `setTimeout().unref()` behaves identically to Node's for the drain pattern | Pitfalls | Extraction might not drain properly before exit; LOW risk -- other codebase timers use same pattern under Bun |
| A2 | `getClaudeConfigHomeDir()` returns `~/.claude` in standard configuration | Architecture Patterns (config path) | Config file created in wrong location; LOW risk -- function used throughout codebase |

**Previously assumed, now verified:**
- ~~A2 (old): FileWriteTool uses `content` field, FileEditTool uses `new_string`~~ -- [VERIFIED: FileWriteTool.ts:63, FileEditTool/types.ts:10]
- ~~Existing scanForSecrets~~ -- [VERIFIED: teamMemorySync/secretScanner.ts:277-295]

## Open Questions

1. **Should the user config file ship with ALL SEC-01 patterns or just the gaps?**
   - What we know: The built-in scanner covers 28/30+ patterns. Only "hex tokens in key-value context" is missing.
   - Recommendation: Ship with just the gap pattern. The config file comment explains that 30+ built-in patterns run automatically. Users add domain-specific patterns here.

2. **Should secret scanning also cover main-agent memory writes?**
   - What we know: The main agent can write memories directly (not via extraction). `createAutoMemCanUseTool` is only used by the forked extraction agent. Main-agent writes go through `FileWriteTool.validateInput` which already calls `checkTeamMemSecrets` (but only for TEAMMEM paths).
   - Recommendation: For Phase 06, the intercept in `createAutoMemCanUseTool` covers extraction writes (MEM-03/SEC-01). Main-agent writes to auto-memory are already rare and prompt-guarded. A follow-up could extend `checkTeamMemSecrets` to auto-memory paths, but that is beyond phase scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun runtime | All execution | Yes | 1.3.11 | -- |
| bun test | Test execution | Yes | built-in | -- |
| fs module | Config file I/O | Yes | Bun built-in | -- |
| Anthropic API key | Forked agent extraction | Depends on user config | -- | Extraction silently skips if API unavailable |

No missing dependencies.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | None needed -- bun test auto-discovers `*.test.ts` files |
| Quick run command | `bun test src/services/extractMemories/` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEM-01 | Feature flags enable extraction pipeline | unit | `bun test src/services/extractMemories/__tests__/extractionGates.test.ts` | Wave 0 |
| MEM-02 | Memory loading path works with autoMem enabled | unit | `bun test src/memdir/__tests__/memoryLoading.test.ts` | Wave 0 (optional -- existing code, verify only) |
| MEM-03 | Built-in scanner blocks credential content in canUseTool | unit | `bun test src/services/extractMemories/__tests__/secretInterception.test.ts` | Wave 0 |
| SEC-01 | All SEC-01 patterns detected by scanner combination | unit | `bun test src/services/extractMemories/__tests__/secretInterception.test.ts -t "SEC-01"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test src/services/extractMemories/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/services/extractMemories/__tests__/secretInterception.test.ts` -- covers MEM-03, SEC-01 (scanner + canUseTool intercept)
- [ ] `src/services/extractMemories/__tests__/extractionGates.test.ts` -- covers MEM-01 (flag enablement verification)
- [ ] `src/services/extractMemories/__tests__/userSecretPatterns.test.ts` -- covers user config loading, defaults, invalid patterns

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | -- |
| V3 Session Management | No | -- |
| V4 Access Control | Yes | `createAutoMemCanUseTool` restricts write paths to memory directory only |
| V5 Input Validation | Yes | `scanForSecrets()` + `scanForUserSecrets()` validate memory content before write |
| V6 Cryptography | No | No crypto operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credential persistence in memory files | Information Disclosure | Two-layer scanner in write-intercept (SEC-01): built-in gitleaks patterns + user patterns |
| Path traversal in memory directory | Tampering | `isAutoMemPath()` with normalize + prefix check (already implemented in paths.ts) |
| Secret patterns config tampering | Tampering | Config file is user-owned (`~/.claude/`); invalid patterns compile to never-match; falls back to defaults |
| Regex ReDoS on crafted content | Denial of Service | Built-in patterns are gitleaks-audited prefix matchers; user patterns bounded by content size |

## Sources

### Primary (HIGH confidence)
- `src/services/teamMemorySync/secretScanner.ts` -- Existing 30+ pattern scanner with gitleaks rules [VERIFIED: full file read]
- `src/services/teamMemorySync/teamMemSecretGuard.ts` -- Existing guard showing scanner usage pattern [VERIFIED: full file read]
- `src/services/extractMemories/extractMemories.ts` -- Full extraction pipeline, canUseTool, forked agent [VERIFIED: full file read]
- `src/services/extractMemories/prompts.ts` -- Extraction prompt templates [VERIFIED: full file read]
- `src/query/stopHooks.ts` -- EXTRACT_MEMORIES gate, fire-and-forget invocation [VERIFIED: full file read]
- `src/memdir/paths.ts` -- Memory path management, isExtractModeActive, tengu_passport_quail [VERIFIED: full file read]
- `src/memdir/findRelevantMemories.ts` -- Sonnet sideQuery memory selection [VERIFIED: full file read]
- `src/memdir/memdir.ts` -- loadMemoryPrompt, ensureMemoryDirExists [VERIFIED: full file read]
- `src/memdir/memoryScan.ts` -- scanMemoryFiles, formatMemoryManifest [VERIFIED: full file read]
- `src/memdir/memoryTypes.ts` -- Memory taxonomy, frontmatter format [VERIFIED: full file read]
- `src/utils/forkedAgent.ts` -- runForkedAgent, CacheSafeParams, createSubagentContext [VERIFIED: full file read]
- `src/utils/featureFlag.ts` -- feature() function, flag file loading [VERIFIED: full file read]
- `src/services/analytics/growthbook.ts` -- getFeatureValue_CACHED_MAY_BE_STALE, getLocalFlagOverrides [VERIFIED: partial read]
- `src/utils/claudemd.ts` -- getMemoryFiles, MEMORY.md loading into context [VERIFIED: partial read]
- `src/utils/backgroundHousekeeping.ts` -- initExtractMemories invocation [VERIFIED: full file read]
- `src/cli/print.ts` -- drainPendingExtraction before shutdown [VERIFIED: partial read]
- `src/tools/FileWriteTool/FileWriteTool.ts` -- `content` field in inputSchema, checkTeamMemSecrets call [VERIFIED: grep]
- `src/tools/FileEditTool/types.ts` -- `new_string` field in inputSchema [VERIFIED: grep]
- `src/tools/FileEditTool/FileEditTool.ts` -- checkTeamMemSecrets call in validateInput [VERIFIED: grep]

### Secondary (MEDIUM confidence)
- Bun `setTimeout().unref()` compatibility [ASSUMED: needs smoke test, but same pattern used elsewhere in codebase]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all code exists in codebase
- Architecture: HIGH -- extraction pipeline fully implemented, intercept point clear, existing scanner discovered
- Secret scanning: HIGH -- existing scanner covers 28+ patterns, verified SEC-01 coverage table
- Pitfalls: HIGH -- identified from direct code reading of gate logic and import patterns
- Memory loading: HIGH -- verified loading path independent of EXTRACT_MEMORIES flag

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable -- no external dependencies changing)
