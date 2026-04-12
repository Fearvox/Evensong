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

  /** Index a document. text is the searchable string, content is the raw data object. */
  index(data: {
    id?: string;
    collection: string;
    content: Record<string, unknown>;
    text: string;
  }): SearchDocument {
    const id = data.id ?? generateId();

    // If document already exists, remove old index entries
    if (this.store.has(id)) {
      this.removeFromIndex(id);
      this.store.delete(id);
    }

    const doc: SearchDocument = {
      id,
      collection: data.collection,
      text: data.text,
      content: data.content,
      indexedAt: now(),
    };

    this.store.create(doc);
    this.addToIndex(id, data.text);
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

  /** Search documents using TF scoring */
  search(
    query: string,
    collection?: string,
    page = 1,
    pageSize = 20,
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
    const start = (page - 1) * pageSize;
    const results = scored.slice(start, start + pageSize);

    return { results, total };
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

  /** Get all unique collections with document counts */
  collections(): Array<{ name: string; documentCount: number }> {
    const counts = new Map<string, number>();
    for (const doc of this.store.getAll()) {
      counts.set(doc.collection, (counts.get(doc.collection) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, documentCount]) => ({ name, documentCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
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

  /** Faceted search: group results by a content field value */
  facets(
    field: string,
    collection?: string,
  ): Array<{ value: string; count: number }> {
    let docs = this.store.getAll();
    if (collection) {
      docs = docs.filter((d) => d.collection === collection);
    }
    const counts = new Map<string, number>();
    for (const doc of docs) {
      const value = doc.content[field];
      if (value !== undefined && value !== null) {
        const key = String(value);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Get search statistics */
  stats(): {
    totalDocuments: number;
    byCollection: Array<{ collection: string; count: number }>;
    totalIndexedTerms: number;
  } {
    const allDocs = this.store.getAll();
    const byCollection = this.collections().map((c) => ({
      collection: c.name,
      count: c.documentCount,
    }));
    return {
      totalDocuments: allDocs.length,
      byCollection,
      totalIndexedTerms: this.invertedIndex.size,
    };
  }

  /** Reindex documents in a collection (rebuild inverted index entries) */
  reindex(collection: string): number {
    const docs = this.store.find((d) => d.collection === collection);
    for (const doc of docs) {
      this.removeFromIndex(doc.id);
      this.addToIndex(doc.id, doc.text);
    }
    return docs.length;
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
