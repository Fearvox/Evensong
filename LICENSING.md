# Licensing

This repository is **dual-licensed**. Different directories and file types
carry different licenses depending on whether they are *code* (reusable
engineering artifacts) or *research output* (novel narrative / paper text).

| License | Applies to | Rights granted |
|---------|------------|----------------|
| **Apache License 2.0** ([LICENSE-APACHE](./LICENSE-APACHE)) | Source code, tests, benchmarks, scripts, configs, developer docs | Use, modify, distribute, sublicense, commercial use, patent grant |
| **CC BY-NC-ND 4.0** ([LICENSE-CC-BY-NC-ND](./LICENSE-CC-BY-NC-ND)) | Research papers, long-form narrative docs, benchmark result prose | Attribution-only, non-commercial, no derivatives |

## Which license applies to which part of the repo

### Apache-2.0 (default for code and developer docs)

Everything listed here is **Apache 2.0 licensed** unless an individual file
header explicitly says otherwise:

- `src/` — Reverse-engineered Claude Code CLI (CCR) source
- `packages/` — Monorepo workspaces (including `research-vault-mcp`)
- `scripts/` — Benchmark harness, dogfood tools, release scripts
- `benchmarks/` — Benchmark harnesses, query sets, raw result JSONL files
- `tests/` — All unit / integration / regression tests
- `services/` — Microservice suite used in benchmarks
- `api/` — HTTP adapters / relay infrastructure
- `shared/` — Shared type definitions
- `skills/`, `repo-bootstrap/`, `evolution-layer/` — Developer tooling
- Root config files: `package.json`, `bun.lock`, `tsconfig*.json`, `biome.json`,
  `vercel.json`, `mcp.json`, `.gitignore`, `.gitattributes`, `.gitmodules`
- Developer documentation: `README.md`, `README-zh.md`, `CLAUDE.md`,
  `AGENTS.md`, `CONTRIBUTING.md`
- Anything in `docs/` **except** files explicitly marked as research
  papers or research narrative (see next section)

### CC BY-NC-ND 4.0 (research deliverables only)

The following are under **CC BY-NC-ND 4.0** — you may redistribute the
original, in its entirety, with attribution, but you may **not** modify
them, create derivative works, or use them for commercial purposes:

- `docs/research/` (if/when present) — Research paper source, drafts, figures
- `docs/evensong-*.pdf` — Compiled Evensong paper PDFs
- Long-form narrative benchmark writeups where explicitly marked in the
  document header as `license: CC-BY-NC-ND-4.0`
- Any file that carries an in-file `SPDX-License-Identifier:
  CC-BY-NC-ND-4.0` header

If a file is ambiguous (e.g. a benchmark summary .md that mixes results
and narrative), the **file header** takes precedence. When missing, default
is Apache 2.0.

## Contribution licensing

All contributions submitted via pull request are licensed under **Apache 2.0**
unless the PR explicitly states otherwise. This matches the code portion of
the repository and is compatible with downstream Apache-2.0 projects
(including EverMind-AI/EverOS).

When contributing code derived from another Apache-2.0 project, please preserve
the original copyright notice and note the provenance in your commit message.

## Provenance

Code in this repository is derived in part from the Anthropic Claude Code CLI
(reverse-engineered for educational purposes). The original binary is
Anthropic's proprietary software; this repository contains independent
reimplementations and research. Nothing in this licensing grant claims
ownership over Anthropic's trademarks or the original design.

Benchmark harnesses and hybrid retrieval architecture (`src/services/retrieval/`,
`scripts/benchmark-*.ts`, `benchmarks/wave3*`) are original work by
@Fearvox / 0xVox, independently inspired by the EverMemOS architecture
(arxiv 2601.02163) by EverMind / Shanda.

## Compatibility matrix

| Downstream project license | Can use Apache 2.0 parts? | Can use CC BY-NC-ND parts? |
|---------------------------|---------------------------|---------------------------|
| Apache 2.0                | ✅ Yes                    | ❌ No (ND forbids modifications) |
| MIT                       | ✅ Yes                    | ❌ No                     |
| GPL v3                    | ✅ Yes                    | ❌ No                     |
| BSD                       | ✅ Yes                    | ❌ No                     |
| Proprietary commercial    | ✅ Yes (respect NOTICE)   | ❌ No (NC forbids)        |
| Academic citation only    | ✅ Yes                    | ✅ Yes (attribution)      |

## Questions?

Open a GitHub issue on this repo, or contact `fearvox1015 at gmail dot com`.

---

Last updated: 2026-04-19
