/**
 * Evensong ANOVA — Two-way ANOVA for the 2x2 Memory × Pressure factorial design
 *
 * Computes SS, df, MS, F, p-value, and eta² for both main effects and the interaction.
 * Supports unbalanced designs (unequal n per cell).
 *
 * Math refs:
 *   - Lanczos approximation for log-gamma (Spouge variant, g=7)
 *   - Lentz continued fraction for regularized incomplete beta (F-CDF)
 */

// ─── Public Types ───────────────────────────────────────────────────────────

export interface AnovaCellData {
  a: number        // factor A level index (0-based)
  b: number        // factor B level index (0-based)
  values: number[] // observations in this cell
}

export interface AnovaInput {
  cells: AnovaCellData[]
  factorAName: string
  factorBName: string
  factorALevels: string[]
  factorBLevels: string[]
}

export interface AnovaFactor {
  name: string
  ss: number
  df: number
  ms: number
  f: number
  p: number
  eta2: number
  significant: boolean  // p < 0.05
}

export interface AnovaResult {
  factorA: AnovaFactor
  factorB: AnovaFactor
  interaction: AnovaFactor
  error: { ss: number; df: number; ms: number }
  total: { ss: number; df: number }
  grandMean: number
  n: number
  cellMeans: Record<string, { mean: number; n: number; std: number }>
}

// ─── Math Helpers ────────────────────────────────────────────────────────────

/**
 * Log-gamma via Lanczos approximation (g=7, 9 coefficients).
 * Valid for x > 0.
 */
function logGamma(x: number): number {
  const g = 7
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]

  if (x < 0.5) {
    // Reflection formula: Γ(x) = π / (sin(πx) · Γ(1-x))
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  }

  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i)
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

/**
 * Regularized incomplete beta function I_x(a, b) via continued fraction (Lentz method).
 * Used to compute the F-distribution CDF.
 */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) throw new RangeError(`x=${x} out of [0,1]`)
  if (x === 0) return 0
  if (x === 1) return 1

  // Use symmetry relation when x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a)
  }

  // Lentz continued fraction
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b)
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a

  // Evaluate cf via modified Lentz
  const TINY = 1e-30
  let f = TINY
  let C = f
  let D = 0

  const maxIter = 200
  for (let m = 0; m <= maxIter; m++) {
    for (let j = 0; j <= 1; j++) {
      let d: number
      if (m === 0 && j === 0) {
        d = 1
      } else if (j === 0) {
        // even step
        d = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
      } else {
        // odd step
        d = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))
      }

      D = 1 + d * D
      if (Math.abs(D) < TINY) D = TINY
      D = 1 / D

      C = 1 + d / C
      if (Math.abs(C) < TINY) C = TINY

      f *= C * D
      if (Math.abs(C * D - 1) < 1e-12) break
    }
  }

  return front * (f - TINY)
}

/**
 * F-distribution CDF: P(X ≤ f) where X ~ F(d1, d2).
 * p-value = 1 - fCdf(F, df_effect, df_error)
 */
function fCdf(f: number, d1: number, d2: number): number {
  if (f <= 0) return 0
  const x = (d1 * f) / (d1 * f + d2)
  return regularizedIncompleteBeta(x, d1 / 2, d2 / 2)
}

// ─── Core ANOVA ─────────────────────────────────────────────────────────────

