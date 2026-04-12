#!/usr/bin/env bun
/**
 * Evensong CLI — Automated benchmark harness for multi-model evaluation
 *
 * Usage:
 *   bun benchmarks/evensong/cli.ts run --config r011-b --repeat 3
 *   bun benchmarks/evensong/cli.ts run --model or-gpt5 --pressure L2 --memory void
 *   bun benchmarks/evensong/cli.ts validate --config r011-b --cost-multiplier 60
 *   bun benchmarks/evensong/cli.ts configs
 *   bun benchmarks/evensong/cli.ts list
 *   bun benchmarks/evensong/cli.ts compare R009 R010
 */

import { runBenchmark, listRuns, nextRunId } from './harness.js'
import { BENCHMARK_MODELS } from './types.js'
import type { RunConfig } from './types.js'
import { getPressureLabel, getMemoryLabel } from './prompts.js'
import { uploadEvidence } from './upload-evidence.js'
import { getPreset, listPresets, resolveMemory, EXPERIMENT_PRESETS } from './configs.js'
import { aggregateStats, saveStats, printStats } from './stats.js'

const HELP = `
  ╔══════════════════════════════════════════════╗
  ║        EVENSONG — Benchmark Harness          ║
  ╚══════════════════════════════════════════════╝

  Commands:
    run       Run a benchmark (by config preset or manual flags)
    validate  Run cheap method validation before expensive models
    configs   List available experiment config presets
    list      Show all benchmark runs from registry
    compare   Diff two runs (e.g., compare R009 R010)
    upload    Upload evidence screenshot/PDF to EverOS storage
    models    List available benchmark models
    next      Show next available run ID

  Run Options:
    --config <name>     Experiment preset (e.g., r011-b, r011-a)
    --repeat <n>        Run same config N times for statistical validation
    --model <name>      Provider preset (default: or-opus)
    --pressure <level>  L0|L1|L2|L3 (default: L0)
    --memory <state>    full|blind|clean|void|evolved (default: full)
    --services <n>      Target service count (default: 8)
    --timeout <min>     Max runtime in minutes (default: 30)
    --id <RUN_ID>       Explicit run ID (default: auto-increment)
    --codename <name>   Run codename (default: from config or model-pressure)

  Validate Options:
    --config <name>       Config to validate against
    --cost-multiplier <n> Expected cost savings factor (default: 60)

  Upload Options:
    --run <RUN_ID>      Run ID to associate with the evidence
    --format json       Output as JSON

  Examples:
    bun benchmarks/evensong/cli.ts run --config r011-b --repeat 3
    bun benchmarks/evensong/cli.ts run --config r011-a
    bun benchmarks/evensong/cli.ts run --model or-gpt5 --pressure L2 --memory void
    bun benchmarks/evensong/cli.ts validate --config r011-b --cost-multiplier 60
    bun benchmarks/evensong/cli.ts configs
`

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      parsed[args[i].slice(2)] = args[i + 1]
      i++
    }
  }
  return parsed
}

/**
 * Build a RunConfig from either --config preset or manual flags.
 * Manual flags override preset values when both are provided.
 */
function buildRunConfig(opts: Record<string, string>, runId: string): RunConfig {
  let config: RunConfig = {
    runId,
    model: 'or-opus',
    pressure: 'L0',
    memory: 'full',
    services: 8,
    timeoutMin: 30,
  }

  // Load preset if --config specified
  if (opts.config) {
    const preset = getPreset(opts.config)
    if (!preset) {
      console.error(`  ❌ Unknown config: ${opts.config}`)
      console.error(`  Available: ${listPresets().join(', ')}`)
      process.exit(1)
    }
    config.model = preset.config.model
    config.pressure = preset.config.pressure
    config.memory = preset.config.memory
    config.services = preset.config.services
    config.codename = preset.config.codename

    console.log(`  📋 Config: ${preset.name}`)
    console.log(`     ${preset.description}`)
    console.log()
  }

  // Manual overrides (flags take precedence over preset)
  if (opts.model) config.model = opts.model
  if (opts.pressure) config.pressure = opts.pressure as RunConfig['pressure']
  if (opts.memory) config.memory = resolveMemory(opts.memory)
  if (opts.services) config.services = parseInt(opts.services, 10)
  if (opts.timeout) config.timeoutMin = parseInt(opts.timeout, 10)
  if (opts.codename) config.codename = opts.codename
  if (opts.id) config.runId = opts.id

  return config
}

