import { describe, expect, test } from 'bun:test'
import { handleMessageFromStream } from '../src/utils/messages.js'

function captureAssistant(message: unknown) {
  let received: unknown = null
  handleMessageFromStream(
    message as Parameters<typeof handleMessageFromStream>[0],
    msg => {
      received = msg
    },
    () => {},
    () => {},
    () => {},
    undefined,
    () => {},
    undefined,
    () => {},
  )
  return received as { message?: { content?: unknown[] } } | null
}

describe('handleMessageFromStream empty-response placeholder', () => {
  test('injects retry placeholder when only an empty thinking block arrives', () => {
    const emptyMessage = {
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: '' }] },
    }
    const received = captureAssistant(emptyMessage)
    expect(received).not.toBeNull()
    const content = received!.message!.content as Array<{ type: string; text?: string }>
    expect(content.length).toBe(2)
    expect(content[0].type).toBe('thinking')
    expect(content[1].type).toBe('text')
    expect(content[1].text).toContain('重试')
  })

  test('injects placeholder when only a redacted_thinking block arrives with empty content', () => {
    const emptyMessage = {
      type: 'assistant',
      message: { content: [{ type: 'redacted_thinking', thinking: '' }] },
    }
    const received = captureAssistant(emptyMessage)
    const content = received!.message!.content as Array<{ type: string; text?: string }>
    expect(content.length).toBe(2)
    expect(content[1].type).toBe('text')
  })

  test('does NOT inject placeholder when assistant has real text content', () => {
    const textMessage = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hi there' }] },
    }
    const received = captureAssistant(textMessage)
    const content = received!.message!.content as Array<{ type: string; text?: string }>
    expect(content.length).toBe(1)
    expect(content[0].text).toBe('hi there')
  })

  test('does NOT inject placeholder when thinking block has real content', () => {
    const thinkingMessage = {
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: 'reasoning about the prompt...' }] },
    }
    const received = captureAssistant(thinkingMessage)
    const content = received!.message!.content as Array<{ type: string; thinking?: string }>
    expect(content.length).toBe(1)
    expect(content[0].thinking).toBe('reasoning about the prompt...')
  })

  test('does NOT inject placeholder when tool_use block is present', () => {
    const toolMessage = {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 't1', name: 'Bash', input: { cmd: 'ls' } },
        ],
      },
    }
    const received = captureAssistant(toolMessage)
    const content = received!.message!.content as Array<{ type: string }>
    expect(content.length).toBe(1)
    expect(content[0].type).toBe('tool_use')
  })

  test('leaves empty content array untouched (no blocks at all)', () => {
    // Edge case: content is an empty array. The guard requires contentArr.length > 0
    // so we don't fabricate a response out of thin air when the upstream sent nothing.
    const emptyArr = {
      type: 'assistant',
      message: { content: [] },
    }
    const received = captureAssistant(emptyArr)
    const content = received!.message!.content as unknown[]
    expect(content.length).toBe(0)
  })
})