export function twoWayAnova(input: AnovaInput): AnovaResult {
  const { cells, factorAName, factorBName, factorALevels, factorBLevels } = input

  const nA = factorALevels.length
  const nB = factorBLevels.length

  // ── Cell statistics ──────────────────────────────────────────────────────

  const cellMeans: Record<string, { mean: number; n: number; std: number }> = {}

  // cellData[a][b] = { mean, n, ss_within }
  const cellData: Array<Array<{ mean: number; n: number; ssWithin: number }>> = Array.from(
    { length: nA },
    () => Array.from({ length: nB }, () => ({ mean: 0, n: 0, ssWithin: 0 })),
  )

  for (const cell of cells) {
    const { a, b, values } = cell
    if (values.length === 0) continue
    const n = values.length
    const mean = values.reduce((s, v) => s + v, 0) / n
    const ssWithin = values.reduce((s, v) => s + (v - mean) ** 2, 0)
    cellData[a][b] = { mean, n, ssWithin }

    const key = `${factorALevels[a]}×${factorBLevels[b]}`
    const std = n > 1 ? Math.sqrt(ssWithin / (n - 1)) : 0
    cellMeans[key] = { mean, n, std }
  }

  // ── Grand mean (weighted by n) ───────────────────────────────────────────

  let totalN = 0
  let grandSum = 0
  for (let a = 0; a < nA; a++) {
    for (let b = 0; b < nB; b++) {
      const { mean, n } = cellData[a][b]
      grandSum += mean * n
      totalN += n
    }
  }
  const grandMean = totalN > 0 ? grandSum / totalN : 0

  // ── Marginal means ───────────────────────────────────────────────────────

  // rowMean[a] = weighted mean for factor A level a (collapsing B)
  const rowMean: number[] = Array(nA).fill(0)
  const rowN: number[] = Array(nA).fill(0)
  for (let a = 0; a < nA; a++) {
    let s = 0
    let n = 0
    for (let b = 0; b < nB; b++) {
      s += cellData[a][b].mean * cellData[a][b].n
      n += cellData[a][b].n
    }
    rowMean[a] = n > 0 ? s / n : grandMean
    rowN[a] = n
  }

  // colMean[b] = weighted mean for factor B level b (collapsing A)
  const colMean: number[] = Array(nB).fill(0)
  const colN: number[] = Array(nB).fill(0)
  for (let b = 0; b < nB; b++) {
    let s = 0
    let n = 0
    for (let a = 0; a < nA; a++) {
      s += cellData[a][b].mean * cellData[a][b].n
      n += cellData[a][b].n
    }
    colMean[b] = n > 0 ? s / n : grandMean
    colN[b] = n
  }

  // ── SS calculations ──────────────────────────────────────────────────────

  // SS_A: deviation of A-level marginal means from grand mean, weighted by n_a
  let ssA = 0
  for (let a = 0; a < nA; a++) {
    ssA += rowN[a] * (rowMean[a] - grandMean) ** 2
  }

  // SS_B: deviation of B-level marginal means from grand mean, weighted by n_b
  let ssB = 0
  for (let b = 0; b < nB; b++) {
    ssB += colN[b] * (colMean[b] - grandMean) ** 2
  }

  // SS_AB (interaction): cell mean - (row effect + col effect - grand mean), weighted by n_cell
  let ssAB = 0
  for (let a = 0; a < nA; a++) {
    for (let b = 0; b < nB; b++) {
      const { mean, n } = cellData[a][b]
      if (n === 0) continue
      const expected = rowMean[a] + colMean[b] - grandMean
      ssAB += n * (mean - expected) ** 2
    }
  }

  // SS_Error: within-cell variation
  let ssError = 0
  for (let a = 0; a < nA; a++) {
    for (let b = 0; b < nB; b++) {
      ssError += cellData[a][b].ssWithin
    }
  }

  // SS_Total: total deviation from grand mean
  const ssTotal = ssA + ssB + ssAB + ssError

  // ── Degrees of freedom ───────────────────────────────────────────────────

  const dfA = nA - 1
  const dfB = nB - 1
  const dfAB = dfA * dfB
  // dfError = N - a*b (cells with data)
  const cellsWithData = cellData.flat().filter(c => c.n > 0).length
  const dfError = totalN - cellsWithData
  const dfTotal = totalN - 1

  // ── MS, F, p ─────────────────────────────────────────────────────────────

  const msA = dfA > 0 ? ssA / dfA : 0
  const msB = dfB > 0 ? ssB / dfB : 0
  const msAB = dfAB > 0 ? ssAB / dfAB : 0
  const msError = dfError > 0 ? ssError / dfError : 1

  const fA = msError > 0 ? msA / msError : 0
  const fB = msError > 0 ? msB / msError : 0
  const fAB = msError > 0 ? msAB / msError : 0

  const pA = dfA > 0 && dfError > 0 ? 1 - fCdf(fA, dfA, dfError) : 1
  const pB = dfB > 0 && dfError > 0 ? 1 - fCdf(fB, dfB, dfError) : 1
  const pAB = dfAB > 0 && dfError > 0 ? 1 - fCdf(fAB, dfAB, dfError) : 1

  const eta2A = ssTotal > 0 ? ssA / ssTotal : 0
  const eta2B = ssTotal > 0 ? ssB / ssTotal : 0
  const eta2AB = ssTotal > 0 ? ssAB / ssTotal : 0

  return {
    factorA: {
      name: factorAName,
      ss: ssA,
      df: dfA,
      ms: msA,
      f: fA,
      p: pA,
      eta2: eta2A,
      significant: pA < 0.05,
    },
    factorB: {
      name: factorBName,
      ss: ssB,
      df: dfB,
      ms: msB,
      f: fB,
      p: pB,
      eta2: eta2B,
      significant: pB < 0.05,
    },
    interaction: {
      name: `${factorAName} × ${factorBName}`,
      ss: ssAB,
      df: dfAB,
      ms: msAB,
      f: fAB,
      p: pAB,
      eta2: eta2AB,
      significant: pAB < 0.05,
    },
    error: { ss: ssError, df: dfError, ms: msError },
    total: { ss: ssTotal, df: dfTotal },
    grandMean,
    n: totalN,
    cellMeans,
  }
}

