# Benchmark Data Completeness + Website Sync + Chart Generation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整同步 benchmark 数据到所有网站（EN/ZH），生成模型对比图表，更新论文数据。

**Architecture:** 三阶段流水线：①数据清洗验证 ②网站同步 ③图表生成+论文更新。数据源 = `benchmarks/evensong/registry.jsonl`（108条），目标 = 4个HTML文件 + 2个LaTeX文件。

**Tech Stack:** Python3（数据处理）+ Rechart/Prext（图表）+ 原有HTML/LaTeX文件

---

## Phase 0: Data Audit & Classification

### Task 0: Full Registry Audit

**Files:**
- Read: `benchmarks/evensong/registry.jsonl` (108 lines)
- Read: `benchmarks/index.html` (current EN dashboard)
- Read: `benchmarks/zh/index.html` (current ZH dashboard)
- Read: `benchmarks/research.html`
- Read: `benchmarks/zh/research.html`

- [ ] **Step 1: Classify all 108 registry entries**

Run:
```python
python3 -c "
import json
from collections import defaultdict

lines = [json.loads(l) for l in open('benchmarks/evensong/registry.jsonl')]
runs = [l for l in lines if l.get('run')]

# Classify by data quality
CLASS_A = []  # tests_new > 0, real agent output
CLASS_B = []  # tests_new == 0 but tests_pre > 0, inherited/contaminated
CLASS_C = []  # tests_new == 0 and tests_pre == 0, failed/no data

for r in runs:
    new = r.get('tests_new', 0)
    pre = r.get('tests_pre', 0)
    if new > 0:
        CLASS_A.append(r)
    elif pre > 0:
        CLASS_B.append(r)
    else:
        CLASS_C.append(r)

print(f'Class A (valid agent output): {len(CLASS_A)}')
for r in sorted(CLASS_A, key=lambda x: x['run']):
    print(f'  {r[\"run\"]}: model={r.get(\"model\",\"?\")[:40]} new={r[\"tests_new\"]} pre={r.get(\"tests_pre\",0)}')

print(f'\\nClass B (inherited/contaminated): {len(CLASS_B)}')
for r in sorted(CLASS_B, key=lambda x: x['run'])[:10]:
    print(f'  {r[\"run\"]}: pre={r.get(\"tests_pre\",0)}')

print(f'\\nClass C (failed/nodata): {len(CLASS_C)}')
for r in sorted(CLASS_C, key=lambda x: x['run'])[:5]:
    print(f'  {r[\"run\"]}')
"
```

- [ ] **Step 2: Identify missing runs from website**

Run:
```python
python3 -c "
import json, re

lines = [json.loads(l) for l in open('benchmarks/evensong/registry.jsonl')]
html = open('benchmarks/index.html').read()
web_runs = set(re.findall(r'R0\d\d[_-]', html))
reg_runs = set(r.get('run','') for r in lines if r.get('run','').startswith('R0'))

missing = sorted(reg_runs - web_runs, key=lambda x: (len(x), x))
print(f'Missing from website: {len(missing)} runs')
print(f'First: {missing[0]}, Last: {missing[-1]}')

# Show which are Class A (need website update most)
CLASS_A_ids = [r['run'] for r in lines if r.get('tests_new', 0) > 0]
a_missing = [r for r in missing if r in CLASS_A_ids]
print(f'Missing Class A (highest priority): {len(a_missing)}')
for r in a_missing:
    print(f'  {r}')
"
```

- [ ] **Step 3: Save audit report**

Run:
```bash
python3 benchmarks/evensong/audit_registry.py  # generate audit report
```

---

## Phase 1: Website Synchronization

### Task 1: Sync EN Dashboard (`benchmarks/index.html`)

**Files:**
- Modify: `benchmarks/index.html`
- Read: `benchmarks/evensong/registry.jsonl`

- [ ] **Step 1: Add R031-R064 rows to comparison table**

Find the table section (around line 1062-1360). Add rows for Class A runs (R037-R047, R052, R053):
```
<tr data-model="opus" data-type="normal">
  <td class="mono">R037</td>
  <td><span class="model-badge">Opus 4.6 (OAuth)</span></td>
  <td>R011 Memory Effect Study</td>
  <td class="mono">8</td>
  <td class="mono">424</td>
  <td class="mono">424</td>
  <td class="pass-rate">8/8</td>
</tr>
```

- [ ] **Step 2: Update era metadata**

Find `<span class="era-meta">R015-R030</span>` and update to `R015-R064`.

- [ ] **Step 3: Update total statistics**

Find and update:
- Total runs count
- Total tests count
- Model count

### Task 2: Sync ZH Dashboard (`benchmarks/zh/index.html`)

**Files:**
- Modify: `benchmarks/zh/index.html`
- Read: `benchmarks/evensong/registry.jsonl`

- [ ] **Step 1: Add same R031-R064 rows to ZH table**

Mirror Task 1 but for Chinese layout. Preserve Chinese labels for mode names.

- [ ] **Step 2: Update ZH era metadata**

- [ ] **Step 3: Update ZH statistics**

### Task 3: Sync EN Research Page (`benchmarks/research.html`)

**Files:**
- Modify: `benchmarks/research.html`
- Read: `benchmarks/evensong/registry.jsonl`

- [ ] **Step 1: Add research cards for new runs**

For R037-R039 (Opus L2 pressure runs), R046-R047 (Opus L2 clean room), R052-R053 (MiniMax validation):
- Create research card entries
- Document behavior observed
- Add to research timeline

### Task 4: Sync ZH Research Page (`benchmarks/zh/research.html`)

**Files:**
- Modify: `benchmarks/zh/research.html`
- Mirror Task 3 for Chinese version

