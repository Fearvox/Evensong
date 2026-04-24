#!/usr/bin/env bun
/**
 * upload-evidence.ts — Upload benchmark screenshots/evidence to EverOS multimodal storage
 *
 * Usage:
 *   bun benchmarks/evensong/upload-evidence.ts <file-path> <run-id>
 *   bun benchmarks/evensong/upload-evidence.ts ./screenshots/R011-final.png R011
 *
 * Flags:
 *   --help    Show usage
 *   --format json    Output as JSON
 *
 * Programmatic:
 *   import { uploadEvidence } from './upload-evidence.js'
 *   const result = await uploadEvidence('./screenshot.png', 'R011')
 */

const EVEROS_STORAGE_ENDPOINT = 'https://api.evermind.ai/api/v1/storage/upload'
const OBSERVER_KEY_ENV = 'EVERMEM_OBS_KEY'

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf':  'application/pdf',
}

function detectContentType(filePath: string): string | null {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return CONTENT_TYPE_MAP[ext] ?? null
}

function getObserverKey(): string {
  const key = process.env[OBSERVER_KEY_ENV]?.trim()
  if (!key) {
    throw new Error(`${OBSERVER_KEY_ENV} is required; no bundled EverOS fallback key is available`)
  }
  return key
}

export interface UploadResult {
  downloadUrl: string
  fileName: string
  runId: string
}

/**
 * Upload a file to EverOS multimodal storage and return the download URL.
 *
 * @param filePath - Path to the file (PNG, JPG, PDF)
 * @param runId    - Benchmark run ID (e.g. "R011")
 * @returns        - { downloadUrl, fileName, runId }
 */
export async function uploadEvidence(filePath: string, runId: string): Promise<UploadResult> {
  // Validate file exists
  const file = Bun.file(filePath)
  const exists = await file.exists()
  if (!exists) {
    throw new Error(`File not found: ${filePath}`)
  }

  // Detect content type
  const contentType = detectContentType(filePath)
  if (!contentType) {
    const supportedExts = Object.keys(CONTENT_TYPE_MAP).join(', ')
    throw new Error(`Unsupported file type: ${filePath}. Supported: ${supportedExts}`)
  }

  // Build a descriptive file name: <runId>-<original-basename>
  const baseName = filePath.split('/').pop()!
  const fileName = baseName.startsWith(runId) ? baseName : `${runId}-${baseName}`

  // Step 1: Request a pre-signed upload URL from EverOS
  const presignRes = await fetch(EVEROS_STORAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getObserverKey()}`,
    },
    body: JSON.stringify({
      file_name: fileName,
      content_type: contentType,
    }),
  })

  if (!presignRes.ok) {
    const body = await presignRes.text()
    throw new Error(`EverOS presign request failed (${presignRes.status}): ${body}`)
  }

  const presignData = (await presignRes.json()) as {
    data: { upload_url: string; download_url: string }
  }

  const { upload_url, download_url } = presignData.data
  if (!upload_url || !download_url) {
    throw new Error(`Invalid presign response: missing upload_url or download_url`)
  }

  // Step 2: Upload the file to the pre-signed URL
  const fileBuffer = await file.arrayBuffer()
  const uploadRes = await fetch(upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: fileBuffer,
  })

  if (!uploadRes.ok) {
    const body = await uploadRes.text()
    throw new Error(`File upload failed (${uploadRes.status}): ${body}`)
  }

  return {
    downloadUrl: download_url,
    fileName,
    runId,
  }
}

// --- CLI entrypoint ---
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
  Upload benchmark evidence to EverOS multimodal storage.

  Usage:
    bun upload-evidence.ts <file-path> <run-id>

  Arguments:
    file-path    Path to PNG, JPG, or PDF file
    run-id       Benchmark run ID (e.g. R011)

  Options:
    --format json    Output as JSON
    --help           Show this help

  Examples:
    bun upload-evidence.ts ./screenshots/R011-final.png R011
    bun upload-evidence.ts ./reports/R011-summary.pdf R011 --format json
`)
    return
  }

  // Parse positional args and flags
  const positional: string[] = []
  let jsonOutput = false

  for (const arg of args) {
    if (arg === '--format') continue
    if (arg === 'json' && args[args.indexOf(arg) - 1] === '--format') {
      jsonOutput = true
      continue
    }
    if (!arg.startsWith('--')) {
      positional.push(arg)
    }
  }

  const [filePath, runId] = positional

  if (!filePath || !runId) {
    console.error('  Error: both <file-path> and <run-id> are required.')
    console.error('  Usage: bun upload-evidence.ts <file-path> <run-id>')
    process.exit(1)
  }

  try {
    const result = await uploadEvidence(filePath, runId)

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`\n  EVENSONG EVIDENCE UPLOAD`)
      console.log(`  ${'═'.repeat(50)}`)
      console.log(`  Run:      ${result.runId}`)
      console.log(`  File:     ${result.fileName}`)
      console.log(`  URL:      ${result.downloadUrl}`)
      console.log(`  ${'═'.repeat(50)}\n`)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (jsonOutput) {
      console.error(JSON.stringify({ error: message }))
    } else {
      console.error(`  Error: ${message}`)
    }
    process.exit(1)
  }
}

// Run CLI if executed directly
const isDirectRun = import.meta.main
if (isDirectRun) {
  main()
}
