# Grok CLI Handoff: Evensong Paper EN Revision

## Task
Fix the English paper `docs/evensong-paper-en.tex` based on peer review feedback. Build PDF with `latexmk -xelatex docs/evensong-paper-en.tex`. Commit when done.

## Paper Location
`docs/evensong-paper-en.tex` (946 lines, 24 pages, XeLaTeX)

## What Just Happened
We ran a 2x2 factorial experiment (Memory x Pressure) on AI coding agents. ANOVA complete. Data:

```
Cell A (Clean+L0):  n=3, tests=[424, 587, 522], M=511
Cell B (Full+L0):   n=3, tests=[0, 16, 8],      M=5 (delta from existing 787)
Cell C (Clean+L2):  n=2, tests=[517, 351],       M=434
Cell D (Full+L2):   n=3, tests=[7, 7, 7],        M=7 (delta)

ANOVA:
  Memory:            F(1,7)=157.4, p<.001, eta2=.917 ***
  Pressure:          F(1,7)=4.5,   p=.072, eta2=.026 ns
  Memory x Pressure: F(1,7)=2.6,   p=.148, eta2=.015 ns
```

Key finding: Memory agents see existing code -> switch to maintenance (delta ~7). Clean room agents build from scratch (~500). Memory doesn't boost output, it REDEFINES THE TASK.

## Peer Review: Weak Reject. Fix These 8 Issues:

### MUST FIX (blocks acceptance)

**1. "Causal" overclaim** — Paper says "causal evidence" everywhere (title, abstract, S1, S4, conclusion). N=11 ANOVA cannot support causal claims. 
- ACTION: Replace "causally changes" with "systematically alters" or "is associated with changes in"
- Keep "causal" only when discussing the experimental DESIGN's intent, not the FINDINGS
- Title suggestion: "How Persistent Memory Alters AI Agent Engineering Strategy: A 2x2 Factorial Study"

**2. DV is ceiling/floor effect** — Reviewer's killer question: "agents who see existing code produce fewer new tests — trivially true, not memory causation."
- ACTION: Add paragraph in Discussion acknowledging this confound explicitly
- Note that the contribution is the OBSERVATION that memory redefines task interpretation, not a strong causal mechanism claim
- Mention future work: test with existing code but NO memory to disentangle

**3. Pressure claim contradicts data** — Abstract/contributions claim "pressure-driven self-evolution" but ANOVA says pressure ns (p=.072)
- ACTION: Abstract line ~247 and contributions ~283: revise to match data. Say "pressure shows a marginal trend (p=.072) but does not reach significance at conventional thresholds"
- Remove "necessary condition" language for pressure

### SHOULD FIX (improves chances)

**4. ProductSigma is anecdotal** — Section 4.3 "emergent" behaviors are single observations
- ACTION: Add qualifier: "These observations are from a single uncontrolled deployment and should be considered exploratory evidence requiring controlled replication"

**5. Branding too heavy** — "DASH SHATTER", custom color palette, brand styling
- ACTION: Remove "DASH SHATTER" from section headers. Keep it only in author affiliation. Remove brand color palette commentary. Make it read like a paper, not a product launch

**6. Cross-model comparison not controlled** — Claude L2 vs Grok L3 is not apples-to-apples
- ACTION: Add sentence: "We note this comparison is across both model and pressure level; same-model cross-pressure comparisons are needed"

**7. References incomplete** — [6] [7] have "arXiv:2502.xxxxx", [8] [15] are internal reports
- ACTION: Either find real arXiv IDs or cite as "forthcoming" / remove

**8. "Single-blind" misuse** — AI agents aren't human subjects
- ACTION: Replace "single-blind" with "information-controlled" or "memory-isolated" throughout

## Style Notes
- arXiv audience: ML researchers, not investors. Kill marketing language.
- Keep the Panopticon topology finding — reviewer liked it
- Keep recursive contamination finding — reviewer liked it
- The "memory redefines task" framing IS the contribution. Make it the star.

## Don't Touch
- TikZ figures (they compile fine)
- Appendix A (decay model)
- Appendix B (harness bug log)
- References that ARE complete

## Build Command
```bash
cd /Users/0xvox/claude-code-reimagine-for-learning/docs
latexmk -xelatex evensong-paper-en.tex
```

## Commit Message Template
```
paper(en): revise per peer review — downgrade causal claims, fix pressure contradiction, debrand
```
