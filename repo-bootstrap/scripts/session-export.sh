#!/bin/bash
set -euo pipefail

# session-export.sh — Export Claude Code session data for cross-environment portability
#
# Usage:
#   bash session-export.sh [--all] [--output DIR]
#
# Default: exports only the latest session transcript.
# --all: exports all sessions (transcripts + subagents + tool results).

EXPORT_ALL=false
OUTPUT_DIR=".claude/cloud-sessions"

for arg in "$@"; do
  case "$arg" in
    --all) EXPORT_ALL=true ;;
    --output)
      shift
      OUTPUT_DIR="$1"
      ;;
    --help|-h)
      echo "Usage: session-export.sh [--all] [--output DIR]"
      echo ""
      echo "  --all     Export all sessions (not just latest)"
      echo "  --output  Custom output directory (default: .claude/cloud-sessions)"
      exit 0
      ;;
  esac
done

# ─── Detect Claude data directory ────────────────────────────────────────────

find_claude_dir() {
  local candidates=(
    "$HOME/.claude"
    "/root/.claude"
    "${XDG_DATA_HOME:-$HOME/.local/share}/claude"
  )
  for dir in "${candidates[@]}"; do
    [ -d "$dir/projects" ] && { echo "$dir"; return; }
  done
  echo ""
}

CLAUDE_DIR=$(find_claude_dir)

if [ -z "$CLAUDE_DIR" ]; then
  echo "Error: Could not find Claude data directory."
  echo "Looked in: ~/.claude, /root/.claude, \$XDG_DATA_HOME/claude"
  exit 1
fi

# ─── Detect project session directory ────────────────────────────────────────

PROJECT_DIR="$(pwd)"
PROJECT_KEY=$(echo "$PROJECT_DIR" | sed 's|/|-|g')
[[ "$PROJECT_KEY" != -* ]] && PROJECT_KEY="-${PROJECT_KEY}"

SESSION_DIR="${CLAUDE_DIR}/projects/${PROJECT_KEY}"

if [ ! -d "$SESSION_DIR" ]; then
  echo "Error: No session data found for this project."
  echo "Expected: $SESSION_DIR"
  echo ""
  echo "Tip: Run Claude Code in this directory first to create session data."
  exit 1
fi

# ─── Count available sessions ────────────────────────────────────────────────

SESSION_COUNT=$(ls "$SESSION_DIR"/*.jsonl 2>/dev/null | wc -l)

if [ "$SESSION_COUNT" -eq 0 ]; then
  echo "Error: No session transcripts found in $SESSION_DIR"
  exit 1
fi

echo "Found $SESSION_COUNT session(s) in $SESSION_DIR"

# ─── Export ──────────────────────────────────────────────────────────────────

mkdir -p "$OUTPUT_DIR"

if [ "$EXPORT_ALL" = true ]; then
  echo "Exporting ALL sessions..."
  cp -r "$SESSION_DIR"/* "$OUTPUT_DIR/"

  # Also export session metadata if available
  for meta_file in "$CLAUDE_DIR/sessions/"*.json; do
    [ -f "$meta_file" ] || continue
    # Check if it references our project
    if grep -q "$PROJECT_DIR" "$meta_file" 2>/dev/null; then
      cp "$meta_file" "$OUTPUT_DIR/_$(basename "$meta_file")"
    fi
  done
else
  echo "Exporting latest session..."
  LATEST=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    UUID=$(basename "$LATEST" .jsonl)
    cp "$LATEST" "$OUTPUT_DIR/"

    # Also copy subagent data and tool results for this session
    if [ -d "$SESSION_DIR/$UUID" ]; then
      cp -r "$SESSION_DIR/$UUID" "$OUTPUT_DIR/"
    fi
  fi
fi

# ─── Generate restore script ────────────────────────────────────────────────

cat > "$OUTPUT_DIR/restore.sh" << 'RESTORE_EOF'
#!/bin/bash
set -euo pipefail

# Restore Claude Code sessions from exported data
# Usage: bash restore.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Compute the project key Claude Code uses
PROJECT_KEY=$(echo "$PROJECT_DIR" | sed 's|/|-|g')
[[ "$PROJECT_KEY" != -* ]] && PROJECT_KEY="-${PROJECT_KEY}"

TARGET_DIR="$HOME/.claude/projects/${PROJECT_KEY}"

echo "=== Session Restore ==="
echo "Project:  $PROJECT_DIR"
echo "Target:   $TARGET_DIR"
echo ""

mkdir -p "$TARGET_DIR"

copied=0
skipped=0
for item in "$SCRIPT_DIR"/*; do
  name=$(basename "$item")
  # Skip meta files and this script
  [[ "$name" == "restore.sh" ]] && continue
  [[ "$name" == _* ]] && continue
  [[ "$name" == "README.md" ]] && continue

  if [ -e "$TARGET_DIR/$name" ]; then
    echo "  SKIP: $name (already exists)"
    skipped=$((skipped + 1))
  else
    cp -r "$item" "$TARGET_DIR/$name"
    echo "  RESTORED: $name"
    copied=$((copied + 1))
  fi
done

echo ""
echo "Restored: $copied  Skipped: $skipped"

# List available sessions
echo ""
echo "=== Available Sessions ==="
for jsonl in "$TARGET_DIR"/*.jsonl; do
  [ -f "$jsonl" ] || continue
  uuid=$(basename "$jsonl" .jsonl)
  lines=$(wc -l < "$jsonl")
  size=$(du -h "$jsonl" | cut -f1)
  # Try to get the date from first line
  echo "  $uuid  ($lines messages, $size)"
done

echo ""
echo "Run 'claude --resume' in $PROJECT_DIR to continue."
RESTORE_EOF

chmod +x "$OUTPUT_DIR/restore.sh"

# ─── Summary ─────────────────────────────────────────────────────────────────

EXPORTED_COUNT=$(ls "$OUTPUT_DIR"/*.jsonl 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)

echo ""
echo "=== Export Complete ==="
echo "Sessions exported: $EXPORTED_COUNT"
echo "Total size:        $TOTAL_SIZE"
echo "Output:            $OUTPUT_DIR/"
echo "Restore script:    $OUTPUT_DIR/restore.sh"
echo ""
echo "Next steps:"
echo "  1. git add $OUTPUT_DIR/"
echo "  2. git commit -m 'chore: export session data'"
echo "  3. git push"
echo "  4. On local machine: git pull && bash $OUTPUT_DIR/restore.sh"
