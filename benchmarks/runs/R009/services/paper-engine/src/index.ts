// R009 Evensong III — Paper Engine Service
import { randomUUID } from 'crypto';
import { InMemoryStore } from '../../../shared/db.ts';
import { NotFoundError, ValidationError, ConflictError } from '../../../shared/errors.ts';
import { createLogger } from '../../../shared/logger.ts';
import { eventBus } from '../../../shared/events.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaperStatus = 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'published';

export interface Author {
  id: string;
  name: string;
  email: string;
  affiliation: string;
  orcid?: string;
}

export interface Citation {
  id: string;
  fromPaperId: string;
  toPaperId: string;
  context?: string;
  createdAt: string;
}

export interface Tag {
  name: string;
  category?: string;
}

export interface Paper {
  id: string;
  title: string;
  abstract: string;
  authors: Author[];
  tags: string[];
  status: PaperStatus;
  doi?: string;
  venue?: string;
  year: number;
  citationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingList {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  paperIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  paper: Paper;
  score: number;
  matchedFields: string[];
}

export interface IngestPaperInput {
  title: string;
  abstract: string;
  authors: Omit<Author, 'id'>[];
  tags?: string[];
  status?: PaperStatus;
  doi?: string;
  venue?: string;
  year?: number;
}

export interface CitationGraph {
  nodes: { id: string; title: string; citationCount: number }[];
  edges: { from: string; to: string; context?: string }[];
}

// ─── Internal store types ─────────────────────────────────────────────────────

interface PaperRecord extends Paper { id: string }
interface CitationRecord extends Citation { id: string }
interface ReadingListRecord extends ReadingList { id: string }

// ─── Service ─────────────────────────────────────────────────────────────────

export class PaperEngineService {
  private papers = new InMemoryStore<PaperRecord>();
  private citations = new InMemoryStore<CitationRecord>();
  private readingLists = new InMemoryStore<ReadingListRecord>();
  private logger = createLogger('paper-engine');

  // ── Ingest ────────────────────────────────────────────────────────────────

