#!/usr/bin/env bash
# R066 — OR China family cross-model L0 benchmark
#
# Triggered after R065 Opus 4.7 self-evolution pivot. Maps user's cc-switch
# 5-slot profile to 4 independent model runs on the same R011 prompt:
#
#   cc-switch slot       →  R066 cell
#   -------------------     ------------------------------
#   Main model            →  or-elephant-alpha
#   Thinking              →  or-glm       (z-ai/glm-5.1)
#   Sonnet default        →  or-kimi      (moonshotai/kimi-k2.5)
#   Opus default          →  or-qwen      (qwen/qwen3.6-plus)
#   Haiku default         →  (overlaps with Main = elephant-alpha; skip)
#
# CCR architecture does NOT support cc-switch's per-slot dispatch, so we
# reduce to 4 independent cells. This is actually BETTER for benchmark
# semantics — each model gets clean attribution.
#
# Expected duration: ~1-2h total (wall clock; runs serial unless batch
# parallelizes). Cost: <$5 (all open/cheap tier).

set -euo pipefail

cd "$(dirname "$0")/../.."

echo "════════════════════════════════════════════════════════════════"
echo "  R066 · OR China Family Cross-Model L0"
echo "  $(date)"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Pivot context: R065 Opus 4.7 blocked by CCR adaptive-thinking"
echo "  infra gap at 1M ctx. R066 uses OR path instead (no 1M beta)."
echo ""

# Preflight: verify OR key alive
echo "→ Preflight: OpenRouter key check"
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "   ✗ OPENROUTER_API_KEY not set. Source ~/.zshrc then re-run."
  exit 1
fi
curl -s -o /dev/null -w "   ✓ OR API: HTTP %{http_code}\n" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models

echo ""
echo "→ Dry-run preview (no actual LLM calls)"
bun benchmarks/evensong/batch.ts \
  --dry-run \
  --models or-elephant-alpha,or-glm,or-kimi,or-qwen \
  --pressure L0 \
  --memory clean \
  --start-id R066

echo ""
read -p "Proceed with live 4-cell batch? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Live batch: 4 models × L0 × clean memory"
echo "════════════════════════════════════════════════════════════════"
bun benchmarks/evensong/batch.ts \
  --models or-elephant-alpha,or-glm,or-kimi,or-qwen \
  --pressure L0 \
  --memory clean \
  --start-id R066

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  R066 batch complete. Next:"
echo "   • Review result.json in benchmarks/runs/R066-* directories"
echo "   • Run /benchmark-ingest to update registry + dashboard"
echo "   • Compare cells: tests/svc, 0-fail rate, time, strategy"
echo "   • R065 archival: see PREDICTIONS-R065.md + three verify docs"
echo "════════════════════════════════════════════════════════════════"
