#!/bin/bash
set -euo pipefail

# audit-infra.sh — Audit project infrastructure maturity
#
# Usage:
#   bash audit-infra.sh [--json] [--flags]
#
# Checks: test framework, linter, CI/CD, type checking, build, feature flags
# Outputs a scorecard to stdout.

OUTPUT_JSON=false
SCAN_FLAGS=false

for arg in "$@"; do
  case "$arg" in
    --json) OUTPUT_JSON=true ;;
    --flags) SCAN_FLAGS=true ;;
    --help|-h)
      echo "Usage: audit-infra.sh [--json] [--flags]"
      exit 0
      ;;
  esac
done

PROJECT_DIR="$(pwd)"
SCORE=0
MAX_SCORE=6

# ─── Helpers ─────────────────────────────────────────────────────────────────

check_pass() { echo "[x] $1: $2"; SCORE=$((SCORE + 1)); }
check_fail() { echo "[ ] $1: $2"; }
check_warn() { echo "[~] $1: $2"; }

# ─── 1. Test Framework ──────────────────────────────────────────────────────

detect_test() {
  # Bun
  if [ -f "bunfig.toml" ] && grep -q "test" bunfig.toml 2>/dev/null; then
    echo "bun-test"; return
  fi
  # package.json test script
  if [ -f "package.json" ] && grep -q '"test"' package.json 2>/dev/null; then
    local cmd
    cmd=$(grep '"test"' package.json | head -1)
    if echo "$cmd" | grep -q "jest"; then echo "jest"; return; fi
    if echo "$cmd" | grep -q "vitest"; then echo "vitest"; return; fi
    if echo "$cmd" | grep -q "mocha"; then echo "mocha"; return; fi
    if echo "$cmd" | grep -q "bun test"; then echo "bun-test"; return; fi
    echo "custom"; return
  fi
  # Config files
  if [ -f "jest.config.js" ] || [ -f "jest.config.ts" ]; then echo "jest"; return; fi
  if [ -f "vitest.config.ts" ] || [ -f "vitest.config.js" ]; then echo "vitest"; return; fi
  # Rust
  if [ -f "Cargo.toml" ]; then echo "cargo-test"; return; fi
  # Go
  if [ -f "go.mod" ]; then echo "go-test"; return; fi
  # Python
  if [ -f "pytest.ini" ]; then echo "pytest"; return; fi
  if [ -f "pyproject.toml" ] && grep -q "pytest" pyproject.toml 2>/dev/null; then echo "pytest"; return; fi

  echo "none"
}

# Test files existence
count_test_files() {
  local count
  count=$(find . \( -name "*.test.*" -o -name "*.spec.*" -o -name "*_test.go" -o -name "test_*.py" \) 2>/dev/null | \
    grep -v node_modules | grep -v .claude | wc -l) || true
  echo "${count:-0}"
}

TEST_FW=$(detect_test)
TEST_FILES=$(count_test_files)

if [ "$TEST_FW" != "none" ] && [ "$TEST_FILES" -gt 0 ]; then
  check_pass "Test Framework" "$TEST_FW ($TEST_FILES test files)"
elif [ "$TEST_FW" != "none" ]; then
  check_warn "Test Framework" "$TEST_FW configured but 0 test files found"
else
  check_fail "Test Framework" "Not configured"
fi

# ─── 2. Linter ──────────────────────────────────────────────────────────────

detect_linter() {
  if [ -f "biome.json" ] || [ -f "biome.jsonc" ]; then echo "biome"; return; fi
  if [ -f ".eslintrc" ] || [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] || [ -f "eslint.config.js" ] || [ -f "eslint.config.mjs" ]; then echo "eslint"; return; fi
  if [ -f ".prettierrc" ] || [ -f "prettier.config.js" ]; then echo "prettier"; return; fi
  # Check devDependencies
  if [ -f "package.json" ]; then
    grep -q '"@biomejs/biome"' package.json 2>/dev/null && { echo "biome-installed-not-configured"; return; }
    grep -q '"eslint"' package.json 2>/dev/null && { echo "eslint-installed-not-configured"; return; }
  fi
  # Rust
  if [ -f "Cargo.toml" ]; then echo "clippy"; return; fi
  # Go
  if [ -f ".golangci.yml" ] || [ -f ".golangci.yaml" ]; then echo "golangci-lint"; return; fi
  # Python
  if [ -f "ruff.toml" ] || [ -f ".ruff.toml" ]; then echo "ruff"; return; fi
  if [ -f ".flake8" ]; then echo "flake8"; return; fi

  echo "none"
}

