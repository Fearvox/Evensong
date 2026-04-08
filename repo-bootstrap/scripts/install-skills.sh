#!/bin/bash
set -euo pipefail

# install-skills.sh — Install ECC skills ecosystem + optional Codex plugin
#
# Usage:
#   bash install-skills.sh [--skip-codex] [--skip-global] [--dry-run]
#
# Installs into .claude/ of the current working directory.

SKIP_CODEX=false
SKIP_GLOBAL=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --skip-codex) SKIP_CODEX=true ;;
    --skip-global) SKIP_GLOBAL=true ;;
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      echo "Usage: install-skills.sh [--skip-codex] [--skip-global] [--dry-run]"
      exit 0
      ;;
  esac
done

PROJECT_DIR="$(pwd)"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

log() { echo "  $1"; }
header() { echo ""; echo "=== $1 ==="; }

# ─── Phase 1: everything-claude-code ─────────────────────────────────────────

header "Installing everything-claude-code"

if [ "$DRY_RUN" = true ]; then
  log "[DRY RUN] Would clone affaan-m/everything-claude-code"
  log "[DRY RUN] Would install skills → .claude/skills/everything-claude-code/"
  log "[DRY RUN] Would install commands → .claude/commands/"
else
  log "Cloning everything-claude-code..."
  git clone --depth 1 https://github.com/affaan-m/everything-claude-code.git "$TEMP_DIR/ecc" 2>/dev/null

  mkdir -p "$PROJECT_DIR/.claude/skills/everything-claude-code"
  mkdir -p "$PROJECT_DIR/.claude/commands"

  # Skills
  if [ -d "$TEMP_DIR/ecc/skills" ]; then
    cp -r "$TEMP_DIR/ecc/skills/"* "$PROJECT_DIR/.claude/skills/everything-claude-code/"
    SKILL_COUNT=$(ls -d "$PROJECT_DIR/.claude/skills/everything-claude-code/"*/ 2>/dev/null | wc -l)
    log "Installed $SKILL_COUNT skills"
  fi

  # Commands
  if [ -d "$TEMP_DIR/ecc/commands" ]; then
    cp -r "$TEMP_DIR/ecc/commands/"* "$PROJECT_DIR/.claude/commands/"
    CMD_COUNT=$(ls "$PROJECT_DIR/.claude/commands/"*.md 2>/dev/null | wc -l)
    log "Installed $CMD_COUNT commands"
  fi

  # Config files (don't overwrite existing)
  for f in "$TEMP_DIR/ecc/.claude/"*.json; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    if [ ! -f "$PROJECT_DIR/.claude/$name" ]; then
      cp "$f" "$PROJECT_DIR/.claude/$name"
      log "Copied config: $name"
    else
      log "Skipped config (exists): $name"
    fi
  done
fi

# ─── Phase 2: Codex Plugin ──────────────────────────────────────────────────

if [ "$SKIP_CODEX" = false ]; then
  header "Installing Codex Plugin"

  if [ "$DRY_RUN" = true ]; then
    log "[DRY RUN] Would clone openai/codex-plugin-cc"
    log "[DRY RUN] Would install 7 codex commands"
  else
    log "Cloning codex-plugin-cc..."
    git clone --depth 1 https://github.com/openai/codex-plugin-cc.git "$TEMP_DIR/codex" 2>/dev/null

    CODEX_SRC="$TEMP_DIR/codex/plugins/codex"

    # Commands (prefixed)
    codex_cmd_count=0
    for f in "$CODEX_SRC/commands/"*.md; do
      [ -f "$f" ] || continue
      cp "$f" "$PROJECT_DIR/.claude/commands/codex-$(basename "$f")"
      codex_cmd_count=$((codex_cmd_count + 1))
    done
    log "Installed $codex_cmd_count codex commands"

    # Scripts
    mkdir -p "$PROJECT_DIR/.claude/codex-plugin"
    [ -d "$CODEX_SRC/scripts" ] && cp -r "$CODEX_SRC/scripts/"* "$PROJECT_DIR/.claude/codex-plugin/"
    [ -d "$CODEX_SRC/prompts" ] && cp -r "$CODEX_SRC/prompts" "$PROJECT_DIR/.claude/codex-plugin/"
    [ -d "$CODEX_SRC/schemas" ] && cp -r "$CODEX_SRC/schemas" "$PROJECT_DIR/.claude/codex-plugin/"
    log "Installed codex scripts + prompts + schemas"

    # Skills + agents
    [ -d "$CODEX_SRC/skills" ] && cp -r "$CODEX_SRC/skills/"* "$PROJECT_DIR/.claude/skills/everything-claude-code/" 2>/dev/null
    mkdir -p "$PROJECT_DIR/.claude/agents"
    for f in "$CODEX_SRC/agents/"*.md; do
      [ -f "$f" ] || continue
      cp "$f" "$PROJECT_DIR/.claude/agents/"
    done

    # Fix CLAUDE_PLUGIN_ROOT paths
    PLUGIN_DIR="$PROJECT_DIR/.claude/codex-plugin"
    for f in "$PROJECT_DIR/.claude/commands/codex-"*.md; do
      [ -f "$f" ] || continue
      if command -v sed >/dev/null 2>&1; then
        # macOS vs GNU sed compatibility
        if sed --version 2>/dev/null | grep -q GNU; then
          sed -i "s|\${CLAUDE_PLUGIN_ROOT}/scripts/|${PLUGIN_DIR}/|g" "$f"
        else
          sed -i '' "s|\${CLAUDE_PLUGIN_ROOT}/scripts/|${PLUGIN_DIR}/|g" "$f"
        fi
      fi
    done
    log "Fixed CLAUDE_PLUGIN_ROOT paths"
  fi
else
  header "Skipping Codex Plugin (--skip-codex)"
fi

# ─── Phase 3: Global User Skills ────────────────────────────────────────────

if [ "$SKIP_GLOBAL" = false ]; then
  GLOBAL_SKILLS="$HOME/.claude/skills"
  if [ -d "$GLOBAL_SKILLS" ] && [ "$(ls -A "$GLOBAL_SKILLS" 2>/dev/null)" ]; then
    header "Global Skills Found"
    for skill_dir in "$GLOBAL_SKILLS"/*/; do
      [ -d "$skill_dir" ] || continue
      skill_name=$(basename "$skill_dir")
      target="$PROJECT_DIR/.claude/skills/$skill_name"
      if [ -d "$target" ]; then
        log "Skipped (exists): $skill_name"
      else
        if [ "$DRY_RUN" = true ]; then
          log "[DRY RUN] Would copy: $skill_name"
        else
          cp -r "$skill_dir" "$target"
          log "Copied: $skill_name"
        fi
      fi
    done
  fi
else
  header "Skipping Global Skills (--skip-global)"
fi

# ─── Summary ────────────────────────────────────────────────────────────────

header "Installation Complete"
total_skills=$(find "$PROJECT_DIR/.claude/skills" -name "SKILL.md" 2>/dev/null | wc -l)
total_commands=$(ls "$PROJECT_DIR/.claude/commands/"*.md 2>/dev/null | wc -l)
log "Total skills:   $total_skills"
log "Total commands: $total_commands"
log "Location:       $PROJECT_DIR/.claude/"
