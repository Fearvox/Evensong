import { describe, test, expect, beforeEach } from "bun:test";
import { SearchEngine } from "../store";

let engine: SearchEngine;

beforeEach(() => {
  engine = new SearchEngine();
});

describe("SearchEngine — tokenize", () => {
  test("lowercases and splits on whitespace", () => {
    const tokens = engine.tokenize("Hello World");
    expect(tokens).toEqual(["hello", "world"]);
  });

  test("splits on punctuation", () => {
    const tokens = engine.tokenize("foo-bar, baz.qux!");
    expect(tokens).toEqual(["foo", "bar", "baz", "qux"]);
  });

  test("returns empty array for empty string", () => {
    expect(engine.tokenize("")).toEqual([]);
  });

  test("handles multiple spaces and special chars", () => {
    const tokens = engine.tokenize("  one   two\tthree\nfour  ");
    expect(tokens).toEqual(["one", "two", "three", "four"]);
  });
});

describe("SearchEngine — index", () => {
  test("indexes a document and returns it", () => {
    const doc = engine.index({ collection: "articles", content: "hello world" });
    expect(doc.id).toBeDefined();
    expect(doc.collection).toBe("articles");
    expect(doc.text).toBe("hello world");
    expect(doc.content).toEqual({ text: "hello world" });
    expect(doc.indexedAt).toBeDefined();
  });

  test("uses provided id when given", () => {
    const doc = engine.index({ id: "custom-1", collection: "articles", content: "test" });
    expect(doc.id).toBe("custom-1");
  });

  test("generates unique id when not provided", () => {
    const d1 = engine.index({ collection: "a", content: "one" });
    const d2 = engine.index({ collection: "a", content: "two" });
    expect(d1.id).not.toBe(d2.id);
  });

  test("re-indexing same id replaces old document", () => {
    engine.index({ id: "doc1", collection: "a", content: "old content" });
    engine.index({ id: "doc1", collection: "a", content: "new content" });
    expect(engine.count()).toBe(1);
    const doc = engine.get("doc1");
    expect(doc?.text).toBe("new content");
  });

  test("re-indexing updates inverted index correctly", () => {
    engine.index({ id: "doc1", collection: "a", content: "alpha beta" });
    engine.index({ id: "doc1", collection: "a", content: "gamma delta" });
    // "alpha" should no longer match
    const r1 = engine.search("alpha");
    expect(r1.total).toBe(0);
    // "gamma" should match
    const r2 = engine.search("gamma");
    expect(r2.total).toBe(1);
  });
});

describe("SearchEngine — search (TF scoring)", () => {
  test("finds documents matching query terms", () => {
    engine.index({ collection: "a", content: "the quick brown fox" });
    engine.index({ collection: "a", content: "the lazy dog" });
    const result = engine.search("fox");
    expect(result.total).toBe(1);
    expect(result.results[0].text).toBe("the quick brown fox");
  });

  test("returns empty results for non-matching query", () => {
    engine.index({ collection: "a", content: "hello world" });
    const result = engine.search("unicorn");
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });

  test("returns empty results for empty query", () => {
    engine.index({ collection: "a", content: "hello world" });
    const result = engine.search("");
    expect(result.total).toBe(0);
  });

  test("ranks higher TF documents first", () => {
    // doc1: "cat" appears 3/4 = 0.75 TF
    engine.index({ id: "high", collection: "a", content: "cat cat cat dog" });
    // doc2: "cat" appears 1/4 = 0.25 TF
    engine.index({ id: "low", collection: "a", content: "cat dog fish bird" });
    const result = engine.search("cat");
    expect(result.total).toBe(2);
    expect(result.results[0].id).toBe("high");
    expect(result.results[1].id).toBe("low");
    expect(result.results[0].score!).toBeGreaterThan(result.results[1].score!);
  });

  test("multi-word query sums TF scores", () => {
    engine.index({ id: "d1", collection: "a", content: "apple banana cherry" });
    engine.index({ id: "d2", collection: "a", content: "apple apple banana" });
    // query "apple banana": d2 apple TF=2/3, banana TF=1/3 => 1.0
    // d1 apple TF=1/3, banana TF=1/3 => 0.667
    const result = engine.search("apple banana");
    expect(result.results[0].id).toBe("d2");
  });

  test("collection filter restricts results", () => {
    engine.index({ collection: "blog", content: "javascript tutorial" });
    engine.index({ collection: "docs", content: "javascript reference" });
    const result = engine.search("javascript", "blog");
    expect(result.total).toBe(1);
    expect(result.results[0].collection).toBe("blog");
  });

  test("limit restricts number of results", () => {
    engine.index({ collection: "a", content: "test document one" });
    engine.index({ collection: "a", content: "test document two" });
    engine.index({ collection: "a", content: "test document three" });
    const result = engine.search("test", undefined, 2);
    expect(result.results.length).toBe(2);
    expect(result.total).toBe(3);
  });

  test("score is a positive number for matching documents", () => {
    engine.index({ collection: "a", content: "hello world" });
    const result = engine.search("hello");
    expect(result.results[0].score).toBeGreaterThan(0);
  });
});

