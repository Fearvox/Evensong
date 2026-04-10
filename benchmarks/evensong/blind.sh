#!/bin/bash
# ─────────────────────────────────────────────────────────
# evensong-blind.sh — Single-blind benchmark launcher
#
# Creates isolated workspace with filtered memories,
# then launches the Evensong harness in blind mode.
#
# Usage:
#   ./benchmarks/evensong/blind.sh R011 or-gpt5 L2
#   ./benchmarks/evensong/blind.sh R011              # defaults: or-opus L0
# ─────────────────────────────────────────────────────────
set -euo pipefail

RUN_ID="${1:?Usage: evensong-blind.sh <RUN_ID> [MODEL] [PRESSURE]}"
MODEL="${2:-or-opus}"
PRESSURE="${3:-L0}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   EVENSONG SINGLE-BLIND LAUNCHER             ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""
echo "  Run:      $RUN_ID"
echo "  Model:    $MODEL"
echo "  Pressure: $PRESSURE"
echo "  Memory:   single-blind (ALLOW-only)"
echo ""

# ── 1. Create isolated workspace ──
WORKSPACE="/tmp/evensong-${RUN_ID}"
if [ -d "$WORKSPACE" ]; then
  echo "  ⚠  Workspace exists: $WORKSPACE"
  echo "     Remove it first: rm -rf $WORKSPACE"
  exit 1
fi
mkdir -p "$WORKSPACE"

# ── 2. Shallow clone ──
echo "  📦 Cloning repo..."
git clone --depth 1 "$PROJECT_ROOT" "$WORKSPACE/repo" 2>/dev/null || {
  echo "  ⚠  git clone failed, copying..."
  rsync -a --exclude=node_modules --exclude=.git "$PROJECT_ROOT/" "$WORKSPACE/repo/"
}

# ── 3. Install deps in workspace ──
echo "  📦 Installing dependencies..."
cd "$WORKSPACE/repo"
bun install --frozen-lockfile 2>/dev/null || bun install

# ── 4. Setup filtered memory (ALLOW-only) ──
SOURCE_MEM="$HOME/.claude/projects/-Users-0xvox-claude-code-reimagine-for-learning/memory"
BENCH_MEM="$WORKSPACE/memory"
mkdir -p "$BENCH_MEM"

ALLOW_FILES=(
  "user_profile.md"
  "feedback_bun_test_file_size.md"
  "feedback_website_standard.md"
  "project_ccb_status.md"
  "project_build_stubs.md"
  "project_architecture_patterns.md"
  "learnings_git_branch_topology.md"
  "learnings_secret_scanning.md"
  "learnings_isenabled_bug.md"
  "reference_gsd_phase_lookup.md"
  "reference_remote_agent_infra.md"
)

COPIED=0
for f in "${ALLOW_FILES[@]}"; do
  if [ -f "$SOURCE_MEM/$f" ]; then
    cp "$SOURCE_MEM/$f" "$BENCH_MEM/"
    ((COPIED++))
  fi
done

# ── 5. Generate clean MEMORY.md ──
cat > "$BENCH_MEM/MEMORY.md" << 'MEMEOF'
# Memory Index (Single-Blind)

## User
- [User Profile](user_profile.md) — Senior dev, Bun runtime

## Feedback
- [Bun Test File Size](feedback_bun_test_file_size.md) — Cap test files at 500 lines

## Project
- [CCB Status](project_ccb_status.md) — Current project phase
- [Build Stubs](project_build_stubs.md) — Missing stubs must be created

## Reference
- [GSD Phase Lookup](reference_gsd_phase_lookup.md) — CLI tool usage
MEMEOF

echo "  🧠 Memory: $COPIED/${#ALLOW_FILES[@]} ALLOW files copied"
echo "     Strategy, emotion, benchmark memories EXCLUDED"

# ── 6. Launch harness ──
echo ""
echo "  🚀 Launching Evensong harness..."
echo "  ─────────────────────────────────"
echo ""

cd "$WORKSPACE/repo"
CLAUDE_COWORK_MEMORY_PATH_OVERRIDE="$BENCH_MEM" \
  EVERMEM_GROUP_ID="evensong-${RUN_ID}" \
  CLAUDE_CODE_DISABLE_MEMORY_EXTRACTION=1 \
  bun benchmarks/evensong/cli.ts run \
    --model "$MODEL" \
    --pressure "$PRESSURE" \
    --memory blind \
    --id "$RUN_ID"

echo ""
echo "  ✅ Single-blind run $RUN_ID complete"
echo "  📂 Workspace: $WORKSPACE"
echo "  📝 Transcript: benchmarks/runs/${RUN_ID}-*/transcript.jsonl"
echo ""
