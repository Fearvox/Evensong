#!/usr/bin/env bash
#
# inject-profile.sh — Evensong Universal Benchmark Profile Injector
#
# Usage:
#   ./inject-profile.sh evensong-universal   # Multi-model via OpenRouter
#   ./inject-profile.sh anthropic-max        # Anthropic direct
#   ./inject-profile.sh reset                # Clear all injections
#
# Idempotent. Backs up configs before mutation.
# Does NOT hardcode API keys — reads from $OPENROUTER_API_KEY at runtime.

set -euo pipefail

CLAUDE_JSON="$HOME/.claude.json"
SETTINGS_JSON="$HOME/.claude/settings.json"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Arg check ───────────────────────────────────────────────────────────────
PROFILE="${1:-}"
if [[ -z "$PROFILE" ]]; then
  die "Usage: $0 <evensong-universal|anthropic-max|reset>"
fi
if [[ "$PROFILE" != "evensong-universal" && "$PROFILE" != "anthropic-max" && "$PROFILE" != "reset" ]]; then
  die "Unknown profile: $PROFILE  (valid: evensong-universal, anthropic-max, reset)"
fi

# ── Ensure configs exist ────────────────────────────────────────────────────
ensure_file() {
  local f="$1"
  local dir
  dir="$(dirname "$f")"
  [[ -d "$dir" ]] || mkdir -p "$dir"
  if [[ ! -f "$f" ]]; then
    echo '{}' > "$f"
    info "Created $f"
  fi
}
ensure_file "$CLAUDE_JSON"
ensure_file "$SETTINGS_JSON"

# ── Backup ──────────────────────────────────────────────────────────────────
cp "$CLAUDE_JSON"    "${CLAUDE_JSON}.bak"
cp "$SETTINGS_JSON"  "${SETTINGS_JSON}.bak"
info "Backed up configs (.bak)"

# ── Print current state ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=== Current State ===${NC}"
echo -e "  ${CYAN}~/.claude.json${NC} additionalModelOptionsCache:"
jq -c '.additionalModelOptionsCache // []' "$CLAUDE_JSON"
echo -e "  ${CYAN}~/.claude/settings.json${NC} env:"
jq -c '.env // {}' "$SETTINGS_JSON"
echo ""

# ── Helper: safe jq in-place ───────────────────────────────────────────────
# jq_inplace FILE FILTER
jq_inplace() {
  local file="$1" filter="$2"
  local tmp
  tmp="$(mktemp)"
  jq "$filter" "$file" > "$tmp" && mv "$tmp" "$file"
}

# ── Profile: evensong-universal ─────────────────────────────────────────────
apply_evensong_universal() {
  info "Applying profile: ${BOLD}evensong-universal${NC}"

  # Require OPENROUTER_API_KEY
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    die "\$OPENROUTER_API_KEY is not set. Export it first."
  fi

  # 1) Inject 8 model options into ~/.claude.json
  local models_json
  models_json='[
    {"value":"openai/gpt-5.4",                  "label":"GPT-5.4",         "description":"OpenAI flagship · $2.50/MTok"},
    {"value":"x-ai/grok-4.20",                  "label":"Grok 4.20",       "description":"xAI · 2M context · $2/MTok"},
    {"value":"google/gemini-3.1-pro-preview",    "label":"Gemini 3.1 Pro",  "description":"Google · $2/MTok"},
    {"value":"z-ai/glm-5.1",                    "label":"GLM-5.1",         "description":"Zhipu AI · Coding #3"},
    {"value":"qwen/qwen3-coder-plus",            "label":"Qwen3 Coder+",    "description":"Alibaba · 1M context"},
    {"value":"deepseek/deepseek-r1-0528",        "label":"DeepSeek R1",     "description":"Reasoning specialist"},
    {"value":"moonshotai/kimi-k2.5",             "label":"Kimi K2.5",       "description":"Moonshot AI · dark horse"},
    {"value":"anthropic/claude-opus-4.6",        "label":"Claude Opus 4.6",  "description":"Anthropic · baseline champion"}
  ]'
  jq_inplace "$CLAUDE_JSON" --argjson models "$models_json" \
    '.additionalModelOptionsCache = $models'
  ok "Injected 8 model options into ~/.claude.json"

  # 2) Update env in ~/.claude/settings.json
  #    - Set ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY, CLAUDE_CODE_DISABLE_THINKING
  #    - Remove ANTHROPIC_AUTH_TOKEN (if present)
  #    - Preserve all other env vars and non-env fields
  jq_inplace "$SETTINGS_JSON" --arg key "$OPENROUTER_API_KEY" '
    .env = (
      (.env // {})
      | del(.ANTHROPIC_AUTH_TOKEN)
      | .ANTHROPIC_BASE_URL = "https://openrouter.ai/api"
      | .ANTHROPIC_API_KEY = $key
      | .CLAUDE_CODE_DISABLE_THINKING = "1"
    )
  '
  ok "Updated env in ~/.claude/settings.json"
  ok "  ANTHROPIC_BASE_URL = https://openrouter.ai/api"
  ok "  ANTHROPIC_API_KEY  = (from \$OPENROUTER_API_KEY)"
  ok "  CLAUDE_CODE_DISABLE_THINKING = 1"
  ok "  ANTHROPIC_AUTH_TOKEN removed"
}

