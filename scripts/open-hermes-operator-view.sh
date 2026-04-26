#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${HERMES_OPERATOR_SESSION:-hermes-operator}"
REPO_ROOT="${HERMES_OPERATOR_REPO_ROOT:-/opt/evensong/ccr}"
DETACH_MODE=0

show_unit_status() {
  local unit="$1"
  local lines="$2"
  if systemctl list-unit-files "$unit" >/dev/null 2>&1 || systemctl status "$unit" >/dev/null 2>&1; then
    systemctl status "$unit" --no-pager --lines=0 | sed -n "1,${lines}p" || true
  else
    echo "$unit not found"
  fi
}

if [[ "${1:-}" == "--detach" ]]; then
  DETACH_MODE=1
  shift
fi

status_loop() {
  while true; do
    clear
    date
    echo
    show_unit_status hermes-gateway.service 12
    echo
    show_unit_status locomo-paper-benchmark.service 14
    echo
    show_unit_status dense-rar-benchmark.service 14
    echo
    echo "Latest Dense RAR runs"
    ls -lt "$REPO_ROOT/benchmarks/runs" 2>/dev/null | head -n 8 || true
    echo
    echo "Latest LoCoMo runs"
    ls -lt "$REPO_ROOT/benchmarks/evensong/locomo_hybrid/results" 2>/dev/null | head -n 8 || true
    sleep 5
  done
}

if [[ "${1:-}" == "--status-loop" ]]; then
  status_loop
  exit 0
fi

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  if [[ "$DETACH_MODE" -eq 1 ]]; then
    exit 0
  fi
  exec tmux attach -t "$SESSION_NAME"
fi

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

tmux new-session -d -s "$SESSION_NAME" "bash '$SCRIPT_PATH' --status-loop"
tmux split-window -v -t "$SESSION_NAME":0.0 "journalctl -u locomo-paper-benchmark.service -u dense-rar-benchmark.service -f -n 40 --no-pager"
tmux split-window -h -t "$SESSION_NAME":0.1 "journalctl -u hermes-gateway.service -f -n 40 --no-pager"
tmux select-pane -t "$SESSION_NAME":0.0
tmux select-layout -t "$SESSION_NAME" tiled >/dev/null
tmux set-option -t "$SESSION_NAME" mouse on >/dev/null
tmux rename-window -t "$SESSION_NAME":0 "ops"

if [[ "$DETACH_MODE" -eq 1 ]]; then
  exit 0
fi

exec tmux attach -t "$SESSION_NAME"
