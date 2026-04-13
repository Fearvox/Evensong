# Business Model Decision — Evensong / DASH SHATTER

**Date:** 2026-04-13
**Author:** Hengyuan Zhu
**Status:** DECIDED — Dual-Track

---

## The Question

Should DASH SHATTER Research pursue the **academic publication path** (NeurIPS paper) or the **product commercialization path** (BIS tooling)?

---

## Option A: Academic Publication Path

**What:** Submit Evensong paper to NeurIPS 2026 (or EMNLP/ICLR if rejected).

**Pros:**
- η²=.917 is a strong, surprising finding — exactly what NeurIPS reviewers want
- Strange loop discovery is novel and philosophically interesting
- Cross-model reward hacking (Grok 83% inflation) has broad implications
- First-mover: no existing benchmark measures memory's causal effect on agent behavior
- Academic credibility enables speaking engagements, consulting rates, university affiliation

**Cons:**
- Single-lab replication needed before strong causal claims (R031-R036)
- Single author from non-top institution — weak social proof
- Timeline: NeurIPS rebuttal = 3-6 months minimum
- No revenue during review period

**Revenue model:** Academic consulting + dataset licensing

---

## Option B: Product Path (BIS Tooling)

**What:** Build and sell Belief Injection System auditing tools to enterprises using AI coding agents.

**Pros:**
- Real problem: every enterprise using AI coding agents is affected by memory contamination
- SOC2/GDPR auditors would pay for BIS audit reports
- Agent developers (LangChain, CrewAI, AutoGen) would pay for benchmarking
- Fast to ship: MVP = CLI tool + PDF report

**Cons:**
- Market education needed: most enterprises don't know memory contamination is a risk
- Competitive moat unclear: benchmark methodology is not defensible IP
- Selling to enterprises requires sales team, security certifications, legal review
- Timeline to revenue: 6-18 months

**Revenue model:** B2B SaaS / per-test pricing

---

## Option C: Dual-Track (DECIDED)

**Simultaneously:**

1. **Near-term (Now → 3 months):** Complete R031-R036 replication → Submit to NeurIPS
2. **Mid-term (3-12 months):** If paper accepted → leverage academic credibility to sell BIS tooling to enterprise
3. **If paper rejected:** Pivot fully to product path; the methodology is the product

**Rationale:**
- The paper is the credibility foundation. Without it, BIS tool = random GitHub repo.
- The product validates the research market. If enterprises won't pay, the research is academically interesting but economically useless.
- No conflict: paper publishes open-access; product is the engineering implementation.

**Revenue in Dual-Track years 1-2:**
- Consulting: $5K-20K/engagement × 4-8 engagements = $20K-160K
- BIS Tool pilot: $10K-30K/pilot × 2-4 pilots = $20K-120K
- **Total: $40K-280K year 1-2 (highly variable)**

---

## Critical Path for This Week

| Priority | Action | ROI |
|----------|--------|-----|
| P1 | R031-R036 MiniMax replication (N≥5/cell) | Validates η²=.917 → paper credible |
| P2 | Paper abstract fix (done ✓) | Removes overclaiming |
| P3 | Business model doc (done ✓) | Clarifies direction |

---

## Decision Owner

Hengyuan Zhu — sole author, all decisions final.

---

*This document is the binding record. Update when direction changes.*
