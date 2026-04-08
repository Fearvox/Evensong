# CCB Evolution Protocol

## Vision

One person + multi-model army vs. two tech giants. Every iteration cycle mimics Anthropic/OpenAI's internal research-to-product pipeline.

## Iteration Cycle

```
Evaluate(errors) -> Analyze(root cause) -> Update(code) -> Test(regression) -> Release(notes) -> Publish -> Monitor -> Repeat
```

### Phase 1: Evaluate
- Run adversarial analysis against current codebase (Codex, Gemini, MiniMax Hermes)
- Cross-reference with Anthropic Red Team findings (Mythos System Card)
- Identify: destructive behaviors, over-refusal, confabulation cascades, reward hacking

### Phase 2: Analyze
- Map each finding to specific code path (file:line)
- Classify: CRITICAL (security) / HIGH (behavior) / MEDIUM (quality) / LOW (cosmetic)
- Root cause: is it a feature gate? A stub? A missing check? An architectural gap?

### Phase 3: Update
- Write fix with test (TDD: test first, then implementation)
- Each fix is atomic commit with conventional commit message
- Verify no regression: `bun test` must pass

### Phase 4: Release
- Generate CHANGELOG entry from commits since last release
- Bump version in package.json
- Write release notes: what changed, why, what it enables
- Tag release in git

### Phase 5: Publish
- Build: `bun run build`
- Verify dist/cli.js works
- Push to remote
- Update ROADMAP.md progress

### Phase 6: Monitor
- Run next adversarial evaluation
- Compare metrics: test count, pass rate, feature coverage
- Feed findings back to Phase 1

## Multi-Model Army

### Available Models (for CCB to USE as providers)

| Model | Provider | API | Status |
|-------|----------|-----|--------|
| Claude Opus 4.6 | Anthropic | @anthropic-ai/sdk | Active |
| Claude Sonnet 4.6 | Anthropic | @anthropic-ai/sdk | Active |
| Claude Haiku 4.5 | Anthropic | @anthropic-ai/sdk | Active |
| GPT-5.4 / Codex | OpenAI | openai SDK | To add |
| Gemini 3.1 Pro | Google | @google/generative-ai | To add |
| MiniMax (abab7) | MiniMax | minimax SDK / OpenAI-compat | To add |
| Xiaomi MiLM | Xiaomi | OpenAI-compatible | To add |
| Grok 3 | xAI | OpenAI-compatible | To add |

### Architecture: Multi-Provider Router

```
User Request
    |
    v
Provider Router (src/utils/model/providers.ts)
    |
    +-> Anthropic (existing)
    +-> AWS Bedrock (existing)
    +-> Google Vertex (existing)
    +-> Azure (existing)
    +-> OpenAI-Compatible (NEW: covers Grok, MiniMax, Xiaomi, etc.)
    +-> Google AI Studio (NEW: Gemini direct)
```

### Adversarial Review Squad

| Reviewer | Role | Flavor |
|----------|------|--------|
| Claude Opus | Primary architect + implementer | ByteDance: ROI-driven |
| Codex (GPT-5.4) | Adversarial code reviewer | OpenAI: adversarial |
| Gemini 3.1 Pro | Architecture critic | Google: systematic |
| MiniMax Hermes | Evolution reviewer | Independent: research-grade |

## Self-Evolution Principles

1. **Every bug is a training signal** -- when the agent fails, the failure pattern becomes a test case
2. **Adversarial by default** -- every major change gets cross-model review before merge
3. **Measure everything** -- test count, pass rate, feature coverage, destructive action rate
4. **Anthropic Red Team as oracle** -- System Card findings are our ground truth for agent behavior
5. **Ship fast, iterate faster** -- weekly release cadence, daily adversarial evaluations

## Metrics Dashboard

| Metric | v1.0 Baseline | v2.0 Target |
|--------|---------------|-------------|
| Test count | 218 | 500+ |
| Pass rate | 100% | 100% |
| Feature flags active | 0 | 15+ |
| Model providers | 4 | 8+ |
| Destructive action rate | unmeasured | < 1% |
| Over-refusal rate | unmeasured | < 5% |
| Context collapse coverage | 0% | 80%+ |
| Cross-session memory | none | automatic |

---
*Created: 2026-04-08*
*Last updated: 2026-04-08*