// ─── Console Printer ─────────────────────────────────────────────────────────

export function printAnova(result: AnovaResult): void {
  const { factorA, factorB, interaction, error, total } = result

  const sig = (p: number) => (p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns')
  const fmt = (n: number, d = 4) => n.toFixed(d)

  console.log(`\n  TWO-WAY ANOVA — ${factorA.name} × ${factorB.name}`)
  console.log(`  Grand mean: ${fmt(result.grandMean, 3)}   N = ${result.n}`)
  console.log()
  console.log(`  ${'Source'.padEnd(24)} ${'SS'.padStart(12)} ${'df'.padStart(5)} ${'MS'.padStart(12)} ${'F'.padStart(8)} ${'p'.padStart(8)} ${'η²'.padStart(6)} Sig`)
  console.log(`  ${'─'.repeat(85)}`)

  const row = (f: AnovaFactor) =>
    `  ${f.name.padEnd(24)} ${fmt(f.ss).padStart(12)} ${String(f.df).padStart(5)} ${fmt(f.ms).padStart(12)} ${fmt(f.f, 3).padStart(8)} ${fmt(f.p, 4).padStart(8)} ${fmt(f.eta2, 3).padStart(6)} ${sig(f.p)}`

  console.log(row(factorA))
  console.log(row(factorB))
  console.log(row(interaction))
  console.log(`  ${'Error'.padEnd(24)} ${fmt(error.ss).padStart(12)} ${String(error.df).padStart(5)} ${fmt(error.ms).padStart(12)}`)
  console.log(`  ${'─'.repeat(85)}`)
  console.log(`  ${'Total'.padEnd(24)} ${fmt(total.ss).padStart(12)} ${String(total.df).padStart(5)}`)

  console.log()
  console.log(`  Cell means:`)
  for (const [key, { mean, n, std }] of Object.entries(result.cellMeans)) {
    console.log(`    ${key.padEnd(30)} mean=${fmt(mean, 3)}  n=${n}  sd=${fmt(std, 3)}`)
  }
  console.log()
  console.log(`  Significance: *** p<.001  ** p<.01  * p<.05  ns p≥.05`)
  console.log()
}
