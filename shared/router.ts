// Minimal HTTP router for Bun.serve()

type RouteParams = Record<string, string>;
type Handler = (req: Request, params: RouteParams) => Promise<Response> | Response;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  get(path: string, handler: Handler): this { return this.add('GET', path, handler); }
  post(path: string, handler: Handler): this { return this.add('POST', path, handler); }
  put(path: string, handler: Handler): this { return this.add('PUT', path, handler); }
  patch(path: string, handler: Handler): this { return this.add('PATCH', path, handler); }
  delete(path: string, handler: Handler): this { return this.add('DELETE', path, handler); }

  private add(method: string, path: string, handler: Handler): this {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({
      method,
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
      handler,
    });
    return this;
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    for (const route of this.routes) {
      if (req.method !== route.method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      const params: RouteParams = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });

      try {
        return await route.handler(req, params);
      } catch (err) {
        if (err instanceof HttpError) {
          return json({ success: false, error: err.message }, err.statusCode);
        }
        const message = err instanceof Error ? err.message : 'Internal server error';
        return json({ success: false, error: message }, 500);
      }
    }

    return json({ success: false, error: 'Not found' }, 404);
  }
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function parseBody<T = unknown>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new HttpError(400, 'Request body is required');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON in request body');
  }
}

export function getQuery(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
