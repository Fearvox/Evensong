#!/usr/bin/env bun
/**
 * OR OpenAI-compat single-shot harness
 *
 * For non-Anthropic-brand OR models (qwen, kimi, glm, elephant).
 * Direct fetch /chat/completions — no CCR spawn, no Anthropic SDK,
 * no multi-turn tool calling. Single prompt → single response.
 *
 * This is a pragmatic fallback because the main CCR harness (harness.ts)
 * spawns `bun run cli.tsx -p` with ANTHROPIC_BASE_URL override, which
 * routes through OR's Anthropic-compat endpoint. That endpoint is
 * restricted on our Hermes key (returns 403 "Key limit exceeded") for
 * non-Anthropic-brand models. The OpenAI-compat endpoint however is
 * open, so we go direct and skip CCR entirely.
 *
 * Schema: registry_schema = 'or-shot-v1'. Readers can distinguish
 * from full-harness rows which have no registry_schema field.
 *
 * Usage:
 *   bun benchmarks/evensong/or-shot.ts \
 *     --models or-elephant-alpha,or-glm,or-kimi,or-qwen \
 *     --pressure L0 --start-id R066 --services 8
 *   bun benchmarks/evensong/or-shot.ts ... --dry-run   # preview only
 */

import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { parseArgs } from 'util'
import { buildPrompt, getPressureLabel } from './prompts.js'
import { BENCHMARK_MODELS } from './types.js'

const REGISTRY_PATH = join(import.meta.dir, 'registry.jsonl')
const RUNS_DIR = join(import.meta.dir, '..', 'runs')

interface OrShotConfig {
  runId: string
  model: string
  pressure: 'L0' | 'L1' | 'L2' | 'L3'
  services: number
  timeoutMs: number
}

interface OrShotResult {
  run: string
  date: string
  model: string
  modelId: string
  mode: string
  response_length: number
  code_blocks: number
  describe_count: number
  test_count: number
  expect_count: number
  service_dirs: number
  finish_reason: string
  elapsed_sec: number
  cost_usd: number
  input_tokens: number
  output_tokens: number
  raw_response_path: string
  registry_schema: 'or-shot-v1'
  invalid?: boolean
  invalid_reason?: string
}

