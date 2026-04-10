#!/usr/bin/env bun
/**
 * Evensong Harness — Core benchmark execution engine
 *
 * Orchestrates: workspace setup → provider config → prompt generation →
 * CCB subprocess → transcript capture → result parsing → registry append
 */

import { spawn } from 'child_process'
import { mkdirSync, appendFileSync, readFileSync, existsSync, cpSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { TranscriptLogger } from './transcript.js'
import { buildPrompt, getPressureLabel, getMemoryLabel } from './prompts.js'
import type { RunConfig, RunResult, ProviderPreset } from './types.js'
import type { EmotionProfile } from './emotion-schema.js'
import { BENCHMARK_MODELS } from './types.js'

const PROJECT_ROOT = resolve(import.meta.dir, '../..')
const REGISTRY_PATH = join(import.meta.dir, 'registry.jsonl')
const RUNS_DIR = join(import.meta.dir, '..', 'runs')

// Memory files classified as ALLOW (safe for runner to see)
const ALLOW_MEMORY_FILES = [
  'user_profile.md',
  'feedback_bun_test_file_size.md',
  'feedback_website_standard.md',
  'project_ccb_status.md',
  'project_build_stubs.md',
  'project_architecture_patterns.md',
  'learnings_git_branch_topology.md',
  'learnings_secret_scanning.md',
  'learnings_isenabled_bug.md',
  'reference_gsd_phase_lookup.md',
  'reference_remote_agent_infra.md',
]

/**
 * Run a complete benchmark
 */
export async function runBenchmark(config: RunConfig): Promise<RunResult> {
  const runDir = join(RUNS_DIR, `${config.runId}-${config.codename ?? config.model}`)
  mkdirSync(runDir, { recursive: true })

  // 1. Setup transcript logger
  const transcriptPath = join(runDir, 'transcript.jsonl')
  const logger = new TranscriptLogger(transcriptPath)
  logger.log('system', `Evensong harness starting: ${config.runId}`, {
    config: { ...config },
    startTime: new Date().toISOString(),
  })

  // 2. Resolve provider
  const provider = BENCHMARK_MODELS.find(m => m.name === config.model)
  if (!provider) {
    const available = BENCHMARK_MODELS.map(m => m.name).join(', ')
    throw new Error(`Unknown model: ${config.model}. Available: ${available}`)
  }
  logger.log('system', `Provider resolved: ${provider.displayName} (${provider.modelId})`)

  // 3. Setup workspace based on memory state
  const workspace = await setupWorkspace(config, logger)
  logger.log('system', `Workspace ready: ${workspace.path} (memory: ${config.memory})`)

  // 4. Build benchmark prompt
  const prompt = buildPrompt(config.pressure, config.services)
  logger.log('prompt', prompt, { pressure: config.pressure, services: config.services })

  // Save prompt to run directory for reference
  writeFileSync(join(runDir, 'prompt.md'), prompt)

  // 5. Build env vars for subprocess
  const env = buildEnv(provider, config, workspace)
  logger.log('system', `Environment configured for ${provider.name}`, {
    model: provider.modelId,
    memory: config.memory,
  })

  // 6. Spawn CCB and capture output
  console.log(`\n  ⏱  Evensong ${config.runId} starting...`)
  console.log(`  📦 Model: ${provider.displayName}`)
  console.log(`  🔥 Pressure: ${getPressureLabel(config.pressure)}`)
  console.log(`  🧠 Memory: ${getMemoryLabel(config.memory)}`)
  console.log(`  📂 Workspace: ${workspace.path}`)
  console.log(`  📝 Transcript: ${transcriptPath}\n`)

  const output = await spawnCCB(prompt, env, workspace.path, config.timeoutMin, logger)

  // 7. Parse results from output
  const metrics = parseResults(output, logger)

  // 8. Build result
  const result: RunResult = {
    run: config.runId,
    codename: config.codename ?? `${config.model}-${config.pressure}`,
    date: new Date().toISOString().split('T')[0],
    model: provider.displayName,
    mode: `${getPressureLabel(config.pressure)} / ${getMemoryLabel(config.memory)}`,
    services: metrics.services ?? config.services,
    tests: metrics.tests,
    failures: metrics.failures,
    assertions: metrics.assertions,
    time_min: logger.elapsedMin,
    criteria: metrics.criteria ?? `${metrics.services ?? config.services}/${config.services}`,
    grade: null,  // assigned manually or by emotion extraction
    notes: `${provider.name} ${config.pressure} ${config.memory}, ${logger.count} transcript entries`,
    transcript_path: transcriptPath,
  }

  // 9. Save result
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2))
  logger.log('metric', 'Run complete', { result })

  // 10. Append to registry
  appendToRegistry(result)
  console.log(`\n  ✅ ${config.runId} complete: ${result.tests} tests, ${result.failures} failures, ${result.time_min}min`)

  return result
}

/**
 * Setup workspace based on memory state
 */
