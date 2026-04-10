// R009 Evensong III — Paper Engine Unit Tests (35+ core tests)
import { describe, it, expect, beforeEach } from 'bun:test';
import { PaperEngineService } from '../src/index.ts';
import { NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';

let svc: PaperEngineService;

const paper1 = () => ({
  title: 'Attention Is All You Need',
  abstract: 'A new architecture based purely on attention mechanisms.',
  authors: [{ name: 'Vaswani', email: 'vaswani@google.com', affiliation: 'Google Brain' }],
  tags: ['transformer', 'attention', 'nlp'],
  year: 2017,
  venue: 'NeurIPS',
});

const paper2 = () => ({
  title: 'BERT: Pre-training of Deep Bidirectional Transformers',
  abstract: 'BERT is designed to pre-train deep bidirectional representations.',
  authors: [{ name: 'Devlin', email: 'devlin@google.com', affiliation: 'Google' }],
  tags: ['bert', 'nlp', 'pretraining'],
  year: 2018,
  venue: 'NAACL',
});

const paper3 = () => ({
  title: 'GPT-3: Language Models are Few-Shot Learners',
  abstract: 'We demonstrate that scaling language models greatly improves task-agnostic performance.',
  authors: [{ name: 'Brown', email: 'brown@openai.com', affiliation: 'OpenAI' }],
  tags: ['gpt', 'nlp', 'few-shot'],
  year: 2020,
  venue: 'NeurIPS',
});

beforeEach(() => { svc = new PaperEngineService(); });

// ── Ingest ────────────────────────────────────────────────────────────────────

describe('ingestPaper', () => {
  it('ingests a valid paper and returns it with an id', async () => {
    const p = await svc.ingestPaper(paper1());
    expect(p.id).toBeTruthy();
    expect(p.title).toBe('Attention Is All You Need');
    expect(p.authors).toHaveLength(1);
    expect(p.authors[0].id).toBeTruthy();
  });

  it('normalizes tags to lowercase', async () => {
    const p = await svc.ingestPaper({ ...paper1(), tags: ['NLP', 'Deep Learning'] });
    expect(p.tags).toContain('nlp');
    expect(p.tags).toContain('deep learning');
  });

  it('defaults status to submitted', async () => {
    const p = await svc.ingestPaper(paper1());
    expect(p.status).toBe('submitted');
  });

  it('accepts an explicit status', async () => {
    const p = await svc.ingestPaper({ ...paper1(), status: 'published' });
    expect(p.status).toBe('published');
  });

  it('throws ValidationError if title is empty', async () => {
    await expect(svc.ingestPaper({ ...paper1(), title: '' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError if abstract is missing', async () => {
    await expect(svc.ingestPaper({ ...paper1(), abstract: '   ' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError if authors array is empty', async () => {
    await expect(svc.ingestPaper({ ...paper1(), authors: [] })).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError if an author has no name', async () => {
    await expect(svc.ingestPaper({
      ...paper1(),
      authors: [{ name: '', email: 'x@y.com', affiliation: 'A' }],
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ConflictError on duplicate DOI', async () => {
    await svc.ingestPaper({ ...paper1(), doi: '10.1234/abc' });
    await expect(svc.ingestPaper({ ...paper2(), doi: '10.1234/abc' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('ingests paper without optional fields', async () => {
    const p = await svc.ingestPaper({ title: 'Minimal', abstract: 'Abstract text', authors: [{ name: 'A', email: 'a@b.com', affiliation: 'Uni' }] });
    expect(p.id).toBeTruthy();
    expect(p.tags).toHaveLength(0);
  });
});

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe('getPaper', () => {
  it('retrieves an ingested paper by id', async () => {
    const p = await svc.ingestPaper(paper1());
    const fetched = await svc.getPaper(p.id);
    expect(fetched.id).toBe(p.id);
    expect(fetched.title).toBe(p.title);
  });

  it('throws NotFoundError for unknown id', async () => {
    await expect(svc.getPaper('nonexistent')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listPapers', () => {
  it('returns all papers when no filter applied', async () => {
    await svc.ingestPaper(paper1());
    await svc.ingestPaper(paper2());
    const list = await svc.listPapers();
    expect(list).toHaveLength(2);
  });

  it('filters by status', async () => {
    await svc.ingestPaper(paper1());
    await svc.ingestPaper({ ...paper2(), status: 'published' });
    const submitted = await svc.listPapers({ status: 'submitted' });
    expect(submitted).toHaveLength(1);
    expect(submitted[0].title).toBe('Attention Is All You Need');
  });

  it('filters by year', async () => {
    await svc.ingestPaper(paper1());
    await svc.ingestPaper(paper2());
    const results = await svc.listPapers({ year: 2017 });
    expect(results).toHaveLength(1);
    expect(results[0].year).toBe(2017);
  });

  it('filters by venue', async () => {
    await svc.ingestPaper(paper1());
    await svc.ingestPaper(paper2());
    const results = await svc.listPapers({ venue: 'NeurIPS' });
    expect(results).toHaveLength(1);
    expect(results[0].venue).toBe('NeurIPS');
  });

  it('returns empty list when nothing matches filter', async () => {
    await svc.ingestPaper(paper1());
    const results = await svc.listPapers({ year: 1900 });
    expect(results).toHaveLength(0);
  });
});

describe('deletePaper', () => {
  it('deletes a paper successfully', async () => {
    const p = await svc.ingestPaper(paper1());
    await svc.deletePaper(p.id);
    await expect(svc.getPaper(p.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for unknown paper id', async () => {
    await expect(svc.deletePaper('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe('searchPapers', () => {
  it('finds paper by title keyword', async () => {
    await svc.ingestPaper(paper1());
    await svc.ingestPaper(paper2());
    const results = await svc.searchPapers('attention');
    expect(results[0].paper.title).toContain('Attention');
    expect(results[0].matchedFields).toContain('title');
  });

  it('returns results ordered by descending score', async () => {
    await svc.ingestPaper(paper1());
    await svc.ingestPaper(paper2());
    await svc.ingestPaper(paper3());
    const results = await svc.searchPapers('nlp');
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('throws ValidationError for empty query', async () => {
    await expect(svc.searchPapers('')).rejects.toBeInstanceOf(ValidationError);
  });

  it('returns empty array when nothing matches', async () => {
    await svc.ingestPaper(paper1());
    const results = await svc.searchPapers('quantum_computing_xyz');
    expect(results).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await svc.ingestPaper({ title: `NLP Paper ${i}`, abstract: 'nlp study', authors: [{ name: `A${i}`, email: `a${i}@x.com`, affiliation: 'U' }] });
    }
    const results = await svc.searchPapers('nlp', 3);
    expect(results).toHaveLength(3);
  });
});

// ── Citations ─────────────────────────────────────────────────────────────────

describe('addCitation', () => {
  it('adds a citation and increments citationCount', async () => {
    const p1 = await svc.ingestPaper(paper1());
    const p2 = await svc.ingestPaper(paper2());
    await svc.addCitation(p2.id, p1.id);
    const updated = await svc.getPaper(p1.id);
    expect(updated.citationCount).toBe(1);
  });

  it('throws ValidationError if self-citation', async () => {
    const p = await svc.ingestPaper(paper1());
    await expect(svc.addCitation(p.id, p.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ConflictError on duplicate citation', async () => {
    const p1 = await svc.ingestPaper(paper1());
    const p2 = await svc.ingestPaper(paper2());
    await svc.addCitation(p1.id, p2.id);
    await expect(svc.addCitation(p1.id, p2.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws NotFoundError for missing source paper', async () => {
    const p = await svc.ingestPaper(paper1());
    await expect(svc.addCitation('ghost', p.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for missing target paper', async () => {
    const p = await svc.ingestPaper(paper1());
    await expect(svc.addCitation(p.id, 'ghost')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('detects direct cycle A→B, B→A', async () => {
    const a = await svc.ingestPaper(paper1());
    const b = await svc.ingestPaper(paper2());
    await svc.addCitation(a.id, b.id);
    await expect(svc.addCitation(b.id, a.id)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('getCitations / getCitedBy', () => {
  it('getCitations returns papers this paper cites', async () => {
    const p1 = await svc.ingestPaper(paper1());
    const p2 = await svc.ingestPaper(paper2());
    await svc.addCitation(p2.id, p1.id);
    const cites = await svc.getCitations(p2.id);
    expect(cites).toHaveLength(1);
    expect(cites[0].toPaperId).toBe(p1.id);
  });

  it('getCitedBy returns papers citing this paper', async () => {
    const p1 = await svc.ingestPaper(paper1());
    const p2 = await svc.ingestPaper(paper2());
    await svc.addCitation(p2.id, p1.id);
    const citedBy = await svc.getCitedBy(p1.id);
    expect(citedBy).toHaveLength(1);
    expect(citedBy[0].fromPaperId).toBe(p2.id);
  });
});

// ── Tags ──────────────────────────────────────────────────────────────────────

describe('addTag / getByTag', () => {
  it('adds a tag to a paper', async () => {
    const p = await svc.ingestPaper(paper1());
    const updated = await svc.addTag(p.id, 'deep-learning');
    expect(updated.tags).toContain('deep-learning');
  });

  it('throws ConflictError for duplicate tag', async () => {
    const p = await svc.ingestPaper(paper1());
    await expect(svc.addTag(p.id, 'transformer')).rejects.toBeInstanceOf(ConflictError);
  });

  it('getByTag returns all papers with that tag', async () => {
    await svc.ingestPaper(paper1());
    await svc.ingestPaper(paper2());
    await svc.ingestPaper(paper3());
    const nlpPapers = await svc.getByTag('nlp');
    expect(nlpPapers).toHaveLength(3);
  });

  it('getByTag is case-insensitive', async () => {
    await svc.ingestPaper(paper1());
    const results = await svc.getByTag('TRANSFORMER');
    expect(results).toHaveLength(1);
  });
});

// ── Author papers ─────────────────────────────────────────────────────────────

describe('getAuthorPapers', () => {
  it('returns papers for an author by email', async () => {
    await svc.ingestPaper(paper1());
    await svc.ingestPaper(paper2());
    const papers = await svc.getAuthorPapers('vaswani@google.com');
    expect(papers).toHaveLength(1);
    expect(papers[0].title).toContain('Attention');
  });

  it('returns empty array for unknown author', async () => {
    await svc.ingestPaper(paper1());
    const papers = await svc.getAuthorPapers('nobody@example.com');
    expect(papers).toHaveLength(0);
  });

  it('throws ValidationError for empty email', async () => {
    await expect(svc.getAuthorPapers('')).rejects.toBeInstanceOf(ValidationError);
  });
});

// ── Reading Lists ─────────────────────────────────────────────────────────────

describe('createReadingList', () => {
  it('creates a reading list', async () => {
    const rl = await svc.createReadingList('user-1', 'My Reading List', 'Papers to read');
    expect(rl.id).toBeTruthy();
    expect(rl.name).toBe('My Reading List');
    expect(rl.paperIds).toHaveLength(0);
  });

  it('throws ValidationError if name is empty', async () => {
    await expect(svc.createReadingList('user-1', '')).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError if ownerId is empty', async () => {
    await expect(svc.createReadingList('', 'My List')).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('addToReadingList / removeFromReadingList', () => {
  it('adds a paper to a reading list', async () => {
    const p = await svc.ingestPaper(paper1());
    const rl = await svc.createReadingList('user-1', 'Classics');
    const updated = await svc.addToReadingList(rl.id, p.id);
    expect(updated.paperIds).toContain(p.id);
  });

  it('throws ConflictError when adding paper already in list', async () => {
    const p = await svc.ingestPaper(paper1());
    const rl = await svc.createReadingList('user-1', 'Classics');
    await svc.addToReadingList(rl.id, p.id);
    await expect(svc.addToReadingList(rl.id, p.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('removes a paper from a reading list', async () => {
    const p = await svc.ingestPaper(paper1());
    const rl = await svc.createReadingList('user-1', 'Classics');
    await svc.addToReadingList(rl.id, p.id);
    const updated = await svc.removeFromReadingList(rl.id, p.id);
    expect(updated.paperIds).not.toContain(p.id);
  });

  it('throws NotFoundError when removing paper not in list', async () => {
    const rl = await svc.createReadingList('user-1', 'Classics');
    await expect(svc.removeFromReadingList(rl.id, 'ghost-paper')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getReadingList', () => {
  it('returns list with resolved papers', async () => {
    const p1 = await svc.ingestPaper(paper1());
    const p2 = await svc.ingestPaper(paper2());
    const rl = await svc.createReadingList('user-1', 'NLP Classics');
    await svc.addToReadingList(rl.id, p1.id);
    await svc.addToReadingList(rl.id, p2.id);
    const { list, papers } = await svc.getReadingList(rl.id);
    expect(list.name).toBe('NLP Classics');
    expect(papers).toHaveLength(2);
  });

  it('throws NotFoundError for unknown list', async () => {
    await expect(svc.getReadingList('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── Citation Graph ────────────────────────────────────────────────────────────

describe('buildCitationGraph', () => {
  it('builds a graph with nodes and edges', async () => {
    const p1 = await svc.ingestPaper(paper1());
    const p2 = await svc.ingestPaper(paper2());
    const p3 = await svc.ingestPaper(paper3());
    await svc.addCitation(p3.id, p1.id);
    await svc.addCitation(p3.id, p2.id);
    const graph = await svc.buildCitationGraph(p3.id, 1);
    expect(graph.nodes.some(n => n.id === p3.id)).toBe(true);
    expect(graph.edges).toHaveLength(2);
  });

  it('throws NotFoundError for unknown root', async () => {
    await expect(svc.buildCitationGraph('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ── Recommendations ───────────────────────────────────────────────────────────

describe('getRecommendations', () => {
  it('returns recommendations for a paper', async () => {
    const p1 = await svc.ingestPaper(paper1());
    const p2 = await svc.ingestPaper(paper2()); // shares nlp tag
    await svc.ingestPaper(paper3()); // shares nlp tag
    const recs = await svc.getRecommendations(p1.id, 5);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every(r => r.id !== p1.id)).toBe(true);
  });

  it('throws NotFoundError for unknown paper', async () => {
    await expect(svc.getRecommendations('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('recommends cited neighbors higher', async () => {
    const p1 = await svc.ingestPaper(paper1());
    const p2 = await svc.ingestPaper(paper2());
    const p3 = await svc.ingestPaper(paper3());
    await svc.addCitation(p1.id, p2.id); // p1 cites p2
    const recs = await svc.getRecommendations(p1.id, 10);
    const p2rec = recs.find(r => r.id === p2.id);
    const p3rec = recs.find(r => r.id === p3.id);
    if (p2rec && p3rec) {
      // p2 should score higher (direct citation) than p3 (only tag overlap)
      const p2idx = recs.indexOf(p2rec);
      const p3idx = recs.indexOf(p3rec);
      expect(p2idx).toBeLessThan(p3idx);
    }
  });
});
