#!/usr/bin/env bun
/**
 * Evensong Batch Runner — Execute multiple benchmark conditions
 *
 * Usage:
 *   bun benchmarks/evensong/batch.ts --models or-gpt5,or-glm,or-grok --pressure L2 --memory clean
 *   bun benchmarks/evensong/batch.ts --matrix mini    # 3 models × 2 pressures × 1 memory = 6 runs
 *   bun benchmarks/evensong/batch.ts --matrix full     # 8 models × 4 pressures × 3 memories = 96 runs
 *   bun benchmarks/evensong/batch.ts --dry-run --matrix mini   # preview what would run
 */

import { parseArgs } from 'util'
import { runBenchmark, nextRunId } from './harness.js'
import type { RunConfig, RunResult } from './types.js'
import { BENCHMARK_MODELS } from './types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

type Pressure = RunConfig['pressure']
type Memory = RunConfig['memory']

interface BatchCondition {
  model: string
  pressure: Pressure
  memory: Memory
}

interface BatchOptions {
  models: string[]
  pressures: Pressure[]
  memories: Memory[]
  services: number
  timeoutMin: number
  startId: string | null
  dryRun: boolean
}

// ─── Matrix Presets ─────────────────────────────────────────────────────────

const MATRIX_MINI: BatchOptions = {
  models: ['or-opus', 'or-gpt5', 'or-glm'],
  pressures: ['L0', 'L2'],
  memories: ['clean'],
  services: 8,
  timeoutMin: 30,
  startId: null,
  dryRun: false,
}

const MATRIX_FULL: BatchOptions = {
  models: BENCHMARK_MODELS.map(m => m.name),
  pressures: ['L0', 'L1', 'L2', 'L3'],
  memories: ['full', 'blind', 'clean'],
  services: 8,
  timeoutMin: 30,
  startId: null,
  dryRun: false,
}

// ─── Cartesian Product ──────────────────────────────────────────────────────

function cartesian(opts: BatchOptions): BatchCondition[] {
  const conditions: BatchCondition[] = []
  for (const model of opts.models) {
    for (const pressure of opts.pressures) {
      for (const memory of opts.memories) {
        conditions.push({ model, pressure, memory })
      }
    }
  }
  return conditions
}

// ─── Run ID Incrementer ────────────────────────────────────────────────────

function incrementRunId(id: string): string {
  const num = parseInt(id.replace('R', ''), 10)
  return `R${String(num + 1).padStart(3, '0')}`
}

// ─── Display Helpers ────────────────────────────────────────────────────────

function resolveDisplayName(modelName: string): string {
  const preset = BENCHMARK_MODELS.find(m => m.name === modelName)
  return preset?.displayName ?? modelName
}

function pad(s: string, width: number): string {
  return s.padEnd(width)
}

function printSummaryTable(results: (RunResult | { run: string; error: string })[]): void {
  const succeeded = results.filter((r): r is RunResult => !('error' in r))
  const failed = results.filter((r): r is { run: string; error: string } => 'error' in r)

  console.log('')
  console.log(`  BATCH SUMMARY — ${results.length} runs`)
  console.log('  ' + '═'.repeat(75))

  if (succeeded.length > 0) {
    console.log(`  ${pad('Run', 9)}${pad('Model', 18)}${pad('Pressure', 12)}${pad('Memory', 10)}${pad('Tests', 7)}${pad('Fail', 6)}Time`)
    console.log('  ' + '─'.repeat(75))
    for (const r of succeeded) {
      const [pressureStr, memoryStr] = r.mode.split(' / ')
      console.log(
        `  ${pad(r.run, 9)}${pad(r.model, 18)}${pad(pressureStr ?? '', 12)}${pad(memoryStr ?? '', 10)}${pad(String(r.tests), 7)}${pad(String(r.failures), 6)}${r.time_min}m`
      )
    }
  }

  if (failed.length > 0) {
    console.log('')
    console.log('  ERRORS:')
    for (const f of failed) {
      console.log(`  ${f.run}: ${f.error}`)
    }
  }

  console.log('  ' + '═'.repeat(75))
  console.log(`  Succeeded: ${succeeded.length}  Failed: ${failed.length}  Total: ${results.length}`)
  console.log('')
}

