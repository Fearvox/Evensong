#!/bin/bash
set -euo pipefail

# session-restore.sh — Restore Claude Code sessions from exported data
#
# Usage:
#   bash session-restore.sh [--source DIR] [--force]
#
# Looks for exported sessions in .claude/cloud-sessions/ by default.

SOURCE_DIR=".claude/cloud-sessions"
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --source)
      shift
      SOURCE_DIR="$1"
      ;;
    --help|-h)
      echo "Usage: session-restore.sh [--source DIR] [--force]"
      echo ""
      echo "  --source  Directory containing exported sessions (default: .claude/cloud-sessions)"
      echo "  --force   Overwrite existing session files"
      exit 0
      ;;
  esac
done

# ─── Validate source ────────────────────────────────────────────────────────

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Source directory not found: $SOURCE_DIR"
  echo ""
  echo "Tip: Run session-export.sh on the cloud environment first,"
  echo "     then git pull to get the exported data."
  exit 1
fi

SESSION_FILES=$(ls "$SOURCE_DIR"/*.jsonl 2>/dev/null | wc -l)

if [ "$SESSION_FILES" -eq 0 ]; then
  echo "Error: No session files (*.jsonl) found in $SOURCE_DIR"
  exit 1
fi

# ─── Detect target directory ────────────────────────────────────────────────

PROJECT_DIR="$(pwd)"
PROJECT_KEY=$(echo "$PROJECT_DIR" | sed 's|/|-|g')
[[ "$PROJECT_KEY" != -* ]] && PROJECT_KEY="-${PROJECT_KEY}"

TARGET_DIR="$HOME/.claude/projects/${PROJECT_KEY}"

echo "=== Session Restore ==="
echo "Source:   $SOURCE_DIR ($SESSION_FILES sessions)"
echo "Project:  $PROJECT_DIR"
echo "Target:   $TARGET_DIR"
echo ""

mkdir -p "$TARGET_DIR"

# ─── Restore ─────────────────────────────────────────────────────────────────

copied=0
skipped=0

for item in "$SOURCE_DIR"/*; do
  name=$(basename "$item")

  # Skip meta/helper files
  [[ "$name" == "restore.sh" ]] && continue
  [[ "$name" == _* ]] && continue
  [[ "$name" == "README.md" ]] && continue

  if [ -e "$TARGET_DIR/$name" ] && [ "$FORCE" = false ]; then
    echo "  SKIP: $name (exists, use --force to overwrite)"
    skipped=$((skipped + 1))
  else
    cp -r "$item" "$TARGET_DIR/$name"
    echo "  RESTORED: $name"
    copied=$((copied + 1))
  fi
done

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "Restored: $copied  Skipped: $skipped"

# List sessions
echo ""
echo "=== Available Sessions ==="
for jsonl in "$TARGET_DIR"/*.jsonl; do
  [ -f "$jsonl" ] || continue
  uuid=$(basename "$jsonl" .jsonl)
  lines=$(wc -l < "$jsonl")
  size=$(du -h "$jsonl" | cut -f1)
  echo "  $uuid  ($lines messages, $size)"
done

echo ""
echo "Run 'claude --resume' to pick a session and continue."
