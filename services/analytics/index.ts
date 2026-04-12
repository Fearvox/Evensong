import { handleRequest } from "./handlers";
import { serverError } from "../shared/http";

const server = Bun.serve({
  port: 3007,
  async fetch(req) {
    try {
      return await handleRequest(req);
    } catch {
      return serverError();
    }
  },
});

console.log(`Analytics service on :${server.port}`);
export { server };
