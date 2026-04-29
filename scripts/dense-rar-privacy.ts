import path from 'node:path'

export interface PublishableRedaction {
  kind: 'secret' | 'private-ip' | 'private-path'
  count: number
  pattern: string
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /api[_-]?key\s*[:=]\s*["']?[^"'\s,}]+/gi, replacement: '[REDACTED-SECRET]' },
  { pattern: /bearer\s+[a-z0-9._~+/=-]+/gi, replacement: '[REDACTED-SECRET]' },
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED-SECRET]' },
  { pattern: /token\s*[:=]\s*["']?[^"'\s,}]+/gi, replacement: '[REDACTED-SECRET]' },
  { pattern: /secret\s*[:=]\s*["']?[^"'\s,}]+/gi, replacement: '[REDACTED-SECRET]' },
]

const PRIVATE_IP_PATTERN =
  /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})\b/g

const PRIVATE_PATH_PATTERN =
  /(?:\/root|\/tmp|\/home\/[^/\s"'`,;)]+|\/Users\/[^/\s"'`,;)]+)\/[^\s"'`,;)]+/g

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(new RegExp(pattern.source, pattern.flags))).length
}

function replaceTracked(
  text: string,
  kind: PublishableRedaction['kind'],
  pattern: RegExp,
  replacement: string,
  redactions: PublishableRedaction[],
): string {
  const count = countMatches(text, pattern)
  if (count === 0) return text
  redactions.push({ kind, count, pattern: pattern.source })
  return text.replace(new RegExp(pattern.source, pattern.flags), replacement)
}

function redactKnownRepoPrefixes(text: string): string {
  let result = text
  const cwd = process.cwd()
  if (cwd) {
    result = result.replaceAll(`${cwd}/`, '')
  }
  result = result.replace(/\/root\/ccr\//g, '')
  result = result.replace(/\/Users\/[^/\s"'`,;)]+\/claude-code-reimagine-for-learning\//g, '')
  return result
}

export function redactPublishableText(text: string): { text: string; redactions: PublishableRedaction[] } {
  const redactions: PublishableRedaction[] = []
  let result = redactKnownRepoPrefixes(text)
  result = result.replace(/\/root\/research-vault\b/g, '<vault-root>')

  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = replaceTracked(result, 'secret', pattern, replacement, redactions)
  }
  result = replaceTracked(result, 'private-ip', PRIVATE_IP_PATTERN, 'ccr-droplet', redactions)
  result = replaceTracked(result, 'private-path', PRIVATE_PATH_PATTERN, '<local-path>', redactions)

  return { text: result, redactions }
}

export function findPublishableLeaks(text: string): string[] {
  const leaks: string[] = []
  for (const { pattern } of SECRET_PATTERNS) {
    const count = countMatches(text, pattern)
    if (count > 0) leaks.push(`secret pattern ${pattern.source} matched ${count} time(s)`)
  }
  const privateIps = countMatches(text, PRIVATE_IP_PATTERN)
  if (privateIps > 0) leaks.push(`private IP pattern matched ${privateIps} time(s)`)
  const privatePaths = countMatches(redactKnownRepoPrefixes(text), PRIVATE_PATH_PATTERN)
  if (privatePaths > 0) leaks.push(`private path pattern matched ${privatePaths} time(s)`)
  return leaks
}

export function publishablePath(raw: string): string {
  if (raw.startsWith('embedded:')) return raw
  if (/^https?:\/\//i.test(raw)) return redactPublishableText(raw).text
  if (path.isAbsolute(raw)) {
    const relative = path.relative(process.cwd(), raw)
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative
    }
    const benchmarkIndex = raw.indexOf('/benchmarks/')
    if (benchmarkIndex >= 0) return raw.slice(benchmarkIndex + 1)
    const planningIndex = raw.indexOf('/.planning/')
    if (planningIndex >= 0) return raw.slice(planningIndex + 1)
    return '<local-path>'
  }
  return redactPublishableText(raw).text
}

export function publishableVaultRoot(_raw: string): string {
  return '<vault-root>'
}

export function sanitizePublishableObject<T>(value: T): T {
  return JSON.parse(redactPublishableText(JSON.stringify(value)).text) as T
}