function printDryRun(conditions: BatchCondition[], startId: string, services: number, timeoutMin: number): void {
  let currentId = startId

  console.log('')
  console.log(`  DRY RUN — ${conditions.length} conditions planned`)
  console.log('  ' + '═'.repeat(75))
  console.log(`  ${pad('Run', 9)}${pad('Model', 18)}${pad('Pressure', 12)}${pad('Memory', 10)}${pad('Services', 10)}Timeout`)
  console.log('  ' + '─'.repeat(75))

  for (const c of conditions) {
    console.log(
      `  ${pad(currentId, 9)}${pad(resolveDisplayName(c.model), 18)}${pad(c.pressure, 12)}${pad(c.memory, 10)}${pad(String(services), 10)}${timeoutMin}m`
    )
    currentId = incrementRunId(currentId)
  }

  console.log('  ' + '═'.repeat(75))
  console.log(`  Total runs: ${conditions.length}`)
  console.log(`  Estimated max time: ${conditions.length * timeoutMin}m (${Math.round(conditions.length * timeoutMin / 60 * 10) / 10}h)`)
  console.log('')
}

// ─── Core Batch Runner (programmatic API) ───────────────────────────────────

export async function runBatch(conditions: RunConfig[]): Promise<RunResult[]> {
  const results: (RunResult | { run: string; error: string })[] = []
  let aborted = false

  // SIGINT handler — finish current run, then stop
  const onSigint = () => {
    console.log('\n  [SIGINT] Finishing current run, then stopping batch...')
    aborted = true
  }
  process.on('SIGINT', onSigint)

  try {
    for (let i = 0; i < conditions.length; i++) {
      if (aborted) {
        console.log(`  [BATCH] Stopped after ${i} of ${conditions.length} runs (SIGINT)`)
        break
      }

      const config = conditions[i]
      console.log(`\n  ── Batch ${i + 1}/${conditions.length}: ${config.runId} (${config.model} ${config.pressure} ${config.memory}) ──`)

      try {
        const result = await runBenchmark(config)
        results.push(result)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`  [ERROR] ${config.runId} failed: ${message}`)
        results.push({ run: config.runId, error: message })
      }
    }
  } finally {
    process.removeListener('SIGINT', onSigint)
  }

  // Print summary
  printSummaryTable(results)

  // Return only successful results
  return results.filter((r): r is RunResult => !('error' in r))
}

// ─── CLI Argument Parsing ───────────────────────────────────────────────────

