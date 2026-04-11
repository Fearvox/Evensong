#!/bin/bash
# Run all microservice tests
set -e

echo "=== Running Microservice Test Suite ==="
echo ""

cd "$(dirname "$0")/.."

bun test services/ --timeout 30000

echo ""
echo "=== All tests passed ==="
