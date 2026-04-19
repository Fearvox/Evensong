# Contributing to Evensong

Thanks for thinking about contributing. This document covers the practical
stuff — what we accept, how to shape a PR, how to run the tests, and what
makes a PR merge-ready.

For the 30-second version, jump to [Quick PR checklist](#quick-pr-checklist).

## Table of contents

- [What we gladly accept](#what-we-gladly-accept)
- [What we probably won't merge](#what-we-probably-wont-merge)
- [Before you start](#before-you-start)
- [Development setup](#development-setup)
- [Running tests](#running-tests)
- [Running benchmarks](#running-benchmarks)
- [Code style](#code-style)
- [Commit conventions](#commit-conventions)
- [Quick PR checklist](#quick-pr-checklist)
- [Licensing of contributions](#licensing-of-contributions)
- [Reporting security issues](#reporting-security-issues)

## What we gladly accept

- **New retrieval providers** — dense-vector stage 1 (BGE-M3, E5, Qwen3-Embedding), RRF fusion layers, adaptive gating that skips stage 2 when BM25 confidence is high. The `VaultRetrievalProvider` contract is intentionally small; anything that implements it works.
- **New model connectors** — additional `ATOMIC_MODELS` entries for models we haven't tested, with a short latency/top-1 note in the PR description.
- **Benchmark extensions** — adversarial queries, vault-size scaling experiments, new test corpora, alternate evaluation metrics (nDCG, MRR at k, recall curves).
- **Documentation** — better tutorials, typo fixes, translations, worked examples, architecture diagrams that actually help.
- **Bug fixes** — anything that crashes, silently drops data, or gives wrong answers.
- **Performance improvements** — backed by before/after numbers from `scripts/benchmark-hybrid-scale.ts`.

## What we probably won't merge

- **Large refactors without a design discussion** — open an issue first if you're rewriting a module. We'd rather spend 15 minutes aligning on shape than review 2000 lines of churn.
- **New dependencies** without a clear justification. The runtime stack is Bun-only on purpose; every added npm package is friction.
- **Style-only mass formatting** — Biome handles this. If you want to improve formatting, update `biome.json`, not 200 files.
- **Features behind our specific API keys** — if only you can run it, nobody else can validate it.
- **Breaking changes to the `VaultRetrievalProvider` contract** without a migration path — existing providers are already in use.

## Before you start

1. **Search existing issues and PRs** — someone might already be on it. [Issues](https://github.com/Fearvox/Evensong/issues) · [PRs](https://github.com/Fearvox/Evensong/pulls).
2. **For non-trivial work, open an issue first** — sketch the shape, get alignment, then code. This saves re-work.
3. **Big discussions belong in [Discussions](https://github.com/Fearvox/Evensong/discussions)** — ideas, Q&A, benchmark results, show-and-tell.

## Development setup

**Prerequisites:**

- [Bun](https://bun.sh) 1.3+ (Node.js is not supported)
- [Atomic Chat](https://atomicchat.io) running on `127.0.0.1:1337` for features that need an LLM judge (optional — tests mock this)
- Git

**Clone and install:**

```bash
git clone https://github.com/Fearvox/Evensong.git
cd Evensong
bun install
```

**Sanity-check the runtime:**

```bash
bun run dev     # launches the CCR REPL
bun run build   # produces dist/cli.js (~27 MB)
```

## Running tests

```bash
# Full retrieval + API test suite (the surface most PRs touch)
bun test src/services/retrieval src/services/api

# Single file
bun test src/services/retrieval/__tests__/bm25.test.ts

# Whole project
bun test

# Type check (new code should not add errors, but see AGENTS.md for pre-existing noise)
bun run tsc --noEmit 2>&1 | grep -E "your-new-file"
```

The retrieval and API surface has **84+ tests** passing as of the last release. New code should add tests, not subtract.

## Running benchmarks

The headline 648-trial benchmark is one command:

```bash
bun run scripts/benchmark-hybrid-scale.ts \
  --runs=3 --with-body \
  --queries-file=benchmarks/wave3f-generated-queries-2026-04-19.json
```

Takes ~2 minutes at `concurrency=3`. Results drop into `benchmarks/runs/` as JSONL and Markdown.

If your PR changes retrieval behavior, **include a before/after row from this harness in the PR description**.

## Code style

- **TypeScript strict mode**; prefer explicit types at module boundaries.
- **Biome** is the linter/formatter — run `bun run biome:fix` or let pre-commit handle it.
- **Small modules, clear boundaries**. Each file one responsibility. See [AGENTS.md](./AGENTS.md) for deeper conventions.
- **Comment the *why*, not the *what*** — if the code explains itself, no comment needed. Non-obvious invariants, historical bugs, and external constraints are fair game.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(retrieval): add dense-vector stage 1 via BGE-M3`
- `fix(api): handle 429 from deepseek with exponential backoff`
- `docs(readme): link new benchmark methodology note`
- `bench: 3-run variance correction on wave3d scale benchmark`
- `chore(repo): bump biome to 2.5`

One logical change per commit. If a PR has 8 commits that mean the same thing, squash before submitting.

## Quick PR checklist

Before hitting "Create pull request":

- [ ] Branch from latest `main`
- [ ] `bun test src/services/retrieval src/services/api` passes
- [ ] Types check for new files: `bun run tsc --noEmit | grep -E "<your-new-paths>"` shows no new errors
- [ ] `bun run build` completes
- [ ] PR title uses Conventional Commits format
- [ ] PR description fills in the template (what / why / shape / tests)
- [ ] For retrieval changes: benchmark before/after row included
- [ ] No secrets / API keys / personal vault content in the diff
- [ ] Updated README / CLAUDE.md / docs if behavior changed

## Licensing of contributions

By opening a pull request, you agree that your contribution is licensed under
the **Apache License 2.0** (see [LICENSE-APACHE](./LICENSE-APACHE)) — same as
the code portion of this repository.

Research narrative files (paper drafts, long-form experimental writeups) are
under **CC BY-NC-ND 4.0** — contributions of this kind should carry an
explicit `SPDX-License-Identifier: CC-BY-NC-ND-4.0` header. When in doubt,
default to Apache 2.0.

See [LICENSING.md](./LICENSING.md) for the per-directory mapping and
compatibility matrix.

## Reporting security issues

If you find a security issue (leaked secret in the repo, auth bypass,
remote code execution path, data-exfil vector in a dependency), **please do
not open a public issue**. Email `admin at zonicdesign dot art` with:

- A brief description
- Reproduction steps if applicable
- A GPG public key if you want an encrypted reply

We aim to respond within 72 hours.

For commercial / partnership / licensing inquiries unrelated to security,
use `business at zonicdesign dot art`.

---

Thanks for contributing. If something in this document is wrong or confusing,
fixing this file is itself a valid PR.
