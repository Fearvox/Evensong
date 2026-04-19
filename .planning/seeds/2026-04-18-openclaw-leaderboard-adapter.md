# SEED: Leaderboard adapter via openclaw — benchmark pre-flight data layer

**Planted:** 2026-04-18T09:35 EDT by Claude Opus 4.7, Nolan 2026-04-18 R070 session
**Type:** infrastructure / tooling
**Priority:** medium-high (directly prevents the pattern-of-errors observed today)
**Surfaces when:** any of the trigger conditions below fire

---

## Context (why this exists)

Today's R066 → R070 cross-model benchmark session produced 11 distinct "red-line-2" (fact-driven) violations. **Every single one** was a case where authoritative external data (OR model page, Design Arena Elo, provider pricing, cache hit rate, Anthropic vs OpenAI endpoint compatibility, key scope) existed as a public web resource but wasn't consulted before the assistant made claims. Examples:

1. Claimed `qwen/qwen3.6-plus` "doesn't exist on OR" — actually exists, my /models API probe was incomplete
2. Claimed Kimi K2.5 cost $0 was "OR billing bug" — actually Cloudflare free provider tier
3. Claimed ElephantAlpha key scope 限制 single-model — actually key has model scope but UI only shows spend limit
4. Claimed OR Anthropic-compat supports all models — actually a paid-tier subscription gate
5. Claimed `or-qwen` modelId `qwen/qwen3.6-plus` right — actually drift from an older Qwen version

Each of these could have been resolved by 1 curl to the right page or API. The `bb-browser-openclaw` plugin already turns 36 websites into CLI commands (103 commands total). Extending it to cover leaderboards + model-pricing would give benchmark scripts a single authoritative data layer.

---

## Proposed commands (openclaw extension)

```bash
# Model existence + pricing + context
openclaw or-model <model-id>
# → JSON: { id, context_length, pricing: { input, output }, providers: [...], deprecated?, free_variant? }

# Leaderboard snapshots
openclaw or-rankings --category programming --limit 10
openclaw design-arena <model-id>
# → JSON: { elo_by_category: { 3d, code, ui, website, ... }, first_rate, tournaments, top_percentile }

openclaw lmarena --category code --limit 20
openclaw livecodebench <model-id>
openclaw artificial-analysis <model-id>

# Provider health
openclaw or-providers <model-id>
# → JSON rows: [{ provider, input_cost, output_cost, cache_hit_rate, latency_p50, uptime }]

# Key scope (key piped via stdin, never argv, never printed)
echo $OPENROUTER_API_KEY | openclaw or-key-check --stdin
# → JSON: { scope: "all" | "model-whitelist" | ..., allowed_models: [...], credit_remaining, total_limit }
```

