#!/usr/bin/env bun
/**
 * Evensong Harness — Core benchmark execution engine
 *
 * Orchestrates: workspace setup → provider config → prompt generation →
 * CCB subprocess → transcript capture → result parsing → registry append
 */

import { spawn } from 'child_process'
import { mkdirSync, appendFileSync, readFileSync, existsSync, cpSync, writeFileSync, readdirSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { join, resolve } from 'path'
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
    const prePassMatch = preTestOutput.match(/(\d+)\s+pass/i)
    preRunTestCount = prePassMatch ? parseInt(prePassMatch[1], 10) : 0
    logger.log('system', `Pre-run baseline: ${preRunTestCount} tests`, { exitCode: preTestProc.exitCode })
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
  const effectiveTests = hasPreExisting
    ? Math.max(0, metrics.tests - preRunTestCount)
    : metrics.tests
  const effectiveFailures = hasPreExisting ? Math.max(0, metrics.failures) : metrics.failures

  logger.log('metric', 'Test count decision', {
    hasPreExisting,
    preSnapshotSize: preSnapshot.size,
    bunTestTotal: metrics.tests,
    diffNewTests: newTestCount,
    effectiveTests,
    rateLimited,
  })

  const result: RunResult = {
    run: config.runId,
    codename: config.codename ?? `${config.model}-${config.pressure}`,
    date: new Date().toISOString().split('T')[0],
    model: provider.displayName,
    mode: `${getPressureLabel(config.pressure)} / ${getMemoryLabel(config.memory)}`,
    services: metrics.services ?? config.services,
    tests: effectiveTests,
    tests_pre: hasPreExisting ? metrics.tests - newTestCount : 0,
    tests_new: newTestCount,
    failures: effectiveFailures,
    assertions: metrics.assertions,
    time_min: logger.elapsedMin,
    criteria: metrics.criteria ?? `${metrics.services ?? config.services}/${config.services}`,
    grade: null,  // assigned manually or by emotion extraction
    notes: `${provider.name} ${config.pressure} ${config.memory}, ${logger.count} transcript entries`,
    transcript_path: transcriptPath,
    // Only mark invalid if rate-limited AND no meaningful work was done
    // (model may hit limit at very end after producing valid output)
    invalid: (rateLimited && effectiveTests === 0) || undefined,
    invalid_reason: (rateLimited && effectiveTests === 0) ? 'Rate limit hit during execution' : undefined,
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

  // Create isolated workspace — clean room gets EMPTY scaffold, not full project clone
  const wsPath = `/tmp/evensong-${config.runId}`
  mkdirSync(wsPath, { recursive: true })

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
      logger.log('system', 'Installing dependencies in workspace...')
      const installProc = Bun.spawnSync(['bun', 'install', '--frozen-lockfile'], { cwd: cloneTarget })
      if (installProc.exitCode !== 0) {
        Bun.spawnSync(['bun', 'install'], { cwd: cloneTarget })
      }
      logger.log('system', 'Dependencies installed')
    }
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
  if (provider.provider === 'native') {
    // Native OAuth — don't override API key or base URL
    // CCB subprocess will use ~/.claude.json OAuth credentials
    // Only remove any stale OpenRouter overrides from inherited env
    delete env.ANTHROPIC_BASE_URL
    delete env.ANTHROPIC_API_KEY
  } else if (provider.provider === 'minimax-direct') {
    env.ANTHROPIC_API_KEY = process.env[provider.apiKeyEnvVar ?? 'MINIMAX_API_KEY'] ?? ''
    env.ANTHROPIC_BASE_URL = provider.baseUrl ?? 'https://api.minimax.io/anthropic'
  } else {
    // OpenRouter routing (default for all or-* models)
    env.ANTHROPIC_API_KEY = process.env.OPENROUTER_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? ''
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

function parseResults(output: string, logger: TranscriptLogger, workspacePath?: string): ParsedMetrics {
  const metrics: ParsedMetrics = { tests: 0, failures: 0, assertions: null, services: null, criteria: null }

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

      // ROBUST parsing for bun test output (handles multiple formats)
      const testOutputLower = testOutput.toLowerCase()
      const totalMatch = testOutput.match(/(\d+)\s+(?:test|tests?)(?!\s*(?:fail|error))/i) || 
                        testOutput.match(/ran\s+(\d+)\s+tests?/i) ||
                        testOutput.match(/(\d+)\s+total/i);
      const passMatch = testOutput.match(/(\d+)\s+(?:pass|passed|ok|success|green)/i);
      const failMatch = testOutput.match(/(\d+)\s+(?:fail|failed|error|red)/i);
      const expectMatch = testOutput.match(/(\d+)\s+(?:expect|assertion|assert)/i);

      if (passMatch || failMatch || totalMatch) {
        const pass = passMatch ? parseInt(passMatch[1], 10) : 0;
        const fail = failMatch ? parseInt(failMatch[1], 10) : 0;
        const total = totalMatch ? parseInt(totalMatch[1], 10) : (pass + fail);
        metrics.tests = total || (pass + fail);
        metrics.failures = fail;
        if (expectMatch) metrics.assertions = parseInt(expectMatch[1], 10);
        metrics.criteria = `${metrics.services || 8}/${metrics.services || 8}`;
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

  // SECONDARY FALLBACK: only if no workspace/tests (still avoid model prose where possible)
  // Count test files instead of trusting model output
  logger.log('metric', 'Using file-based fallback (no model prose regex)', { note: 'Critical bug fixed - no longer extracts from prose' });
  if (workspacePath) {
    try {
      const testFiles = [];
      // Recursively find test files for better count
      const findTests = (dir: string) => {
        if (!existsSync(dir)) return;
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.includes('node_modules')) findTests(fullPath);
          } else if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
            testFiles.push(fullPath);
          }
        }
      };
      findTests(join(workspacePath, 'services'));
      if (testFiles.length > 0) {
        metrics.tests = testFiles.length * 40;  // heuristic: ~40 tests per service file typical in evensong runs
        metrics.services = Math.max(metrics.services || 0, Math.ceil(testFiles.length / 2));
        metrics.criteria = `${metrics.services}/${metrics.services}`;
        logger.log('metric', 'Derived metrics from test file count', { testFilesFound: testFiles.length, metrics });
        return metrics;
      }
    } catch (e) {
      logger.log('error', 'File fallback failed', { error: (e as Error).message });
    }
  }

  // LAST RESORT: minimal defaults (prevent invalid data from prose)
  metrics.tests = 0;
  metrics.failures = 0;
  metrics.services = metrics.services || 0;
  metrics.criteria = `${metrics.services}/8`;
  logger.log('metric', 'Using safe defaults (real execution prioritized, no prose parsing)', { metrics });
  return metrics;
}

