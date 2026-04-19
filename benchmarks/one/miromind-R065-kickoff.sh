#!/usr/bin/env bash
# Miromind cross-reference batch for R065 Opus 4.7 self-evolution.
# Fires 5 runs via OpenRouter (pipe-mode headless) to produce the
# cross-model + cross-pressure comparison table.
#
# Precondition: R065 Opus 4.7 L0 (R065-b-rep1) has completed in native REPL.
# Reason: we want the native Opus 4.7 floor anchored before spending tokens
# on comparison arms. Avoids wasting a parallel batch on a trivially-broken
# run if R065-b reveals something wrong with the harness.
#
# Matrix (5 runs, ~$8-12, ~1-2h):
#   or-opus × L0, L2, L3    → same-family version delta vs Opus 4.7
#   or-gpt5 × L2            → cross-vendor L2 anchor
#   or-elephant-alpha × L2  → stealth-model shakedown
#
# Combined with R065 native trio (Opus 4.7 L0/L2/L3), final matrix = 9 cells.

set -euo pipefail

cd "$(dirname "$0")/../.."

echo "════════════════════════════════════════════════════════════════"
echo "  Miromind × R065 Cross-Reference Batch"
echo "  $(date)"
echo "════════════════════════════════════════════════════════════════"

# Preflight: verify OR key alive
echo ""
echo "→ Preflight: OpenRouter key check"
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "   ✗ OPENROUTER_API_KEY not set. Source ~/.zshrc then re-run."
  exit 1
fi
curl -s -o /dev/null -w "   ✓ OR API: HTTP %{http_code}\n" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models

echo ""
echo "→ Dry-run preview (no actual LLM calls yet)"
bun benchmarks/evensong/batch.ts --dry-run --models or-opus --pressure L0,L2,L3 --memory clean
bun benchmarks/evensong/batch.ts --dry-run --models or-gpt5,or-elephant-alpha --pressure L2 --memory clean

echo ""
read -p "Proceed with live batch? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Phase 1/2 · Same-family pressure gradient (Opus 4.6 L0/L2/L3)"
echo "════════════════════════════════════════════════════════════════"
bun benchmarks/evensong/batch.ts \
  --models or-opus \
  --pressure L0,L2,L3 \
  --memory clean

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Phase 2/2 · Cross-vendor L2 anchors (GPT-5 + Elephant-α)"
echo "════════════════════════════════════════════════════════════════"
bun benchmarks/evensong/batch.ts \
  --models or-gpt5,or-elephant-alpha \
  --pressure L2 \
  --memory clean

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Miromind batch complete. Next:"
echo "   • Review per-run result.json files in benchmarks/runs/"
echo "   • Run /benchmark-ingest to update registry + dashboard"
echo "   • Generate R065 comparison report (manual or via dashboard)"
echo "════════════════════════════════════════════════════════════════"
