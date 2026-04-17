import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const CLAUDE = readFileSync(join(root, 'src', 'services', 'api', 'claude.ts'), 'utf8')
const MESSAGES = readFileSync(join(root, 'src', 'utils', 'messages.ts'), 'utf8')
const REPL = readFileSync(join(root, 'src', 'screens', 'REPL.tsx'), 'utf8')

describe('REPL stream parser invariants (regression guards)', () => {
  test('claude.ts SSE loop keeps the for-await chunk iterator', () => {
    // The decompiled SSE loop at L2126 must remain — it's how the SDK
    // stream is consumed and every Phase 11 fix chained off of it.
    expect(CLAUDE).toMatch(/for await \(const part of stream\)/)
  })

  test('claude.ts yields stream_event for every validated chunk', () => {
    // Downstream consumers (QueryEngine, REPL) depend on this exact shape.
    expect(CLAUDE).toMatch(/yield\s*\{\s*[^}]*type:\s*['"]stream_event['"]/)
  })

  test('claude.ts preserves the stream-end fallback errors', () => {
    // These error paths are what let -p mode recover rather than hang.
    expect(CLAUDE).toContain(
      'Stream completed without receiving message_start event - triggering non-streaming fallback',
    )
    expect(CLAUDE).toContain('Stream ended without receiving any events')
  })

  test('messages.ts injects a retry placeholder on all-empty assistant content', () => {
    // Phase 11 Task 2 α: MiniMax signature-only thinking block → visible retry.
    expect(MESSAGES).toContain('empty assistant content detected')
    expect(MESSAGES).toContain('模型返回空响应')
  })

  test('messages.ts guards hasUsefulContent across text / thinking / tool_use blocks', () => {
    // The three block kinds the detector must cover.
    expect(MESSAGES).toMatch(/b\.type === ['"]text['"]/)
    expect(MESSAGES).toMatch(/b\.type === ['"]thinking['"] \|\| b\.type === ['"]redacted_thinking['"]/)
    expect(MESSAGES).toMatch(/b\.type === ['"]tool_use['"]/)
  })

  test('REPL.tsx visibleStreamingText falls back to full buffer when no newline', () => {
    // Phase 11 Task 2 γ: single-line replies were hidden by `|| null`.
    // The fix replaces the fallback with the raw streamingText buffer.
    expect(REPL).toMatch(
      /streamingText\.substring\(0, streamingText\.lastIndexOf\('\\n'\) \+ 1\) \|\| streamingText/,
    )
    expect(REPL).not.toMatch(
      /streamingText\.substring\(0, streamingText\.lastIndexOf\('\\n'\) \+ 1\) \|\| null/,
    )
  })
})
