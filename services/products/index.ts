import { handleRequest } from "./handlers";
import { serverError } from "../shared/http";

const server = Bun.serve({
  port: 3003,
  async fetch(req) {
    try {
      return await handleRequest(req);
    } catch {
      return serverError();
    }
  },
});

console.log(`Products service on :${server.port}`);
export { server };
