import { handleRequest } from "./handlers";
import { serverError } from "../shared/http";

const server = Bun.serve({
  port: 3005,
  async fetch(req) {
    try {
      return await handleRequest(req);
    } catch {
      return serverError();
    }
  },
});

console.log(`Payments service on :${server.port}`);
export { server };
