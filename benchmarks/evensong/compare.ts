#!/usr/bin/env bun
/**
 * evensong compare — diff two benchmark runs
 * Usage: bun benchmarks/evensong/compare.ts R006 R007
 */

import { readFileSync } from 'fs'
import { join } from 'path'

interface Run {
  run: string
  codename: string
  date: string
  model: string
  mode: string
  services: number
  tests: number
  failures: number
  assertions: number | null
  time_min: number | null
  criteria: string
  docs: { adr: number | null; runbooks: number | null; soc2: number | null }
  grade: string | null
  notes: string
}

const registryPath = join(import.meta.dir, 'registry.jsonl')
const lines = readFileSync(registryPath, 'utf-8').trim().split('\n')
const runs: Run[] = lines.map(l => JSON.parse(l))

const [a, b] = process.argv.slice(2)
if (!a || !b) {
  console.log('Usage: bun compare.ts R006 R007')
  process.exit(1)
}

const runA = runs.find(r => r.run === a)
const runB = runs.find(r => r.run === b)
if (!runA || !runB) {
  console.log(`Run not found: ${!runA ? a : b}`)
  process.exit(1)
}

const delta = (va: number | null, vb: number | null): string => {
  if (va == null || vb == null) return 'N/A'
  const diff = vb - va
  const pct = va === 0 ? '∞' : `${((diff / va) * 100).toFixed(1)}%`
  return `${diff > 0 ? '+' : ''}${diff} (${pct})`
}

console.log(`\n  EVENSONG COMPARE: ${a} vs ${b}`)
console.log(`  ${'═'.repeat(50)}`)
console.log(`  ${''.padEnd(20)} ${a.padEnd(12)} ${b.padEnd(12)} Delta`)
console.log(`  ${'─'.repeat(50)}`)
console.log(`  ${'Model'.padEnd(20)} ${runA.model.padEnd(12)} ${runB.model.padEnd(12)}`)
console.log(`  ${'Mode'.padEnd(20)} ${runA.mode.padEnd(12)} ${runB.mode.padEnd(12)}`)
console.log(`  ${'Services'.padEnd(20)} ${String(runA.services).padEnd(12)} ${String(runB.services).padEnd(12)} ${delta(runA.services, runB.services)}`)
console.log(`  ${'Tests'.padEnd(20)} ${String(runA.tests).padEnd(12)} ${String(runB.tests).padEnd(12)} ${delta(runA.tests, runB.tests)}`)
console.log(`  ${'Failures'.padEnd(20)} ${String(runA.failures).padEnd(12)} ${String(runB.failures).padEnd(12)}`)
console.log(`  ${'Assertions'.padEnd(20)} ${String(runA.assertions ?? 'N/A').padEnd(12)} ${String(runB.assertions ?? 'N/A').padEnd(12)} ${delta(runA.assertions, runB.assertions)}`)
console.log(`  ${'Time (min)'.padEnd(20)} ${String(runA.time_min ?? 'N/A').padEnd(12)} ${String(runB.time_min ?? 'N/A').padEnd(12)} ${delta(runA.time_min, runB.time_min)}`)
console.log(`  ${'Criteria'.padEnd(20)} ${runA.criteria.padEnd(12)} ${runB.criteria.padEnd(12)}`)
console.log(`  ${'Grade'.padEnd(20)} ${(runA.grade ?? '-').padEnd(12)} ${(runB.grade ?? '-').padEnd(12)}`)
console.log(`  ${'─'.repeat(50)}`)
console.log(`  ${a}: ${runA.notes}`)
console.log(`  ${b}: ${runB.notes}`)
console.log()