interface Workspace {
  path: string
  memoryPath: string | null
  cleanup?: () => void
}

async function setupWorkspace(config: RunConfig, logger: TranscriptLogger): Promise<Workspace> {
  if (config.memory === 'full') {
    // Full memory — use current project directory as-is
    return { path: PROJECT_ROOT, memoryPath: null }
  }

  // Create isolated workspace for blind/clean memory
  const wsPath = `/tmp/evensong-${config.runId}`
  mkdirSync(wsPath, { recursive: true })

  // Clone repo (shallow)
  const cloneTarget = join(wsPath, 'repo')
  if (!existsSync(cloneTarget)) {
    logger.log('system', `Cloning repo to ${cloneTarget}`)
    const proc = Bun.spawnSync(['git', 'clone', '--depth', '1', PROJECT_ROOT, cloneTarget])
    if (proc.exitCode !== 0) {
      // Fallback: copy
      cpSync(PROJECT_ROOT, cloneTarget, { recursive: true, filter: (src) => !src.includes('node_modules') && !src.includes('.git') })
    }

    // Install dependencies in workspace
    logger.log('system', 'Installing dependencies in workspace...')
    const installProc = Bun.spawnSync(['bun', 'install', '--frozen-lockfile'], { cwd: cloneTarget })
    if (installProc.exitCode !== 0) {
      Bun.spawnSync(['bun', 'install'], { cwd: cloneTarget })
    }
    logger.log('system', 'Dependencies installed')
  }

  if (config.memory === 'clean') {
    // Clean room — no memories at all
    logger.log('system', 'Clean room: no memory files')
    return {
      path: cloneTarget,
      memoryPath: join(wsPath, 'empty-memory'),
      cleanup: () => { try { require('fs').rmSync(wsPath, { recursive: true }) } catch {} },
    }
  }

  if (config.memory === 'blind') {
    // Single-blind — copy only ALLOW-classified memories
    const sourceMem = join(
      process.env.HOME ?? '',
      '.claude/projects/-Users-0xvox-claude-code-reimagine-for-learning/memory'
    )
    const blindMem = join(wsPath, 'memory')
    mkdirSync(blindMem, { recursive: true })

    let copied = 0
    for (const file of ALLOW_MEMORY_FILES) {
      const src = join(sourceMem, file)
      if (existsSync(src)) {
        cpSync(src, join(blindMem, file))
        copied++
      }
    }

    // Write clean MEMORY.md index (no strategy entries)
    writeFileSync(join(blindMem, 'MEMORY.md'), `# Memory Index (Single-Blind)\n\n## User\n- [User Profile](user_profile.md) — Senior dev, Bun runtime\n\n## Feedback\n- [Bun Test File Size](feedback_bun_test_file_size.md) — Cap test files at 500 lines\n\n## Project\n- [CCB Status](project_ccb_status.md) — Current project phase\n- [Build Stubs](project_build_stubs.md) — Missing stubs must be created\n\n## Reference\n- [GSD Phase Lookup](reference_gsd_phase_lookup.md) — CLI tool usage\n`)

    logger.log('system', `Single-blind: ${copied}/${ALLOW_MEMORY_FILES.length} memory files copied`)
    return {
      path: cloneTarget,
      memoryPath: blindMem,
      cleanup: () => { try { require('fs').rmSync(wsPath, { recursive: true }) } catch {} },
    }
  }

  return { path: PROJECT_ROOT, memoryPath: null }
}

/**
 * Build environment variables for the CCB subprocess
 */
function buildEnv(provider: ProviderPreset, config: RunConfig, workspace: Workspace): Record<string, string> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    // Disable auto-memory extraction during benchmark (prevent contamination)
    CLAUDE_CODE_DISABLE_MEMORY_EXTRACTION: '1',
    // Benchmark identification
    EVENSONG_RUN_ID: config.runId,
    EVENSONG_MODEL: config.model,
    EVENSONG_PRESSURE: config.pressure,
  }

  // Route to correct API based on provider type
  if (provider.provider === 'minimax-direct') {
    env.ANTHROPIC_API_KEY = process.env[provider.apiKeyEnvVar ?? 'MINIMAX_API_KEY'] ?? ''
    env.ANTHROPIC_BASE_URL = provider.baseUrl ?? 'https://api.minimax.io/anthropic'
  } else {
    // OpenRouter routing (default for all or-* models)
    env.ANTHROPIC_API_KEY = process.env.OPENROUTER_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? ''
    env.ANTHROPIC_BASE_URL = 'https://openrouter.ai/api/v1'
  }

  // Model override
  env.ANTHROPIC_MODEL = provider.modelId

  // Memory isolation with EverOS keys
  if (workspace.memoryPath) {
    env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE = workspace.memoryPath
  }
  if (config.memory !== 'full') {
    env.EVERMEM_GROUP_ID = `evensong-${config.runId}`
  }
  if (config.memory === 'clean') {
    // Void space — empty/disposable, no memories persist
    env.EVERMEM_API_KEY = '309390b7-2468-4a4f-b800-f593fea15ba4'
    env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
  } else if (config.memory === 'blind') {
    // Allaround space — general-purpose runner memories only
    env.EVERMEM_API_KEY = 'a2981e4d-6374-4c40-ab50-9c8ae052a7c4'
  }
  // 'full' — don't override EVERMEM_API_KEY, uses default Key A from plugin .env

  return env
}