LINTER=$(detect_linter)
case "$LINTER" in
  *-installed-not-configured)
    check_warn "Linter" "$(echo "$LINTER" | sed 's/-installed-not-configured//') installed but not configured"
    ;;
  none)
    check_fail "Linter" "Not configured"
    ;;
  *)
    check_pass "Linter" "$LINTER"
    ;;
esac

# ─── 3. CI/CD ───────────────────────────────────────────────────────────────

detect_ci() {
  if [ -d ".github/workflows" ] && [ "$(ls .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null | wc -l)" -gt 0 ]; then echo "github-actions"; return; fi
  if [ -f ".gitlab-ci.yml" ]; then echo "gitlab-ci"; return; fi
  if [ -f "Jenkinsfile" ]; then echo "jenkins"; return; fi
  if [ -f ".circleci/config.yml" ]; then echo "circleci"; return; fi
  if [ -f ".travis.yml" ]; then echo "travis"; return; fi
  echo "none"
}

CI=$(detect_ci)
if [ "$CI" != "none" ]; then
  check_pass "CI/CD" "$CI"
else
  check_fail "CI/CD" "Not configured"
fi

# ─── 4. Type Checking ───────────────────────────────────────────────────────

detect_types() {
  if [ -f "tsconfig.json" ]; then
    local strict
    strict=$(grep '"strict"' tsconfig.json 2>/dev/null | head -1)
    if echo "$strict" | grep -q "true"; then
      echo "typescript-strict"
    else
      echo "typescript"
    fi
    return
  fi
  if [ -f "mypy.ini" ] || [ -f ".mypy.ini" ]; then echo "mypy"; return; fi
  if [ -f "pyproject.toml" ] && grep -q "mypy" pyproject.toml 2>/dev/null; then
    echo "mypy"; return
  fi
  [ -f "go.mod" ] && { echo "go-vet"; return; }
  if [ -f "Cargo.toml" ]; then echo "rust-compiler"; return; fi
  echo "none"
}

TYPES=$(detect_types)
if [ "$TYPES" != "none" ]; then
  check_pass "Type Checking" "$TYPES"
else
  check_fail "Type Checking" "Not configured"
fi

# ─── 5. Build System ────────────────────────────────────────────────────────

detect_build() {
  if [ -f "package.json" ] && grep -q '"build"' package.json 2>/dev/null; then
    echo "npm-build"; return
  fi
  if [ -f "Cargo.toml" ]; then echo "cargo"; return; fi
  if [ -f "go.mod" ]; then echo "go"; return; fi
  if [ -f "Makefile" ]; then echo "make"; return; fi
  if [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then echo "gradle"; return; fi
  if [ -f "pom.xml" ]; then echo "maven"; return; fi
  echo "none"
}

BUILD=$(detect_build)
if [ "$BUILD" != "none" ]; then
  check_pass "Build System" "$BUILD"
else
  check_fail "Build System" "Not detected"
fi

# ─── 6. Feature Flags ───────────────────────────────────────────────────────

if [ "$SCAN_FLAGS" = true ] || [ -d "src" ]; then
  FLAG_FILES=$(grep -rl "feature(" src/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | wc -l)
  ENV_FILES=$(grep -rl "process\.env\." src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
  TOTAL_FLAGS=$((FLAG_FILES + ENV_FILES))

  if [ "$TOTAL_FLAGS" -gt 0 ]; then
    check_warn "Feature Flags" "$FLAG_FILES feature() files + $ENV_FILES process.env files"
  else
    check_pass "Feature Flags" "None detected (clean codebase)"
  fi
else
  check_pass "Feature Flags" "N/A (no src/ directory)"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "Score: $SCORE / $MAX_SCORE"
echo ""

if [ "$SCORE" -eq "$MAX_SCORE" ]; then
  echo "All checks passing. Infrastructure is solid."
elif [ "$SCORE" -ge 4 ]; then
  echo "Good foundation. Address the [ ] items above to improve."
else
  echo "Significant gaps found. Consider running Phase 2 (install-skills.sh) first."
fi

# ─── JSON Output ─────────────────────────────────────────────────────────────

if [ "$OUTPUT_JSON" = true ]; then
  cat <<ENDJSON

{
  "score": $SCORE,
  "max_score": $MAX_SCORE,
  "test_framework": "$TEST_FW",
  "test_files": $TEST_FILES,
  "linter": "$LINTER",
  "ci": "$CI",
  "type_checking": "$TYPES",
  "build_system": "$BUILD",
  "feature_flag_files": ${FLAG_FILES:-0}
}
ENDJSON
fi
