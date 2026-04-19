# SEED: harness.ts spawnCLI — OpenAI-compat routing for non-Anthropic OR models

**Planted:** 2026-04-18T08:05 EDT by Claude Opus 4.7 (pua:pro regimen session)
**Type:** architectural improvement
**Priority:** medium (R066 unblocked via workaround, but multi-turn agent benchmark still blocked)
**Surfaces when:** any of the trigger conditions below fire

---

## Context (why this exists)

During R066 benchmark kickoff on 2026-04-18, `batch.ts` / `runBenchmark` / `spawnCLI` path produced HTTP 403 "Key limit exceeded" on all 4 non-Anthropic OR models (qwen, kimi, glm) despite the same key successfully calling `/chat/completions` OpenAI-compat endpoint.

**Root cause isolated** (see `.claude/verify/20260418-*` chain + commit 48d831f message):
- `harness.ts:344-347` sets `env.ANTHROPIC_BASE_URL = 'https://openrouter.ai/api/v1'` + `env.ANTHROPIC_MODEL = provider.modelId`
- `spawnCLI` launches `bun run src/entrypoints/cli.tsx -p` (CCR print mode)
- CCR print mode goes through Anthropic SDK → sends `POST <base>/v1/messages` (Anthropic-compat)
- OR's Anthropic-compat proxy is a paid-tier subscription feature not in our base OR credit. Non-Anthropic-brand models get 403.
- elephant-alpha is the lone exception (OR-native free stealth).

**Workaround shipped (A):** `benchmarks/evensong/or-shot.ts` direct fetch `/chat/completions`, single-turn, no CCR spawn. Lite metrics (grep-based). `registry_schema='or-shot-v1'`.

**What this seed proposes (B):** Make `harness.ts:spawnCLI` provider-aware — route non-Anthropic OR models through CCR's `ProviderRouter` / `OpenAICompatibleClient` so they get the full agent loop (multi-turn tool calling, AgentTool spawn, self-repair iterations). Restores R011 benchmark semantics for cross-family models.

**SCOPE UPDATE (2026-04-18 09:58):** REPL chat round-trip **已通过验证** — `bun run dev` → `/provider or-qwen-plus` → "hello say pong only" → `pong`. Pure chat works.

**SCOPE UPDATE v3 (2026-04-18 10:15):** 4-stage REPL test reveals B seed is much deeper than initially scoped. `1919cef` (OpenAICompatibleClient.tools send) was a real fix but **never reached at runtime** because `claude.ts:1165-1168` drops tools on forward. User-observed symptoms:
  - (T1) New REPL starts with banner `qwen/qwen3.6-plus · Claude Max` but first user message still 401s against Anthropic OAuth
  - (T2) /provider or-qwen-plus manually after startup: chat works, but request to agent task produces Anthropic-format `{"type":"tool_use",...}` text block IN CONTENT, not a real `tool_calls` OpenAI response
  - (T3) Qwen is hallucinating the tool_use JSON from its training priors because CCR never sent the `tools` field to OR — Qwen has no idea what tools actually exist
  - (T4) multi-turn follow-up cannot execute because nothing was parsed as actionable tool call

Real 4-sub-bug inventory (was "1 fix", now architecture):

  ✅ **IN #1 (Startup state sync)**: REPL boot reads persisted `mainLoopModel` and sets banner, but leaves `getActiveProvider()` returning 'anthropic'. First user message flows through `claude.ts` Anthropic SDK + OAuth → 401 if tools/MCP/beta headers are active. Fix: when mainLoopModel is a non-Anthropic preset, also `setActiveProvider(presetName)` at startup.

  ✅ **IN #2 (claude.ts forward tools to provider)**: `claude.ts:1165-1168` calls `provider.createMessage({ systemPrompt, messages })` without tools. Fix: also collect the tool schemas built earlier in the function (see `queryCheckpoint('query_tool_schema_build_start')` region around L1227+) and pass them. OpenAICompatibleClient side is already ready (commit `1919cef`).

  ✅ **IN #3 (Response tool_calls → Anthropic tool_use parse)**: claude.ts:1190-1200 already has partial code that maps `result.toolCalls[]` into Anthropic-style `{type:'tool_use'}` content blocks. Needs verification that downstream consumers (tool executor in query.ts) pick these up correctly, and that the subsequent turn's `messages` array encodes the tool_result in a format OpenAI providers accept (this is the multi-turn history adapter, was called out in v2).

  ✅ **IN #4 (AgentTool subagent spawn)**: separate path where main agent invokes a subagent that itself targets an OR non-Anthropic model — currently routes through Anthropic SDK for the spawn call. Same 401/missing-tool class of failure.

  ✅ **IN #5 (benchmarks/evensong/harness.ts)**: batch.ts non-interactive harness still uses ANTHROPIC_BASE_URL env override.

Architecture readiness matrix (revised):
  - Qwen 3.6 Plus as chat-only main agent (no tools at all): **ready today** ✓
  - Qwen 3.6 Plus as tool-using main agent: needs #1 + #2 + #3 verification (half a day)
  - Multi-turn tool loop with tool_result history: needs #3 fully (hours after #1+#2)
  - "Opus 4.7 + Qwen subagent" three-star architecture: needs #1-#4 (days)
  - Full benchmark harness cross-model multi-turn: needs #1-#5 (days+)

User at 2026-04-18 10:15 verdict: **4-time recurrence of same-root bug → stop whack-a-mole, batch fix in dedicated B seed PR**.

---

## Trigger conditions (surface this seed when)

Any of these, in priority order:

