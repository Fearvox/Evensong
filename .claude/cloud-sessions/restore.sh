#!/bin/bash
set -euo pipefail

# Cloud → Local Session Restore Script
# 用法: cd <project-root> && bash .claude/cloud-sessions/restore.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 1. 计算本地 Claude Code 的项目路径标识
# Claude Code 把绝对路径的 / 替换成 -，开头加 -
PROJECT_KEY=$(echo "$PROJECT_DIR" | sed 's|/|-|g')
if [[ "$PROJECT_KEY" != -* ]]; then
  PROJECT_KEY="-${PROJECT_KEY}"
fi

TARGET_DIR="$HOME/.claude/projects/${PROJECT_KEY}"

echo "=== Cloud → Local Session Restore ==="
echo "Project:    $PROJECT_DIR"
echo "Project key: $PROJECT_KEY"
echo "Target:     $TARGET_DIR"
echo ""

# 2. 创建目标目录
mkdir -p "$TARGET_DIR"

# 3. 复制所有 session transcripts 和子目录
copied=0
for item in "$SCRIPT_DIR"/*; do
  name=$(basename "$item")
  # 跳过脚本自身和元数据文件
  [[ "$name" == "restore.sh" ]] && continue
  [[ "$name" == "_settings.json" ]] && continue
  [[ "$name" == "_current-session.json" ]] && continue
  [[ "$name" == "README.md" ]] && continue

  if [ -e "$TARGET_DIR/$name" ]; then
    echo "  SKIP (exists): $name"
  else
    cp -r "$item" "$TARGET_DIR/$name"
    echo "  COPY: $name"
    copied=$((copied + 1))
  fi
done

echo ""
echo "Restored $copied items to $TARGET_DIR"

# 4. 显示可恢复的 sessions
echo ""
echo "=== Available Sessions ==="
for jsonl in "$TARGET_DIR"/*.jsonl; do
  [ -f "$jsonl" ] || continue
  uuid=$(basename "$jsonl" .jsonl)
  lines=$(wc -l < "$jsonl")
  size=$(du -h "$jsonl" | cut -f1)
  echo "  $uuid  ($lines turns, $size)"
done

echo ""
echo "Done! Run 'claude --resume' in $PROJECT_DIR to pick a session."
