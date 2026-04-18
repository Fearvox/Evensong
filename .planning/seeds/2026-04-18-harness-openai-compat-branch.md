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

---

## Trigger conditions (surface this seed when)

Any of these, in priority order:

1. **User explicitly requests multi-turn agent benchmark on OR China family** — e.g. "we need real R011-equivalent data for qwen/kimi/glm, not just single-shot"
2. **User asks to add a new non-Anthropic OR model to BENCHMARK_MODELS** — this is exactly when harness.ts needs the branch
3. **Anthropic upstream ships adaptive-thinking clamp fix** — natural batching point to also tackle harness.ts refactor (both require touching `claude.ts` surrounding code)
4. **Paper review cycle starts** — reviewers will likely ask "why only single-turn for OR family?"
5. **OR BYOK or Anthropic-compat pricing changes** — if OR removes the Anthropic-compat subscription gate, this seed is no longer load-bearing
6. **"Opus 4.7 + Kimi-K2.5 + MiniMax-M2.7 三星架构" 落地** (Nolan 2026-04-18 构想) — 主 Opus 4.7 + Kimi 作为 262K-ctx 免费读库 subagent + MiniMax 作为 thinking-heavy 独立探索 subagent。MiniMax 路径已通 (`minimax-direct` provider Anthropic-compat `api.minimax.io/anthropic`),**Kimi 部分正是此 seed 要解锁** — AgentTool spawn 对 Kimi 目前走 CCR 的 Anthropic SDK path,会撞和 R066 batch.ts 同样的 OR Anthropic-compat 403。B1 实施后,`or-kimi` 可作为 teammate 模型通过 ProviderRouter OpenAICompatibleClient 路由,AgentTool prompt 里加 "use Kimi subagent to read large file and summarize" 之类的 task routing,成本 $0/M。这是本 seed 最具体的 near-term driver。

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
