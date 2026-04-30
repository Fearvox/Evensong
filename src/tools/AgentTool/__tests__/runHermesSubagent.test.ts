import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('runHermesSubagent', () => {
  let testDir: string
  let fakeHermesPath: string
  let originalBin: string | undefined

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'hermes-deadlock-'))
    fakeHermesPath = join(testDir, 'fake-hermes')
    const script = [
      '#!/usr/bin/env bash',
      'for i in $(seq 1 4000); do',
      '  echo "stderr_line_${i}_padding_padding_padding_padding_padding_padding" >&2',
      'done',
      'echo "RESULT_SENTINEL"',
    ].join('\n')
    writeFileSync(fakeHermesPath, script)
    chmodSync(fakeHermesPath, 0o755)
    originalBin = process.env.HERMES_BIN
    process.env.HERMES_BIN = fakeHermesPath
  })

  afterAll(() => {
    if (originalBin === undefined) {
      delete process.env.HERMES_BIN
    } else {
      process.env.HERMES_BIN = originalBin
    }

    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch {}
  })

  test(
    'does not deadlock when subprocess writes large stderr (>64KB)',
    async () => {
      const { runHermesSubagent } = await import('../runHermesSubagent.ts')
      const messages: unknown[] = []

      for await (const msg of runHermesSubagent({
        prompt: 'test prompt',
        cwd: testDir,
      })) {
        messages.push(msg)
      }

      expect(messages.length).toBeGreaterThanOrEqual(2)

      const userMsg = messages.find((message: any) => message.type === 'user') as
        | any
        | undefined

      expect(userMsg).toBeDefined()
      expect(userMsg.message.content[0].text).toContain('RESULT_SENTINEL')
    },
    5000,
  )
})