async function cmdRun(args: string[]): Promise<void> {
  const opts = parseArgs(args)
  const repeatCount = parseInt(opts.repeat ?? '1', 10)

  if (repeatCount < 1 || repeatCount > 20) {
    console.error(`  ❌ --repeat must be 1–20, got ${repeatCount}`)
    process.exit(1)
  }

  // Validate model
  const baseConfig = buildRunConfig(opts, nextRunId())
  const valid = BENCHMARK_MODELS.find(m => m.name === baseConfig.model)
  if (!valid) {
    console.error(`  ❌ Unknown model: ${baseConfig.model}`)
    console.error(`  Available: ${BENCHMARK_MODELS.map(m => m.name).join(', ')}`)
    process.exit(1)
  }

  // Validate pressure
  if (!['L0', 'L1', 'L2', 'L3'].includes(baseConfig.pressure)) {
    console.error(`  ❌ Invalid pressure: ${baseConfig.pressure}. Use L0|L1|L2|L3`)
    process.exit(1)
  }

  // Single run — simple path
  if (repeatCount === 1) {
    printRunHeader(baseConfig, valid)
    const result = await runBenchmark(baseConfig)
    printRunResult(result)
    return
  }

  // Repeated runs — generate descriptive IDs, then aggregate stats
  const configName = opts.config ?? `${baseConfig.model}-${baseConfig.pressure}`
  const baseId = nextRunId()
  const baseNum = parseInt(baseId.replace('R', ''), 10)

  console.log(`\n  EVENSONG REPEAT — ${configName} × ${repeatCount}`)
  console.log(`  ${'═'.repeat(50)}`)
  console.log(`  Model:    ${valid.displayName} (${valid.modelId})`)
  console.log(`  Pressure: ${getPressureLabel(baseConfig.pressure)}`)
  console.log(`  Memory:   ${getMemoryLabel(baseConfig.memory)}`)
  console.log(`  ${'═'.repeat(50)}\n`)

  const results = []

  for (let i = 1; i <= repeatCount; i++) {
    const runId = `R${String(baseNum + i - 1).padStart(3, '0')}-${configName}-rep${i}`
    const config: RunConfig = {
      ...baseConfig,
      runId,
      codename: `${baseConfig.codename ?? configName}-rep${i}`,
    }

    console.log(`\n  ── Repeat ${i}/${repeatCount}: ${runId} ──`)

    try {
      const result = await runBenchmark(config)
      results.push(result)
      printRunResult(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ❌ ${runId} failed: ${message}`)
    }
  }

  // Aggregate and save stats
  if (results.length >= 2) {
    const summary = aggregateStats(configName, results)
    const statsPath = saveStats(summary)
    printStats(summary)
    console.log(`  📊 Stats saved: ${statsPath}`)
  } else if (results.length === 1) {
    console.log(`\n  ⚠  Only 1/${repeatCount} runs succeeded — no stats aggregation`)
  } else {
    console.error(`\n  ❌ All ${repeatCount} runs failed — no results`)
  }
}

async function cmdValidate(args: string[]): Promise<void> {
  const opts = parseArgs(args)
  const costMultiplier = parseInt(opts['cost-multiplier'] ?? '60', 10)

  if (!opts.config) {
    console.error('  Usage: validate --config <name> [--cost-multiplier <n>]')
    console.error('  Runs the validate-cheap preset first, then reports whether')
    console.error('  the harness/prompt/criteria work before expensive model runs.')
    process.exit(1)
  }

  const target = getPreset(opts.config)
  if (!target) {
    console.error(`  ❌ Unknown config: ${opts.config}`)
    process.exit(1)
  }

  const cheapPreset = getPreset('validate-cheap')!

  console.log(`\n  EVENSONG VALIDATION PROTOCOL`)
  console.log(`  ${'═'.repeat(55)}`)
  console.log(`  Target:     ${target.name}`)
  console.log(`  Validation: ${cheapPreset.name}`)
  console.log(`  Cost ratio: ~${costMultiplier}x cheaper validation`)
  console.log(`  ${'═'.repeat(55)}`)
  console.log()
  console.log(`  Step 1: Run cheap model (${cheapPreset.config.model}) to validate:`)
  console.log(`          - Harness workspace setup works`)
  console.log(`          - Prompt is clear and achievable`)
  console.log(`          - Test criteria can be met`)
  console.log()

  const runId = `${nextRunId()}-validate-${opts.config}`
  const config: RunConfig = {
    runId,
    model: cheapPreset.config.model,
    pressure: cheapPreset.config.pressure,
    memory: cheapPreset.config.memory,
    services: cheapPreset.config.services,
    timeoutMin: 30,
    codename: `validate-${opts.config}`,
  }

  const result = await runBenchmark(config)
  printRunResult(result)

  // Verdict
  console.log(`\n  VALIDATION VERDICT`)
  console.log(`  ${'─'.repeat(55)}`)
  if (result.failures === 0 && result.tests > 0) {
    console.log(`  ✅ PASS — harness works, ${result.tests} tests passed`)
    console.log(`  → Safe to run target: ${target.name}`)
    console.log(`  → Saved ~${costMultiplier}x on failure detection`)
  } else if (result.tests === 0) {
    console.log(`  ❌ FAIL — 0 tests produced. Harness or prompt issue.`)
    console.log(`  → Fix before running expensive target.`)
  } else {
    console.log(`  ⚠  PARTIAL — ${result.tests} tests, ${result.failures} failures`)
    console.log(`  → Investigate failures before running target.`)
  }
  console.log()
}

function cmdConfigs(): void {
  const presets = Object.entries(EXPERIMENT_PRESETS)
  console.log(`\n  EXPERIMENT CONFIGS (${presets.length})`)
  console.log(`  ${'═'.repeat(70)}`)
  console.log(`  ${'Name'.padEnd(18)} ${'Model'.padEnd(14)} ${'P'.padEnd(4)} ${'Memory'.padEnd(9)} Description`)
  console.log(`  ${'─'.repeat(70)}`)
  for (const [name, preset] of presets) {
    const c = preset.config
    console.log(`  ${name.padEnd(18)} ${c.model.padEnd(14)} ${c.pressure.padEnd(4)} ${c.memory.padEnd(9)} ${preset.name}`)
  }
  console.log()
}

function cmdSetup(args: string[]): void {
  const opts = parseArgs(args)
  const runId = opts.id ?? nextRunId()
  const config = buildRunConfig(opts, runId)

  const provider = BENCHMARK_MODELS.find(m => m.name === config.model)
  if (!provider) {
    console.error(`  ❌ Unknown model: ${config.model}`)
    process.exit(1)
  }

  console.log(`\n  EVENSONG SETUP — ${runId}`)
  console.log(`  ${'═'.repeat(40)}`)
  console.log(`  Model:    ${provider.displayName}`)
  console.log(`  Pressure: ${getPressureLabel(config.pressure)}`)
  console.log(`  Memory:   ${getMemoryLabel(config.memory)}`)
  console.log()
  console.log(`  To run manually:`)
  console.log(`    ./benchmarks/evensong/blind.sh ${runId} ${config.model} ${config.pressure} ${config.memory}`)
  console.log()
}

function cmdList(): void {
  const runs = listRuns()
  if (runs.length === 0) {
    console.log('  No runs in registry.')
    return
  }

  console.log(`\n  EVENSONG REGISTRY — ${runs.length} runs`)
  console.log(`  ${'═'.repeat(80)}`)
  console.log(`  ${'Run'.padEnd(8)} ${'Model'.padEnd(16)} ${'Tests'.padEnd(8)} ${'Fail'.padEnd(6)} ${'Time'.padEnd(8)} ${'Grade'.padEnd(6)} Mode`)
  console.log(`  ${'─'.repeat(80)}`)

  for (const r of runs) {
    const grade = r.grade ?? '-'
    const time = r.time_min != null ? `${r.time_min}m` : 'N/A'
    console.log(`  ${r.run.padEnd(8)} ${(r.model ?? '').padEnd(16)} ${String(r.tests).padEnd(8)} ${String(r.failures).padEnd(6)} ${time.padEnd(8)} ${grade.padEnd(6)} ${r.mode ?? ''}`)
  }
  console.log()
}

function cmdCompare(args: string[]): void {
  const [a, b] = args
  if (!a || !b) {
    console.log('  Usage: compare <RUN_A> <RUN_B>')
    return
  }

  const runs = listRuns()
  const runA = runs.find(r => r.run === a)
  const runB = runs.find(r => r.run === b)

  if (!runA || !runB) {
    console.log(`  Run not found: ${!runA ? a : b}`)
    return
  }

  const delta = (va: number | null | undefined, vb: number | null | undefined): string => {
    if (va == null || vb == null) return 'N/A'
    const diff = Math.round((vb - va) * 10) / 10
    const pct = va === 0 ? '∞' : `${((diff / va) * 100).toFixed(1)}%`
    return `${diff > 0 ? '+' : ''}${diff} (${pct})`
  }

  console.log(`\n  EVENSONG COMPARE: ${a} vs ${b}`)
  console.log(`  ${'═'.repeat(50)}`)
  console.log(`  ${''.padEnd(20)} ${a.padEnd(12)} ${b.padEnd(12)} Delta`)
  console.log(`  ${'─'.repeat(50)}`)
  console.log(`  ${'Model'.padEnd(20)} ${(runA.model ?? '').padEnd(12)} ${(runB.model ?? '').padEnd(12)}`)
  console.log(`  ${'Mode'.padEnd(20)} ${(runA.mode ?? '').padEnd(12)} ${(runB.mode ?? '').padEnd(12)}`)
  console.log(`  ${'Services'.padEnd(20)} ${String(runA.services).padEnd(12)} ${String(runB.services).padEnd(12)} ${delta(runA.services, runB.services)}`)
  console.log(`  ${'Tests'.padEnd(20)} ${String(runA.tests).padEnd(12)} ${String(runB.tests).padEnd(12)} ${delta(runA.tests, runB.tests)}`)
  console.log(`  ${'Failures'.padEnd(20)} ${String(runA.failures).padEnd(12)} ${String(runB.failures).padEnd(12)}`)
  console.log(`  ${'Assertions'.padEnd(20)} ${String(runA.assertions ?? 'N/A').padEnd(12)} ${String(runB.assertions ?? 'N/A').padEnd(12)} ${delta(runA.assertions, runB.assertions)}`)
  console.log(`  ${'Time (min)'.padEnd(20)} ${String(runA.time_min ?? 'N/A').padEnd(12)} ${String(runB.time_min ?? 'N/A').padEnd(12)} ${delta(runA.time_min, runB.time_min)}`)
  console.log(`  ${'Grade'.padEnd(20)} ${(runA.grade ?? '-').padEnd(12)} ${(runB.grade ?? '-').padEnd(12)}`)
  console.log(`  ${'─'.repeat(50)}`)
  console.log(`  ${a}: ${runA.notes ?? ''}`)
  console.log(`  ${b}: ${runB.notes ?? ''}`)
  console.log()
}

function cmdModels(): void {
  console.log(`\n  BENCHMARK MODELS (${BENCHMARK_MODELS.length})`)
  console.log(`  ${'═'.repeat(60)}`)
  console.log(`  ${'Preset'.padEnd(18)} ${'Model ID'.padEnd(32)} Display`)
  console.log(`  ${'─'.repeat(60)}`)
  for (const m of BENCHMARK_MODELS) {
    console.log(`  ${m.name.padEnd(18)} ${m.modelId.padEnd(32)} ${m.displayName}`)
  }
  console.log()
}

async function cmdUpload(args: string[]): Promise<void> {
  const opts = parseArgs(args)
  const filePath = args.find(a => !a.startsWith('--') && a !== opts.run && a !== opts.format)
  const runId = opts.run

  if (!filePath || !runId) {
    console.error('  Usage: upload <file-path> --run <RUN_ID>')
    process.exit(1)
  }

  const jsonOutput = opts.format === 'json'

  try {
    const result = await uploadEvidence(filePath, runId)
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`\n  EVENSONG EVIDENCE UPLOAD`)
      console.log(`  ${'═'.repeat(50)}`)
      console.log(`  Run:      ${result.runId}`)
      console.log(`  File:     ${result.fileName}`)
      console.log(`  URL:      ${result.downloadUrl}`)
      console.log(`  ${'═'.repeat(50)}\n`)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (jsonOutput) {
      console.error(JSON.stringify({ error: message }))
    } else {
      console.error(`  Error: ${message}`)
    }
    process.exit(1)
  }
}

function cmdNext(): void {
  console.log(`  Next run ID: ${nextRunId()}`)
}

// ─── Display Helpers ────────────────────────────────────────────────────

function printRunHeader(config: RunConfig, provider: { displayName: string; modelId: string }): void {
  console.log(`\n  EVENSONG ${config.runId}`)
  console.log(`  ${'═'.repeat(40)}`)
  console.log(`  Model:    ${provider.displayName} (${provider.modelId})`)
  console.log(`  Pressure: ${getPressureLabel(config.pressure)}`)
  console.log(`  Memory:   ${getMemoryLabel(config.memory)}`)
  console.log(`  Services: ${config.services}`)
  console.log(`  Timeout:  ${config.timeoutMin}min`)
  console.log(`  ${'═'.repeat(40)}\n`)
}

function printRunResult(result: { tests: number; failures: number; assertions?: number | null; time_min: number; transcript_path?: string }): void {
  console.log(`\n  RESULT`)
  console.log(`  ${'─'.repeat(40)}`)
  console.log(`  Tests:      ${result.tests}`)
  console.log(`  Failures:   ${result.failures}`)
  console.log(`  Assertions: ${result.assertions ?? 'N/A'}`)
  console.log(`  Time:       ${result.time_min}min`)
  if (result.transcript_path) console.log(`  Transcript: ${result.transcript_path}`)
  console.log()
}

// ─── Main ───────────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'run':       await cmdRun(args); break
  case 'validate':  await cmdValidate(args); break
  case 'configs':   cmdConfigs(); break
  case 'setup':     cmdSetup(args); break
  case 'list':      cmdList(); break
  case 'compare':   cmdCompare(args); break
  case 'upload':    await cmdUpload(args); break
  case 'models':    cmdModels(); break
  case 'next':      cmdNext(); break
  case 'help':
  case '--help':
  case '-h':
  case undefined:   console.log(HELP); break
  default:
    console.error(`  Unknown command: ${command}`)
    console.log(HELP)
    process.exit(1)
}
