// R009 Evensong III — Paper Engine Fuzz / Property-Based Tests (5+ properties)
import { describe, it, expect, beforeEach } from 'bun:test';
import { PaperEngineService } from '../src/index.ts';
import { ValidationError, ConflictError } from '../../../shared/errors.ts';

let svc: PaperEngineService;

// ── Fuzz helpers ──────────────────────────────────────────────────────────────

function randStr(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function randEmail(): string {
  return `${randStr(6)}@${randStr(4)}.com`;
}

function randPaper(overrides: Partial<{ title: string; abstract: string; tags: string[]; year: number }> = {}) {
  return {
    title: overrides.title ?? `Paper ${randStr(8)}`,
    abstract: overrides.abstract ?? `Abstract content about ${randStr(12)}`,
    authors: [{ name: `Author ${randStr(6)}`, email: randEmail(), affiliation: `Uni ${randStr(4)}` }],
    tags: overrides.tags ?? [randStr(5), randStr(5)],
    year: overrides.year ?? (2000 + Math.floor(Math.random() * 25)),
  };
}

beforeEach(() => { svc = new PaperEngineService(); });

// ── Property 1: ingest → getPaper round-trip preserves all fields ─────────────

describe('fuzz: ingest round-trip fidelity', () => {
  it('ingest → getPaper preserves title, abstract, year for 15 random papers', async () => {
    for (let i = 0; i < 15; i++) {
      const input = randPaper();
      const ingested = await svc.ingestPaper(input);
      const fetched = await svc.getPaper(ingested.id);
      expect(fetched.title).toBe(input.title.trim());
      expect(fetched.abstract).toBe(input.abstract.trim());
      expect(fetched.year).toBe(input.year);
      expect(fetched.citationCount).toBe(0);
    }
  });
});

// ── Property 2: no self-citations accepted ────────────────────────────────────

describe('fuzz: self-citation always rejected', () => {
  it('self-citation throws ValidationError for 12 papers', async () => {
    for (let i = 0; i < 12; i++) {
      const p = await svc.ingestPaper(randPaper());
      await expect(svc.addCitation(p.id, p.id)).rejects.toBeInstanceOf(ValidationError);
    }
  });
});

// ── Property 3: citation count is always consistent ──────────────────────────

describe('fuzz: citation count consistency', () => {
  it('citationCount equals number of unique inbound citations for 10 papers', async () => {
    // Ingest 10 papers, create a random DAG, verify counts match
    const papers: string[] = [];
    for (let i = 0; i < 10; i++) {
      const p = await svc.ingestPaper(randPaper());
      papers.push(p.id);
    }

    // Build a simple DAG: paper[i] cites paper[j] if j < i (no cycles possible)
    const expectedCounts = new Map<string, number>();
    for (const id of papers) expectedCounts.set(id, 0);

    for (let i = 1; i < papers.length; i++) {
      // Each paper cites the one before it
      await svc.addCitation(papers[i], papers[i - 1]);
      expectedCounts.set(papers[i - 1], (expectedCounts.get(papers[i - 1]) ?? 0) + 1);
    }

    for (const id of papers) {
      const p = await svc.getPaper(id);
      expect(p.citationCount).toBe(expectedCounts.get(id)!);
    }
  });
});

// ── Property 4: search always returns subset of stored papers ─────────────────

describe('fuzz: search results always subset of stored papers', () => {
  it('all search results exist in the store for 15 random queries', async () => {
    // Ingest 15 papers
    const ids = new Set<string>();
    for (let i = 0; i < 15; i++) {
      const p = await svc.ingestPaper(randPaper());
      ids.add(p.id);
    }

    // Run 15 random queries
    for (let i = 0; i < 15; i++) {
      const query = randStr(3);
      const results = await svc.searchPapers(query);
      for (const r of results) {
        expect(ids.has(r.paper.id)).toBe(true);
        expect(r.score).toBeGreaterThan(0);
        expect(r.matchedFields.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── Property 5: reading list membership is idempotent-free (no duplicates) ────

describe('fuzz: reading list no duplicates', () => {
  it('adding same paper twice to reading list always throws ConflictError (12 iterations)', async () => {
    for (let i = 0; i < 12; i++) {
      svc._reset();
      const p = await svc.ingestPaper(randPaper());
      const rl = await svc.createReadingList(randStr(6), randStr(8));
      await svc.addToReadingList(rl.id, p.id);
      await expect(svc.addToReadingList(rl.id, p.id)).rejects.toBeInstanceOf(ConflictError);
      const { list } = await svc.getReadingList(rl.id);
      // Only one entry
      const occurrences = list.paperIds.filter(id => id === p.id).length;
      expect(occurrences).toBe(1);
    }
  });
});

// ── Property 6: recommendations never exceed requested limit ─────────────────

describe('fuzz: recommendations respect limit', () => {
  it('getRecommendations never returns more than limit for 10 random scenarios', async () => {
    for (let i = 0; i < 10; i++) {
      svc._reset();
      const count = 5 + Math.floor(Math.random() * 10); // 5–14 papers
      const papers: string[] = [];
      for (let j = 0; j < count; j++) {
        const p = await svc.ingestPaper(randPaper());
        papers.push(p.id);
      }
      const limit = 1 + Math.floor(Math.random() * 5);
      const targetId = papers[Math.floor(Math.random() * papers.length)];
      const recs = await svc.getRecommendations(targetId, limit);
      expect(recs.length).toBeLessThanOrEqual(limit);
    }
  });
});

// ── Property 7: DOI uniqueness always enforced ───────────────────────────────

describe('fuzz: DOI uniqueness', () => {
  it('duplicate DOIs always rejected across 10 random DOIs', async () => {
    for (let i = 0; i < 10; i++) {
      const doi = `10.${randStr(4)}/${randStr(6)}`;
      await svc.ingestPaper({ ...randPaper(), doi });
      await expect(
        svc.ingestPaper({ ...randPaper(), doi })
      ).rejects.toBeInstanceOf(ConflictError);
    }
  });
});
