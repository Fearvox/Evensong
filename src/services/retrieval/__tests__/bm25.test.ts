import { describe, test, expect } from 'bun:test'
import { tokenize, buildBM25Index, scoreDocument, rankByBM25 } from '../bm25.js'

describe('tokenize', () => {
  test('splits English on whitespace + punctuation, lowercases', () => {
    expect(tokenize('Memory Sparse Attention for 100M Tokens')).toEqual([
      'memory',
      'sparse',
      'attention',
      'for',
      '100m',
      'tokens',
    ])
  })

  test('splits CJK into single-character tokens', () => {
    expect(tokenize('超图记忆')).toEqual(['超', '图', '记', '忆'])
  })

  test('handles mixed EN+CJK', () => {
    expect(tokenize('HyperMem 超图 memory')).toEqual(['hypermem', '超', '图', 'memory'])
  })

  test('discards empty tokens from consecutive delimiters', () => {
    expect(tokenize('foo,,,bar ! ! baz')).toEqual(['foo', 'bar', 'baz'])
  })
})

describe('buildBM25Index', () => {
  test('computes avgdl + df correctly for 3 docs', () => {
    const docs = [
      { id: 'd1', text: 'memory sparse attention' },
      { id: 'd2', text: 'hypergraph memory for conversations' },
      { id: 'd3', text: 'attention is all you need' },
    ]
    const idx = buildBM25Index(docs)
    expect(idx.totalDocs).toBe(3)
    expect(idx.avgdl).toBe((3 + 4 + 5) / 3)
    // 'memory' in d1, d2 → df=2
    expect(idx.df.get('memory')).toBe(2)
    // 'attention' in d1, d3 → df=2
    expect(idx.df.get('attention')).toBe(2)
    // 'hypergraph' only in d2 → df=1
    expect(idx.df.get('hypergraph')).toBe(1)
  })
})

describe('scoreDocument', () => {
  test('returns positive score when query tokens match doc', () => {
    const docs = [
      { id: 'd1', text: 'memory sparse attention' },
      { id: 'd2', text: 'hypergraph memory' },
      { id: 'd3', text: 'unrelated doc' },
    ]
    const idx = buildBM25Index(docs)
    const queryTokens = tokenize('memory attention')
    expect(scoreDocument(queryTokens, 'd1', idx)).toBeGreaterThan(0)
    expect(scoreDocument(queryTokens, 'd3', idx)).toBe(0)
  })

  test('rare term contributes more than common term (idf weighting)', () => {
    const docs = [
      { id: 'd1', text: 'memory memory memory hypergraph' }, // 'memory' is common (3/3), hypergraph rare
      { id: 'd2', text: 'memory data storage' },
      { id: 'd3', text: 'memory retrieval system' },
    ]
    const idx = buildBM25Index(docs)
    // Query 'hypergraph' should score d1 higher than query 'memory' scores d1
    // because idf(hypergraph) >> idf(memory)
    const scoreHyper = scoreDocument(tokenize('hypergraph'), 'd1', idx)
    const scoreCommon = scoreDocument(tokenize('memory'), 'd1', idx)
    expect(scoreHyper).toBeGreaterThan(scoreCommon)
  })
})

describe('rankByBM25', () => {
  test('ranks most-relevant doc first', () => {
    const docs = [
      { id: 'msa', text: 'memory sparse attention 100M tokens' },
      { id: 'hypermem', text: 'hypergraph memory long-term conversations' },
      { id: 'memgpt', text: 'LLM as operating system memory paging' },
      { id: 'unrelated', text: 'completely unrelated topic about cooking' },
    ]
    const ranked = rankByBM25('memory sparse attention for long context', docs, { topK: 3 })
    expect(ranked[0]?.id).toBe('msa')
    expect(ranked.length).toBe(3)
    expect(ranked.every((r) => r.score > 0)).toBe(true)
  })

  test('returns empty list if no tokens match', () => {
    const docs = [
      { id: 'a', text: 'foo bar' },
      { id: 'b', text: 'baz qux' },
    ]
    const ranked = rankByBM25('completely absent query', docs, { topK: 5 })
    expect(ranked.length).toBe(0)
  })

  test('topK caps the returned list', () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, text: 'memory shared' }))
    const ranked = rankByBM25('memory', docs, { topK: 3 })
    expect(ranked.length).toBe(3)
  })

  test('handles CJK query against CJK doc text', () => {
    const docs = [
      { id: 'zh1', text: '超图记忆 长期对话' },
      { id: 'en1', text: 'hypergraph memory' },
      { id: 'zh2', text: '稀疏注意力 记忆模型' },
    ]
    const ranked = rankByBM25('超图', docs, { topK: 2 })
    expect(ranked[0]?.id).toBe('zh1')
  })
})
