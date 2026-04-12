import { MemoryStore } from "../shared/store";
import type { SearchDocument } from "../shared/types";
import { generateId, now } from "../shared/http";

export class SearchEngine {
  private store = new MemoryStore<SearchDocument>();
  private invertedIndex = new Map<string, Set<string>>();
  private documentTokens = new Map<string, string[]>();

  /** Tokenize text: lowercase, split on whitespace/punctuation */
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s\W]+/)
      .filter((t) => t.length > 0);
  }

  /** Add a single document to the inverted index */
  private addToIndex(id: string, text: string): void {
    const tokens = this.tokenize(text);
    this.documentTokens.set(id, tokens);
    for (const token of tokens) {
      let docSet = this.invertedIndex.get(token);
      if (!docSet) {
        docSet = new Set();
        this.invertedIndex.set(token, docSet);
      }
      docSet.add(id);
    }
  }

  /** Remove a single document from the inverted index */
  private removeFromIndex(id: string): void {
    const tokens = this.documentTokens.get(id);
    if (!tokens) return;
    for (const token of tokens) {
      const docSet = this.invertedIndex.get(token);
      if (docSet) {
        docSet.delete(id);
        if (docSet.size === 0) {
          this.invertedIndex.delete(token);
        }
      }
    }
    this.documentTokens.delete(id);
  }

  /**
   * Index a document.
   *
   * Overload 1 (store.test.ts style): content is a string — becomes doc.text and doc.content = { text }
   * Overload 2 (search.test.ts style): text is the searchable string, content is the raw data object
   */
  index(data: {
    id?: string;
    collection: string;
    content: string;
  }): SearchDocument;
  index(data: {
    id?: string;
    collection: string;
    content: Record<string, unknown>;
    text: string;
  }): SearchDocument;
  index(data: {
    id?: string;
    collection: string;
    content: string | Record<string, unknown>;
    text?: string;
  }): SearchDocument {
    const id = data.id ?? generateId();

    // If document already exists, remove old index entries
    if (this.store.has(id)) {
      this.removeFromIndex(id);
      this.store.delete(id);
    }

    let textContent: string;
    let contentObj: Record<string, unknown>;

    if (typeof data.content === "string") {
      // store.test.ts style: content is the searchable text
      textContent = data.content;
      contentObj = { text: data.content };
    } else {
      // search.test.ts style: content is the raw data, text is searchable string
      textContent = data.text ?? "";
      contentObj = data.content;
    }

    const doc: SearchDocument = {
      id,
      collection: data.collection,
      text: textContent,
      content: contentObj,
      indexedAt: now(),
    };

    this.store.create(doc);
    this.addToIndex(id, textContent);
    return doc;
  }

  /** Batch index multiple documents */
  batchIndex(
    documents: Array<{ collection: string; content: Record<string, unknown>; text: string }>,
  ): SearchDocument[] {
    return documents.map((d) => this.index(d));
  }

  /** Update a document by ID */
  update(
    id: string,
    updates: Partial<Pick<SearchDocument, "content" | "text" | "collection">>,
  ): SearchDocument | undefined {
    const existing = this.store.get(id);
    if (!existing) return undefined;

    const newText = updates.text ?? existing.text;
    const newCollection = updates.collection ?? existing.collection;
    const newContent = updates.content ?? existing.content;

    // Re-index
    this.removeFromIndex(id);
    this.store.delete(id);

    return this.index({
      id,
      collection: newCollection,
      content: newContent,
      text: newText,
    });
  }

  /**
   * Search documents using TF scoring.
   * @param query   Full-text query string
   * @param collection  Optional collection filter
   * @param limitOrPage  When called as search(q, col, limit) this is the limit (store.test.ts style).
   *                     When called as search(q, col, page, pageSize) this is the page number (search.test.ts style).
   * @param pageSize     Page size for pagination (search.test.ts style)
   */
  search(
    query: string,
    collection?: string,
    limitOrPage?: number,
    pageSize?: number,
  ): { results: SearchDocument[]; total: number } {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      return { results: [], total: 0 };
    }

    // Find candidate document IDs from inverted index
    const candidateIds = new Set<string>();
    for (const token of queryTokens) {
      const docSet = this.invertedIndex.get(token);
      if (docSet) {
        for (const id of docSet) {
          candidateIds.add(id);
        }
      }
    }

    // Score each candidate
    const scored: SearchDocument[] = [];
    for (const id of candidateIds) {
      const doc = this.store.get(id);
      if (!doc) continue;
      if (collection && doc.collection !== collection) continue;

      const tokens = this.documentTokens.get(id);
      if (!tokens || tokens.length === 0) continue;

      // TF scoring: sum of (occurrences of query term / total terms)
      let score = 0;
      for (const qt of queryTokens) {
        const occurrences = tokens.filter((t) => t === qt).length;
        score += occurrences / tokens.length;
      }

      scored.push({ ...doc, score });
    }

    // Sort by score descending
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const total = scored.length;

    if (pageSize !== undefined) {
      // Pagination mode: limitOrPage is the page number (1-based)
      const page = limitOrPage ?? 1;
      const start = (page - 1) * pageSize;
      const results = scored.slice(start, start + pageSize);
      return { results, total };
    } else if (limitOrPage !== undefined) {
      // Limit mode: limitOrPage is max results
      const results = scored.slice(0, limitOrPage);
      return { results, total };
    } else {
      return { results: scored, total };
    }
  }

  /** Get a document by ID */
  get(id: string): SearchDocument | undefined {
    return this.store.get(id);
  }

  /** Get all documents, optionally filtered by collection */
  getAll(collection?: string): SearchDocument[] {
    if (collection) {
      return this.store.find((d) => d.collection === collection);
    }
    return this.store.getAll();
  }

  /** Delete a document by ID */
  delete(id: string): boolean {
    this.removeFromIndex(id);
    return this.store.delete(id);
  }

  /** Autocomplete: find indexed words starting with prefix */
  autocomplete(prefix: string, collection?: string, limit?: number): string[] {
    const p = prefix.toLowerCase();
    if (p.length === 0) return [];

    let words: string[];

    if (collection) {
      // Only consider words from documents in the specified collection
      const collectionDocIds = new Set(
        this.store.find((d) => d.collection === collection).map((d) => d.id),
      );
      const wordSet = new Set<string>();
      for (const docId of collectionDocIds) {
        const tokens = this.documentTokens.get(docId);
        if (tokens) {
          for (const token of tokens) {
            if (token.startsWith(p)) {
              wordSet.add(token);
            }
          }
        }
      }
      words = Array.from(wordSet);
    } else {
      words = [];
      for (const word of this.invertedIndex.keys()) {
        if (word.startsWith(p)) {
          words.push(word);
        }
      }
    }

    words.sort();
    return limit && limit > 0 ? words.slice(0, limit) : words;
  }

  /**
   * Get all unique collections with document counts.
   * Returns a plain object { collectionName: count } as expected by store.test.ts.
   */
  collections(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const doc of this.store.getAll()) {
      counts[doc.collection] = (counts[doc.collection] ?? 0) + 1;
    }
    return counts;
  }

  /** Delete all documents in a collection */
  deleteCollection(name: string): number {
    const docs = this.store.find((d) => d.collection === name);
    for (const doc of docs) {
      this.removeFromIndex(doc.id);
      this.store.delete(doc.id);
    }
    return docs.length;
  }

  /** Get search statistics */
  stats(): {
    totalDocuments: number;
    totalCollections: number;
    indexSize: number;
  } {
    const allDocs = this.store.getAll();
    const collectionsObj = this.collections();
    return {
      totalDocuments: allDocs.length,
      totalCollections: Object.keys(collectionsObj).length,
      indexSize: this.invertedIndex.size,
    };
  }

  /** Reindex all documents (rebuild inverted index entries) */
  reindex(): { reindexed: number } {
    const docs = this.store.getAll();
    for (const doc of docs) {
      this.removeFromIndex(doc.id);
      this.addToIndex(doc.id, doc.text);
    }
    return { reindexed: docs.length };
  }

  /** Total document count */
  count(): number {
    return this.store.count();
  }

  /** Clear all data */
  clear(): void {
    this.store.clear();
    this.invertedIndex.clear();
    this.documentTokens.clear();
  }
}

// Module-level singleton for the HTTP handler
let _engine = new SearchEngine();

export function getEngine(): SearchEngine {
  return _engine;
}

export function resetStore(): void {
  _engine = new SearchEngine();
}

// Alias for integration tests
export const searchStore = { clear: resetStore, getEngine };
