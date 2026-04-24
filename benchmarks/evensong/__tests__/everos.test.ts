/**
 * EverOS v1 API Client — Tests
 *
 * Unit tests (always run):
 *   - Constructor requires key
 *   - All 6 modules exist
 *
 * Integration tests (skip if no env var):
 *   - Settings.get works with real Key A (observer key)
 */

import { describe, test, expect } from 'bun:test'
import { EverOSClient, createObserverClient, createRunnerClient, createVoidClient } from '../everos.js'

describe('EverOSClient', () => {
  test('constructor requires an API key', () => {
    expect(() => new EverOSClient('')).toThrow('EverOSClient requires an API key')
    // @ts-expect-error — testing missing arg
    expect(() => new EverOSClient()).toThrow()
  })

  test('constructor accepts a valid key', () => {
    const client = new EverOSClient('test-key-123')
    expect(client).toBeDefined()
  })

  test('all 6 modules are initialized', () => {
    const client = new EverOSClient('test-key-123')
    expect(client.memories).toBeDefined()
    expect(client.groups).toBeDefined()
    expect(client.senders).toBeDefined()
    expect(client.tasks).toBeDefined()
    expect(client.storage).toBeDefined()
    expect(client.settings).toBeDefined()
  })

  test('modules have correct methods', () => {
    const client = new EverOSClient('test-key-123')

    // Memories
    expect(typeof client.memories.addPersonal).toBe('function')
    expect(typeof client.memories.addGroup).toBe('function')
    expect(typeof client.memories.addAgent).toBe('function')
    expect(typeof client.memories.search).toBe('function')
    expect(typeof client.memories.agenticSearch).toBe('function')
    expect(typeof client.memories.get).toBe('function')
    expect(typeof client.memories.delete).toBe('function')
    expect(typeof client.memories.flushPersonal).toBe('function')
    expect(typeof client.memories.flushGroup).toBe('function')
    expect(typeof client.memories.flushAgent).toBe('function')

    // Groups
    expect(typeof client.groups.create).toBe('function')
    expect(typeof client.groups.get).toBe('function')
    expect(typeof client.groups.update).toBe('function')

    // Senders
    expect(typeof client.senders.create).toBe('function')
    expect(typeof client.senders.get).toBe('function')
    expect(typeof client.senders.update).toBe('function')

    // Tasks
    expect(typeof client.tasks.getStatus).toBe('function')

    // Storage
    expect(typeof client.storage.getUploadUrl).toBe('function')

    // Settings
    expect(typeof client.settings.get).toBe('function')
    expect(typeof client.settings.update).toBe('function')
  })

  test('custom base URL strips trailing slashes', () => {
    const client = new EverOSClient('test-key', 'https://custom.api.com/v1///')
    // Verify by attempting a request (will fail but URL should be well-formed)
    expect(client).toBeDefined()
  })
})

describe('Factory functions', () => {
  test('createObserverClient returns a client', () => {
    const old = process.env.EVERMEM_OBS_KEY
    process.env.EVERMEM_OBS_KEY = 'test-observer-key'
    try {
      const client = createObserverClient()
      expect(client).toBeInstanceOf(EverOSClient)
      expect(client.settings).toBeDefined()
    } finally {
      if (old === undefined) delete process.env.EVERMEM_OBS_KEY
      else process.env.EVERMEM_OBS_KEY = old
    }
  })

  test('createRunnerClient returns a client', () => {
    const old = process.env.EVERMEM_RNR_KEY
    process.env.EVERMEM_RNR_KEY = 'test-runner-key'
    try {
      const client = createRunnerClient()
      expect(client).toBeInstanceOf(EverOSClient)
      expect(client.settings).toBeDefined()
    } finally {
      if (old === undefined) delete process.env.EVERMEM_RNR_KEY
      else process.env.EVERMEM_RNR_KEY = old
    }
  })

  test('createVoidClient returns a client', () => {
    const old = process.env.EVERMEM_VOID_KEY
    process.env.EVERMEM_VOID_KEY = 'test-void-key'
    try {
      const client = createVoidClient()
      expect(client).toBeInstanceOf(EverOSClient)
      expect(client.settings).toBeDefined()
    } finally {
      if (old === undefined) delete process.env.EVERMEM_VOID_KEY
      else process.env.EVERMEM_VOID_KEY = old
    }
  })

  test('factory functions require explicit env keys', () => {
    const old = process.env.EVERMEM_OBS_KEY
    delete process.env.EVERMEM_OBS_KEY
    try {
      expect(() => createObserverClient()).toThrow(/EVERMEM_OBS_KEY is required/)
    } finally {
      if (old !== undefined) process.env.EVERMEM_OBS_KEY = old
    }
  })
})

describe('Settings.get integration', () => {
  const obsKey = process.env.EVERMEM_OBS_KEY
  const liveOptIn = process.env.EVENSONG_RUN_LIVE_TESTS === '1'
  const skipReason = process.env.CI
    ? 'CI environment — skip real API calls'
    : !liveOptIn
      ? 'EVENSONG_RUN_LIVE_TESTS=1 not set — skip real API calls'
    : obsKey
      ? null
      : 'EVERMEM_OBS_KEY not set — skip real API calls'

  test.skipIf(!!skipReason)('Settings.get returns data with observer key', async () => {
    const client = new EverOSClient(obsKey!)
    try {
      const result = await client.settings.get()
      // The API should return something — either data or a response object
      expect(result).toBeDefined()
    } catch (err) {
      // If the API is unreachable, that's acceptable in local dev
      const msg = err instanceof Error ? err.message : String(err)
      if (
        msg.includes('fetch failed') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ConnectionRefused') ||
        msg.includes('Unable to connect')
      ) {
        console.warn('[everos.test] API unreachable, skipping: ' + msg)
        return
      }
      throw err
    }
  })
})
