// Proactive mode state management — minimal implementation for KAIROS
let _active = false
let _paused = false
let _source: string | undefined

export function isProactiveActive(): boolean {
  return _active && !_paused
}

export function activateProactive(source?: string): void {
  _active = true
  _paused = false
  _source = source
}

export function isProactivePaused(): boolean {
  return _paused
}

export function deactivateProactive(): void {
  _active = false
  _paused = false
  _source = undefined
}

export function pauseProactive(): void {
  _paused = true
}

export function resumeProactive(): void {
  _paused = false
}

export function getProactiveSource(): string | undefined {
  return _source
}
