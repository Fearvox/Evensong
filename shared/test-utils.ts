// Test utilities for service testing

type AppHandler = (req: Request) => Promise<Response>;

export interface TestResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

export async function request<T = any>(
  app: AppHandler,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<TestResponse<T>> {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await app(new Request(`http://test${path}`, init));
  let data: any;
  const ct = response.headers.get('content-type');
  if (ct?.includes('json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }
  return { status: response.status, data, headers: response.headers };
}

export async function get<T = any>(app: AppHandler, path: string, headers?: Record<string, string>) {
  return request<T>(app, 'GET', path, undefined, headers);
}

export async function post<T = any>(app: AppHandler, path: string, body?: unknown, headers?: Record<string, string>) {
  return request<T>(app, 'POST', path, body, headers);
}

export async function put<T = any>(app: AppHandler, path: string, body?: unknown, headers?: Record<string, string>) {
  return request<T>(app, 'PUT', path, body, headers);
}

export async function patch<T = any>(app: AppHandler, path: string, body?: unknown, headers?: Record<string, string>) {
  return request<T>(app, 'PATCH', path, body, headers);
}

export async function del<T = any>(app: AppHandler, path: string, headers?: Record<string, string>) {
  return request<T>(app, 'DELETE', path, undefined, headers);
}
