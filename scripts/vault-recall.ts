#!/usr/bin/env bun
/**
 * Vault recall CLI — Wave 3+ entry point.
 *
 * Usage:
 *   bun run scripts/vault-recall.ts "query here"
 *   bun run scripts/vault-recall.ts "query" --topk 3 --model grok-3
 *   bun run scripts/vault-recall.ts "query" --fallback              # use 4-level chain
 *   bun run scripts/vault-recall.ts "query" --json                  # CI-friendly output
 *   bun run scripts/vault-recall.ts "query" --vault /path/to/vault  # override root
 *
 * Default provider chain when --fallback is passed:
 *   deepseek/deepseek-v3.2 → grok-3 → openrouter/auto:free → local Gemma
 * (primary first; each falls back on error or availability=false).
 *
 * Default single provider: deepseek/deepseek-v3.2 (judge benchmark winner
 * 2026-04-19: 729ms avg / 3/3 correct top-1 on reference manifest).
 *
 * Exit codes:
 *   0  — at least one provider returned a ranking (possibly empty)
 *   1  — all providers failed
 *   2  — bad invocation / vault not found
 */

import { createLocalGemmaClient, ATOMIC_MODELS } from '../src/services/api/localGemma.js'
import { createAtomicProvider } from '../src/services/retrieval/providers/atomicProvider.js'
import { vaultRetrieve, AllProvidersFailedError } from '../src/services/retrieval/vaultRetrieve.js'
import { buildVaultManifest } from '../src/services/retrieval/manifestBuilder.js'
import type { VaultRetrievalProvider } from '../src/services/retrieval/types.js'

interface Args {
  query: string
  topK: number
  model: string
  fallback: boolean
  json: boolean
  vaultRoot: string
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = []
  const flags = new Map<string, string | boolean>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags.set(key, next)
        i++
      } else {
        flags.set(key, true)
      }
    } else {
      positional.push(a)
    }
  }
  const query = positional[0]
  if (!query) {
    console.error('usage: bun run scripts/vault-recall.ts "<query>" [--topk N] [--model ID] [--fallback] [--json] [--vault PATH]')
    process.exit(2)
  }
  return {
    query,
    topK: parseInt(String(flags.get('topk') ?? '5'), 10),
    model: String(flags.get('model') ?? ATOMIC_MODELS.DEEPSEEK_V32),
    fallback: flags.get('fallback') === true,
    json: flags.get('json') === true,
    vaultRoot: String(flags.get('vault') ?? `${process.cwd()}/_vault`),
  }
}

function buildProviders(fallback: boolean, singleModel: string): VaultRetrievalProvider[] {
  if (fallback) {
    return [
      createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.DEEPSEEK_V32 })),
      createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.GROK_3 })),
      createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.OR_AUTO_FREE })),
      createAtomicProvider(createLocalGemmaClient({ model: ATOMIC_MODELS.LOCAL_GEMMA })),
    ]
  }
  return [createAtomicProvider(createLocalGemmaClient({ model: singleModel }))]
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  let manifest
  try {
    manifest = await buildVaultManifest({ vaultRoot: args.vaultRoot })
  } catch (err) {
    console.error(`vault-recall: failed to build manifest from ${args.vaultRoot}: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }

  if (manifest.length === 0) {
    console.error(`vault-recall: vault at ${args.vaultRoot} has 0 manifest entries (check .meta/registry.jsonl and decay-scores.json)`)
    process.exit(2)
  }

  const providers = buildProviders(args.fallback, args.model)

  try {
    const result = await vaultRetrieve(
      { query: args.query, manifest, topK: args.topK },
      { providers },
    )

    if (args.json) {
      const enriched = result.rankedPaths.map((p) => {
        const entry = manifest.find((m) => m.path === p)
        return { path: p, title: entry?.title ?? null, retention: entry?.retentionScore ?? null }
      })
      console.log(JSON.stringify({ query: args.query, provider: result.provider, latencyMs: result.latencyMs, results: enriched }, null, 2))
    } else {
      console.log(`\n🔍 "${args.query}"`)
      console.log(`   provider: ${result.provider}   latency: ${result.latencyMs}ms   manifest: ${manifest.length} entries\n`)
      if (result.rankedPaths.length === 0) {
        console.log('   (no results — manifest empty or LLM returned [])')
      } else {
        for (const [i, p] of result.rankedPaths.entries()) {
          const entry = manifest.find((m) => m.path === p)
          console.log(`   ${i + 1}. ${entry?.title ?? '(unknown)'}`)
          console.log(`      ${p}`)
          if (entry?.excerpt) console.log(`      ${entry.excerpt.slice(0, 120)}${entry.excerpt.length > 120 ? '…' : ''}`)
          console.log()
        }
      }
    }
    process.exit(0)
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      console.error(`vault-recall: all ${providers.length} provider(s) failed:`)
      for (const a of err.attempts) console.error(`  - ${a.provider}: ${a.error}`)
      process.exit(1)
    }
    console.error(`vault-recall: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main()
