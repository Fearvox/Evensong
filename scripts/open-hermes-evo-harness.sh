#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${HERMES_HARNESS_SESSION:-hermes-harness}"
DETACH_MODE=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${HERMES_HARNESS_REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

show_unit_status() {
  local unit="$1"
  local lines="$2"
  if systemctl list-unit-files "$unit" >/dev/null 2>&1 || systemctl status "$unit" >/dev/null 2>&1; then
    systemctl status "$unit" --no-pager --lines=0 | sed -n "1,${lines}p" || true
  else
    echo "$unit not found"
  fi
}

status_loop() {
  while true; do
    clear
    date
    echo
    echo "Session: $SESSION_NAME"
    echo "Repo:    $REPO_ROOT"
    echo
    show_unit_status hermes-gateway.service 10
    echo
    show_unit_status locomo-paper-benchmark.service 10
    echo
    show_unit_status dense-rar-benchmark.service 10
    echo
    echo "Live tmux sessions"
    tmux ls 2>/dev/null || echo "no tmux sessions"
    echo
    echo "Latest Dense RAR runs"
    ls -lt "$REPO_ROOT/benchmarks/runs" 2>/dev/null | head -n 6 || true
    echo
    echo "Latest LoCoMo runs"
    ls -lt "$REPO_ROOT/benchmarks/evensong/locomo_hybrid/results" 2>/dev/null | head -n 6 || true
    sleep 5
  done
}

slot_shell() {
  local slot="$1"
  cd "$REPO_ROOT"
  printf '\n[%s slot]\n' "$slot"
  printf 'Repo: %s\n' "$REPO_ROOT"
  printf 'Common start:\n'
  printf '  hermes --tui\n'
  printf '  git status\n'
  printf '  ls benchmarks/runs | tail\n\n'
  exec bash -l
}

if [[ "${1:-}" == "--detach" ]]; then
  DETACH_MODE=1
  shift
fi

if [[ "${1:-}" == "--status-loop" ]]; then
  status_loop
  exit 0
fi

if [[ "${1:-}" == "--slot-shell" ]]; then
  slot_shell "${2:-slot}"
  exit 0
fi

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  if [[ "$DETACH_MODE" -eq 1 ]]; then
    exit 0
  fi
  exec tmux attach -t "$SESSION_NAME"
fi

SCRIPT_PATH="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"

tmux new-session -d -s "$SESSION_NAME" "bash '$SCRIPT_PATH' --status-loop"
tmux set-option -t "$SESSION_NAME" remain-on-exit on >/dev/null
tmux rename-window -t "$SESSION_NAME":0 "ops"
bench_pane="$(
  tmux split-window -v -P -F "#{pane_id}" -t "$SESSION_NAME":0.0 \
    "journalctl -u locomo-paper-benchmark.service -u dense-rar-benchmark.service -f -n 40 --no-pager"
)"
tmux split-window -h -t "$bench_pane" "journalctl -u hermes-gateway.service -f -n 40 --no-pager"
tmux select-layout -t "$SESSION_NAME":0 tiled >/dev/null

tmux new-window -t "$SESSION_NAME" -n "main" "bash '$SCRIPT_PATH' --slot-shell main"
tmux new-window -t "$SESSION_NAME" -n "research" "bash '$SCRIPT_PATH' --slot-shell research"
tmux new-window -t "$SESSION_NAME" -n "verify" "bash '$SCRIPT_PATH' --slot-shell verify"
tmux new-window -t "$SESSION_NAME" -n "bench" "bash '$SCRIPT_PATH' --slot-shell bench"

tmux set-option -t "$SESSION_NAME" mouse on >/dev/null
tmux select-window -t "$SESSION_NAME":0

if [[ "$DETACH_MODE" -eq 1 ]]; then
  exit 0
fi

exec tmux attach -t "$SESSION_NAME"