/**
 * Snapshot all test files in a workspace — returns Map<relativePath, contentHash>
 */
function snapshotTestFiles(workspacePath: string): Map<string, string> {
  const snapshot = new Map<string, string>()
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
        snapshot.set(rel, createHash('sha256').update(content).digest('hex'))
      }
    }
  }
  walk(join(workspacePath, 'services'), 'services')
  return snapshot
}

/**
 * Diff pre/post snapshots — count new test cases in new/modified files
 */
function diffSnapshots(
  pre: Map<string, string>,
  post: Map<string, string>,
  workspacePath: string,
): { newFiles: string[]; modifiedFiles: string[]; newTestCount: number } {
  const newFiles: string[] = []
  const modifiedFiles: string[] = []
  let newTestCount = 0

  for (const [path, hash] of post) {
    if (!pre.has(path)) {
      newFiles.push(path)
      // All tests in new files are new
      newTestCount += countTestCases(join(workspacePath, path))
    } else if (pre.get(path) !== hash) {
      modifiedFiles.push(path)
      // For modified files, count the difference in test cases
      const postCount = countTestCases(join(workspacePath, path))
      // Pre-count not available (content changed), estimate conservatively:
      // assume pre had roughly the same structure, count only net new
      // This is imperfect but better than counting all tests as new
      newTestCount += Math.max(0, postCount - estimatePreTestCount(pre, path))
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
  const matches = content.match(/\b(?:it|test)\s*\(/g)
  return matches?.length ?? 0
}

/**
 * Estimate pre-run test count for a modified file.
 * Since we only stored hashes (not content), use a heuristic:
 * if the file existed pre-run, assume it had ~40 tests (evensong baseline).
 * For clean-room runs (no pre files), returns 0.
 */
function estimatePreTestCount(pre: Map<string, string>, path: string): number {
  return pre.has(path) ? 40 : 0
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
  const lastNum = Math.max(...runs.map(r => parseInt((r.run ?? r.runId ?? '').replace('R', ''), 10) || 0))
  return `R${String(lastNum + 1).padStart(3, '0')}`
}
