# Plan 02-02: Generate Per-Category LOCOMO Analysis

## What

Break down LOCOMO results by the 5 categories: Personal Facts, Temporal, Inferences, Explanations, Adversarial.

## Why

Different categories may favor different retrieval strategies. Per-category analysis reveals where BGE-M3 dense excels or struggles.

## How

### Step 1: Parse category from LOCOMO QA

Each QA entry has `category` field (0-4):
- 0: Personal Facts
- 1: Temporal
- 2: Inferences
- 3: Explanations
- 4: Adversarial

### Step 2: Aggregate per-category

```python
CATEGORY_NAMES = ['Personal Facts', 'Temporal', 'Inferences', 'Explanations', 'Adversarial']

results_by_category = {i: {'recall': [], 'f1': []} for i in range(5)}

for item in locomo_data:
    for qa in item['qa']:
        cat = qa['category']
        recall, f1 = evaluate_qa(qa, retrieved_ids)
        results_by_category[cat]['recall'].append(recall)
        results_by_category[cat]['f1'].append(f1)

# Compute averages
for cat in results_by_category:
    print(f"{CATEGORY_NAMES[cat]}: Recall={np.mean(results_by_category[cat]['recall']):.3f}, F1={np.mean(results_by_category[cat]['f1']):.3f}")
```

### Step 3: Generate visualization

Create bar chart comparing BGE-M3 dense vs dragon per category.

## Verification

1. All 5 categories have > 0 samples
2. Per-category Recall and F1 computed correctly
3. Chart saved to `results/locomorag_by_category.png`

## Success Criteria

Per-category breakdown exists for all 5 LOCOMO categories with F1 and Recall per category

## Status

- [x] Completed (2026-04-22)

## Results (LOCOMO10 Conv1, 199 QAs)

| Category | Count | Recall@5 | F1 |
|----------|-------|----------|----|
| Cat1 (Personal Facts) | 32 | 0.35 | 0.20 |
| Cat2 (Temporal) | 37 | 0.86 | 0.29 |
| Cat3 (Inferences) | 13 | 0.46 | 0.21 |
| Cat4 (Explanations) | 70 | 0.68 | 0.23 |
| Cat5 (Adversarial) | 47 | 0.41 | 0.14 |