describe("SearchEngine — get / getAll / delete", () => {
  test("get returns document by id", () => {
    const doc = engine.index({ id: "x", collection: "a", content: "hello" });
    const fetched = engine.get("x");
    expect(fetched?.id).toBe("x");
    expect(fetched?.text).toBe("hello");
  });

  test("get returns undefined for missing id", () => {
    expect(engine.get("nonexistent")).toBeUndefined();
  });

  test("getAll returns all documents", () => {
    engine.index({ collection: "a", content: "one" });
    engine.index({ collection: "b", content: "two" });
    expect(engine.getAll().length).toBe(2);
  });

  test("getAll with collection filter", () => {
    engine.index({ collection: "a", content: "one" });
    engine.index({ collection: "b", content: "two" });
    engine.index({ collection: "a", content: "three" });
    const filtered = engine.getAll("a");
    expect(filtered.length).toBe(2);
    for (const d of filtered) {
      expect(d.collection).toBe("a");
    }
  });

  test("delete removes document and returns true", () => {
    engine.index({ id: "d1", collection: "a", content: "hello world" });
    expect(engine.delete("d1")).toBe(true);
    expect(engine.get("d1")).toBeUndefined();
    expect(engine.count()).toBe(0);
  });

  test("delete cleans up inverted index", () => {
    engine.index({ id: "d1", collection: "a", content: "unique_word" });
    engine.delete("d1");
    const result = engine.search("unique_word");
    expect(result.total).toBe(0);
  });

  test("delete returns false for non-existent id", () => {
    expect(engine.delete("nope")).toBe(false);
  });
});

describe("SearchEngine — autocomplete", () => {
  test("returns words starting with prefix", () => {
    engine.index({ collection: "a", content: "javascript java json" });
    const suggestions = engine.autocomplete("ja");
    expect(suggestions).toContain("java");
    expect(suggestions).toContain("javascript");
    expect(suggestions).not.toContain("json");
  });

  test("returns empty for empty prefix", () => {
    engine.index({ collection: "a", content: "hello world" });
    expect(engine.autocomplete("")).toEqual([]);
  });

  test("results are sorted alphabetically", () => {
    engine.index({ collection: "a", content: "banana blueberry blackberry" });
    const suggestions = engine.autocomplete("b");
    expect(suggestions).toEqual(["banana", "blackberry", "blueberry"]);
  });

  test("respects limit parameter", () => {
    engine.index({ collection: "a", content: "ant apple avocado artichoke" });
    const suggestions = engine.autocomplete("a", undefined, 2);
    expect(suggestions.length).toBe(2);
  });

  test("filters by collection", () => {
    engine.index({ collection: "fruits", content: "apple apricot" });
    engine.index({ collection: "animals", content: "antelope albatross" });
    const suggestions = engine.autocomplete("a", "fruits");
    expect(suggestions).toContain("apple");
    expect(suggestions).toContain("apricot");
    expect(suggestions).not.toContain("antelope");
  });

  test("returns no duplicates", () => {
    engine.index({ collection: "a", content: "hello hello hello" });
    const suggestions = engine.autocomplete("he");
    expect(suggestions).toEqual(["hello"]);
  });
});

describe("SearchEngine — collections", () => {
  test("returns collection counts", () => {
    engine.index({ collection: "blog", content: "one" });
    engine.index({ collection: "blog", content: "two" });
    engine.index({ collection: "docs", content: "three" });
    const colls = engine.collections();
    expect(colls["blog"]).toBe(2);
    expect(colls["docs"]).toBe(1);
  });

  test("returns empty object when no documents", () => {
    expect(engine.collections()).toEqual({});
  });
});

describe("SearchEngine — stats", () => {
  test("reports correct statistics", () => {
    engine.index({ collection: "a", content: "hello world" });
    engine.index({ collection: "b", content: "foo bar baz" });
    const stats = engine.stats();
    expect(stats.totalDocuments).toBe(2);
    expect(stats.totalCollections).toBe(2);
    expect(stats.indexSize).toBeGreaterThan(0);
  });

  test("empty engine has zero stats", () => {
    const stats = engine.stats();
    expect(stats.totalDocuments).toBe(0);
    expect(stats.totalCollections).toBe(0);
    expect(stats.indexSize).toBe(0);
  });
});

describe("SearchEngine — reindex", () => {
  test("rebuilds inverted index and returns count", () => {
    engine.index({ id: "d1", collection: "a", content: "hello world" });
    engine.index({ id: "d2", collection: "a", content: "foo bar" });
    const result = engine.reindex();
    expect(result.reindexed).toBe(2);
  });

  test("search still works after reindex", () => {
    engine.index({ collection: "a", content: "unique term here" });
    engine.reindex();
    const result = engine.search("unique");
    expect(result.total).toBe(1);
  });
});

describe("SearchEngine — clear", () => {
  test("removes all documents and index data", () => {
    engine.index({ collection: "a", content: "hello" });
    engine.index({ collection: "b", content: "world" });
    engine.clear();
    expect(engine.count()).toBe(0);
    expect(engine.getAll().length).toBe(0);
    expect(engine.search("hello").total).toBe(0);
  });
});