  async ingestPaper(input: IngestPaperInput): Promise<Paper> {
    if (!input.title?.trim()) throw new ValidationError('Paper title is required');
    if (!input.abstract?.trim()) throw new ValidationError('Paper abstract is required');
    if (!input.authors || input.authors.length === 0) throw new ValidationError('At least one author required');
    for (const a of input.authors) {
      if (!a.name?.trim()) throw new ValidationError('Author name is required');
      if (!a.email?.trim()) throw new ValidationError('Author email is required');
    }

    // DOI uniqueness check
    if (input.doi) {
      const existing = await this.papers.findAll(p => p.doi === input.doi);
      if (existing.length > 0) throw new ConflictError(`Paper with DOI '${input.doi}' already exists`);
    }

    const now = new Date().toISOString();
    const paper: PaperRecord = {
      id: randomUUID(),
      title: input.title.trim(),
      abstract: input.abstract.trim(),
      authors: input.authors.map(a => ({ ...a, id: randomUUID(), name: a.name.trim(), email: a.email.trim() })),
      tags: input.tags?.map(t => t.toLowerCase().trim()).filter(Boolean) ?? [],
      status: input.status ?? 'submitted',
      doi: input.doi,
      venue: input.venue,
      year: input.year ?? new Date().getFullYear(),
      citationCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.papers.insert(paper);

    await eventBus.publish({
      id: randomUUID(),
      type: 'paper.ingested',
      source: 'paper-engine',
      timestamp: now,
      correlationId: randomUUID(),
      payload: { paperId: paper.id, title: paper.title },
    });

    this.logger.info('Paper ingested', { paperId: paper.id });
    return paper;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async getPaper(id: string): Promise<Paper> {
    const paper = await this.papers.findById(id);
    if (!paper) throw new NotFoundError('Paper', id);
    return paper;
  }

  async listPapers(filter?: { status?: PaperStatus; year?: number; venue?: string }): Promise<Paper[]> {
    return this.papers.findAll(p => {
      if (filter?.status && p.status !== filter.status) return false;
      if (filter?.year && p.year !== filter.year) return false;
      if (filter?.venue && p.venue !== filter.venue) return false;
      return true;
    });
  }

  async deletePaper(id: string): Promise<void> {
    const paper = await this.papers.findById(id);
    if (!paper) throw new NotFoundError('Paper', id);

    // Remove all citations involving this paper
    const related = await this.citations.findAll(c => c.fromPaperId === id || c.toPaperId === id);
    for (const c of related) {
      await this.citations.delete(c.id);
      // Update citation count of the other paper
      const otherId = c.fromPaperId === id ? c.toPaperId : c.fromPaperId;
      const other = await this.papers.findById(otherId);
      if (other && c.toPaperId !== id) {
        // Only decrement if this citation was pointing TO the other paper
      }
      if (other && c.toPaperId === otherId) {
        await this.papers.update(otherId, { citationCount: Math.max(0, other.citationCount - 1), updatedAt: new Date().toISOString() });
      }
    }

    // Remove from all reading lists
    const allLists = await this.readingLists.findAll(rl => rl.paperIds.includes(id));
    for (const rl of allLists) {
      await this.readingLists.update(rl.id, {
        paperIds: rl.paperIds.filter(pid => pid !== id),
        updatedAt: new Date().toISOString(),
      });
    }

    await this.papers.delete(id);
    this.logger.info('Paper deleted', { paperId: id });
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async searchPapers(query: string, limit = 20): Promise<SearchResult[]> {
    if (!query?.trim()) throw new ValidationError('Search query is required');
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const all = await this.papers.findAll();
    const results: SearchResult[] = [];

    for (const paper of all) {
      let score = 0;
      const matchedFields: string[] = [];
      const titleLower = paper.title.toLowerCase();
      const abstractLower = paper.abstract.toLowerCase();
      const authorNames = paper.authors.map(a => a.name.toLowerCase()).join(' ');

      for (const term of terms) {
        if (titleLower.includes(term)) {
          score += 3;
          if (!matchedFields.includes('title')) matchedFields.push('title');
        }
        if (abstractLower.includes(term)) {
          score += 1;
          if (!matchedFields.includes('abstract')) matchedFields.push('abstract');
        }
        if (paper.tags.some(t => t.includes(term))) {
          score += 2;
          if (!matchedFields.includes('tags')) matchedFields.push('tags');
        }
        if (authorNames.includes(term)) {
          score += 2;
          if (!matchedFields.includes('authors')) matchedFields.push('authors');
        }
      }

      if (score > 0) results.push({ paper, score, matchedFields });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ── Citations ─────────────────────────────────────────────────────────────

  async addCitation(fromPaperId: string, toPaperId: string, context?: string): Promise<Citation> {
    if (fromPaperId === toPaperId) throw new ValidationError('A paper cannot cite itself');

    const [from, to] = await Promise.all([
      this.papers.findById(fromPaperId),
      this.papers.findById(toPaperId),
    ]);
    if (!from) throw new NotFoundError('Paper', fromPaperId);
    if (!to) throw new NotFoundError('Paper', toPaperId);

    // Duplicate check
    const existing = await this.citations.findAll(c => c.fromPaperId === fromPaperId && c.toPaperId === toPaperId);
    if (existing.length > 0) throw new ConflictError(`Citation from '${fromPaperId}' to '${toPaperId}' already exists`);

    // Cycle detection: if adding from→to would create a cycle
    if (await this._wouldCreateCycle(fromPaperId, toPaperId)) {
      throw new ValidationError(`Adding citation from '${fromPaperId}' to '${toPaperId}' would create a cycle`);
    }

    const now = new Date().toISOString();
    const citation: CitationRecord = {
      id: randomUUID(),
      fromPaperId,
      toPaperId,
      context,
      createdAt: now,
    };

    await this.citations.insert(citation);
    await this.papers.update(toPaperId, {
      citationCount: to.citationCount + 1,
      updatedAt: now,
    });

    this.logger.info('Citation added', { from: fromPaperId, to: toPaperId });
    return citation;
  }

  private async _wouldCreateCycle(fromId: string, toId: string): Promise<boolean> {
    // DFS: can we reach fromId starting from toId?
    const visited = new Set<string>();
    const stack = [toId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      const outgoing = await this.citations.findAll(c => c.fromPaperId === current);
      for (const c of outgoing) stack.push(c.toPaperId);
    }
    return false;
  }

  async getCitations(paperId: string): Promise<Citation[]> {
    await this.getPaper(paperId); // throws if not found
    return this.citations.findAll(c => c.fromPaperId === paperId);
  }

  async getCitedBy(paperId: string): Promise<Citation[]> {
    await this.getPaper(paperId);
    return this.citations.findAll(c => c.toPaperId === paperId);
  }

  async buildCitationGraph(rootId: string, depth = 2): Promise<CitationGraph> {
    await this.getPaper(rootId);
    const visitedNodes = new Map<string, { id: string; title: string; citationCount: number }>();
    const edges: { from: string; to: string; context?: string }[] = [];
    const queue: Array<{ id: string; currentDepth: number }> = [{ id: rootId, currentDepth: 0 }];
    const processed = new Set<string>();

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      if (processed.has(id)) continue;
      processed.add(id);

      const paper = await this.papers.findById(id);
      if (!paper) continue;
      visitedNodes.set(id, { id, title: paper.title, citationCount: paper.citationCount });

      if (currentDepth < depth) {
        const outgoing = await this.citations.findAll(c => c.fromPaperId === id);
        for (const c of outgoing) {
          edges.push({ from: c.fromPaperId, to: c.toPaperId, context: c.context });
          if (!processed.has(c.toPaperId)) {
            queue.push({ id: c.toPaperId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    return { nodes: Array.from(visitedNodes.values()), edges };
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async addTag(paperId: string, tag: string): Promise<Paper> {
    const paper = await this.getPaper(paperId);
    const normalized = tag.toLowerCase().trim();
    if (!normalized) throw new ValidationError('Tag cannot be empty');
    if (paper.tags.includes(normalized)) throw new ConflictError(`Tag '${normalized}' already exists on paper`);

    const updated = await this.papers.update(paperId, {
      tags: [...paper.tags, normalized],
      updatedAt: new Date().toISOString(),
    });
    return updated!;
  }

  async getByTag(tag: string): Promise<Paper[]> {
    const normalized = tag.toLowerCase().trim();
    return this.papers.findAll(p => p.tags.includes(normalized));
  }

  // ── Author papers ─────────────────────────────────────────────────────────

  async getAuthorPapers(authorEmail: string): Promise<Paper[]> {
    if (!authorEmail?.trim()) throw new ValidationError('Author email is required');
    const email = authorEmail.toLowerCase().trim();
    return this.papers.findAll(p => p.authors.some(a => a.email.toLowerCase() === email));
  }

  // ── Reading Lists ─────────────────────────────────────────────────────────

  async createReadingList(ownerId: string, name: string, description = ''): Promise<ReadingList> {
    if (!ownerId?.trim()) throw new ValidationError('Owner ID is required');
    if (!name?.trim()) throw new ValidationError('Reading list name is required');

    const now = new Date().toISOString();
    const rl: ReadingListRecord = {
      id: randomUUID(),
      name: name.trim(),
      description: description.trim(),
      ownerId: ownerId.trim(),
      paperIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.readingLists.insert(rl);
    return rl;
  }

  async addToReadingList(listId: string, paperId: string): Promise<ReadingList> {
    const [rl, paper] = await Promise.all([
      this.readingLists.findById(listId),
      this.papers.findById(paperId),
    ]);
    if (!rl) throw new NotFoundError('ReadingList', listId);
    if (!paper) throw new NotFoundError('Paper', paperId);
    if (rl.paperIds.includes(paperId)) throw new ConflictError(`Paper '${paperId}' already in reading list`);

    const updated = await this.readingLists.update(listId, {
      paperIds: [...rl.paperIds, paperId],
      updatedAt: new Date().toISOString(),
    });
    return updated!;
  }

  async removeFromReadingList(listId: string, paperId: string): Promise<ReadingList> {
    const rl = await this.readingLists.findById(listId);
    if (!rl) throw new NotFoundError('ReadingList', listId);
    if (!rl.paperIds.includes(paperId)) throw new NotFoundError('Paper in reading list', paperId);

    const updated = await this.readingLists.update(listId, {
      paperIds: rl.paperIds.filter(id => id !== paperId),
      updatedAt: new Date().toISOString(),
    });
    return updated!;
  }

  async getReadingList(listId: string): Promise<{ list: ReadingList; papers: Paper[] }> {
    const rl = await this.readingLists.findById(listId);
    if (!rl) throw new NotFoundError('ReadingList', listId);

    const papers: Paper[] = [];
    for (const pid of rl.paperIds) {
      const p = await this.papers.findById(pid);
      if (p) papers.push(p);
    }
    return { list: rl, papers };
  }

  // ── Recommendations ───────────────────────────────────────────────────────

  async getRecommendations(paperId: string, limit = 10): Promise<Paper[]> {
    const target = await this.getPaper(paperId);
    const all = await this.papers.findAll(p => p.id !== paperId);

    // Get papers cited by target and papers that cite target
    const outgoing = await this.citations.findAll(c => c.fromPaperId === paperId);
    const incoming = await this.citations.findAll(c => c.toPaperId === paperId);
    const relatedIds = new Set([
      ...outgoing.map(c => c.toPaperId),
      ...incoming.map(c => c.fromPaperId),
    ]);

    const scores = new Map<string, number>();

    for (const candidate of all) {
      let score = 0;

      // Tag overlap
      const sharedTags = target.tags.filter(t => candidate.tags.includes(t));
      score += sharedTags.length * 3;

      // Citation overlap: papers that cite both
      const candidateIncoming = await this.citations.findAll(c => c.toPaperId === candidate.id);
      const targetIncomingIds = new Set(incoming.map(c => c.fromPaperId));
      for (const c of candidateIncoming) {
        if (targetIncomingIds.has(c.fromPaperId)) score += 2;
      }

      // Same venue / year
      if (target.venue && candidate.venue === target.venue) score += 2;
      if (Math.abs(candidate.year - target.year) <= 2) score += 1;

      // Direct citation neighbors get a boost
      if (relatedIds.has(candidate.id)) score += 5;

      if (score > 0) scores.set(candidate.id, score);
    }

    return all
      .filter(p => scores.has(p.id))
      .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
      .slice(0, limit);
  }

  // ── Utility / test helpers ────────────────────────────────────────────────

  _reset(): void {
    this.papers.clear();
    this.citations.clear();
    this.readingLists.clear();
  }

  async _counts() {
    return {
      papers: this.papers.size,
      citations: this.citations.size,
      readingLists: this.readingLists.size,
    };
  }
}
