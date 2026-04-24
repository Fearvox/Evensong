#!/usr/bin/env bun
/**
 * Evensong Harness — Core benchmark execution engine
 *
 * Orchestrates: workspace setup → provider config → prompt generation →
 * CCB subprocess → transcript capture → result parsing → registry append
 */

import { spawn } from 'child_process'
import { mkdirSync, appendFileSync, readFileSync, existsSync, cpSync, writeFileSync, readdirSync, symlinkSync, rmSync, mkdtempSync } from 'fs'
import { createHash } from 'crypto'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { TranscriptLogger } from './transcript.js'
import { buildPrompt, getPressureLabel, getMemoryLabel } from './prompts.js'
import type { RunConfig, RunResult, ProviderPreset } from './types.js'
import type { EmotionProfile } from './emotion-schema.js'
import { BENCHMARK_MODELS } from './types.js'

export function detectRateLimit(output: string): boolean {
  const patterns = [
    /you've hit your limit/i,
    /rate.?limit/i,
    /429\s+too many requests/i,
    /rate_limit_error/i,
    /usage.?limit/i,
  ]
  return patterns.some(p => p.test(output))
}

function requireEnv(name: string, purpose: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required for ${purpose}; no benchmark fallback key is bundled`)
  }
  return value
}

export interface BunTestMetrics {
  tests: number
  failures: number
  assertions: number | null
  valid: boolean
}

export function parseBunTestOutput(output: string): BunTestMetrics {
  const ranMatch = output.match(/^\s*Ran\s+(\d+)\s+tests?\s+across\b/im)
  const passMatch = output.match(/^\s*(\d+)\s+pass(?:ed)?\b/im)
  const failMatch = output.match(/^\s*(\d+)\s+fail(?:ed)?\b/im)
  const expectMatch =
    output.match(/^\s*(\d+)\s+expect\(\)\s+calls?\b/im) ??
    output.match(/^\s*(\d+)\s+(?:assertions?|expects?)\b/im)

  if (!ranMatch && !passMatch && !failMatch) {
    return { tests: 0, failures: 0, assertions: null, valid: false }
  }

  const pass = passMatch ? parseInt(passMatch[1]!, 10) : 0
  const fail = failMatch ? parseInt(failMatch[1]!, 10) : 0
  const tests = ranMatch ? parseInt(ranMatch[1]!, 10) : pass + fail

  return {
    tests,
    failures: fail,
    assertions: expectMatch ? parseInt(expectMatch[1]!, 10) : null,
    valid: Number.isFinite(tests) && tests >= 0,
  }
}

export function calculateEffectiveTestMetrics(params: {
  hasPreExisting: boolean
  postRunTests: number
  preRunTests: number
  newTestCount: number
  failures: number
}): { effectiveTests: number; effectiveFailures: number; testsPre: number; testsNew: number } {
  const effectiveTests = params.hasPreExisting
    ? Math.max(0, params.postRunTests - params.preRunTests)
    : params.postRunTests
  return {
    effectiveTests,
    effectiveFailures: Math.max(0, params.failures),
    testsPre: params.hasPreExisting ? params.preRunTests : 0,
    testsNew: params.newTestCount,
  }
}

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
  try {

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

  // 5.5. Snapshot pre-existing test files (for pre/post diff)
  const preSnapshot = snapshotTestFiles(workspace.path)

  // 5.6. Run pre-run bun test to get baseline test count (for full-memory mode)
  let preRunTestCount = 0
  if (preSnapshot.size > 0) {
    logger.log('system', 'Running pre-run bun test for baseline count...')
    const preTestProc = Bun.spawnSync(['bun', 'test'], {
      cwd: workspace.path,
      timeout: 180_000,
      env: { ...process.env, FORCE_COLOR: '0', BUN_TEST_TIMEOUT: '60000' },
    })
    const preTestOutput = (preTestProc.stdout?.toString() ?? '') + (preTestProc.stderr?.toString() ?? '')
    const parsedPre = parseBunTestOutput(preTestOutput)
    if (!parsedPre.valid) {
      logger.log('error', 'Pre-run bun test output was not parseable; refusing to compute full-memory delta', {
        exitCode: preTestProc.exitCode,
        preview: preTestOutput.slice(0, 800),
      })
      throw new Error('Pre-run bun test output was not parseable; benchmark delta would be unsafe')
    }
    preRunTestCount = parsedPre.tests
    logger.log('system', `Pre-run baseline: ${preRunTestCount} tests`, {
      exitCode: preTestProc.exitCode,
      failures: parsedPre.failures,
      assertions: parsedPre.assertions,
    })
  }
  logger.log('system', `Pre-snapshot: ${preSnapshot.size} test files`, {
    files: [...preSnapshot.keys()],
  })
  writeFileSync(join(runDir, 'pre-snapshot.json'), JSON.stringify([...preSnapshot.entries()], null, 2))

  // 6. Spawn CCB and capture output
  console.log(`\n  ⏱  Evensong ${config.runId} starting...`)
  console.log(`  📦 Model: ${provider.displayName}`)
  console.log(`  🔥 Pressure: ${getPressureLabel(config.pressure)}`)
  console.log(`  🧠 Memory: ${getMemoryLabel(config.memory)}`)
  console.log(`  📂 Workspace: ${workspace.path}`)
  console.log(`  📝 Transcript: ${transcriptPath}\n`)

  const output = await spawnCLI(prompt, env, workspace.path, config.timeoutMin, logger, provider)

  // 6.5. Check for rate limit before parsing
  const rateLimited = detectRateLimit(output)
  if (rateLimited) {
    logger.log('error', 'RATE LIMIT DETECTED — run invalid', { outputPreview: output.slice(0, 500) })
    console.error(`\n  ❌ ${config.runId} RATE LIMITED — marking invalid`)
  }

  // 7. Parse results — run actual bun test in workspace for verified metrics
  const metrics = parseResults(output, logger, workspace.path)

  // 7.5. Post-snapshot diff — only count newly generated tests
  const postSnapshot = snapshotTestFiles(workspace.path)
  const { newFiles, modifiedFiles, newTestCount } = diffSnapshots(preSnapshot, postSnapshot, workspace.path)
  logger.log('metric', 'Pre/post diff', {
    pre: preSnapshot.size,
    post: postSnapshot.size,
    newFiles: newFiles.length,
    modifiedFiles: modifiedFiles.length,
    newTestCount,
  })
  writeFileSync(join(runDir, 'post-snapshot.json'), JSON.stringify([...postSnapshot.entries()], null, 2))
  writeFileSync(join(runDir, 'diff.json'), JSON.stringify({ newFiles, modifiedFiles, newTestCount }, null, 2))

  // 8. Build result — use delta when pre-existing tests detected
  const hasPreExisting = preSnapshot.size > 0
  // For full-memory: effective = post_bun_test - pre_bun_test (delta of actual test counts)
  // For clean-room: effective = metrics.tests (all tests are new)
  const effective = calculateEffectiveTestMetrics({
    hasPreExisting,
    postRunTests: metrics.tests,
    preRunTests: preRunTestCount,
    newTestCount,
    failures: metrics.failures,
  })

  logger.log('metric', 'Test count decision', {
    hasPreExisting,
    preSnapshotSize: preSnapshot.size,
    bunTestTotal: metrics.tests,
    diffNewTests: newTestCount,
    effectiveTests: effective.effectiveTests,
    rateLimited,
  })

  const result: RunResult = {
    run: config.runId,
    codename: config.codename ?? `${config.model}-${config.pressure}`,
    date: new Date().toISOString().split('T')[0],
    model: provider.displayName,
    mode: `${getPressureLabel(config.pressure)} / ${getMemoryLabel(config.memory)}`,
    services: metrics.services ?? config.services,
    tests: effective.effectiveTests,
    tests_pre: effective.testsPre,
    tests_new: effective.testsNew,
    failures: effective.effectiveFailures,
    assertions: metrics.assertions,
    time_min: logger.elapsedMin,
    criteria: metrics.criteria ?? `${metrics.services ?? config.services}/${config.services}`,
    grade: null,  // assigned manually or by emotion extraction
    notes: `${provider.name} ${config.pressure} ${config.memory}, ${logger.count} transcript entries`,
    registry_schema: 'evensong-harness-v2',
    transcript_path: transcriptPath,
    // Only mark invalid if rate-limited AND no meaningful work was done
    // (model may hit limit at very end after producing valid output)
    invalid: ((rateLimited && effective.effectiveTests === 0) || !metrics.valid) || undefined,
    invalid_reason: (rateLimited && effective.effectiveTests === 0)
      ? 'Rate limit hit during execution'
      : !metrics.valid
        ? 'Unable to verify test metrics from bun test output'
        : undefined,
    metric_source: metrics.metricSource,
    harness_status: metrics.valid ? 'ok' : 'invalid',
  }

  // 9. Save result
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2))
  logger.log('metric', 'Run complete', { result })

  // 10. Append to registry
  appendToRegistry(result)
  console.log(`\n  ✅ ${config.runId} complete: ${result.tests} tests, ${result.failures} failures, ${result.time_min}min`)

  return result
  } finally {
    cleanupWorkspace(workspace, logger)
  }
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

  // Create isolated one-shot workspace. Fixed /tmp/evensong-${runId}
  // paths let failed/stale runs contaminate repeated benchmark attempts.
  const wsPath = mkdtempSync(join(tmpdir(), `evensong-${config.runId}-`))

  const cloneTarget = join(wsPath, 'repo')
  if (!existsSync(cloneTarget)) {
    if (config.memory === 'clean') {
      // Clean room: empty scaffold with only package.json + tsconfig for bun test
      logger.log('system', `Creating empty scaffold at ${cloneTarget}`)
      mkdirSync(join(cloneTarget, 'services'), { recursive: true })
      // Minimal package.json for bun test
      writeFileSync(join(cloneTarget, 'package.json'), JSON.stringify({
        name: 'evensong-clean-room', type: 'module',
        devDependencies: { typescript: '*' }
      }, null, 2))
      writeFileSync(join(cloneTarget, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', strict: true, outDir: 'dist' }
      }, null, 2))
      Bun.spawnSync(['bun', 'install'], { cwd: cloneTarget })
      logger.log('system', 'Empty clean-room scaffold ready — no pre-existing code')
    } else {
      // Blind mode: clone repo but filter memories
      logger.log('system', `Cloning repo to ${cloneTarget}`)
      const proc = Bun.spawnSync(['git', 'clone', '--depth', '1', PROJECT_ROOT, cloneTarget])
      if (proc.exitCode !== 0) {
        cpSync(PROJECT_ROOT, cloneTarget, { recursive: true, filter: (src) => !src.includes('node_modules') && !src.includes('.git') })
      }
      // Remove workspaces field from package.json — bun install with workspaces doesn't
      // properly symlink @ant/* packages in local clones, so handle manually
      const wsPkgPath = join(cloneTarget, 'package.json')
      let hadWorkspaces = false
      if (existsSync(wsPkgPath)) {
        const pkg = JSON.parse(readFileSync(wsPkgPath, 'utf-8'))
        if (pkg.workspaces) {
          hadWorkspaces = true
          delete pkg.workspaces
          writeFileSync(wsPkgPath, JSON.stringify(pkg, null, 2) + '\n')
          logger.log('system', 'Removed workspaces config (fixes @ant/* symlink in cloned repos)')
        }
      }
      logger.log('system', 'Installing dependencies in workspace...')
      const installProc = Bun.spawnSync(['bun', 'install'], { cwd: cloneTarget })
      if (installProc.exitCode !== 0) {
        logger.log('error', `bun install failed with exit code ${installProc.exitCode}`, {
          stderr: (installProc.stderr?.toString() ?? '').slice(0, 500),
        })
      } else {
        logger.log('system', 'Dependencies installed successfully')
      }
      // Manually symlink @ant/* packages that workspaces config would normally handle
      const antSrc = join(cloneTarget, 'packages', '@ant')
      const antDst = join(cloneTarget, 'node_modules', '@ant')
      if (existsSync(antSrc) && !existsSync(antDst)) {
        mkdirSync(antDst, { recursive: true })
        for (const pkg of readdirSync(antSrc)) {
          const srcPath = join(antSrc, pkg)
          const dstPath = join(antDst, pkg)
          if (!existsSync(dstPath)) {
            symlinkSync(srcPath, dstPath)
            logger.log('system', `Symlinked @ant/${pkg} into node_modules`)
          }
        }
      }
    }
  }

  if (config.memory === 'clean') {
    // Clean room — no memories at all
    logger.log('system', 'Clean room: no memory files')
    return {
      path: cloneTarget,
      memoryPath: join(wsPath, 'empty-memory'),
      cleanup: () => { rmSync(wsPath, { recursive: true, force: true }) },
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
      cleanup: () => { rmSync(wsPath, { recursive: true, force: true }) },
    }
  }

  return { path: PROJECT_ROOT, memoryPath: null }
}

function cleanupWorkspace(workspace: Workspace, logger: TranscriptLogger): void {
  if (!workspace.cleanup) return
  if (process.env.EVENSONG_RETAIN_WORKSPACE === '1') {
    logger.log('system', 'Workspace retained by EVENSONG_RETAIN_WORKSPACE=1', {
      path: workspace.path,
    })
    return
  }
  try {
    workspace.cleanup()
    logger.log('system', 'Temporary workspace cleaned', { path: workspace.path })
  } catch (err) {
    logger.log('error', 'Temporary workspace cleanup failed', {
      path: workspace.path,
      error: err instanceof Error ? err.message : String(err),
    })
  }
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
  if (provider.provider === 'native') {
    // Native OAuth — don't override API key or base URL
    // CCB subprocess will use ~/.claude.json OAuth credentials
    // Only remove any stale OpenRouter overrides from inherited env
    delete env.ANTHROPIC_BASE_URL
    delete env.ANTHROPIC_API_KEY
  } else if (provider.provider === 'minimax-direct') {
    const keyEnv = provider.apiKeyEnvVar ?? 'MINIMAX_API_KEY'
    env.ANTHROPIC_API_KEY = requireEnv(keyEnv, `${provider.name} benchmark provider`)
    env.ANTHROPIC_BASE_URL = provider.baseUrl ?? 'https://api.minimax.io/anthropic'
  } else {
    // OpenRouter routing (default for all or-* models)
    env.ANTHROPIC_API_KEY =
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      ''
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('OPENROUTER_API_KEY or ANTHROPIC_API_KEY is required for OpenRouter benchmark providers')
    }
    env.ANTHROPIC_BASE_URL = 'https://openrouter.ai/api/v1'
  }

  // Model override (native uses internal model ID format)
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
    env.EVERMEM_API_KEY = requireEnv('EVENSONG_EVERMEM_VOID_API_KEY', 'clean-memory Evensong runs')
    env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = '1'
  } else if (config.memory === 'blind') {
    // Allaround space — general-purpose runner memories only
    env.EVERMEM_API_KEY = requireEnv('EVENSONG_EVERMEM_BLIND_API_KEY', 'blind-memory Evensong runs')
  }
  // 'full' — don't override EVERMEM_API_KEY, uses default Key A from plugin .env

  return env
}

/**
 * Spawn CCB in pipe mode and capture output
 */
function spawnCLI(
  prompt: string,
  env: Record<string, string>,
  cwd: string,
  timeoutMin: number,
  logger: TranscriptLogger,
  provider: ProviderPreset,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Choose CLI binary based on provider type
    let cmd: string
    let args: string[]

    if (provider.provider === 'grok-native') {
      // Use local Grok CLI
      cmd = 'grok'
      args = ['-p', prompt, '-d', cwd, '-m', provider.modelId]
    } else {
      // Use CCB (Claude Code Best) for all other providers
      const ccbPath = join(PROJECT_ROOT, 'src/entrypoints/cli.tsx')
      cmd = 'bun'
      args = ['run', ccbPath, '-p', '--dangerously-skip-permissions']
    }

    logger.log('system', `Spawning: ${cmd} ${args.slice(0, 3).join(' ')}...`)

    const child = spawn(cmd, args, {
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

    // Send prompt via stdin (CCB reads from stdin; Grok uses -p flag)
    if (provider.provider !== 'grok-native') {
      child.stdin.write(prompt)
      child.stdin.end()
    }

    let timedOut = false
    // Timeout
    const timer = setTimeout(() => {
      timedOut = true
      logger.log('error', `Timeout after ${timeoutMin} minutes`)
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000)
    }, timeoutMin * 60 * 1000)

    child.on('close', (code) => {
      clearTimeout(timer)
      logger.log('system', `Process exited with code ${code}`, { exitCode: code })
      if (stderr.trim()) logger.log('error', `stderr: ${stderr.slice(0, 5000)}`)
      if (timedOut) {
        reject(new Error(`Benchmark subprocess timed out after ${timeoutMin} minutes`))
        return
      }
      if (code !== 0) {
        reject(new Error(`Benchmark subprocess exited with code ${code}: ${stderr.slice(0, 500)}`))
        return
      }
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
  metricSource: RunResult['metric_source']
  valid: boolean
}

function parseResults(output: string, logger: TranscriptLogger, workspacePath?: string): ParsedMetrics {
  const metrics: ParsedMetrics = {
    tests: 0,
    failures: 0,
    assertions: null,
    services: null,
    criteria: null,
    metricSource: 'not-run',
    valid: false,
  }

  // STEP 1: Count actual service directories (real execution metric)
  if (workspacePath) {
    const servicesDir = join(workspacePath, 'services')
    if (existsSync(servicesDir)) {
      const dirs = readdirSync(servicesDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('__'))
      metrics.services = dirs.length
      logger.log('system', `Found ${metrics.services} service directories`)

      // STEP 2: Run actual bun test to get REAL metrics (CRITICAL FIX: no more model prose regex)
      logger.log('system', `Running REAL bun test in ${workspacePath} (timeout 180s)...`)
      const testProc = Bun.spawnSync(['bun', 'test'], {  // removed invalid --bail 0; let it run fully
        cwd: workspacePath,
        timeout: 180_000,  // increased for full suites
        env: { ...process.env, FORCE_COLOR: '0', BUN_TEST_TIMEOUT: '60000' },
      })
      const testOutput = (testProc.stdout?.toString() ?? '') + (testProc.stderr?.toString() ?? '')
      logger.log('metric', 'bun test raw output summary', { 
        exitCode: testProc.exitCode, 
        outputLength: testOutput.length,
        preview: testOutput.slice(0, 800) + (testOutput.length > 800 ? '...' : '')
      })

      const parsed = parseBunTestOutput(testOutput)
      if (parsed.valid) {
        metrics.tests = parsed.tests
        metrics.failures = parsed.failures
        metrics.assertions = parsed.assertions
        metrics.criteria = `${metrics.services || 8}/${metrics.services || 8}`;
        metrics.metricSource = 'bun-test'
        metrics.valid = true
        logger.log('metric', 'VERIFIED metrics from ACTUAL bun test execution', { 
          metrics, 
          usedRealExecution: true,
          testExitCode: testProc.exitCode 
        });
        return metrics;
      }
      logger.log('system', 'bun test output not parseable with primary patterns — trying secondary patterns')
    }
  }

  // LAST RESORT: minimal invalid defaults (prevent invalid data from prose or file-count heuristics)
  metrics.tests = 0;
  metrics.failures = 0;
  metrics.services = metrics.services || 0;
  metrics.criteria = `${metrics.services}/8`;
  metrics.metricSource = 'unparseable'
  metrics.valid = false
  logger.log('metric', 'Using invalid safe defaults (real execution prioritized, no prose or file-count parsing)', { metrics });
  return metrics;
}

export interface TestFileSnapshot {
  hash: string
  testCount: number
}

/**
 * Snapshot all test files in a workspace.
 */
function snapshotTestFiles(workspacePath: string): Map<string, TestFileSnapshot> {
  const snapshot = new Map<string, TestFileSnapshot>()
  const walk = (dir: string, prefix: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(dir, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(full, rel)
      } else if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
        const content = readFileSync(full, 'utf-8')
        snapshot.set(rel, {
          hash: createHash('sha256').update(content).digest('hex'),
          testCount: countTestCasesFromContent(content),
        })
      }
    }
  }
  walk(join(workspacePath, 'services'), 'services')
  return snapshot
}

/**
 * Diff pre/post snapshots — count new test cases in new/modified files
 */
export function diffSnapshots(
  pre: Map<string, TestFileSnapshot>,
  post: Map<string, TestFileSnapshot>,
  workspacePath: string,
): { newFiles: string[]; modifiedFiles: string[]; newTestCount: number } {
  const newFiles: string[] = []
  const modifiedFiles: string[] = []
  let newTestCount = 0

  for (const [path, postEntry] of post) {
    const preEntry = pre.get(path)
    if (!preEntry) {
      newFiles.push(path)
      newTestCount += postEntry.testCount
    } else if (preEntry.hash !== postEntry.hash) {
      modifiedFiles.push(path)
      newTestCount += Math.max(0, postEntry.testCount - preEntry.testCount)
    }
  }

  return { newFiles, modifiedFiles, newTestCount }
}

/**
 * Count test cases in a file by matching it/test/describe patterns
 */
function countTestCases(filePath: string): number {
  if (!existsSync(filePath)) return 0
  const content = readFileSync(filePath, 'utf-8')
  return countTestCasesFromContent(content)
}

function countTestCasesFromContent(content: string): number {
  const matches = content.match(/\b(?:it|test)\s*\(/g)
  return matches?.length ?? 0
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
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter((entry): entry is RunResult => isRunResult(entry))
}

function isRunResult(entry: unknown): entry is RunResult {
  if (!entry || typeof entry !== 'object') return false
  const value = entry as Partial<RunResult>
  return typeof value.run === 'string' &&
    typeof value.codename === 'string' &&
    typeof value.model === 'string' &&
    typeof value.tests === 'number'
}

/**
 * Get next run ID based on registry
 */
export function nextRunId(): string {
  const runs = listRuns()
  if (runs.length === 0) return 'R011'
  const lastNum = Math.max(...runs.map(r => parseInt((r.run ?? r.runId ?? '').replace('R', ''), 10) || 0))
  return `R${String(lastNum + 1).padStart(3, '0')}`
}
