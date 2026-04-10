# Context window detection fails for third-party Anthropic-compatible API providers

## Bug Description

When using a third-party provider that implements the Anthropic API (e.g., MiniMax via `https://api.minimax.io/anthropic`), Claude Code's context window detection falls back to the hardcoded default of 200,000 tokens, even when the underlying model may support a larger context window.

## Root Cause

In `src/utils/context.ts`, `getContextWindowForModel()` calls `getModelCapability()` to retrieve `max_input_tokens` from a cached capability list. However, `getModelCapability()` is gated by `isFirstPartyAnthropicBaseUrl()` in `src/utils/model/modelCapabilities.ts:46-51`:

```typescript
function isModelCapabilitiesEligible(): boolean {
  if (process.env.USER_TYPE !== 'ant') return false
  if (getAPIProvider() !== 'firstParty') return false
  if (!isFirstPartyAnthropicBaseUrl()) return false  // ← MiniMax fails here
  return true
}
```

Since MiniMax's base URL is `https://api.minimax.io/anthropic` (not `api.anthropic.com`), `isFirstPartyAnthropicBaseUrl()` returns `false`, and `getModelCapability()` returns `undefined`. This causes `getContextWindowForModel()` to fall through to `MODEL_CONTEXT_WINDOW_DEFAULT = 200_000`.

## Impact

- **AutoCompact triggers too aggressively**: With a 200K assumed window, AutoCompact threshold is `200,000 - 13,000 = 187,000` (93.5%). If MiniMax actually supports 1M, this is ~19% into the real window.
- **Users hit context limits unexpectedly**: The tool estimates the context is at 93.5% when it may actually be at only 18.7% for a 1M-capable model served through MiniMax.
- **Manual `/compact` becomes necessary**: Users report needing to run `/compact` manually when the auto-compact warning should have fired much earlier (or not at all).

## Reproduction Steps

1. Set `ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic`
2. Set `ANTHROPIC_AUTH_TOKEN=<MiniMax token>`
3. Set `ANTHROPIC_MODEL=MiniMax-M2.7` (or any model served through MiniMax)
4. Observe that `getContextWindowForModel("MiniMax-M2.7")` returns `200000` regardless of the model's actual capabilities
5. Note that AutoCompact warning fires at ~187K tokens (based on 200K window) rather than at a proportional threshold for the actual window

## Expected Behavior

Claude Code should either:
1. **Detect actual context window** for third-party providers (if the provider exposes model capabilities via their own endpoints)
2. **Allow manual override** via environment variable (`CLAUDE_CODE_MAX_CONTEXT_TOKENS`) or model configuration
3. **At minimum, not assume the smallest possible window** for unknown third-party providers — use a conservative estimate or probe the actual limit

## Proposed Fix

### Option A: Extend capability detection to third-party providers (medium effort)

Add a `getThirdPartyModelCapability()` path that tries to fetch from the provider's model list endpoint, or maintain a local override map for known MiniMax/Gateway models.

### Option B: Environment variable override for specific models (simple, immediate)

Add support for per-model context window overrides in `CLAUDE_CODE_MAX_CONTEXT_TOKENS`:
```
CLAUDE_CODE_MAX_CONTEXT_TOKENS="MiniMax-M2.7:1000000,claude-opus-4-6:1000000"
```

### Option C: Probe actual context limit on first use (most robust)

On the first API call with a new model, detect `413 Payload Too Large` and learn the actual limit, persisting it locally. Already done for team memory (`src/services/teamMemorySync/index.ts:529`), could be generalized.

## Workaround

Set `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000` in environment to override the auto-detected window for all models.

## Additional Context

- AutoCompact already has a circuit breaker (3 consecutive failures) to prevent hammering the API when context is irrecoverably over the limit (`src/services/compact/autoCompact.ts:70`)
- The 200K default is documented at `src/utils/context.ts:9` as a comment but may not reflect actual provider capabilities
- This issue affects any Anthropic-compatible third-party API (Azure, AWS Bedrock, Vertex, MiniMax, OpenRouter, etc.) where the provider URL doesn't match `api.anthropic.com`
