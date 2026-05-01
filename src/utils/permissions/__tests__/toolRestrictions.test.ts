import { describe, expect, test } from 'bun:test'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..', '..', '..', '..')

type ToolRestrictionResult = {
  toolNames?: string[]
  allowRules?: string[]
  denyRules?: string[]
}

async function runToolRestrictionScenario(script: string): Promise<ToolRestrictionResult> {
  const proc = Bun.spawn(['bun', '-e', script], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      USER_TYPE: 'external',
    },
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  expect(stderr).toBe('')
  expect(exitCode).toBe(0)
  return JSON.parse(stdout) as ToolRestrictionResult
}

const setupScript = String.raw`
const { mkdtemp, mkdir, rm } = await import('fs/promises')
const { tmpdir } = await import('os')
const { join } = await import('path')
;(globalThis).feature = (_name) => false
;(globalThis).MACRO = {
  VERSION: '0.0.0-test',
  BUILD_TIME: new Date().toISOString(),
  FEEDBACK_CHANNEL: '',
  ISSUES_EXPLAINER: '',
  NATIVE_PACKAGE_URL: '',
  PACKAGE_URL: '',
  VERSION_CHANGELOG: '',
}
;(globalThis).BUILD_TARGET = 'external'
;(globalThis).BUILD_ENV = 'production'
;(globalThis).INTERFACE_TYPE = 'stdio'
const { setOriginalCwd, setFlagSettingsInline, setFlagSettingsPath, setAllowedSettingSources } = await import('./src/bootstrap/state.js')
const { resetSettingsCache } = await import('./src/utils/settings/settingsCache.js')
const root = await mkdtemp(join(tmpdir(), 'ccr-tool-restrictions-'))
const configDir = join(root, 'config')
const projectDir = join(root, 'project')
await mkdir(projectDir, { recursive: true })
process.env.CLAUDE_CONFIG_DIR = configDir
process.env.HOME = root
process.env.XDG_CONFIG_HOME = join(root, '.config')
process.env.XDG_CACHE_HOME = join(root, '.cache')
setOriginalCwd(projectDir)
setAllowedSettingSources(['userSettings', 'projectSettings', 'localSettings'])
setFlagSettingsInline(null)
setFlagSettingsPath(undefined)
resetSettingsCache()
try {
`

const teardownScript = String.raw`
} finally {
  await rm(root, { recursive: true, force: true })
}
`

describe('tool restriction parity', () => {
  test('--tools exposes only requested base tools to the model tool list', async () => {
    const result = await runToolRestrictionScenario(setupScript + String.raw`
const { initializeToolPermissionContext } = await import('./src/utils/permissions/permissionSetup.js')
const { getTools } = await import('./src/tools.js')
const { toolPermissionContext } = await initializeToolPermissionContext({
  allowedToolsCli: [],
  disallowedToolsCli: [],
  baseToolsCli: ['Read,Edit'],
  permissionMode: 'default',
  allowDangerouslySkipPermissions: false,
  addDirs: [],
})
console.log(JSON.stringify({ toolNames: getTools(toolPermissionContext).map(tool => tool.name).sort() }))
` + teardownScript)

    expect(result.toolNames).toEqual(['Edit', 'Read'])
  }, 15_000)

  test('--tools default preset keeps the default tool set available', async () => {
    const result = await runToolRestrictionScenario(setupScript + String.raw`
const { initializeToolPermissionContext } = await import('./src/utils/permissions/permissionSetup.js')
const { getTools } = await import('./src/tools.js')
const { toolPermissionContext } = await initializeToolPermissionContext({
  allowedToolsCli: [],
  disallowedToolsCli: [],
  baseToolsCli: ['default'],
  permissionMode: 'default',
  allowDangerouslySkipPermissions: false,
  addDirs: [],
})
console.log(JSON.stringify({ toolNames: getTools(toolPermissionContext).map(tool => tool.name).sort() }))
` + teardownScript)

    expect(result.toolNames).toContain('Read')
    expect(result.toolNames).toContain('Edit')
    expect(result.toolNames).toContain('Bash')
    expect(result.toolNames).toContain('Grep')
    expect(result.toolNames?.length).toBeGreaterThan(5)
  }, 15_000)

  test('--allowed-tools and --disallowed-tools parse comma/space lists and preserve Bash rule contents', async () => {
    const result = await runToolRestrictionScenario(setupScript + String.raw`
const { initializeToolPermissionContext } = await import('./src/utils/permissions/permissionSetup.js')
const { toolPermissionContext } = await initializeToolPermissionContext({
  allowedToolsCli: ['Read, Bash(git:*)', 'Edit'],
  disallowedToolsCli: ['WebFetch WebSearch', 'Bash(rm:*)'],
  baseToolsCli: [],
  permissionMode: 'default',
  allowDangerouslySkipPermissions: false,
  addDirs: [],
})
console.log(JSON.stringify({
  allowRules: toolPermissionContext.alwaysAllowRules.cliArg,
  denyRules: toolPermissionContext.alwaysDenyRules.cliArg,
}))
` + teardownScript)

    expect(result.allowRules).toEqual(['Read', 'Bash(git:*)', 'Edit'])
    expect(result.denyRules).toEqual(['WebFetch', 'WebSearch', 'Bash(rm:*)'])
  }, 15_000)
})