1. **User explicitly requests multi-turn agent benchmark on OR China family** — e.g. "we need real R011-equivalent data for qwen/kimi/glm, not just single-shot"
2. **User asks to add a new non-Anthropic OR model to BENCHMARK_MODELS** — this is exactly when harness.ts needs the branch
3. **Anthropic upstream ships adaptive-thinking clamp fix** — natural batching point to also tackle harness.ts refactor (both require touching `claude.ts` surrounding code)
4. **Paper review cycle starts** — reviewers will likely ask "why only single-turn for OR family?"
5. **OR BYOK or Anthropic-compat pricing changes** — if OR removes the Anthropic-compat subscription gate, this seed is no longer load-bearing
6. **"Opus 4.7 + Qwen3.6-Plus(1M) + MiniMax-M2.7 三星架构" 落地** (Nolan 2026-04-18 post-R070 确认,原 Kimi 方案被 Qwen 替代)  — 主 Opus 4.7 + **Qwen 3.6 Plus (1M ctx, $0.325/$1.95, Arena Code Top 9%) 作为主 subagent** + MiniMax 作为 thinking-heavy 独立探索 subagent。R070 benchmark 证据:55 test + 7 describe + 76 expect + 3 svc hybrid + 5min + $0.032/run,全维度碾压 R069 qwen3-max,且结构化比 Kimi 更贴 Opus R011 风格(每 describe 含 ~8 tests,分层清晰)。MiniMax 路径已通 (`minimax-direct` Anthropic-compat `api.minimax.io/anthropic`);**Qwen3.6-plus 部分正是此 seed 要解锁** — AgentTool spawn 对 `or-qwen-plus` 目前走 CCR 的 Anthropic SDK path,会撞和 R066 batch.ts 同样的 OR Anthropic-compat 403。B1 实施后,`or-qwen-plus` 作为 teammate 模型通过 ProviderRouter OpenAICompatibleClient 路由,AgentTool prompt 可按任务类型分派:
  - "读整个代码库 + 总结" → Qwen 3.6 Plus 1M ctx (主力)
  - "深度思考单一问题" → MiniMax-M2.7
  - Kimi K2.5 降为 "免费 long-context 备胎"(低优先,Cloudflare cache 11% 差)
  成本估:单 session 主 Opus + 10 次 Qwen subagent 调用 ≈ $0.50,比纯 Opus 4.7 multi-turn 成本低 70%+。**这是本 seed 最高 ROI near-term driver。**

---

## Implementation sketch

### Option B1 — CCR print mode gains `--provider <name>` flag

Add CLI flag to `src/main.tsx` that sets active provider via ProviderRouter *instead of* relying on ANTHROPIC_BASE_URL override. Benefits: orthogonal to existing Anthropic SDK path, no DRI-warning touchpoint.

```diff
 // src/main.tsx commander options
+.option('--provider <name>', 'Active provider preset name (routes through ProviderRouter instead of Anthropic SDK)')
```

Then in harness.ts:
```diff
 if (provider.provider === 'grok-native') {
   cmd = 'grok'; args = ['-p', prompt, ...]
+} else if (provider.provider === 'openrouter' && !isAnthropicBrand(provider.modelId)) {
+  cmd = 'bun'
+  args = ['run', ccbPath, '-p', '--dangerously-skip-permissions', '--provider', provider.name]
 } else {
   cmd = 'bun'; args = ['run', ccbPath, '-p', '--dangerously-skip-permissions']
 }
```

CCR print mode's top-level API dispatch must then check for `options.provider` before building Anthropic SDK request; if set, use `getProviderRouter().getProvider(options.provider).createMessage(...)` instead.

### Option B2 — harness-side pre-flight dispatch

Skip CCR spawn entirely for OR OpenAI-compat models; use `OpenAICompatibleClient` directly (imported from `src/services/providers/OpenAICompatibleClient.ts`) and run the full agent loop inline in harness. More invasive but pure in harness layer.

### Option B3 — Hybrid

Use `or-shot.ts` (current) + extend with multi-turn tool-calling loop: re-fetch with accumulated `messages` array, wire bun `Read`/`Write`/`Bash` tools to OR tools format. Keeps CCR untouched but duplicates agent logic.

**Recommended when seed fires:** B1 (lowest blast radius, reuses CCR's existing OpenAICompatibleClient).

---

## Related files

- `src/services/providers/ProviderRouter.ts` — has `or-qwen`/`or-kimi`/`or-glm`/`or-elephant-alpha` presets
- `src/services/providers/OpenAICompatibleClient.ts` — already handles chat/completions for REPL
- `src/services/api/claude.ts:1764` — sensitive DRI block, DO NOT touch during this seed
- `benchmarks/evensong/harness.ts:344-347` — where ANTHROPIC_BASE_URL override happens
- `benchmarks/evensong/or-shot.ts` — current single-turn workaround (reference for lite metrics)
- `benchmarks/evensong/PREDICTIONS-R065.md` / `.claude/verify/20260418-*` — full RCA chain

## Estimated cost when actualized

- B1: ~4-8h (CCR commander option + dispatch branch + tests)
- B2: ~8-12h (full harness rewrite path)
- B3: ~2-4h (or-shot extension, but diverges from CCR main path)

## Success criteria

A `batch.ts` run like `--models or-qwen,or-kimi --pressure L0` completes with:
- 4+ tool calls per run (AgentTool / Bash / Write mix)
- non-zero newTestCount from pre/post workspace diff
- `bun test` exit code 0 in /tmp/evensong-R0XX/repo
- registry row has schema parity with R011/R064 Anthropic runs (no `registry_schema='or-shot-v1'` tag)
