<!--
Thanks for contributing! Keep this template; delete only the italicized
guide lines, not the section headings.
-->

## What this PR does

<!-- One sentence. Same energy as a good commit subject. -->

## Why

<!-- What problem does this solve? Link the issue if there is one:
Closes #nnn    /    Relates to #nnn -->

## Shape of the change

<!-- Rough sketch of what changed and where. Keep honest — reviewers will
see the diff, so focus on intent and non-obvious decisions. -->

- [ ] New public API surface? List the new exports.
- [ ] Breaking changes? Spell them out + migration notes.
- [ ] New runtime dependency? Justify the add.

## Test coverage

<!-- Point to the new/changed tests. If you updated the benchmark harness,
paste a before/after summary row. -->

```
bun test <path>
```

- [ ] New tests added (unit / integration / benchmark).
- [ ] Existing tests still pass locally: `bun test src/services/retrieval src/services/api` (84+ tests).
- [ ] If this touches retrieval or BM25: re-ran `scripts/benchmark-hybrid-scale.ts --runs=3` and numbers are committed under `benchmarks/runs/`.

## Benchmark impact (for retrieval / algorithm PRs only)

<!-- Delete this section if the PR is unrelated to retrieval or perf.
Otherwise paste the summary MD excerpt. -->

| Pipeline | Top-1 | p50 | p90 | Notes |
|----------|-------|-----|-----|-------|
| baseline (pre-PR) | | | | |
| this PR | | | | |

Raw results: `benchmarks/runs/<timestamp>.jsonl`

## Licensing

- [ ] Code in this PR is contributed under the repo's code license (**Apache License 2.0**, see [LICENSING.md](../LICENSING.md)).
- [ ] If any files are research narrative / paper text, they carry an explicit `SPDX-License-Identifier: CC-BY-NC-ND-4.0` header (rare — default is Apache 2.0).
- [ ] Third-party code re-used here preserves its original copyright + license notice.

## Checklist

- [ ] PR title follows [conventional commits](https://www.conventionalcommits.org/) (e.g. `feat(retrieval): …`, `fix(api): …`, `docs: …`, `bench: …`).
- [ ] No secrets / API keys / personal vault content committed.
- [ ] Updated README / CLAUDE.md / docs if I changed behavior a contributor would need to know.
- [ ] Type check passes: `bun run tsc --noEmit`.
- [ ] Build passes: `bun run build`.

## Screenshots / CLI output (optional)

<!-- If this is a UX / REPL / tool change, paste a before/after. -->
