#!/bin/bash
# Evensong Benchmark Launcher
# Usage: ./benchmarks/evensong/run-benchmark.sh <model-preset> [run-id]
# Example: ./benchmarks/evensong/run-benchmark.sh or-gpt5 R012

set -euo pipefail

PRESET="${1:?Usage: run-benchmark.sh <model-preset> [run-id]}"
RUN_ID="${2:-RTEST}"

# Model presets (must match benchmarks/evensong/types.ts)
case "$PRESET" in
  or-gpt5)    MODEL_ID="openai/gpt-5.4" ;;
  or-grok)    MODEL_ID="x-ai/grok-4.20" ;;
  or-opus)    MODEL_ID="anthropic/claude-opus-4.6" ;;
  or-gemini)  MODEL_ID="google/gemini-3.1-pro-preview" ;;
  or-glm)     MODEL_ID="z-ai/glm-5.1" ;;
  or-qwen)    MODEL_ID="qwen/qwen3-coder-plus" ;;
  or-deepseek) MODEL_ID="deepseek/deepseek-r1-0528" ;;
  or-kimi)    MODEL_ID="moonshotai/kimi-k2.5" ;;
  *)          echo "Unknown preset: $PRESET"; exit 1 ;;
esac

echo "================================================"
echo "  EVENSONG $RUN_ID — $MODEL_ID"
echo "  Preset: $PRESET"
echo "  Date: $(date '+%Y-%m-%d %H:%M')"
echo "================================================"

# Verify OpenRouter key exists
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "ERROR: OPENROUTER_API_KEY not set"
  exit 1
fi

# Launch CCB with clean env — override everything settings.json might inject
# --model flag has priority 2 (above ANTHROPIC_MODEL env, above settings.json)
exec env \
  ANTHROPIC_BASE_URL="https://openrouter.ai/api" \
  ANTHROPIC_API_KEY="$OPENROUTER_API_KEY" \
  ANTHROPIC_MODEL="$MODEL_ID" \
  ANTHROPIC_AUTH_TOKEN="" \
  CLAUDE_CODE_DISABLE_THINKING=1 \
  dash-shatter --model "$MODEL_ID"
