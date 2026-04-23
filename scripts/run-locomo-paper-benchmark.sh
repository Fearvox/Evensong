#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOME_DIR="${HOME:-/root}"

if [ -f "$HOME_DIR/.hermes/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$HOME_DIR/.hermes/.env"
  set +a
fi

LOCOMO_MODEL="${LOCOMO_MODEL:-MiniMax-M2.7}"
LOCOMO_BASE_URL="${LOCOMO_BASE_URL:-https://api.minimax.io/v1}"
LOCOMO_API_KEY_ENV="${LOCOMO_API_KEY_ENV:-MINIMAX_API_KEY}"
LOCOMO_TOP_K="${LOCOMO_TOP_K:-5}"
LOCOMO_LIMIT="${LOCOMO_LIMIT:-0}"
LOCOMO_SAMPLE_ID="${LOCOMO_SAMPLE_ID:-}"
LOCOMO_INDEX_MODE="${LOCOMO_INDEX_MODE:-full}"
LOCOMO_LIGHT_DOC_LIMIT="${LOCOMO_LIGHT_DOC_LIMIT:-48}"
LOCOMO_LIGHT_NEIGHBOR_RADIUS="${LOCOMO_LIGHT_NEIGHBOR_RADIUS:-1}"
LOCOMO_TIMEOUT="${LOCOMO_TIMEOUT:-60}"
LOCOMO_METHOD_NAME="${LOCOMO_METHOD_NAME:-CCR DenseRAG}"
LOCOMO_PYTHON="${LOCOMO_PYTHON:-python3}"
export PYTHONUNBUFFERED="${PYTHONUNBUFFERED:-1}"

cd "$REPO_ROOT"

args=(
  "$REPO_ROOT/benchmarks/evensong/locomo_hybrid/eval_locomo_paper.py"
  --model="$LOCOMO_MODEL" \
  --base-url="$LOCOMO_BASE_URL" \
  --api-key-env="$LOCOMO_API_KEY_ENV" \
  --top-k="$LOCOMO_TOP_K" \
  --limit="$LOCOMO_LIMIT" \
  --index-mode="$LOCOMO_INDEX_MODE" \
  --light-doc-limit="$LOCOMO_LIGHT_DOC_LIMIT" \
  --light-neighbor-radius="$LOCOMO_LIGHT_NEIGHBOR_RADIUS" \
  --timeout="$LOCOMO_TIMEOUT" \
  --method-name="$LOCOMO_METHOD_NAME"
)

if [ -n "$LOCOMO_SAMPLE_ID" ]; then
  args+=(--sample-id="$LOCOMO_SAMPLE_ID")
fi

exec "$LOCOMO_PYTHON" "${args[@]}"
