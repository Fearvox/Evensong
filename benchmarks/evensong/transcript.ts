import { appendFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { TranscriptEntry } from './types.js'

export class TranscriptLogger {
  readonly path: string
  private startTime: number
  private entryCount = 0

  constructor(path: string) {
    this.path = path
    this.startTime = Date.now()
    mkdirSync(dirname(path), { recursive: true })
  }

  log(type: TranscriptEntry['type'], content: string, metadata?: Record<string, unknown>): void {
    const entry: TranscriptEntry = {
      ts: Date.now(),
      elapsed_s: Math.round((Date.now() - this.startTime) / 100) / 10,  // 1 decimal
      type,
      content: content.length > 50000 ? content.slice(0, 50000) + '...[truncated]' : content,
      ...(metadata ? { metadata } : {}),
    }
    appendFileSync(this.path, JSON.stringify(entry) + '\n')
    this.entryCount++
  }

  get count(): number { return this.entryCount }
  get elapsedMin(): number { return Math.round((Date.now() - this.startTime) / 60000 * 10) / 10 }
}
