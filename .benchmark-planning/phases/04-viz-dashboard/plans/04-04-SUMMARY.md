# SUMMARY 04-04: Unified Dashboard

## What

Single `dashboard.html` assembling all 3 visualizations (LOCOMO bar chart, MTEB radar, resource table) under tabbed navigation. Deployable to GitHub Pages at `https://Fearvox.github.io/Evensong/benchmarks/evensong/viz/dashboard.html`.

## Implementation

`benchmarks/evensong/viz/dashboard.html`:
- Brutalist dark theme (#0a0a0a background, #00e5ff accent)
- 3 tabs: LOCOMO Per-Category | MTEB Retrieval | Resource Metrics
- Each tab: inline iframe to the respective sub-viz
- Footer with data provenance + source links
- Zero build step — pure HTML/CSS/JS, CDN Chart.js

## Tabs

| Tab | Viz | Source |
|-----|-----|--------|
| 1 | LOCOMO bar chart | `locomorag_chart.html` |
| 2 | MTEB radar | `mteb_radar_chart.html` |
| 3 | Resource table | `resource_table.html` |

## Deployment

Push to GitHub → GitHub Pages auto-serves static files at:
```
https://Fearvox.github.io/Evensong/benchmarks/evensong/viz/dashboard.html
```

## Notes

- This is the **shippable artifact** for EverMind algorithm team
- Embeddable in internal docs via iframe or link
- All data embedded in HTML (no server, no API keys)
- Chart.js via CDN — requires internet access to load
