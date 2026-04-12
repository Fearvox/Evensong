// Auth microservice — Bun.serve entrypoint

import { router } from "./handlers";
import { serverError } from "../shared/http";

const PORT = Number(process.env.AUTH_PORT) || 3001;

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    try {
      return await router(req);
    } catch {
      return serverError();
    }
  },
});

console.log(`Auth service on :${server.port}`);
export { server };
