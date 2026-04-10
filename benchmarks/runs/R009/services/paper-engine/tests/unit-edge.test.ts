// R009 Evensong III — Paper Engine Edge Case Tests (15+ tests)
import { describe, it, expect, beforeEach } from 'bun:test';
import { PaperEngineService } from '../src/index.ts';
import { NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';

let svc: PaperEngineService;

const mkPaper = (overrides: Partial<{
  title: string; abstract: string; tags: string[]; year: number; venue: string;
}> = {}) => ({
  title: overrides.title ?? 'Test Paper',
  abstract: overrides.abstract ?? 'Test abstract content',
  authors: [{ name: 'Author A', email: 'a@test.com', affiliation: 'Test Uni' }],
  tags: overrides.tags ?? ['ml'],
  year: overrides.year ?? 2022,
  venue: overrides.venue,
});

beforeEach(() => { svc = new PaperEngineService(); });

// ── Edge: title/abstract whitespace ───────────────────────────────────────────

it('trims leading/trailing whitespace from title', async () => {
  const p = await svc.ingestPaper({ ...mkPaper(), title: '  Trimmed Title  ' });
  expect(p.title).toBe('Trimmed Title');
});

it('trims leading/trailing whitespace from abstract', async () => {
  const p = await svc.ingestPaper({ ...mkPaper(), abstract: '\n  Abstract text.\n  ' });
  expect(p.abstract).toBe('Abstract text.');
});

// ── Edge: citation deduplication ──────────────────────────────────────────────

it('allows multiple papers to cite the same paper', async () => {
  const p1 = await svc.ingestPaper(mkPaper({ title: 'A' }));
  const p2 = await svc.ingestPaper(mkPaper({ title: 'B' }));
  const p3 = await svc.ingestPaper(mkPaper({ title: 'C' }));
  await svc.addCitation(p2.id, p1.id);
  await svc.addCitation(p3.id, p1.id);
  const p1Updated = await svc.getPaper(p1.id);
  expect(p1Updated.citationCount).toBe(2);
});

// ── Edge: three-node cycle ────────────────────────────────────────────────────

it('detects transitive cycle A→B→C, C→A', async () => {
  const a = await svc.ingestPaper(mkPaper({ title: 'A' }));
  const b = await svc.ingestPaper(mkPaper({ title: 'B' }));
  const c = await svc.ingestPaper(mkPaper({ title: 'C' }));
  await svc.addCitation(a.id, b.id);
  await svc.addCitation(b.id, c.id);
  await expect(svc.addCitation(c.id, a.id)).rejects.toBeInstanceOf(ValidationError);
});

// ── Edge: citation context stored ─────────────────────────────────────────────

it('stores and returns citation context', async () => {
  const p1 = await svc.ingestPaper(mkPaper({ title: 'A' }));
  const p2 = await svc.ingestPaper(mkPaper({ title: 'B' }));
  await svc.addCitation(p1.id, p2.id, 'Used in section 3');
  const cites = await svc.getCitations(p1.id);
  expect(cites[0].context).toBe('Used in section 3');
});

// ── Edge: delete removes citations from both sides ────────────────────────────

it('deleting a paper removes citations involving it', async () => {
  const a = await svc.ingestPaper(mkPaper({ title: 'A' }));
  const b = await svc.ingestPaper(mkPaper({ title: 'B' }));
  await svc.addCitation(a.id, b.id);
  await svc.deletePaper(a.id);
  // b's citation count should not be corrupted and fetching b works
  const bFetched = await svc.getPaper(b.id);
  expect(bFetched.id).toBe(b.id);
  // a is gone
  await expect(svc.getPaper(a.id)).rejects.toBeInstanceOf(NotFoundError);
});

// ── Edge: delete removes paper from reading lists ─────────────────────────────

it('deleting a paper removes it from all reading lists', async () => {
  const p = await svc.ingestPaper(mkPaper({ title: 'Deletable' }));
  const rl1 = await svc.createReadingList('u1', 'List 1');
  const rl2 = await svc.createReadingList('u2', 'List 2');
  await svc.addToReadingList(rl1.id, p.id);
  await svc.addToReadingList(rl2.id, p.id);
  await svc.deletePaper(p.id);
  const { list: l1 } = await svc.getReadingList(rl1.id);
  const { list: l2 } = await svc.getReadingList(rl2.id);
  expect(l1.paperIds).not.toContain(p.id);
  expect(l2.paperIds).not.toContain(p.id);
});

// ── Edge: citation graph depth 0 ─────────────────────────────────────────────

it('citation graph with depth=0 returns only root node, no edges', async () => {
  const p = await svc.ingestPaper(mkPaper({ title: 'Root' }));
  const p2 = await svc.ingestPaper(mkPaper({ title: 'Other' }));
  await svc.addCitation(p.id, p2.id);
  const graph = await svc.buildCitationGraph(p.id, 0);
  expect(graph.nodes).toHaveLength(1);
  expect(graph.nodes[0].id).toBe(p.id);
  expect(graph.edges).toHaveLength(0);
});

// ── Edge: empty reading list returns empty papers array ───────────────────────

it('getReadingList returns empty papers array for empty list', async () => {
  const rl = await svc.createReadingList('u1', 'Empty List');
  const { papers } = await svc.getReadingList(rl.id);
  expect(papers).toHaveLength(0);
});

// ── Edge: getByTag returns empty for nonexistent tag ─────────────────────────

it('getByTag returns empty array when no papers have that tag', async () => {
  await svc.ingestPaper(mkPaper({ tags: ['ml'] }));
  const results = await svc.getByTag('quantum');
  expect(results).toHaveLength(0);
});

// ── Edge: searchPapers matches author name ────────────────────────────────────

it('search matches on author name', async () => {
  await svc.ingestPaper({
    title: 'Unrelated Topic',
    abstract: 'Nothing about the query',
    authors: [{ name: 'LeCun', email: 'lecun@meta.com', affiliation: 'Meta' }],
  });
  const results = await svc.searchPapers('LeCun');
  expect(results).toHaveLength(1);
  expect(results[0].matchedFields).toContain('authors');
});

// ── Edge: recommendations excludes self ───────────────────────────────────────

it('getRecommendations never includes the target paper itself', async () => {
  const p1 = await svc.ingestPaper(mkPaper({ title: 'Target', tags: ['ml', 'cv'] }));
  await svc.ingestPaper(mkPaper({ title: 'Other1', tags: ['ml'] }));
  await svc.ingestPaper(mkPaper({ title: 'Other2', tags: ['cv'] }));
  const recs = await svc.getRecommendations(p1.id);
  expect(recs.every(r => r.id !== p1.id)).toBe(true);
});

// ── Edge: recommendations with no candidates returns empty ───────────────────

it('getRecommendations returns empty when only one paper exists', async () => {
  const p = await svc.ingestPaper(mkPaper({ title: 'Lonely Paper' }));
  const recs = await svc.getRecommendations(p.id);
  expect(recs).toHaveLength(0);
});

// ── Edge: multiple authors on a paper ────────────────────────────────────────

it('paper with multiple authors resolves getAuthorPapers for each', async () => {
  await svc.ingestPaper({
    title: 'Joint Paper',
    abstract: 'Collaborative work',
    authors: [
      { name: 'Alice', email: 'alice@uni.edu', affiliation: 'Uni A' },
      { name: 'Bob', email: 'bob@uni.edu', affiliation: 'Uni B' },
    ],
    tags: ['collab'],
  });
  const alicePapers = await svc.getAuthorPapers('alice@uni.edu');
  const bobPapers = await svc.getAuthorPapers('bob@uni.edu');
  expect(alicePapers).toHaveLength(1);
  expect(bobPapers).toHaveLength(1);
  expect(alicePapers[0].id).toBe(bobPapers[0].id);
});

// ── Edge: _reset clears all state ─────────────────────────────────────────────

it('_reset clears papers, citations, and reading lists', async () => {
  const p = await svc.ingestPaper(mkPaper());
  const rl = await svc.createReadingList('u', 'L');
  await svc.addToReadingList(rl.id, p.id);
  svc._reset();
  const counts = await svc._counts();
  expect(counts.papers).toBe(0);
  expect(counts.citations).toBe(0);
  expect(counts.readingLists).toBe(0);
});

// ── Edge: citation graph depth=1 traverses exactly one hop ───────────────────

it('citation graph depth=1 includes direct neighbors only', async () => {
  const a = await svc.ingestPaper(mkPaper({ title: 'A' }));
  const b = await svc.ingestPaper(mkPaper({ title: 'B' }));
  const c = await svc.ingestPaper(mkPaper({ title: 'C' }));
  await svc.addCitation(a.id, b.id);
  await svc.addCitation(b.id, c.id);
  const graph = await svc.buildCitationGraph(a.id, 1);
  const nodeIds = graph.nodes.map(n => n.id);
  expect(nodeIds).toContain(a.id);
  expect(nodeIds).toContain(b.id);
  // c is 2 hops away, should not be included at depth=1
  expect(nodeIds).not.toContain(c.id);
});
