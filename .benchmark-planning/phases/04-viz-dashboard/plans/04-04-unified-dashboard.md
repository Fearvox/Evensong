---
name: 04-04 Unified Dashboard
objective: Single HTML page assembling all 4 visualizations under one stable URL
plan_number: "04-04"
phase: "04"
wave: 2
autonomous: true
gap_closure: false
status: pending
created: "2026-04-22"
key-files:
  created:
    - benchmarks/evensong/viz/dashboard.html
  modified: []
must-haves:
  - Single HTML page at stable URL
  - All 4 visualizations accessible: LOCOMO bar chart, MTEB radar, resource table
  - Unified header + branding (EverMind x Evensong)
  - Deployable to GitHub Pages
tasks:
  - { id: 1, name: "Assemble sub-pages in dashboard.html", description: "Inline or iframe each viz into single page with nav tabs" }
  - { id: 2, name: "Add unified branding", description: "Header with EverMind x Evensong branding, nav between 3 sections" }
  - { id: 3, name: "Add footer with data provenance", description: "Note data sources: LOCOMO Conv1 baseline, synthetic MTEB benchmark, R066-R070 registry" }
  - { id: 4, name: "Deploy to GitHub Pages", description: "Push to benchmarks/evensong/viz/ — GitHub Pages auto-serves" }
---

# Plan: 04-04 — Unified Dashboard

## What

Single HTML page assembling all visualizations (LOCOMO bar chart, MTEB radar, resource table) under one URL, deployable to GitHub Pages.

## How

Architecture: single `dashboard.html` with tabbed navigation:
- Tab 1: LOCOMO Per-Category Performance (04-01 bar chart inline)
- Tab 2: MTEB Retrieval Comparison (04-02 radar chart inline)
- Tab 3: Resource Metrics (04-03 table inline)
- CSS: minimal brutalist (matches evensong.zonicdesign.art)
- JS: tab switching via CSS + vanilla JS

## Deployment

`benchmarks/evensong/viz/dashboard.html` pushed to GitHub → GitHub Pages serves at `https://Fearvox.github.io/Evensong/benchmarks/evensong/viz/dashboard.html`

## Verification

- [ ] dashboard.html loads with 3 tabs
- [ ] Each tab shows the correct visualization
- [ ] Page loads without external dependencies failing (Chart.js CDN)
- [ ] GitHub Pages URL accessible

## Notes

- This is the "shippable artifact" for EverMind algorithm team
- Stable URL enables embedding in EverMind's internal docs
- All data embedded in HTML (no server needed)
