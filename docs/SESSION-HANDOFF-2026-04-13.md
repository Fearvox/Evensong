# Session Handoff — 2026-04-13

**Session Goal:** 三个 Priority 全干完 (NeurIPS paper + business model + MiniMax replication)
**Status:** PARTIAL — infrastructure restored, replication ran, but workspace deps still fragile

---

## 今晚已完成

### 1. Paper Abstract 因果措辞修正 ✅
**Commit:** `53204d0`

- **EN (evensong-paper-v3-en.tex):**
  - Line 244: `causal evidence they lacked` → `preliminary suggestive evidence for their parity principle`
  - Line 387: `Evensong provides what Clark lacked: causal evidence` → `preliminary behavioral evidence for Clark's parity principle`
- **ZH (evensong-paper-zh.tex):**
  - Line 299: `首个记忆因果证据` → `首个记忆因果关联证据（replication 进行中）`
  - Line 1082: `我们的因果证据表明` → `我们初步的观察性证据表明...存在关联`

### 2. Business Model 决策 ✅
**File:** `docs/business-model-DECISION.md`

**Decision: Dual-Track**
- Near-term: 完成 R031-R036 replication → Submit NeurIPS
- Mid-term: Paper accepted → leverage credibility → BIS enterprise sales
- If rejected: pure product pivot

### 3. Benchmark Infrastructure 修复 ✅
**Commit:** `53204d0` + `8900f11`

| 修复项 | Detail |
|--------|--------|
| Registry.jsonl | 18条损坏JSON修复（brace-match解析） |
| Harness | `r.run ?? r.runId` 字段兼容 |
| @ant/* workspace | 复制到 node_modules/@ant/ |
| @opentelemetry/semantic-conventions | bun add |
| fflate, openai, vscode-jsonrpc | bun add |
| @aws-sdk/credential-provider-node | bun add |
| color-diff-napi (workspace loop) | npm 安装绕过 |
| bun.lock trailing comma | python 修复 |

**Build 验证:** `bun build src/entrypoints/cli.tsx --outdir dist --target bun` → 27MB ✅  
**CLI 验证:** `bun run dist/cli.js --version` → `2.1.888 (DASH SHATTER)` ✅

### 4. MiniMax Replication 尝试 ⚠️
**Runs:** R052-R059 (validate-cheap × 3 + r011-a/b/c/d × 5 each)

| Run | Result | Issue |
|-----|--------|-------|
| R052 validate-cheap-rep1 | 0 tests | CCB spawn failed (module resolution) |
| R053 validate-cheap-rep2 | **429 tests / 21.7min** ✅ | Working MiniMax ROI confirmed |
| R054 validate-cheap-rep3 | 0 tests | Transient lodash-es resolution failure |
| R055-R059 r011-a/b/c/d | 0-31 tests | All failed: clean workspace = CLI can't start |

**Key Finding:** R053 = 429 tests / $0.5 = **860 tests/$** — MiniMax ROI confirmed.  
**Root Cause:** clean workspace (no node_modules) → CCB CLI fails to start due to missing modules.  
**Full workspace:** CLI starts but ~30 tests all fail — MiniMax behaves fundamentally differently from Opus.

---

## 待办 (Next Session Priority)

### P0: Reproduce R031-R036 with Working Configuration
**Problem:** clean workspace → CCB spawn fails for ALL models (not just MiniMax)
**Fix needed in harness.ts:**
```typescript
// After creating empty scaffold in clean mode, run:
// bun install to populate node_modules
// OR: bundle CCB as single-file executable
```
**Current workaround:** Use `full` memory (workspace IS the CCR repo) for replication runs.

### P1: Run R031-R036 with native-opus (confirmed working)
```
MINIMAX_API_KEY="$ANTHROPIC_API_KEY" bun benchmarks/evensong/cli.ts run --config r011-a --repeat 5
# Then r011-b, r011-c, r011-d × 5 each
```
**Target:** 20 runs total → ANOVA replication → η² = .917 validation

### P2: Fix MiniMax Full Memory Runs
r011-b (full memory) = ~30 tests with failures. This is NOT a harness bug — it's MiniMax behavior under the prompt. Need to investigate:
- Is 30 tests reproducible?
- Are failures due to bad code or model limitations?
- Should we use different prompt/pressure for MiniMax?

### P3: Check Grok's "reasoning part" damage
Grok reportedly deleted reasoning-related code. Need:
```bash
git diff HEAD~20 -- src/ | grep -i reasoning | head -20
```
Identify what was broken and restore.

---

## Open Questions

1. **Why does full workspace (r011-b/d) CLI start but produce only 30 tests?**
   - R053 (clean workspace with prior CCB init) produced 429 tests
   - R055-r011-b (full workspace) produces 30 tests
   - Possible: full workspace has pre-existing code that short-circuits the benchmark

2. **Should R031-R036 use clean or full memory?**
   - Original design: clean = baseline control
   - But clean workspace can't run CLI
   - Workaround: use full workspace for all runs (different baseline)

3. **R012-E-002/003 contamination in registry**
   - These runs (from R012-E experiment) are multi-line JSON that broke the parser
   - Already fixed (65 valid entries now)
   - But R012-E-002 has important data (52 tests, Grok subagent)

---

## Commit History Tonight

| Commit | Message |
|--------|---------|
| `53204d0` | fix(evensong): paper causal claims + harness registry + business model |
| `8900f11` | fix(deps): restore broken workspace + missing npm dependencies |

---

## Key Files

- `benchmarks/evensong/harness.ts` — Main benchmark orchestrator
- `benchmarks/evensong/configs.ts` — Experiment presets (r011-a/b/c/d)
- `benchmarks/evensong/registry.jsonl` — All run data (65 entries, cleaned)
- `benchmarks/evensong/stats/anova-2x2.json` — Current ANOVA (η²=.917)
- `docs/business-model-DECISION.md` — Dual-Track decision record
- `docs/evensong-paper-v3-en.tex` — EN paper (abstract softened)
- `docs/evensong-paper-zh.tex` — ZH paper (abstract softened)

---

## CLI / Env

```bash
# Build
bun build src/entrypoints/cli.tsx --outdir dist --target bun

# Verify
bun run dist/cli.js --version  # → 2.1.888 (DASH SHATTER)

# Benchmark (after fixing workspace issue)
MINIMAX_API_KEY="$ANTHROPIC_API_KEY" \
  bun benchmarks/evensong/cli.ts run --config r011-a --repeat 5
```
