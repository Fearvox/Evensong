import { describe, expect, test } from 'bun:test'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..', '..', '..')

type ScenarioResult = {
  settings?: Record<string, any>
  sources?: string[]
}

async function runSettingsScenario(script: string): Promise<ScenarioResult> {
  const proc = Bun.spawn(['bun', '-e', script], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  expect(stderr).toBe('')
  expect(exitCode).toBe(0)
  return JSON.parse(stdout) as ScenarioResult
}

const setupScript = String.raw`
const { mkdtemp, mkdir, rm, writeFile } = await import('fs/promises')
const { tmpdir } = await import('os')
const { join } = await import('path')
;(globalThis).feature = (_name) => false
const {
  setAllowedSettingSources,
  setFlagSettingsInline,
  setFlagSettingsPath,
  setOriginalCwd,
} = await import('./src/bootstrap/state.js')
const { resetSettingsCache } = await import('./src/utils/settings/settingsCache.js')

async function writeJson(path, value) {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

const root = await mkdtemp(join(tmpdir(), 'ccr-settings-parity-'))
const configDir = join(root, 'config')
const projectDir = join(root, 'project')
await mkdir(join(projectDir, '.claude'), { recursive: true })
process.env.CLAUDE_CONFIG_DIR = configDir
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

describe('settings source parity', () => {
  test('merges user, project, local, and --settings sources in documented precedence order', async () => {
    const result = await runSettingsScenario(setupScript + String.raw`
const { getInitialSettings } = await import('./src/utils/settings/settings.js')
const flagSettingsPath = join(projectDir, 'flag-settings.json')

await writeJson(join(configDir, 'settings.json'), {
  model: 'user-model',
  env: {
    SHARED: 'user',
    USER_ONLY: '1',
  },
  permissions: {
    allow: ['Bash(user:*)'],
    defaultMode: 'default',
  },
})
await writeJson(join(projectDir, '.claude', 'settings.json'), {
  model: 'project-model',
  env: {
    SHARED: 'project',
    PROJECT_ONLY: '1',
  },
  permissions: {
    allow: ['Bash(project:*)'],
    deny: ['Read(secret)'],
  },
})
await writeJson(join(projectDir, '.claude', 'settings.local.json'), {
  model: 'local-model',
  env: {
    SHARED: 'local',
    LOCAL_ONLY: '1',
  },
  permissions: {
    allow: ['Bash(local:*)'],
    defaultMode: 'plan',
  },
})
await writeJson(flagSettingsPath, {
  model: 'flag-model',
  env: {
    SHARED: 'flag',
    FLAG_ONLY: '1',
  },
  permissions: {
    deny: ['Bash(rm:*)'],
  },
})
setFlagSettingsPath(flagSettingsPath)
resetSettingsCache()
console.log(JSON.stringify({ settings: getInitialSettings() }))
` + teardownScript)

    expect(result.settings?.model).toBe('flag-model')
    expect(result.settings?.env).toEqual({
      SHARED: 'flag',
      USER_ONLY: '1',
      PROJECT_ONLY: '1',
      LOCAL_ONLY: '1',
      FLAG_ONLY: '1',
    })
    expect(result.settings?.permissions?.defaultMode).toBe('plan')
    expect(result.settings?.permissions?.allow).toEqual([
      'Bash(user:*)',
      'Bash(project:*)',
      'Bash(local:*)',
    ])
    expect(result.settings?.permissions?.deny).toEqual([
      'Read(secret)',
      'Bash(rm:*)',
    ])
  }, 15_000)

  test('--setting-sources filters user/project/local while preserving --settings flag input', async () => {
    const result = await runSettingsScenario(setupScript + String.raw`
const { getSettingsWithSources } = await import('./src/utils/settings/settings.js')
const flagSettingsPath = join(projectDir, 'flag-settings.json')

await writeJson(join(configDir, 'settings.json'), {
  model: 'user-model',
  env: {
    USER_ONLY: '1',
    SHARED: 'user',
  },
})
await writeJson(join(projectDir, '.claude', 'settings.json'), {
  model: 'project-should-be-filtered',
  env: {
    PROJECT_ONLY: '1',
    SHARED: 'project',
  },
})
await writeJson(join(projectDir, '.claude', 'settings.local.json'), {
  model: 'local-should-be-filtered',
  env: {
    LOCAL_ONLY: '1',
    SHARED: 'local',
  },
})
await writeJson(flagSettingsPath, {
  env: {
    FLAG_ONLY: '1',
    SHARED: 'flag',
  },
})
setAllowedSettingSources(['userSettings'])
setFlagSettingsPath(flagSettingsPath)
resetSettingsCache()
const withSources = getSettingsWithSources()
console.log(JSON.stringify({
  settings: withSources.effective,
  sources: withSources.sources.map(source => source.source),
}))
` + teardownScript)

    expect(result.sources).toEqual(['userSettings', 'flagSettings'])
    expect(result.settings?.model).toBe('user-model')
    expect(result.settings?.env).toEqual({
      USER_ONLY: '1',
      SHARED: 'flag',
      FLAG_ONLY: '1',
    })
  }, 15_000)
})