Each command scrapes the relevant OR page via Playwright (openclaw's existing browser automation), parses the structured data, emits JSON. Can be piped: `openclaw or-model qwen/qwen3.6-plus | jq .pricing.input`.

---

## Integration points

### 1. `benchmark-preflight` skill — auto-lookup before predictions

Modify `.claude/skills/benchmark-preflight/SKILL.md` Phase 3 "Prediction Generation" to include:

```
Before predicting for each candidate model:
  openclaw or-model <model-id>      → verify existence, get context_length, pricing
  openclaw design-arena <model-id>  → pull Elo-by-category as external baseline
  openclaw or-providers <model-id>  → find best (provider, cache_hit) combo
Insert the retrieved data into PREDICTIONS-R0XX.md § External Baselines.
```

Would have caught today's qwen/qwen3.6-plus name drift + qwen-max vs qwen3.6-plus distinction in 5 seconds.

### 2. `or-shot.ts` + `batch.ts` — validate model existence (pseudocode)

Add preflight call before API dispatch (illustrative, adapt to codebase conventions + use `execFileNoThrow` per repo security notes):

```
// preflight (pseudocode — use safe exec wrapper from src/utils/)
meta = await openclaw_or_model(preset.modelId)
if meta.deprecated:
  raise BenchmarkConfigError(`Model ${preset.modelId} deprecated, migrate to ${meta.successor}`)
```

Would have caught today's `qwen/qwen3.6-plus-04-02:free` deprecation before burning a batch run.

### 3. `types.ts BENCHMARK_MODELS` — drift auditor

CI script that runs nightly:
```bash
for preset in BENCHMARK_MODELS:
  openclaw or-model $preset.modelId
  if NOT_FOUND or DEPRECATED: open issue "BENCHMARK_MODELS drift: $preset"
```

Would have caught our `qwen/qwen3.6-plus` → `qwen/qwen3-max` drift months ago if it existed.

### 4. `miromind-R0XX-kickoff.sh` — smarter preflight

Replace the hardcoded 4 curl probes with:
```bash
ALLOWED=$(echo $OPENROUTER_API_KEY | openclaw or-key-check --stdin | jq -c .allowed_models)
for model in "${MODELS[@]}"; do
  if ! echo "$ALLOWED" | grep -q "\"$model\""; then
    echo "✗ $model not in key scope. Switch key or remove from batch."
    exit 1
  fi
done
```

Would have caught today's ElephantAlpha-scoped key issue in the preflight phase, not 4 cells deep into a failed batch.

---

## Trigger conditions (surface when)

1. **Next cross-model benchmark (R071+)** — natural integration point, worth the upfront investment
2. **Any new entry to `BENCHMARK_MODELS`** — instead of trusting cc-switch UI names, validate via openclaw first
3. **Paper review / reproducibility requirement** — reviewer says "how do you know model X was the latest?" — the adapter log is the answer
4. **OR deprecates another model** (like today's `:free` variant) — if this happens 2+ more times in a quarter, adapter is ROI-positive
5. **User manually requests leaderboard lookup** — e.g. "is qwen3.6-plus still top 10?" — current flow is screenshot+copy; adapter is 1 command

---

## Implementation sketch (rough)

**Phase 1** (1-2 days): base commands for OR only
- `openclaw or-model` (scrape openrouter.ai/<model-id>)
- `openclaw or-rankings --category <cat>` (scrape openrouter.ai/rankings)
- `openclaw or-providers <model-id>` (scrape openrouter.ai/<model-id>/providers)
- `openclaw or-key-check --stdin` (POST with piped key, parse response)

**Phase 2** (1-2 days): external leaderboards
- `openclaw design-arena <model-id>` (openrouter.ai Design Arena page — JSON already embedded in HTML)
- `openclaw lmarena --category <cat>` (lmarena.ai rankings API or scrape)
- `openclaw livecodebench <model-id>`
- `openclaw artificial-analysis <model-id>`

**Phase 3** (0.5 day): integration
- Update `benchmark-preflight` skill
- Add validation call into `or-shot.ts` + `batch.ts` (use repo's `execFileNoThrow` wrapper, not raw exec)
- Write `scripts/check-benchmark-models-drift.sh` for CI

---

## Related files

- `~/.claude/plugins/bb-browser-openclaw/` — existing skill, where new commands land
- `benchmarks/evensong/or-shot.ts` — integration target
- `benchmarks/evensong/types.ts` — BENCHMARK_MODELS drift target
- `.claude/skills/benchmark-preflight/SKILL.md` — integration target
- `.planning/seeds/2026-04-18-harness-openai-compat-branch.md` — companion B seed (different axis but same meta-goal: reduce benchmark infra fragility)

## Success criteria

A future R0XX benchmark pre-flight produces output like:

```
→ Pre-flight: validating 4 candidate models via openclaw
  ✓ openrouter/elephant-alpha  (exists, free via Cloudflare, 256K ctx, Elo n/a)
  ✓ z-ai/glm-5.1              (exists, $0.29/$1.20, 128K ctx, Arena 5.8%)
  ✓ moonshotai/kimi-k2.5       (exists, $0 via Cloudflare 11% cache, 262K ctx, Arena 4.2%)
  ⚠ qwen/qwen3.6-plus-04-02:free (DEPRECATED — migrating to qwen/qwen3.6-plus)
  ✓ qwen/qwen3.6-plus          (exists, $0.325/$1.95, 1M ctx, Arena 32% 1st rate)
→ Proceeding to live batch. Predictions populated from Arena Elo baselines.
```

When this output matches reality, adapter delivered ROI.

## Cost estimate when actualized

- ~2-3 days engineering (bb-browser-openclaw has templates for scraping; new commands = copy+modify)
- Zero runtime cost if results cached; no paid API keys needed (all leaderboards are public)
- ~50 LOC per command + Playwright selectors

## Security note

Any shell invocation from TypeScript should route through the repo's `src/utils/execFileNoThrow.ts` wrapper (uses `execFile`, not `exec`, preventing shell injection). Never interpolate user-supplied model IDs directly into shell strings.

## References

- `bb-browser-openclaw` skill description: "Turn any website into a CLI command. 36 platforms, 103 commands — Twitter,…"
- Today's error chain: `.claude/verify/20260418-*` (verify-assumptions logs showing 11 red-line-2 violations)
- Companion seed: `.planning/seeds/2026-04-18-harness-openai-compat-branch.md`
