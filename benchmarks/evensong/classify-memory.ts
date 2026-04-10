#!/usr/bin/env bun
/**
 * Memory Classifier — Pre-Benchmark Audit
 *
 * Reads all memory files, auto-classifies ALLOW/BLOCK/GRAY using keyword matching.
 * Outputs a classification table. Pre-flight check before blind benchmark runs.
 *
 * Usage:
 *   bun benchmarks/evensong/classify-memory.ts
 *   bun benchmarks/evensong/classify-memory.ts --fix
 *   bun benchmarks/evensong/classify-memory.ts --dir /custom/memory/path
 */

import { readdir, readFile, mkdir, rename, writeFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

// ─── Classification Rules ────────────────────────────────────────────────────

const BLOCK_KEYWORDS = [
  // Strategy / competitive
  'strategy', 'evolution', 'surpass', 'beat', 'goal', 'target',
  // Emotion / pressure
  'pressure', 'emotion', 'pua', 'emotionprompt',
  // Identity / anonymity
  'evensong', 'ghost name', 'anonymous', 'leaderboard',
  // Observer / meta
  'observer', 'monitoring', 'emergence', 'reward hacking',
  // Methodology specifics
  'a/b', 'parallel strategy', 'two-wave',
  // Calibration
  'sweet spot', 'cliff', 'calibration',
]

const ALLOW_FILES = new Set([
  'user_profile.md',
  'feedback_bun_test_file_size.md',
  'feedback_website_standard.md',
  'project_ccb_status.md',
  'project_build_stubs.md',
  'project_architecture_patterns.md',
  'learnings_git_branch_topology.md',
  'learnings_secret_scanning.md',
  'learnings_isenabled_bug.md',
  'reference_gsd_phase_lookup.md',
  'reference_remote_agent_infra.md',
])

// ─── Frontmatter Parser ─────────────────────────────────────────────────────

interface Frontmatter {
  description?: string
  body: string
}

function parseFrontmatter(content: string): Frontmatter {
  const trimmed = content.trimStart()
  if (!trimmed.startsWith('---')) {
    return { body: content }
  }

  const endIdx = trimmed.indexOf('---', 3)
  if (endIdx === -1) {
    return { body: content }
  }

  const yamlBlock = trimmed.slice(3, endIdx)
  const body = trimmed.slice(endIdx + 3).trimStart()

  // Simple YAML extraction for 'description' field
  let description: string | undefined
  for (const line of yamlBlock.split('\n')) {
    const match = line.match(/^description:\s*(.+)$/i)
    if (match) {
      description = match[1].trim().replace(/^["']|["']$/g, '')
      break
    }
  }

  return { description, body }
}

// ─── Classification ─────────────────────────────────────────────────────────

type Classification = 'ALLOW' | 'BLOCK' | 'GRAY'

interface ClassifiedFile {
  filename: string
  classification: Classification
  matchedKeywords: string[]
}

function classifyFile(filename: string, content: string): ClassifiedFile {
  // Check ALLOW list first
  if (ALLOW_FILES.has(filename)) {
    return { filename, classification: 'ALLOW', matchedKeywords: [] }
  }

  // Parse frontmatter
  const { description, body } = parseFrontmatter(content)

  // Build search text: description + first 200 chars of body
  const searchText = [
    description ?? '',
    body.slice(0, 200),
  ].join(' ').toLowerCase()

  // Check BLOCK keywords (case-insensitive)
  const matched: string[] = []
  for (const keyword of BLOCK_KEYWORDS) {
    if (searchText.includes(keyword.toLowerCase())) {
      matched.push(keyword)
    }
  }

  if (matched.length > 0) {
    return { filename, classification: 'BLOCK', matchedKeywords: matched }
  }

  return { filename, classification: 'GRAY', matchedKeywords: [] }
}

// ─── Exported API ───────────────────────────────────────────────────────────

export async function classifyMemories(memoryDir: string): Promise<{
  allow: string[]
  block: string[]
  gray: string[]
}> {
  const files = await readdir(memoryDir)
  const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md')

  const result = { allow: [] as string[], block: [] as string[], gray: [] as string[] }

  for (const filename of mdFiles) {
    const content = await readFile(join(memoryDir, filename), 'utf-8')
    const { classification } = classifyFile(filename, content)

    if (classification === 'ALLOW') result.allow.push(filename)
    else if (classification === 'BLOCK') result.block.push(filename)
    else result.gray.push(filename)
  }

  return result
}

// ─── Fix Mode ───────────────────────────────────────────────────────────────

async function fixBlockedFiles(memoryDir: string, blockedFiles: ClassifiedFile[]): Promise<void> {
  if (blockedFiles.length === 0) {
    console.log('\n  Nothing to fix — no BLOCK files found.')
    return
  }

  const blockedDir = join(memoryDir, '.blocked')
  if (!existsSync(blockedDir)) {
    await mkdir(blockedDir, { recursive: true })
  }

  console.log(`\n  FIX MODE — Moving ${blockedFiles.length} BLOCK files to .blocked/`)
  console.log(`  ${'─'.repeat(55)}`)

  for (const file of blockedFiles) {
    const src = join(memoryDir, file.filename)
    const dst = join(blockedDir, file.filename)
    await rename(src, dst)
    console.log(`  Moved: ${file.filename} -> .blocked/${file.filename}`)
  }

  // Update MEMORY.md — remove lines referencing blocked files
  const memoryMdPath = join(memoryDir, 'MEMORY.md')
  if (existsSync(memoryMdPath)) {
    const memoryContent = await readFile(memoryMdPath, 'utf-8')
    const blockedNames = new Set(blockedFiles.map(f => f.filename))
    const lines = memoryContent.split('\n')
    const filtered = lines.filter(line => {
      // Match markdown links like [Label](filename.md)
      const linkMatch = line.match(/\]\(([^)]+\.md)\)/)
      if (linkMatch && blockedNames.has(linkMatch[1])) {
        return false
      }
      return true
    })

    // Clean up consecutive blank lines left by removal
    const cleaned: string[] = []
    for (const line of filtered) {
      if (line.trim() === '' && cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') {
        continue
      }
      cleaned.push(line)
    }

    await writeFile(memoryMdPath, cleaned.join('\n'), 'utf-8')
    console.log(`  Updated: MEMORY.md (removed ${blockedFiles.length} entries)`)
  }

  console.log(`  ${'─'.repeat(55)}`)
  console.log(`  Done. Run again without --fix to verify.\n`)
}

// ─── Display ────────────────────────────────────────────────────────────────

function formatTable(classified: ClassifiedFile[]): void {
  // Sort: ALLOW first, then BLOCK, then GRAY
  const order: Record<Classification, number> = { ALLOW: 0, BLOCK: 1, GRAY: 2 }
  classified.sort((a, b) => order[a.classification] - order[b.classification])

  const maxFilenameLen = Math.max(...classified.map(f => f.filename.length), 20)
  const colWidth = maxFilenameLen + 2

  console.log()
  console.log('  MEMORY CLASSIFICATION — Pre-Benchmark Audit')
  console.log(`  ${'═'.repeat(colWidth + 40)}`)
  console.log(`  ${'Status'.padEnd(12)} ${'File'.padEnd(colWidth)} Matched Keywords`)
  console.log(`  ${'─'.repeat(colWidth + 40)}`)

  for (const file of classified) {
    let statusIcon: string
    let keywordDisplay: string

    switch (file.classification) {
      case 'ALLOW':
        statusIcon = '\u2705 ALLOW'
        keywordDisplay = '(hardcoded safe)'
        break
      case 'BLOCK':
        statusIcon = '\uD83D\uDEAB BLOCK'
        keywordDisplay = file.matchedKeywords.join(', ')
        break
      case 'GRAY':
        statusIcon = '\u26A0\uFE0F  GRAY'
        keywordDisplay = '(no keyword match)'
        break
    }

    console.log(`  ${statusIcon.padEnd(12)} ${file.filename.padEnd(colWidth)} ${keywordDisplay}`)
  }

  console.log(`  ${'─'.repeat(colWidth + 40)}`)

  const counts = { ALLOW: 0, BLOCK: 0, GRAY: 0 }
  for (const f of classified) counts[f.classification]++

  console.log(`  Summary: ${counts.ALLOW} ALLOW, ${counts.BLOCK} BLOCK, ${counts.GRAY} GRAY`)
  console.log()
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const doFix = args.includes('--fix')

  // Allow custom memory dir via --dir flag
  let memoryDir: string
  const dirIdx = args.indexOf('--dir')
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    memoryDir = args[dirIdx + 1]
  } else {
    memoryDir = join(
      homedir(),
      '.claude/projects/-Users-0xvox-claude-code-reimagine-for-learning/memory'
    )
  }

  if (!existsSync(memoryDir)) {
    console.error(`  Memory directory not found: ${memoryDir}`)
    process.exit(1)
  }

  // Read and classify all files
  const files = await readdir(memoryDir)
  const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md')

  if (mdFiles.length === 0) {
    console.log('  No memory files found.')
    process.exit(0)
  }

  const classified: ClassifiedFile[] = []
  for (const filename of mdFiles) {
    const content = await readFile(join(memoryDir, filename), 'utf-8')
    classified.push(classifyFile(filename, content))
  }

  // Display table
  formatTable(classified)

  // Fix mode
  if (doFix) {
    const blocked = classified.filter(f => f.classification === 'BLOCK')
    await fixBlockedFiles(memoryDir, blocked)
  }

  // Exit code: 1 if any BLOCK files found (useful for CI)
  const hasBlocked = classified.some(f => f.classification === 'BLOCK')
  process.exit(hasBlocked ? 1 : 0)
}

main().catch(err => {
  console.error('  Fatal:', err.message)
  process.exit(2)
})
