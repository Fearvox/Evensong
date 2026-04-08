import { describe, test, expect, afterEach } from 'bun:test'
import {
  is529Error,
  getRetryDelay,
  BASE_DELAY_MS,
  getDefaultMaxRetries,
} from 'src/services/api/withRetry.js'
import { extractConnectionErrorDetails } from 'src/services/api/errorUtils.js'
import { APIError, APIConnectionError } from '@anthropic-ai/sdk'

describe('is529Error', () => {
  test('returns true for APIError with status 529', () => {
    const error = new APIError(529, undefined, 'Overloaded', undefined)
    expect(is529Error(error)).toBe(true)
  })

  test('returns false for APIError with status 500', () => {
    const error = new APIError(500, undefined, 'Server Error', undefined)
    expect(is529Error(error)).toBe(false)
  })

  test('returns false for non-APIError objects', () => {
    expect(is529Error(new Error('random error'))).toBe(false)
    expect(is529Error('string')).toBe(false)
    expect(is529Error(null)).toBe(false)
    expect(is529Error(undefined)).toBe(false)
  })

  test('returns true for APIError with overloaded_error in message', () => {
    const error = new APIError(
      500,
      undefined,
      'Something happened: {"type":"overloaded_error"}',
      undefined,
    )
    expect(is529Error(error)).toBe(true)
  })
})

describe('getRetryDelay', () => {
  test('attempt 1 returns BASE_DELAY_MS (no jitter lower bound)', () => {
    const delay = getRetryDelay(1)
    // BASE_DELAY_MS * 2^0 = 500, plus up to 25% jitter = 500..625
    expect(delay).toBeGreaterThanOrEqual(BASE_DELAY_MS)
    expect(delay).toBeLessThanOrEqual(BASE_DELAY_MS * 1.25)
  })

  test('attempt 2 returns BASE_DELAY_MS * 2 range (exponential backoff)', () => {
    const delay = getRetryDelay(2)
    // BASE_DELAY_MS * 2^1 = 1000, plus up to 25% jitter = 1000..1250
    expect(delay).toBeGreaterThanOrEqual(BASE_DELAY_MS * 2)
    expect(delay).toBeLessThanOrEqual(BASE_DELAY_MS * 2 * 1.25)
  })

  test('attempt 3 returns BASE_DELAY_MS * 4 range', () => {
    const delay = getRetryDelay(3)
    // BASE_DELAY_MS * 2^2 = 2000, plus up to 25% jitter = 2000..2500
    expect(delay).toBeGreaterThanOrEqual(BASE_DELAY_MS * 4)
    expect(delay).toBeLessThanOrEqual(BASE_DELAY_MS * 4 * 1.25)
  })

  test('respects retry-after header as seconds string', () => {
    const delay = getRetryDelay(1, '5')
    expect(delay).toBe(5000)
  })

  test('retry-after header takes precedence over exponential backoff', () => {
    const delay = getRetryDelay(5, '2')
    expect(delay).toBe(2000)
  })

  test('caps delay at maxDelayMs (default 32000)', () => {
    // attempt 100 would be huge without cap
    const delay = getRetryDelay(100)
    expect(delay).toBeLessThanOrEqual(32000 * 1.25)
  })

  test('non-numeric retry-after falls back to exponential backoff', () => {
    const delay = getRetryDelay(1, 'not-a-number')
    // Should fall back to exponential: BASE_DELAY_MS * 2^0 + jitter
    expect(delay).toBeGreaterThanOrEqual(BASE_DELAY_MS)
    expect(delay).toBeLessThanOrEqual(BASE_DELAY_MS * 1.25)
  })
})

describe('getDefaultMaxRetries', () => {
  const savedEnv = { ...process.env }

  afterEach(() => {
    // Restore env
    if (savedEnv.CLAUDE_CODE_MAX_RETRIES !== undefined) {
      process.env.CLAUDE_CODE_MAX_RETRIES = savedEnv.CLAUDE_CODE_MAX_RETRIES
    } else {
      delete process.env.CLAUDE_CODE_MAX_RETRIES
    }
  })

  test('returns 10 (DEFAULT_MAX_RETRIES) when no env override', () => {
    delete process.env.CLAUDE_CODE_MAX_RETRIES
    expect(getDefaultMaxRetries()).toBe(10)
  })

  test('returns env override when CLAUDE_CODE_MAX_RETRIES is set', () => {
    process.env.CLAUDE_CODE_MAX_RETRIES = '5'
    expect(getDefaultMaxRetries()).toBe(5)
  })
})

describe('extractConnectionErrorDetails', () => {
  test('extracts code from ECONNRESET error', () => {
    const cause = new Error('read ECONNRESET')
    ;(cause as Error & { code: string }).code = 'ECONNRESET'
    const wrapper = new Error('Connection error.')
    wrapper.cause = cause

    const details = extractConnectionErrorDetails(wrapper)
    expect(details).not.toBeNull()
    expect(details!.code).toBe('ECONNRESET')
    expect(details!.isSSLError).toBe(false)
  })

  test('extracts code from EPIPE error', () => {
    const cause = new Error('write EPIPE')
    ;(cause as Error & { code: string }).code = 'EPIPE'
    const wrapper = new Error('Connection error.')
    wrapper.cause = cause

    const details = extractConnectionErrorDetails(wrapper)
    expect(details).not.toBeNull()
    expect(details!.code).toBe('EPIPE')
    expect(details!.isSSLError).toBe(false)
  })

  test('extracts code from direct error with code property', () => {
    const error = new Error('ETIMEDOUT')
    ;(error as Error & { code: string }).code = 'ETIMEDOUT'

    const details = extractConnectionErrorDetails(error)
    expect(details).not.toBeNull()
    expect(details!.code).toBe('ETIMEDOUT')
  })

  test('returns null for non-Error objects', () => {
    expect(extractConnectionErrorDetails('string')).toBeNull()
    expect(extractConnectionErrorDetails(42)).toBeNull()
    expect(extractConnectionErrorDetails(null)).toBeNull()
    expect(extractConnectionErrorDetails(undefined)).toBeNull()
  })

  test('returns null for Error without code property', () => {
    const error = new Error('generic error')
    expect(extractConnectionErrorDetails(error)).toBeNull()
  })

  test('identifies SSL errors correctly', () => {
    const error = new Error('SSL error')
    ;(error as Error & { code: string }).code = 'CERT_HAS_EXPIRED'

    const details = extractConnectionErrorDetails(error)
    expect(details).not.toBeNull()
    expect(details!.code).toBe('CERT_HAS_EXPIRED')
    expect(details!.isSSLError).toBe(true)
  })
})
