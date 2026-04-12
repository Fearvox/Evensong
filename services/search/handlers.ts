import {
  success,
  error,
  notFound,
  serverError,
  parseBody,
  getPathSegments,
  getQueryParams,
} from "../shared/http";
import { isNonEmptyString, validate, formatValidationErrors } from "../shared/validation";
import type { SearchEngine } from "./store";

export function createRouter(engine: SearchEngine): (req: Request) => Response | Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const method = req.method;
    const segments = getPathSegments(req.url);
    const params = getQueryParams(req.url);

    // All routes start with /search
    if (segments[0] !== "search") {
      return notFound("Route not found");
    }

    try {
      // POST /search/index — index a document
      if (method === "POST" && segments[1] === "index" && segments.length === 2) {
        const body = await parseBody<{ id?: unknown; collection?: unknown; content?: unknown }>(req);
        if (!body) return error("Invalid or missing request body");

        const errors = validate([
          { field: "collection", valid: isNonEmptyString(body.collection), message: "collection is required" },
          { field: "content", valid: isNonEmptyString(body.content), message: "content is required and must be a non-empty string" },
        ]);
        if (errors.length > 0) return error(formatValidationErrors(errors));

        const doc = engine.index({
          id: isNonEmptyString(body.id) ? (body.id as string) : undefined,
          collection: body.collection as string,
          content: body.content as string,
        });
        return success(doc, 201);
      }

      // POST /search/query — search documents
      if (method === "POST" && segments[1] === "query" && segments.length === 2) {
        const body = await parseBody<{ query?: unknown; collection?: unknown; limit?: unknown }>(req);
        if (!body) return error("Invalid or missing request body");

        if (!isNonEmptyString(body.query)) {
          return error("query is required and must be a non-empty string");
        }

        const collection = isNonEmptyString(body.collection) ? (body.collection as string) : undefined;
        const limit = typeof body.limit === "number" && body.limit > 0 ? body.limit : undefined;

        const result = engine.search(body.query as string, collection, limit);
        return success(result);
      }

      // GET /search/documents — list all documents (with optional ?collection= filter)
      if (method === "GET" && segments[1] === "documents" && segments.length === 2) {
        const collection = params.get("collection") || undefined;
        const docs = engine.getAll(collection);
        return success(docs);
      }

      // GET /search/documents/:id — get document by id
      if (method === "GET" && segments[1] === "documents" && segments.length === 3) {
        const id = segments[2];
        const doc = engine.get(id);
        if (!doc) return notFound("Document not found");
        return success(doc);
      }

      // DELETE /search/documents/:id — remove document from index
      if (method === "DELETE" && segments[1] === "documents" && segments.length === 3) {
        const id = segments[2];
        const doc = engine.get(id);
        if (!doc) return notFound("Document not found");
        engine.delete(id);
        return success({ deleted: true, id });
      }

      // POST /search/autocomplete — autocomplete suggestions
      if (method === "POST" && segments[1] === "autocomplete" && segments.length === 2) {
        const body = await parseBody<{ prefix?: unknown; collection?: unknown; limit?: unknown }>(req);
        if (!body) return error("Invalid or missing request body");

        if (!isNonEmptyString(body.prefix)) {
          return error("prefix is required and must be a non-empty string");
        }

        const collection = isNonEmptyString(body.collection) ? (body.collection as string) : undefined;
        const limit = typeof body.limit === "number" && body.limit > 0 ? body.limit : undefined;

        const suggestions = engine.autocomplete(body.prefix as string, collection, limit);
        return success({ suggestions });
      }

      // GET /search/collections — list all collections with document counts
      if (method === "GET" && segments[1] === "collections" && segments.length === 2) {
        const collections = engine.collections();
        return success(collections);
      }

      // GET /search/stats — search statistics
      if (method === "GET" && segments[1] === "stats" && segments.length === 2) {
        const stats = engine.stats();
        return success(stats);
      }

      // POST /search/reindex — reindex all documents
      if (method === "POST" && segments[1] === "reindex" && segments.length === 2) {
        const result = engine.reindex();
        return success(result);
      }

      return notFound("Route not found");
    } catch {
      return serverError("Internal server error");
    }
  };
}
