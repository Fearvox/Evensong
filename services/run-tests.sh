#!/bin/bash
# Run all microservice tests
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_SERVICES=()

SERVICES=(auth users products orders payments notifications analytics search)
PORTS=(3001 3002 3003 3004 3005 3006 3007 3008)

echo "============================================"
echo "  Microservice Test Suite"
echo "============================================"
echo ""

for i in "${!SERVICES[@]}"; do
  svc="${SERVICES[$i]}"
  port="${PORTS[$i]}"
  echo "--- $svc (port $port) ---"
  if [ -d "$svc/__tests__" ]; then
    OUTPUT=$(cd "$SCRIPT_DIR/.." && bun test "services/$svc/__tests__/" 2>&1) || true
    echo "$OUTPUT" | tail -5

    PASS=$(echo "$OUTPUT" | grep -oE '[0-9]+ pass' | grep -oE '[0-9]+' || echo "0")
    FAIL=$(echo "$OUTPUT" | grep -oE '[0-9]+ fail' | grep -oE '[0-9]+' || echo "0")

    TOTAL_PASS=$((TOTAL_PASS + PASS))
    TOTAL_FAIL=$((TOTAL_FAIL + FAIL))

    if [ "$FAIL" -gt 0 ]; then
      FAILED_SERVICES+=("$svc")
    fi
  else
    echo "  No tests found"
  fi
  echo ""
done

# Integration tests
if [ -d "integration/__tests__" ]; then
  echo "--- integration ---"
  OUTPUT=$(cd "$SCRIPT_DIR/.." && bun test "services/integration/__tests__/" 2>&1) || true
  echo "$OUTPUT" | tail -5

  PASS=$(echo "$OUTPUT" | grep -oE '[0-9]+ pass' | grep -oE '[0-9]+' || echo "0")
  FAIL=$(echo "$OUTPUT" | grep -oE '[0-9]+ fail' | grep -oE '[0-9]+' || echo "0")

  TOTAL_PASS=$((TOTAL_PASS + PASS))
  TOTAL_FAIL=$((TOTAL_FAIL + FAIL))

  if [ "$FAIL" -gt 0 ]; then
    FAILED_SERVICES+=("integration")
  fi
  echo ""
fi

echo "============================================"
echo "  Results: $TOTAL_PASS passed, $TOTAL_FAIL failed"
echo "============================================"

if [ ${#FAILED_SERVICES[@]} -gt 0 ]; then
  echo "  Failed: ${FAILED_SERVICES[*]}"
  exit 1
else
  echo "  All tests passed!"
  exit 0
fi
