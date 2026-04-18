#!/usr/bin/env bash
# R066 — OR China Family Cross-Model L0 Benchmark
#
# PIVOT NOTE (2026-04-18): This script originally used batch.ts + CCR spawn
# (Anthropic-compat endpoint). That path returned 403 "Key limit exceeded"
# on ALL non-Anthropic-brand OR models (qwen/kimi/glm) because our Hermes
# OR key does not include the Anthropic-compat proxy subscription.
# OpenAI-compat endpoint on same key works fine for all 4 models.
#
# Current impl: benchmarks/evensong/or-shot.ts (direct fetch, single-turn).
# Trade-off: no multi-turn tool calling, but that's acceptable for R011's
# greenfield "build from scratch" prompt which is gen-heavy not agent-heavy.
#
# Longer-term fix: patch harness.ts spawnCLI to route through CCR's
# ProviderRouter/OpenAICompatibleClient instead of ANTHROPIC_BASE_URL
# override. Flagged as gsd-plant-seed (see .planning/seeds/).

set -euo pipefail
cd "$(dirname "$0")/../.."

echo "════════════════════════════════════════════════════════════════"
echo "  R066 · OR China Family Cross-Model L0 (or-shot single-turn)"
echo "  $(date)"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Preflight 1: key set
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "  ✗ OPENROUTER_API_KEY not set. Source ~/.zshrc first."
  exit 1
fi

# Preflight 2: key has OpenAI-compat access to non-stealth models
# (ElephantAlpha key only passes elephant-alpha; Hermes passes everything)
echo "→ Preflight: OpenAI-compat reachability for qwen3-max"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen/qwen3-max","messages":[{"role":"user","content":"ping"}],"max_tokens":5}')
if [ "$STATUS" != "200" ]; then
  echo "  ✗ qwen/qwen3-max returned HTTP $STATUS (expected 200)"
  echo ""
  echo "  If 403: current OR key likely has model scope limit."
  echo "          Switch to Hermes Hipp Mem key:"
  echo "            1. open https://openrouter.ai/settings/keys"
  echo "            2. Reveal 'Hermes Hipp Mem' key"
  echo "            3. export OPENROUTER_API_KEY=<paste>"
  echo "          Re-run this script."
  exit 1
fi
echo "  ✓ qwen3-max reachable (HTTP 200)"
echo ""

# Dry-run preview
echo "→ Dry-run preview (no LLM calls)"
bun benchmarks/evensong/or-shot.ts \
  --models or-elephant-alpha,or-glm,or-kimi,or-qwen \
  --pressure L0 \
  --start-id R066 \
  --services 8 \
  --dry-run

echo ""
read -p "Proceed with live 4-cell batch? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Live batch: 4 cells × L0 × single-turn OR OpenAI-compat"
echo "════════════════════════════════════════════════════════════════"
bun benchmarks/evensong/or-shot.ts \
  --models or-elephant-alpha,or-glm,or-kimi,or-qwen \
  --pressure L0 \
  --start-id R066 \
  --services 8 \
  --timeout-min 15

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  R066 batch complete. Next:"
echo "   • Inspect runs/R066-or-elephant-alpha-orshot/raw-response.md etc."
echo "   • registry.jsonl appended with 4 rows (registry_schema=or-shot-v1)"
echo "   • Compare test_count / describe_count / code_blocks across cells"
echo "   • Paper uses these as 'cross-family single-turn baseline'"
echo "════════════════════════════════════════════════════════════════"
