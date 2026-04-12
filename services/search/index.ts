import { SearchEngine } from "./store";
import { createRouter } from "./handlers";
import { serverError } from "../shared/http";

const engine = new SearchEngine();
const router = createRouter(engine);

const server = Bun.serve({
  port: 3008,
  async fetch(req) {
    try {
      return await router(req);
    } catch {
      return serverError();
    }
  },
});

console.log(`Search service on :${server.port}`);
export { server };