function parseCliArgs(): BatchOptions {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      models:     { type: 'string' },
      pressure:   { type: 'string' },
      memory:     { type: 'string' },
      services:   { type: 'string' },
      timeout:    { type: 'string' },
      matrix:     { type: 'string' },
      'start-id': { type: 'string' },
      'dry-run':  { type: 'boolean', default: false },
      help:       { type: 'boolean', default: false },
    },
    strict: true,
  })

  if (values.help) {
    console.log(`
  Evensong Batch Runner

  Usage:
    bun benchmarks/evensong/batch.ts [options]

  Options:
    --models <list>     Comma-separated model preset names (e.g., or-gpt5,or-glm)
    --pressure <list>   Pressure level(s): L0,L1,L2,L3 (default: L0)
    --memory <list>     Memory state(s): full,blind,clean (default: full)
    --services <n>      Service count per run (default: 8)
    --timeout <min>     Per-run timeout in minutes (default: 30)
    --matrix <preset>   Use preset: "mini" or "full"
    --start-id <id>     Starting run ID (default: auto from registry)
    --dry-run           Preview planned conditions without executing
    --help              Show this help message

  Matrix presets:
    mini    3 models (opus,gpt5,glm) × 2 pressures (L0,L2) × 1 memory (clean) = 6 runs
    full    8 models × 4 pressures × 3 memories = 96 runs

  Examples:
    bun benchmarks/evensong/batch.ts --models or-gpt5,or-glm --pressure L2 --memory clean
    bun benchmarks/evensong/batch.ts --matrix mini --dry-run
    bun benchmarks/evensong/batch.ts --matrix full --start-id R050
`)
    process.exit(0)
  }

  // If --matrix is specified, start from preset and allow overrides
  let opts: BatchOptions
  if (values.matrix === 'mini') {
    opts = { ...MATRIX_MINI }
  } else if (values.matrix === 'full') {
    opts = { ...MATRIX_FULL }
  } else if (values.matrix) {
    console.error(`  Unknown matrix preset: ${values.matrix}. Use "mini" or "full".`)
    process.exit(1)
  } else {
    opts = {
      models: [],
      pressures: ['L0'],
      memories: ['full'],
      services: 8,
      timeoutMin: 30,
      startId: null,
      dryRun: false,
    }
  }

  // Override with explicit CLI args
  if (values.models) {
    opts.models = values.models.split(',').map(s => s.trim())
  }
  if (values.pressure) {
    opts.pressures = values.pressure.split(',').map(s => s.trim()) as Pressure[]
  }
  if (values.memory) {
    opts.memories = values.memory.split(',').map(s => s.trim()) as Memory[]
  }
  if (values.services) {
    opts.services = parseInt(values.services, 10)
  }
  if (values.timeout) {
    opts.timeoutMin = parseInt(values.timeout, 10)
  }
  if (values['start-id']) {
    opts.startId = values['start-id']
  }
  if (values['dry-run']) {
    opts.dryRun = true
  }

  // Validate: must have at least one model
  if (opts.models.length === 0) {
    console.error('  Error: No models specified. Use --models or --matrix.')
    process.exit(1)
  }

  // Validate model names
  const validNames = new Set(BENCHMARK_MODELS.map(m => m.name))
  for (const name of opts.models) {
    if (!validNames.has(name)) {
      console.error(`  Error: Unknown model "${name}". Available: ${[...validNames].join(', ')}`)
      process.exit(1)
    }
  }

  // Validate pressure values
  const validPressures = new Set(['L0', 'L1', 'L2', 'L3'])
  for (const p of opts.pressures) {
    if (!validPressures.has(p)) {
      console.error(`  Error: Unknown pressure "${p}". Use L0, L1, L2, or L3.`)
      process.exit(1)
    }
  }

  // Validate memory values
  const validMemories = new Set(['full', 'blind', 'clean'])
  for (const m of opts.memories) {
    if (!validMemories.has(m)) {
      console.error(`  Error: Unknown memory "${m}". Use full, blind, or clean.`)
      process.exit(1)
    }
  }

  return opts
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseCliArgs()
  const conditions = cartesian(opts)
  const startId = opts.startId ?? nextRunId()

  if (conditions.length === 0) {
    console.log('  No conditions to run.')
    return
  }

  // Dry run — just print the plan
  if (opts.dryRun) {
    printDryRun(conditions, startId, opts.services, opts.timeoutMin)
    return
  }

  // Build RunConfig array with auto-incrementing IDs
  let currentId = startId
  const configs: RunConfig[] = conditions.map(c => {
    const config: RunConfig = {
      runId: currentId,
      model: c.model,
      pressure: c.pressure,
      memory: c.memory,
      services: opts.services,
      timeoutMin: opts.timeoutMin,
    }
    currentId = incrementRunId(currentId)
    return config
  })

  console.log(`\n  Evensong Batch: ${configs.length} runs starting from ${startId}`)
  console.log(`  Models: ${opts.models.map(resolveDisplayName).join(', ')}`)
  console.log(`  Pressures: ${opts.pressures.join(', ')}`)
  console.log(`  Memories: ${opts.memories.join(', ')}`)
  console.log(`  Services: ${opts.services}  Timeout: ${opts.timeoutMin}m/run`)
  console.log('')

  await runBatch(configs)
}

// Run if executed directly
main().catch(err => {
  console.error(`  Fatal: ${err.message ?? err}`)
  process.exit(1)
})
