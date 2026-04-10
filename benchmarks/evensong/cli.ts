#!/usr/bin/env bun
/**
 * Evensong CLI — Automated benchmark harness for multi-model evaluation
 *
 * Usage:
 *   bun benchmarks/evensong/cli.ts run --model or-gpt5 --pressure L2 --memory clean
 *   bun benchmarks/evensong/cli.ts list
 *   bun benchmarks/evensong/cli.ts compare R009 R010
 *   bun benchmarks/evensong/cli.ts setup --model or-gpt5 --pressure L2 --memory blind --id R011
 */

import { runBenchmark, listRuns, nextRunId } from './harness.js'
import { BENCHMARK_MODELS } from './types.js'
import type { RunConfig } from './types.js'
import { getPressureLabel, getMemoryLabel } from './prompts.js'

const HELP = `
  ╔══════════════════════════════════════════════╗
  ║        EVENSONG — Benchmark Harness          ║
  ╚══════════════════════════════════════════════╝

  Commands:
    run      Run a benchmark (automated, pipe mode)
    setup    Prepare workspace only (for manual interactive run)
    list     Show all benchmark runs from registry
    compare  Diff two runs (e.g., compare R009 R010)
    models   List available benchmark models
    next     Show next available run ID

  Run Options:
    --model <name>      Provider preset (default: or-opus)
    --pressure <level>  L0|L1|L2|L3 (default: L0)
    --memory <state>    full|blind|clean (default: full)
    --services <n>      Target service count (default: 8)
    --timeout <min>     Max runtime in minutes (default: 30)
    --id <RUN_ID>       Explicit run ID (default: auto-increment)
    --codename <name>   Run codename (default: model-pressure)

  Examples:
    bun benchmarks/evensong/cli.ts run --model or-gpt5 --pressure L2 --memory clean
    bun benchmarks/evensong/cli.ts run --model or-glm --pressure L3 --services 10
    bun benchmarks/evensong/cli.ts list
    bun benchmarks/evensong/cli.ts compare R009 R010
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

async function cmdRun(args: string[]): Promise<void> {
  const opts = parseArgs(args)

  const config: RunConfig = {
    runId: opts.id ?? nextRunId(),
    codename: opts.codename,
    model: opts.model ?? 'or-opus',
    pressure: (opts.pressure ?? 'L0') as RunConfig['pressure'],
    memory: (opts.memory ?? 'full') as RunConfig['memory'],
    services: parseInt(opts.services ?? '8', 10),
    timeoutMin: parseInt(opts.timeout ?? '30', 10),
  }

  // Validate model
  const valid = BENCHMARK_MODELS.find(m => m.name === config.model)
  if (!valid) {
    console.error(`  ❌ Unknown model: ${config.model}`)
    console.error(`  Available: ${BENCHMARK_MODELS.map(m => m.name).join(', ')}`)
    process.exit(1)
  }

  // Validate pressure
  if (!['L0', 'L1', 'L2', 'L3'].includes(config.pressure)) {
    console.error(`  ❌ Invalid pressure: ${config.pressure}. Use L0|L1|L2|L3`)
    process.exit(1)
  }

  // Validate memory
  if (!['full', 'blind', 'clean'].includes(config.memory)) {
    console.error(`  ❌ Invalid memory: ${config.memory}. Use full|blind|clean`)
    process.exit(1)
  }

  console.log(`\n  EVENSONG ${config.runId}`)
  console.log(`  ${'═'.repeat(40)}`)
  console.log(`  Model:    ${valid.displayName} (${valid.modelId})`)
  console.log(`  Pressure: ${getPressureLabel(config.pressure)}`)
  console.log(`  Memory:   ${getMemoryLabel(config.memory)}`)
  console.log(`  Services: ${config.services}`)
  console.log(`  Timeout:  ${config.timeoutMin}min`)
  console.log(`  ${'═'.repeat(40)}\n`)

  const result = await runBenchmark(config)

  console.log(`\n  RESULT`)
  console.log(`  ${'─'.repeat(40)}`)
  console.log(`  Tests:      ${result.tests}`)
  console.log(`  Failures:   ${result.failures}`)
  console.log(`  Assertions: ${result.assertions ?? 'N/A'}`)
  console.log(`  Time:       ${result.time_min}min`)
  console.log(`  Transcript: ${result.transcript_path}`)
  console.log()
}

function cmdSetup(args: string[]): void {
  const opts = parseArgs(args)
  const runId = opts.id ?? nextRunId()
  const model = opts.model ?? 'or-opus'
  const pressure = opts.pressure ?? 'L0'
  const memory = opts.memory ?? 'full'

  const provider = BENCHMARK_MODELS.find(m => m.name === model)
  if (!provider) {
    console.error(`  ❌ Unknown model: ${model}`)
    process.exit(1)
  }

  console.log(`\n  EVENSONG SETUP — ${runId}`)
  console.log(`  ${'═'.repeat(40)}`)
  console.log(`  Model:    ${provider.displayName}`)
  console.log(`  Pressure: ${getPressureLabel(pressure)}`)
  console.log(`  Memory:   ${getMemoryLabel(memory)}`)
  console.log()
  console.log(`  To run manually:`)
  console.log(`    ./benchmarks/evensong/blind.sh ${runId} ${model} ${pressure} ${memory}`)
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

function cmdNext(): void {
  console.log(`  Next run ID: ${nextRunId()}`)
}

// Main
const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'run':     await cmdRun(args); break
  case 'setup':   cmdSetup(args); break
  case 'list':    cmdList(); break
  case 'compare': cmdCompare(args); break
  case 'models':  cmdModels(); break
  case 'next':    cmdNext(); break
  case 'help':
  case '--help':
  case '-h':
  case undefined:  console.log(HELP); break
  default:
    console.error(`  Unknown command: ${command}`)
    console.log(HELP)
    process.exit(1)
}