---

## Phase 2: Model Quality Analysis & Charts

### Task 5: Compute Per-Model Statistics

**Files:**
- Create: `benchmarks/evensong/model_stats.py`
- Read: `benchmarks/evensong/registry.jsonl`

- [ ] **Step 1: Compute model-level aggregates**

```python
import json
from collections import defaultdict

lines = [json.loads(l) for l in open('benchmarks/evensong/registry.jsonl')]

# Group by model
by_model = defaultdict(list)
for r in lines:
    model = r.get('model', 'unknown')
    by_model[model].append(r)

# Compute per-model stats
for model, runs in sorted(by_model.items(), key=lambda x: -sum(r.get('tests_new',0) for r in x[1])):
    total_new = sum(r.get('tests_new', 0) for r in runs)
    total_pre = sum(r.get('tests_pre', 0) for r in runs)
    valid_runs = [r for r in runs if r.get('tests_new', 0) > 0]
    avg_new = total_new / len(valid_runs) if valid_runs else 0
    print(f'{model[:40]}: runs={len(runs)}, valid={len(valid_runs)}, total_new={total_new}, avg_new={avg_new:.0f}')
```

- [ ] **Step 2: Generate comparison metrics vs baseline**

Baseline: R002 Opus Codex (111 tests, 18/18 criteria)
Compute: efficiency ratio, criteria pass rate, cost per test

### Task 6: Generate Rechart/Prext Comparison Charts

**Files:**
- Create: `docs/charts/model-comparison.tsx` (Rechart component)
- Create: `docs/charts/compute-efficiency.tsx`
- Modify: `docs/evensong-paper-en.tex` (replace static charts)
- Modify: `docs/evensong-paper-zh.tex`

- [ ] **Step 1: Build model comparison bar chart**

Chart data for each model:
- Model name
- Total tests_new
- Avg tests per valid run
- Criteria pass rate (%)
- Cost per 1000 tests ($)

```tsx
// docs/charts/model-comparison.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const data = [
  { model: 'Opus 4.6', tests_new: 2882, avg_per_run: 480, pass_rate: 100, cost_per_1k: 0.52 },
  { model: 'MiniMax-M2.7', tests_new: 1270, avg_per_run: 317, pass_rate: 83, cost_per_1k: 0.09 },
  { model: 'Grok 4.1 Fast', tests_new: 959, avg_per_run: 479, pass_rate: 75, cost_per_1k: 0.31 },
  { model: 'Gemini 3.1', tests_new: 337, avg_per_run: 337, pass_rate: 100, cost_per_1k: 0.42 },
  { model: 'GPT-5.4 Codex', tests_new: 336, avg_per_run: 336, pass_rate: 100, cost_per_1k: 1.18 },
];
```

- [ ] **Step 2: Build compute efficiency scatter plot**

X: cost per run ($), Y: tests_new per run, bubble size = criteria score

- [ ] **Step 3: Build memory effect waterfall (R011 ANOVA data)**

From paper v3: F(1,7)=157.4, p<.001, η²=.917
Visualize clean vs full memory breakdown by model

### Task 7: Update Paper with New Charts

**Files:**
- Modify: `docs/evensong-paper-en.tex`
- Modify: `docs/evensong-paper-zh.tex`
- Create: `docs/charts/` (generated SVG or PDF exports)

- [ ] **Step 1: Replace Figure 3 (model comparison bar chart)**

```latex
\begin{figure}[ht]
\centering
\caption{Model Performance Comparison (R001-R064)}
\label{fig:model-comparison}
% Include PDF/SVG from Rechart export
\end{figure}
```

- [ ] **Step 2: Update Table 2 (per-model statistics)**

Insert computed values from Task 5.

- [ ] **Step 3: Update ANOVA summary in paper**

Add R037-R047 data to the memory effect analysis. Recompute η² if needed.

---

## Phase 3: Quality Assurance

### Task 8: Cross-Website Consistency Check

**Files:**
- Create: `benchmarks/evensong/verify_sync.py`

- [ ] **Step 1: Verify all websites show same run set**

```python
python3 -c "
import re

files = {
    'EN dashboard': 'benchmarks/index.html',
    'ZH dashboard': 'benchmarks/zh/index.html',
    'EN research': 'benchmarks/research.html',
    'ZH research': 'benchmarks/zh/research.html',
}

for name, path in files.items():
    html = open(path).read()
    runs = sorted(set(re.findall(r'R0\d\d[_-]?', html)))
    print(f'{name}: {len(runs)} runs, last={runs[-1] if runs else \"none\"}')
"
```

- [ ] **Step 2: Verify registry vs website row counts match**

- [ ] **Step 3: Verify Chinese text preserves correct terminology**

Check: 模型名称(service names), 模式名(mode names), 技术术语 — all i18n compliant

### Task 9: Compile Paper PDF and Verify

**Files:**
- Modify: `docs/evensong-paper-en.tex`
- Modify: `docs/evensong-paper-zh.tex`

- [ ] **Step 1: Build EN paper**

Run: `cd docs && latexmk -C && latexmk -pdf evensong-paper-en.tex`
Expected: 0 errors

- [ ] **Step 2: Build ZH paper**

Run: `cd docs && latexmk -C && latexmk -pdf evensong-paper-zh.tex`
Expected: 0 errors

- [ ] **Step 3: Verify PDF output exists**

Run: `ls -la docs/evensong-paper-en.pdf docs/evensong-paper-zh.pdf`

---

## Execution Options

**Which approach?**

1. **Subagent-Driven (recommended)** — I dispatch subagents per phase, fast parallel iteration
2. **Inline Execution** — I execute phases sequentially in this session with checkpoints