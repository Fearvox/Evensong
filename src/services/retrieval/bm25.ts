/**
 * Okapi BM25 — standard parameters (k1=1.5, b=0.75).
 *
 * Tokenizer policy:
 *   - English: lowercase, split on whitespace + punctuation, keep alphanumeric
 *     (including digits/`-`/`_` inside a run).
 *   - CJK: every CJK unified-ideograph is a standalone token (jieba-free).
 *   - Mixed: EN runs and CJK chars interleave naturally.
 *
 * Data model:
 *   - docs: { id, text } — `text` is the concatenation of every field we want
 *     to index (title + excerpt + tags joined by spaces).
 *   - Index:
 *       postings: Map<token, Map<docId, termFreq>>   (not used at score time,
 *         kept for debugging + potential reuse)
 *       tf:       Map<docId, Map<token, freq>>       (primary lookup)
 *       df:       Map<token, docCount>
 *       docLen:   Map<docId, tokenCount>
 *       totalDocs, avgdl: scalars
 *
 * The score formula (Robertson/Spärck Jones):
 *   idf(q)  = ln((N − df(q) + 0.5) / (df(q) + 0.5) + 1)           (always ≥ 0)
 *   bm25(q, d) =
 *     Σ_over_tokens_in_q  idf(q) *
 *         tf(q, d) * (k1 + 1)
 *       ─────────────────────────────────────────────────
 *       tf(q, d) + k1 * (1 − b + b * (|d| / avgdl))
 */

export const BM25_K1 = 1.5
export const BM25_B = 0.75

export interface Doc {
  id: string
  text: string
}

export interface BM25Index {
  totalDocs: number
  avgdl: number
  tf: Map<string, Map<string, number>>
  df: Map<string, number>
  docLen: Map<string, number>
}

// Unicode ranges for CJK unified ideographs we treat as single-character tokens.
const CJK_PATTERN = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/

/**
 * Tokenize into a flat array of lowercased tokens. EN runs stay whole,
 * CJK chars each become one token, whitespace + punctuation are delimiters.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  let buffer = ''
  const flush = () => {
    if (buffer.length > 0) {
      tokens.push(buffer.toLowerCase())
      buffer = ''
    }
  }
  for (const ch of text) {
    if (CJK_PATTERN.test(ch)) {
      flush()
      tokens.push(ch.toLowerCase())
      continue
    }
    // Alphanumeric + `-` + `_` keeps going; anything else is a delimiter.
    if (/[a-zA-Z0-9\-_]/.test(ch)) {
      buffer += ch
    } else {
      flush()
    }
  }
  flush()
  return tokens
}

export function buildBM25Index(docs: Doc[]): BM25Index {
  const tf = new Map<string, Map<string, number>>()
  const df = new Map<string, number>()
  const docLen = new Map<string, number>()
  let totalLen = 0

  for (const doc of docs) {
    const tokens = tokenize(doc.text)
    docLen.set(doc.id, tokens.length)
    totalLen += tokens.length
    const docCounts = new Map<string, number>()
    for (const token of tokens) {
      docCounts.set(token, (docCounts.get(token) ?? 0) + 1)
    }
    tf.set(doc.id, docCounts)
    // df: count each distinct token in this doc once
    for (const token of docCounts.keys()) {
      df.set(token, (df.get(token) ?? 0) + 1)
    }
  }

  const totalDocs = docs.length
  const avgdl = totalDocs > 0 ? totalLen / totalDocs : 0
  return { totalDocs, avgdl, tf, df, docLen }
}

function idf(token: string, index: BM25Index): number {
  const df = index.df.get(token) ?? 0
  // Floor at 0 — in our flavor, extremely common terms still contribute slightly.
  return Math.log((index.totalDocs - df + 0.5) / (df + 0.5) + 1)
}

export function scoreDocument(queryTokens: string[], docId: string, index: BM25Index): number {
  const docCounts = index.tf.get(docId)
  if (!docCounts) return 0
  const dl = index.docLen.get(docId) ?? 0
  if (dl === 0 || index.avgdl === 0) return 0
  const lenNormFactor = 1 - BM25_B + BM25_B * (dl / index.avgdl)
  let score = 0
  for (const token of queryTokens) {
    const tf = docCounts.get(token)
    if (!tf) continue
    const numerator = tf * (BM25_K1 + 1)
    const denom = tf + BM25_K1 * lenNormFactor
    score += idf(token, index) * (numerator / denom)
  }
  return score
}

export interface RankOptions {
  /** Cap the returned list length. Missing / non-positive means "all non-zero". */
  topK?: number
}

export interface RankHit {
  id: string
  score: number
}

export function rankByBM25(query: string, docs: Doc[], options: RankOptions = {}): RankHit[] {
  const index = buildBM25Index(docs)
  const queryTokens = tokenize(query)
  const scored: RankHit[] = []
  for (const doc of docs) {
    const s = scoreDocument(queryTokens, doc.id, index)
    if (s > 0) scored.push({ id: doc.id, score: s })
  }
  scored.sort((a, b) => b.score - a.score)
  if (options.topK !== undefined && options.topK > 0 && scored.length > options.topK) {
    scored.length = options.topK
  }
  return scored
}
