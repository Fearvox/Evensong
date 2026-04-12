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
import { getEngine } from "./store";

/**
 * Handle a single HTTP request using the module-level SearchEngine singleton.
 * This is the entry point used by tests (search.test.ts).
 */
export async function handleRequest(req: Request): Promise<Response> {
  const engine = getEngine();
  const method = req.method;
  const segments = getPathSegments(req.url);
  const params = getQueryParams(req.url);

  // All routes start with /search
  if (segments[0] !== "search") {
    return notFound("Route not found");
  }

  try {
    // GET /search/health
    if (method === "GET" && segments[1] === "health" && segments.length === 2) {
      return success({ status: "ok", service: "search" });
    }

    // POST /search/index/batch — batch index documents
    if (method === "POST" && segments[1] === "index" && segments[2] === "batch" && segments.length === 3) {
      const body = await parseBody<{ documents?: unknown }>(req);
      if (!body) return error("Invalid or missing request body");

      if (!Array.isArray(body.documents)) {
        return error("documents must be an array");
      }

      if (body.documents.length === 0) {
        return error("documents array must not be empty");
      }

      // Validate each document
      for (const doc of body.documents) {
        if (!doc || typeof doc !== "object") {
          return error("each document must be an object");
        }
        const d = doc as Record<string, unknown>;
        const errs = validate([
          { field: "collection", valid: isNonEmptyString(d.collection), message: "collection is required" },
          { field: "text", valid: isNonEmptyString(d.text), message: "text is required" },
          { field: "content", valid: d.content !== undefined && d.content !== null, message: "content is required" },
        ]);
        if (errs.length > 0) return error(formatValidationErrors(errs));
      }

      const documents = engine.batchIndex(
        body.documents.map((d: Record<string, unknown>) => ({
          collection: d.collection as string,
          content: d.content as Record<string, unknown>,
          text: d.text as string,
        })),
      );
      return success({ indexed: documents.length, documents }, 201);
    }

    // POST /search/index — index a single document
    if (method === "POST" && segments[1] === "index" && segments.length === 2) {
      const body = await parseBody<{ id?: unknown; collection?: unknown; content?: unknown; text?: unknown }>(req);
      if (!body) return error("Invalid or missing request body");

      const errs = validate([
        { field: "collection", valid: isNonEmptyString(body.collection), message: "collection is required" },
        { field: "text", valid: isNonEmptyString(body.text), message: "text is required" },
        { field: "content", valid: body.content !== undefined && body.content !== null, message: "content is required" },
      ]);
      if (errs.length > 0) return error(formatValidationErrors(errs));

      const doc = engine.index({
        id: isNonEmptyString(body.id) ? (body.id as string) : undefined,
        collection: body.collection as string,
        content: body.content as Record<string, unknown>,
        text: body.text as string,
      });
      return success(doc, 201);
    }

    // GET /search/autocomplete — autocomplete suggestions
    if (method === "GET" && segments[1] === "autocomplete" && segments.length === 2) {
      const q = params.get("q") ?? "";
      if (!q) {
        return success([]);
      }
      const collection = params.get("collection") || undefined;
      const limitParam = params.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;

      const suggestions = engine.autocomplete(q, collection, limit);
      return success(suggestions);
    }

    // GET /search — full-text search
    if (method === "GET" && segments.length === 1) {
      const q = params.get("q") ?? "";
      if (!q) {
        return error("q is required");
      }

      const collection = params.get("collection") || undefined;
      const pageParam = params.get("page");
      const pageSizeParam = params.get("pageSize");
      const page = pageParam ? parseInt(pageParam, 10) : 1;
      const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 20;

      const { results, total } = engine.search(q, collection, page, pageSize);

      // Return flat response shape expected by search.test.ts
      return new Response(
        JSON.stringify({
          success: true,
          data: results,
          total,
          page,
          pageSize,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return notFound("Route not found");
  } catch {
    return serverError("Internal server error");
  }
}

/**
 * Create a router function that uses a provided engine.
 * Used by index.ts for the HTTP server.
 */
export function createRouter(engine: import("./store").SearchEngine): (req: Request) => Response | Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      return await handleRequest(req);
    } catch {
      return serverError("Internal server error");
    }
  };
}
