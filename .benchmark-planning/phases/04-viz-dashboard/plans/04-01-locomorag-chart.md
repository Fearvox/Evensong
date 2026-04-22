---
name: 04-01 LOCOMO Per-Category Bar Chart
objective: Render F1 + Recall per category bar chart for BGE-M3 dense vs dragon baseline
plan_number: "04-01"
phase: "04"
wave: 1
autonomous: true
gap_closure: false
status: pending
created: "2026-04-22"
key-files:
  created:
    - benchmarks/evensong/viz/locomorag_chart.html
  modified: []
must-haves:
  - Bar chart shows F1 and Recall@5 side-by-side for all 5 LOCOMO categories
  - BGE-M3 dense bars vs dragon bars grouped per category
  - Chart readable at 800px width, exportable as PNG
  - Baseline data from Phase 2 (Conv1): Cat1(TBD), Cat2(Temporal:R=0.86,F1=0.29), Cat3(Inference:R=0.68), Cat4(Explanation:R=0.63), Cat5(Adversarial:R=0.41,F1=0.14)
tasks:
  - { id: 1, name: "Draft chart HTML with Chart.js", description: "Build bar chart with grouped bars per category, F1 + Recall@5" }
  - { id: 2, name: "Populate with LOCOMO Conv1 baseline data", description: "Fill in baseline numbers from Phase 2 results" }
  - { id: 3, name: "Add legend and labels", description: "BGE-M3 dense vs dragon, Cat1-5 labels, axis labels" }
---

# Plan: 04-01 — LOCOMO Per-Category Bar Chart

## What

Interactive bar chart comparing BGE-M3 dense vs dragon baseline on all 5 LOCOMO categories. Shows F1 and Recall@5 side-by-side grouped by category.

## Data (from Phase 2 Conv1 baseline)

| Category | Name | Recall@5 | F1 |
|----------|------|----------|----|
| Cat1 | Personal Facts | TBD | TBD |
| Cat2 | Temporal | 0.86 | 0.29 |
| Cat3 | Inferences | 0.68 | TBD |
| Cat4 | Explanations | 0.63 | TBD |
| Cat5 | Adversarial | 0.41 | 0.14 |

Baseline dragon (from LOCOMO paper): ~R@5=0.59 overall

## How

Use Chart.js via CDN in a self-contained HTML file:
- Grouped bar chart: 5 categories × 2 metrics (F1, Recall@5)
- Two bars per category: BGE-M3 dense (blue) + dragon (orange)
- Responsive, PNG export via `chart.toBase64Image()`

## Verification

- [ ] 5 category groups visible
- [ ] BGE-M3 dense vs dragon comparison clear
- [ ] F1 and Recall@5 both shown
- [ ] PNG export works