/**
 * Spawn CCB in pipe mode and capture output
 */
function spawnCCB(
  prompt: string,
  env: Record<string, string>,
  cwd: string,
  timeoutMin: number,
  logger: TranscriptLogger,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ccbPath = join(PROJECT_ROOT, 'src/entrypoints/cli.tsx')
    const child = spawn('bun', ['run', ccbPath, '-p'], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      logger.log('response', text)
      // Stream to console for live monitoring
      process.stdout.write(text)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      if (text.trim()) logger.log('error', text)
    })

    // Send prompt via stdin
    child.stdin.write(prompt)
    child.stdin.end()

    // Timeout
    const timer = setTimeout(() => {
      logger.log('error', `Timeout after ${timeoutMin} minutes`)
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000)
    }, timeoutMin * 60 * 1000)

    child.on('close', (code) => {
      clearTimeout(timer)
      logger.log('system', `Process exited with code ${code}`, { exitCode: code })
      if (stderr.trim()) logger.log('error', `stderr: ${stderr.slice(0, 5000)}`)
      resolve(stdout)
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      logger.log('error', `Spawn error: ${err.message}`)
      reject(err)
    })
  })
}

/**
 * Parse test results from CCB output
 */
interface ParsedMetrics {
  tests: number
  failures: number
  assertions: number | null
  services: number | null
  criteria: string | null
}

function parseResults(output: string, logger: TranscriptLogger): ParsedMetrics {
  const metrics: ParsedMetrics = { tests: 0, failures: 0, assertions: null, services: null, criteria: null }

  // Look for bun test output patterns:
  // "X tests, Y failures" or "X pass, Y fail"
  const testMatch = output.match(/(\d+)\s+(?:tests?|pass)/i)
  const failMatch = output.match(/(\d+)\s+fail/i)
  const assertMatch = output.match(/(\d+)\s+(?:assertions?|expects?)/i)

  if (testMatch) metrics.tests = parseInt(testMatch[1], 10)
  if (failMatch) metrics.failures = parseInt(failMatch[1], 10)
  if (assertMatch) metrics.assertions = parseInt(assertMatch[1], 10)

  // Count service directories mentioned
  const servicePattern = /services\/(\w+)/g
  const services = new Set<string>()
  let match
  while ((match = servicePattern.exec(output)) !== null) {
    services.add(match[1])
  }
  if (services.size > 0) metrics.services = services.size

  // Look for criteria pattern (e.g., "24/24")
  const criteriaMatch = output.match(/(\d+)\/(\d+)/g)
  if (criteriaMatch) metrics.criteria = criteriaMatch[criteriaMatch.length - 1]

  logger.log('metric', 'Parsed results', { metrics })
  return metrics
}

/**
 * Append a result to the registry JSONL
 * Includes transcript_path (useful metadata) but strips emotion
 * (emotion data is added separately by the extraction pipeline via updateRegistryEmotion)
 */
export function appendToRegistry(result: RunResult): void {
  const { emotion, ...registryEntry } = result
  appendFileSync(REGISTRY_PATH, JSON.stringify(registryEntry) + '\n')
}

/**
 * Find a run by ID in registry.jsonl and patch its emotion field.
 * Atomic: reads entire file, modifies matching line, rewrites file.
 * Returns true if the run was found and updated, false otherwise.
 */
export function updateRegistryEmotion(runId: string, emotion: EmotionProfile): boolean {
  if (!existsSync(REGISTRY_PATH)) return false

  const content = readFileSync(REGISTRY_PATH, 'utf-8')
  const lines = content.trim().split('\n').filter(Boolean)

  let found = false
  const updated = lines.map(line => {
    const entry = JSON.parse(line)
    if (entry.run === runId) {
      found = true
      entry.emotion = emotion
    }
    return JSON.stringify(entry)
  })

  if (!found) return false

  writeFileSync(REGISTRY_PATH, updated.join('\n') + '\n')
  return true
}

/**
 * List all runs from registry
 */
export function listRuns(): RunResult[] {
  if (!existsSync(REGISTRY_PATH)) return []
  return readFileSync(REGISTRY_PATH, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

/**
 * Get next run ID based on registry
 */
export function nextRunId(): string {
  const runs = listRuns()
  if (runs.length === 0) return 'R011'
  const lastNum = Math.max(...runs.map(r => parseInt(r.run.replace('R', ''), 10) || 0))
  return `R${String(lastNum + 1).padStart(3, '0')}`
}
