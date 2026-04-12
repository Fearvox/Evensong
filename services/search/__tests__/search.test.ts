import { describe, it, expect, beforeEach } from "bun:test";
import { handleRequest } from "../handlers";
import { resetStore } from "../store";

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return new Request(`http://localhost:3008${path}`, opts);
}

async function json(r: Response) {
  return r.json();
}

async function indexDoc(collection: string, content: Record<string, unknown>, text: string) {
  const res = await handleRequest(req("POST", "/search/index", { collection, content, text }));
  const body = await json(res);
  return body.data;
}

describe("Search Service", () => {
  beforeEach(() => resetStore());

  // --- Index ---

  describe("POST /search/index", () => {
    it("indexes a single document", async () => {
      const res = await handleRequest(req("POST", "/search/index", {
        collection: "articles",
        content: { title: "Hello World" },
        text: "hello world introduction",
      }));
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.success).toBe(true);
      expect(body.data.collection).toBe("articles");
      expect(body.data.content.title).toBe("Hello World");
      expect(body.data.id).toBeDefined();
      expect(body.data.indexedAt).toBeDefined();
    });

    it("rejects missing collection", async () => {
      const res = await handleRequest(req("POST", "/search/index", {
        content: { title: "X" },
        text: "hello",
      }));
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("collection");
    });

    it("rejects missing text", async () => {
      const res = await handleRequest(req("POST", "/search/index", {
        collection: "articles",
        content: { title: "X" },
      }));
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("text");
    });

    it("rejects missing content", async () => {
      const res = await handleRequest(req("POST", "/search/index", {
        collection: "articles",
        text: "hello",
      }));
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("content");
    });

    it("rejects empty body", async () => {
      const res = await handleRequest(new Request("http://localhost:3008/search/index", { method: "POST" }));
      expect(res.status).toBe(400);
    });
  });

  // --- Batch Index ---

  describe("POST /search/index/batch", () => {
    it("indexes multiple documents", async () => {
      const res = await handleRequest(req("POST", "/search/index/batch", {
        documents: [
          { collection: "articles", content: { title: "A" }, text: "alpha article" },
          { collection: "articles", content: { title: "B" }, text: "beta article" },
        ],
      }));
      expect(res.status).toBe(201);
      const body = await json(res);
      expect(body.data.indexed).toBe(2);
      expect(body.data.documents).toHaveLength(2);
    });

    it("rejects empty documents array", async () => {
      const res = await handleRequest(req("POST", "/search/index/batch", { documents: [] }));
      expect(res.status).toBe(400);
    });

    it("rejects non-array documents", async () => {
      const res = await handleRequest(req("POST", "/search/index/batch", { documents: "bad" }));
      expect(res.status).toBe(400);
    });

    it("validates each document in batch", async () => {
      const res = await handleRequest(req("POST", "/search/index/batch", {
        documents: [{ collection: "articles", content: { title: "A" }  }],
      }));
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("text");
    });
  });

  // --- Full-text Search ---

  describe("GET /search", () => {
    it("searches by single term", async () => {
      await indexDoc("articles", { title: "TypeScript Guide" }, "typescript programming language guide");
      await indexDoc("articles", { title: "Cooking" }, "recipes for cooking pasta");

      const res = await handleRequest(req("GET", "/search?q=typescript"));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].content.title).toBe("TypeScript Guide");
      expect(body.data[0].score).toBeGreaterThan(0);
    });

    it("searches by multiple terms", async () => {
      await indexDoc("articles", { title: "TS" }, "typescript programming");
      await indexDoc("articles", { title: "JS" }, "javascript programming");

      const res = await handleRequest(req("GET", "/search?q=typescript+programming"));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty for no matches", async () => {
      await indexDoc("articles", { title: "A" }, "hello world");
      const res = await handleRequest(req("GET", "/search?q=nonexistent"));
      const body = await json(res);
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it("filters by collection", async () => {
      await indexDoc("articles", { title: "A" }, "typescript guide");
      await indexDoc("docs", { title: "B" }, "typescript reference");

      const res = await handleRequest(req("GET", "/search?q=typescript&collection=docs"));
      const body = await json(res);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].collection).toBe("docs");
    });

    it("searches across all collections by default", async () => {
      await indexDoc("articles", { title: "A" }, "typescript");
      await indexDoc("docs", { title: "B" }, "typescript");

      const res = await handleRequest(req("GET", "/search?q=typescript"));
      const body = await json(res);
      expect(body.data).toHaveLength(2);
    });

    it("returns higher TF scores first", async () => {
      await indexDoc("articles", { title: "Low" }, "typescript is great and many other words here today");
      await indexDoc("articles", { title: "High" }, "typescript typescript typescript");

      const res = await handleRequest(req("GET", "/search?q=typescript"));
      const body = await json(res);
      expect(body.data[0].content.title).toBe("High");
      expect(body.data[0].score).toBeGreaterThan(body.data[1].score);
    });

    it("rejects empty query", async () => {
      const res = await handleRequest(req("GET", "/search?q="));
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("q");
    });

    it("supports pagination", async () => {
      for (let i = 0; i < 5; i++) {
        await indexDoc("articles", { title: `Doc ${i}` }, "common term");
      }
      const res = await handleRequest(req("GET", "/search?q=common&page=1&pageSize=2"));
      const body = await json(res);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(5);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(2);
    });

    it("returns empty for search on empty index", async () => {
      const res = await handleRequest(req("GET", "/search?q=anything"));
      const body = await json(res);
      expect(body.data).toHaveLength(0);
    });
  });

  // --- Autocomplete ---

  describe("GET /search/autocomplete", () => {
    it("returns prefix matches", async () => {
      await indexDoc("articles", { title: "A" }, "typescript programming language");
      const res = await handleRequest(req("GET", "/search/autocomplete?q=type"));
      const body = await json(res);
      expect(body.data).toContain("typescript");
    });

    it("returns empty for no prefix match", async () => {
      await indexDoc("articles", { title: "A" }, "hello world");
      const res = await handleRequest(req("GET", "/search/autocomplete?q=xyz"));
      const body = await json(res);
      expect(body.data).toHaveLength(0);
    });

    it("filters by collection", async () => {
      await indexDoc("articles", { title: "A" }, "typescript guide");
      await indexDoc("docs", { title: "B" }, "typeset reference");

      const res = await handleRequest(req("GET", "/search/autocomplete?q=type&collection=articles"));
      const body = await json(res);
      expect(body.data).toContain("typescript");
      expect(body.data).not.toContain("typeset");
    });

    it("respects limit", async () => {
      await indexDoc("articles", {}, "alpha apple avocado artichoke almond");
      const res = await handleRequest(req("GET", "/search/autocomplete?q=a&limit=2"));
      const body = await json(res);
      expect(body.data.length).toBeLessThanOrEqual(2);
    });

    it("returns empty for empty prefix", async () => {
      await indexDoc("articles", {}, "hello");
      const res = await handleRequest(req("GET", "/search/autocomplete?q="));
      const body = await json(res);
      expect(body.data).toHaveLength(0);
    });
  });

  // --- Health ---

  describe("GET /search/health", () => {
    it("returns health status", async () => {
      const res = await handleRequest(req("GET", "/search/health"));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.status).toBe("ok");
      expect(body.data.service).toBe("search");
    });
  });
});