function liteMetrics(content: string): Pick<OrShotResult, 'code_blocks' | 'describe_count' | 'test_count' | 'expect_count' | 'service_dirs'> {
  const fenceCount = (content.match(/```/g) ?? []).length
  const describes = (content.match(/\bdescribe\s*\(/g) ?? []).length
  const tests = (content.match(/\btest\s*\(/g) ?? []).length
  const its = (content.match(/\bit\s*\(/g) ?? []).length
  const expects = (content.match(/\bexpect\s*\(/g) ?? []).length
  const serviceDirs = new Set((content.match(/services\/[a-z][a-z0-9_-]*/gi) ?? []).map(s => s.toLowerCase())).size
  return {
    code_blocks: Math.floor(fenceCount / 2),
    describe_count: describes,
    test_count: tests + its,
    expect_count: expects,
    service_dirs: serviceDirs,
  }
}

async function runOrShot(config: OrShotConfig): Promise<OrShotResult> {
  const preset = BENCHMARK_MODELS.find(m => m.name === config.model)
  if (!preset) throw new Error(`Unknown model: ${config.model}`)

  const runDir = join(RUNS_DIR, `${config.runId}-${config.model}-orshot`)
  mkdirSync(runDir, { recursive: true })

  const prompt = buildPrompt(config.pressure, config.services)
  writeFileSync(join(runDir, 'prompt.md'), prompt)

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set')

  console.log(`\n  ⏱  OR-shot ${config.runId} starting...`)
  console.log(`  📦 Model: ${preset.displayName} (${preset.modelId})`)
  console.log(`  🔥 Pressure: ${getPressureLabel(config.pressure)}`)
  console.log(`  📝 Output: ${runDir}/raw-response.md`)

  const startMs = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)

  let resp: Response
  let data: Record<string, unknown>
  try {
    resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Fearvox/Evensong',
        'X-Title': 'Evensong OR-shot benchmark',
      },
      body: JSON.stringify({
        model: preset.modelId,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 16000,
      }),
      signal: controller.signal,
    })
    data = (await resp.json()) as Record<string, unknown>
  } finally {
    clearTimeout(timer)
  }

  const elapsed = (Date.now() - startMs) / 1000
  const today = new Date().toISOString().split('T')[0]

  // Error path
  if (!resp.ok || !(data as { choices?: unknown }).choices) {
    const errObj = (data as { error?: { message?: string } }).error
    const errMsg = errObj?.message ?? `HTTP ${resp.status}`
    const errPath = join(runDir, 'error.json')
    writeFileSync(errPath, JSON.stringify(data, null, 2))
    const result: OrShotResult = {
      run: config.runId,
      date: today,
      model: preset.displayName,
      modelId: preset.modelId,
      mode: `${getPressureLabel(config.pressure)} / OR-shot-single-turn`,
      response_length: 0,
      code_blocks: 0,
      describe_count: 0,
      test_count: 0,
      expect_count: 0,
      service_dirs: 0,
      finish_reason: 'error',
      elapsed_sec: elapsed,
      cost_usd: 0,
      input_tokens: 0,
      output_tokens: 0,
      raw_response_path: errPath,
      registry_schema: 'or-shot-v1',
      invalid: true,
      invalid_reason: errMsg,
    }
    writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2))
    appendFileSync(REGISTRY_PATH, JSON.stringify(result) + '\n')
    console.log(`\n  ❌ ${config.runId} ERROR: ${errMsg}`)
    return result
  }

  // Success path
  type Choice = { message?: { content?: string }; finish_reason?: string }
  type Usage = { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  const choices = (data as { choices: Choice[] }).choices
  const usage = (data as { usage?: Usage }).usage ?? {}
  const content = choices[0]?.message?.content ?? ''
  const rawPath = join(runDir, 'raw-response.md')
  writeFileSync(rawPath, content)

  const metrics = liteMetrics(content)
  const result: OrShotResult = {
    run: config.runId,
    date: today,
    model: preset.displayName,
    modelId: preset.modelId,
    mode: `${getPressureLabel(config.pressure)} / OR-shot-single-turn`,
    response_length: content.length,
    ...metrics,
    finish_reason: choices[0]?.finish_reason ?? 'unknown',
    elapsed_sec: elapsed,
    cost_usd: usage.cost ?? 0,
    input_tokens: usage.prompt_tokens ?? 0,
    output_tokens: usage.completion_tokens ?? 0,
    raw_response_path: rawPath,
    registry_schema: 'or-shot-v1',
  }

  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2))
  appendFileSync(REGISTRY_PATH, JSON.stringify(result) + '\n')

  console.log(`\n  ✅ ${config.runId} complete:`)
  console.log(`     ${metrics.test_count} test() + ${metrics.describe_count} describe() + ${metrics.expect_count} expect()`)
  console.log(`     ${metrics.code_blocks} code blocks · ${metrics.service_dirs} service dirs referenced`)
  console.log(`     ${result.response_length} chars · ${elapsed.toFixed(1)}s · $${result.cost_usd.toFixed(4)}`)
  return result
}

function printBatchSummary(results: OrShotResult[]): void {
  console.log('\n  BATCH SUMMARY')
  console.log('  ' + '═'.repeat(90))
  console.log('  Run    Model'.padEnd(38) + 'Tests'.padEnd(8) + 'Describe'.padEnd(10) + 'Expect'.padEnd(8) + 'Blocks'.padEnd(8) + 'Cost')
  console.log('  ' + '─'.repeat(90))
  for (const r of results) {
    const status = r.invalid ? '❌' : '✅'
    console.log(
      '  ' +
      status + ' ' + r.run.padEnd(7) +
      r.model.slice(0, 26).padEnd(28) +
      String(r.test_count).padEnd(8) +
      String(r.describe_count).padEnd(10) +
      String(r.expect_count).padEnd(8) +
      String(r.code_blocks).padEnd(8) +
      '$' + r.cost_usd.toFixed(4)
    )
  }
  console.log('  ' + '═'.repeat(90))
  const ok = results.filter(r => !r.invalid).length
  console.log(`  Succeeded: ${ok}  Failed: ${results.length - ok}  Total: ${results.length}`)
}

// ─── CLI ────────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      models: { type: 'string' },
      pressure: { type: 'string', default: 'L0' },
      'start-id': { type: 'string', default: 'R066' },
      services: { type: 'string', default: '8' },
      'timeout-min': { type: 'string', default: '10' },
      'dry-run': { type: 'boolean', default: false },
    },
  })

  if (!values.models) {
    console.error(
      'Usage: bun benchmarks/evensong/or-shot.ts \\\n' +
      '  --models or-elephant-alpha,or-glm,or-kimi,or-qwen \\\n' +
      '  --pressure L0 --start-id R066 --services 8 [--dry-run]'
    )
    process.exit(1)
  }

  const models = values.models.split(',').map(s => s.trim()).filter(Boolean)
  const pressure = values.pressure as 'L0' | 'L1' | 'L2' | 'L3'
  const startId = values['start-id'] as string
  const services = parseInt(values.services as string, 10)
  const timeoutMs = parseInt(values['timeout-min'] as string, 10) * 60 * 1000

  const unknown = models.filter(m => !BENCHMARK_MODELS.find(p => p.name === m))
  if (unknown.length > 0) {
    console.error(`Unknown models: ${unknown.join(', ')}`)
    console.error(`Available: ${BENCHMARK_MODELS.map(p => p.name).join(', ')}`)
    process.exit(1)
  }

  const baseNum = parseInt(startId.replace('R', ''), 10)
  const configs: OrShotConfig[] = models.map((m, i) => ({
    runId: `R${String(baseNum + i).padStart(3, '0')}`,
    model: m,
    pressure,
    services,
    timeoutMs,
  }))

  console.log(`\n  OR-shot batch — ${configs.length} runs from ${startId}`)
  console.log(`  Models: ${models.join(', ')}`)
  console.log(`  Pressure: ${pressure}  Services: ${services}  Timeout: ${values['timeout-min']}m/run`)

  if (values['dry-run']) {
    console.log('\n  DRY RUN — planned cells:')
    for (const c of configs) {
      const p = BENCHMARK_MODELS.find(m => m.name === c.model)
      console.log(`    ${c.runId}  ${(p?.displayName ?? '').padEnd(30)} ${p?.modelId}`)
    }
    console.log('\n  Run without --dry-run to execute.')
    return
  }

  const results: OrShotResult[] = []
  for (const c of configs) {
    try {
      results.push(await runOrShot(c))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\n  ❌ ${c.runId} threw: ${msg}`)
      results.push({
        run: c.runId, date: new Date().toISOString().split('T')[0],
        model: c.model, modelId: c.model,
        mode: `${getPressureLabel(c.pressure)} / OR-shot-single-turn`,
        response_length: 0, code_blocks: 0, describe_count: 0, test_count: 0,
        expect_count: 0, service_dirs: 0, finish_reason: 'throw',
        elapsed_sec: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0,
        raw_response_path: '', registry_schema: 'or-shot-v1',
        invalid: true, invalid_reason: msg,
      })
    }
  }
  printBatchSummary(results)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