# ── Profile: anthropic-max ──────────────────────────────────────────────────
apply_anthropic_max() {
  info "Applying profile: ${BOLD}anthropic-max${NC}"

  # Require OPENROUTER_API_KEY for ANTHROPIC_AUTH_TOKEN restoration
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    die "\$OPENROUTER_API_KEY is not set. Export it first."
  fi

  # 1) Clear additionalModelOptionsCache
  jq_inplace "$CLAUDE_JSON" '.additionalModelOptionsCache = []'
  ok "Cleared additionalModelOptionsCache in ~/.claude.json"

  # 2) Update env: restore ANTHROPIC_AUTH_TOKEN, set ANTHROPIC_MODEL,
  #    remove ANTHROPIC_BASE_URL and CLAUDE_CODE_DISABLE_THINKING
  jq_inplace "$SETTINGS_JSON" --arg key "$OPENROUTER_API_KEY" '
    .env = (
      (.env // {})
      | del(.ANTHROPIC_BASE_URL)
      | del(.ANTHROPIC_API_KEY)
      | del(.CLAUDE_CODE_DISABLE_THINKING)
      | .ANTHROPIC_AUTH_TOKEN = $key
      | .ANTHROPIC_MODEL = "anthropic/claude-opus-4.6"
    )
  '
  ok "Updated env in ~/.claude/settings.json"
  ok "  ANTHROPIC_AUTH_TOKEN = (from \$OPENROUTER_API_KEY)"
  ok "  ANTHROPIC_MODEL = anthropic/claude-opus-4.6"
  ok "  Removed ANTHROPIC_BASE_URL"
  ok "  Removed CLAUDE_CODE_DISABLE_THINKING"
}

# ── Profile: reset ──────────────────────────────────────────────────────────
apply_reset() {
  info "Applying profile: ${BOLD}reset${NC}"

  # 1) Clear additionalModelOptionsCache
  jq_inplace "$CLAUDE_JSON" '.additionalModelOptionsCache = []'
  ok "Cleared additionalModelOptionsCache in ~/.claude.json"

  # 2) Remove all injected env keys (preserve others)
  jq_inplace "$SETTINGS_JSON" '
    .env = (
      (.env // {})
      | del(.ANTHROPIC_BASE_URL)
      | del(.ANTHROPIC_API_KEY)
      | del(.ANTHROPIC_AUTH_TOKEN)
      | del(.ANTHROPIC_MODEL)
      | del(.CLAUDE_CODE_DISABLE_THINKING)
    )
  '
  ok "Cleared injected env vars from ~/.claude/settings.json"
}

# ── Dispatch ────────────────────────────────────────────────────────────────
case "$PROFILE" in
  evensong-universal) apply_evensong_universal ;;
  anthropic-max)     apply_anthropic_max ;;
  reset)             apply_reset ;;
esac

# ── Print new state ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=== New State ===${NC}"
echo -e "  ${CYAN}~/.claude.json${NC} additionalModelOptionsCache:"
jq '.additionalModelOptionsCache // []' "$CLAUDE_JSON"
echo -e "  ${CYAN}~/.claude/settings.json${NC} env:"
jq '.env // {}' "$SETTINGS_JSON"

echo ""
echo -e "${GREEN}${BOLD}Profile '$PROFILE' applied.${NC}"
echo -e "${YELLOW}Restart CCB (claude) for changes to take effect.${NC}"
