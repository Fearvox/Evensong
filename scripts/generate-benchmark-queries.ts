#!/usr/bin/env bun
/**
 * Wave 3+F — auto-generate 108 benchmark queries from the real _vault manifest.
 *
 * Uses grok-3 to generate queries (different model than the deepseek-v3.2
 * judge to avoid self-correlation bias). For each of the 18 real entries
 * generate 6 query variants:
 *   1. title-paraphrase  (rewrite the title in user-voice)
 *   2. concept-abstract  (ask about the core idea without title keywords)
 *   3. body-term         (ask about a specific term only in body content)
 *   4. chinese           (中文 rewrite of the query)
 *   5. negation          (negation-phrased query — "not X but Y")
 *   6. ambiguous         (hard query that might match multiple md)
 *
 * Saves to benchmarks/wave3f-generated-queries-YYYY-MM-DD.json with ideal
 * = source md path. The prompt is committed for auditability — reviewers
 * can see exactly how queries were generated.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildVaultManifest } from '../src/services/retrieval/manifestBuilder.js'
import { createLocalGemmaClient, ATOMIC_MODELS, chatCompletionLocalGemma } from '../src/services/api/localGemma.js'

const GENERATOR_MODEL = ATOMIC_MODELS.GROK_3 // DIFFERENT from judge (deepseek-v3.2)

interface GeneratedQuery {
  id: number
  category: 'title-paraphrase' | 'concept-abstract' | 'body-term' | 'chinese' | 'negation' | 'ambiguous'
  q: string
  ideal: string
  source_title: string
  generated_by: string
}

const SYSTEM_PROMPT = `You generate realistic user search queries for a personal knowledge vault.

You will receive a single document entry (title, excerpt, body snippet). Generate SIX diverse query variants that a real user might type when looking for this exact document. Output MUST be a JSON object with these six keys, each mapping to a single-sentence query string:

{
  "title_paraphrase": "<user-voice rewrite of the title, no direct title tokens>",
  "concept_abstract": "<question about the document's core idea without using title words>",
  "body_term": "<search for a specific term/number/method that appears in the body>",
  "chinese": "<中文 query 可能是 paraphrase or concept>",
  "negation": "<query phrased with negation, e.g. 'not X but Y'>",
  "ambiguous": "<intentionally hard query that could match this doc OR a related doc in a memory/ML context>"
}

Rules:
- NO direct copy of the title as query.
- Queries should be realistic things a user would type, not summaries.
- Each query should be 5-15 words (chinese can be shorter).
- Output ONLY the JSON object. No preamble, no code fence.`

async function generateForEntry(
  entry: { path: string; title: string; excerpt?: string; body?: string },
  idCounter: number,
): Promise<GeneratedQuery[]> {
  const client = createLocalGemmaClient({ model: GENERATOR_MODEL })
  const bodySnippet = (entry.body ?? '').slice(0, 1500)
  const userPrompt = `Document:
TITLE: ${entry.title}
EXCERPT: ${entry.excerpt ?? ''}
BODY (first 1500 chars): ${bodySnippet}

Generate the 6 query variants JSON object now.`

  const resp = await chatCompletionLocalGemma(client, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7, // higher for diversity
    maxTokens: 1024,
  })

  // Parse — LLM should emit JSON object; strip code fence if present
  let raw = resp.content.trim()
  raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '')
  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`  ❌ parse fail for ${entry.path.split('/').pop()}: ${raw.slice(0, 200)}`)
    return []
  }

  const categories: Array<{ key: string; cat: GeneratedQuery['category'] }> = [
    { key: 'title_paraphrase', cat: 'title-paraphrase' },
    { key: 'concept_abstract', cat: 'concept-abstract' },
    { key: 'body_term', cat: 'body-term' },
    { key: 'chinese', cat: 'chinese' },
    { key: 'negation', cat: 'negation' },
    { key: 'ambiguous', cat: 'ambiguous' },
  ]
  const out: GeneratedQuery[] = []
  for (const { key, cat } of categories) {
    const q = parsed[key]
    if (typeof q === 'string' && q.length > 0) {
      out.push({
        id: idCounter++,
        category: cat,
        q,
        ideal: entry.path,
        source_title: entry.title,
        generated_by: GENERATOR_MODEL,
      })
    }
  }
  return out
}

async function main() {
  const manifest = await buildVaultManifest({ vaultRoot: process.cwd() + '/_vault', withBody: true })
  console.log(`[gen] manifest: ${manifest.length} real entries → target ${manifest.length * 6} queries`)
  console.log(`[gen] generator model: ${GENERATOR_MODEL}`)

  let idCounter = 1
  const all: GeneratedQuery[] = []
  let done = 0
  const t0 = Date.now()

  // Sequential to avoid grok rate limits and keep error messages clean
  for (const entry of manifest) {
    const queries = await generateForEntry(entry, idCounter)
    idCounter += queries.length
    all.push(...queries)
    done++
    console.log(`  [${done}/${manifest.length}] ${entry.title.slice(0, 50)}... → +${queries.length} queries (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const outPath = path.join(process.cwd(), 'benchmarks', `wave3f-generated-queries-${stamp}.json`)
  writeFileSync(outPath, JSON.stringify({
    _meta: {
      generated_at: new Date().toISOString(),
      generator_model: GENERATOR_MODEL,
      generator_prompt: SYSTEM_PROMPT,
      total_queries: all.length,
      source_manifest_size: manifest.length,
    },
    queries: all,
  }, null, 2) + '\n')
  console.log(`\n[gen] ${all.length} queries written to ${outPath}`)
  console.log(`[gen] wall: ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // Category breakdown
  const catCounts = new Map<string, number>()
  for (const q of all) catCounts.set(q.category, (catCounts.get(q.category) ?? 0) + 1)
  console.log('\n[gen] category breakdown:')
  for (const [cat, n] of catCounts) console.log(`  ${cat}: ${n}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
