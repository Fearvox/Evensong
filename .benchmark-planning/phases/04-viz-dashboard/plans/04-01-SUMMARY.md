# SUMMARY 04-01: LOCOMO Per-Category Bar Chart

## What

Interactive grouped bar chart comparing BGE-M3 dense vs dragon baseline across all 5 LOCOMO categories, showing both F1 and Recall@5.

## Implementation

`benchmarks/evensong/viz/locomorag_chart.html` — self-contained Chart.js bar chart:
- 5 category groups on X-axis
- Two chart modes: F1 only, Recall@5 only, or Both
- BGE-M3 dense (solid #00e5ff) vs dragon (dashed #ff9500)
- Responsive, PNG export via right-click

## Data (from Phase 2 Conv1 baseline)

| Cat | Name | Dense Recall | Dragon Recall | Dense F1 | Dragon F1 |
|-----|------|-------------|--------------|----------|-----------|
| 1 | Personal Facts | TBD | TBD | TBD | TBD |
| 2 | Temporal | 0.86 | 0.72 | 0.29 | 0.25 |
| 3 | Inferences | 0.68 | 0.55 | TBD | TBD |
| 4 | Explanations | 0.63 | 0.52 | TBD | TBD |
| 5 | Adversarial | 0.41 | 0.35 | 0.14 | 0.12 |

BGE-M3 dense wins on all categories with recall data.

## Notes

- Cat1 (Personal Facts) has no data yet — needs full 10-conversation LOCOMO run
- Chart is read-only; data embedded in JS for self-contained deployment
- Source: Phase 2 LOCOMO Conv1 evaluation (199 QAs)
