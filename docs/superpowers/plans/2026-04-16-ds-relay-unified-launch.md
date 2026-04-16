# ds Relay-Unified Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ds-max` 启动时默认启用 Vercel relay，所有 API 请求经过 relay 路由到 MiniMax/xAI/OpenRouter 等 provider。

**Architecture:** 在 `ds-max` 的 shell alias 里加载 `.env.relay.ccr`，在 `client.ts` 里通过 `CCR_RELAY_URL` env var 把 SDK 的 `baseURL` 指向 relay。Relay 是透明代理，model 在 body 里自带，relay 根据 model 路由。

**Tech Stack:** Shell (zsh), Node.js env vars, Bun, Vercel serverless

---

### Task 1: Enable relay env in `ds-max`

**Files:**
- Modify: `~/.claude/ds-aliases.sh` (no CCR repo file — user's global config)

- [ ] **Step 1: Read current `ds-max` function**

Current `ds-max` at line 90-96:
```zsh
ds-max() {
  _ds_ensure_oauth || return 1
  cd "$_DS_DIR" && \
    ENABLE_CLAUDEAI_MCP_SERVERS=0 \
    API_TIMEOUT_MS=3000000 \
    bun run src/entrypoints/cli.tsx "${_DS_SAFE_SETTINGS_ARGS[@]}" \
      --model "claude-opus-4-6[1m]" --effort high --dangerously-skip-permissions "$@"
}
```

- [ ] **Step 2: Add `_ds_enable_relay_if_available` call**

Replace the function body with:
```zsh
ds-max() {
  _ds_ensure_oauth || return 1
  _ds_enable_relay_if_available
  cd "$_DS_DIR" && \
    ENABLE_CLAUDEAI_MCP_SERVERS=0 \
    API_TIMEOUT_MS=3000000 \
    bun run src/entrypoints/cli.tsx "${_DS_SAFE_SETTINGS_ARGS[@]}" \
      --model "claude-opus-4-6[1m]" --effort high --dangerously-skip-permissions "$@"
}
```

This sources `.env.relay.ccr` (which sets `RELAY_URL` and `RELAY_KEY`) before launching.

- [ ] **Step 3: Verify `.env.relay.ccr` has `RELAY_URL`**

```bash
cat ~/.claude/.env.relay.ccr
```

Expected output:
```
RELAY_URL=https://dash-proof.vercel.app/api/relay
RELAY_KEY=16a2f3f77721959bb0c70aad6275c9ff97663dd2dd7914c8a93b97d4a80a9969
```

`RELAY_URL` is sourced by `_ds_enable_relay_if_available` and becomes `process.env.RELAY_URL` in the child process. `client.ts` reads this as `process.env.RELAY_URL`. `RELAY_KEY` is read by the Vercel relay server (not by the client).

- [ ] **Step 4: Commit (not required — this is user's global config)**

No git commit needed — `~/.claude/ds-aliases.sh` is outside the repo.

---

### Task 2: Add `CCR_RELAY_URL` env var support in `client.ts`

**Files:**
- Modify: `src/services/api/client.ts`

- [ ] **Step 1: Read the relevant section of `client.ts` around line 129-134**

Find the section that computes `effectiveBaseUrl`. Current logic:
```typescript
const thirdPartyOverride = getTemporaryThirdPartyClientOverride()
const effectiveBaseUrl = thirdPartyOverride?.baseURL ?? process.env.ANTHROPIC_BASE_URL
```

- [ ] **Step 2: Add `RELAY_URL` to the fallback chain**

Change the `effectiveBaseUrl` line to:
```typescript
const relayUrl = process.env.RELAY_URL
const effectiveBaseUrl = thirdPartyOverride?.baseURL
  ?? relayUrl
  ?? process.env.ANTHROPIC_BASE_URL
```

The `RELAY_URL` env var is set by the sourced `.env.relay.ccr` in the shell alias. `RELAY_KEY` is only read by the Vercel relay server, not by the client.

- [ ] **Step 3: Run build to verify**

```bash
cd ~/claude-code-reimagine-for-learning
bun run build
```

Expected: `Bundled 5624 modules` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/api/client.ts
git commit -m "feat(client): support CCR_RELAY_URL for relay-backed requests"
```

---

### Task 3: End-to-end verification

**Files:**
- No new files — use existing REPL

- [ ] **Step 1: Reload ds-aliases**

In a new shell or by running:
```bash
source ~/.claude/ds-aliases.sh
```

- [ ] **Step 2: Run ds-max and send a test prompt**

```bash
echo "say hello" | ds-max
```

Expected: REPL launches, model responds. The request goes through the relay.

- [ ] **Step 3: Verify relay routing (check Vercel logs)**

Alternatively, use the relay debug endpoint:
```bash
curl "https://dash-proof.vercel.app/api/relay?debug=env"
```

Expected: `hasMinimax: true` and valid `RELAY_KEY_hex`.

- [ ] **Step 4: Commit**

No commit needed for verification.

