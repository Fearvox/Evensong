import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

function loadFlagsFromDisk(): Record<string, boolean> {
  try {
    const flagFile = join(
      process.env.HOME || '',
      '.claude',
      'feature-flags.json',
    )
    if (existsSync(flagFile)) {
      const data = JSON.parse(readFileSync(flagFile, 'utf-8'))
      const validated: Record<string, boolean> = {}
      for (const [key, val] of Object.entries(data)) {
        if (typeof val === 'boolean') {
          validated[key] = val
        }
      }
      return validated
    }
  } catch {
    // Silent fail -- fall back to all-false
  }
  return {}
}

let _flagCache: Record<string, boolean> = loadFlagsFromDisk()

export function feature(name: string): boolean {
  if (process.env.CLAUDE_FEATURE_ALL === 'true') return true
  const envVal = process.env[`CLAUDE_FEATURE_${name}`]
  if (envVal !== undefined) return envVal === 'true' || envVal === '1'
  return _flagCache[name] ?? false
}

export function getAllFlags(): Record<string, boolean> {
  const flags = { ..._flagCache }
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('CLAUDE_FEATURE_') || key === 'CLAUDE_FEATURE_ALL') {
      continue
    }
    if (value === 'true' || value === '1') {
      flags[key.slice('CLAUDE_FEATURE_'.length)] = true
    } else if (value === 'false' || value === '0') {
      flags[key.slice('CLAUDE_FEATURE_'.length)] = false
    }
  }
  return flags
}

/**
 * Re-read flags from disk. Exposed for testing only.
 * @internal
 */
export function _reloadFlagsForTesting(): void {
  _flagCache = loadFlagsFromDisk()
}
