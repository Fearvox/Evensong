import { OrderStore } from "./store";
import { createRouter } from "./handlers";
import { serverError } from "../shared/http";

const store = new OrderStore();
const router = createRouter(store);

const server = Bun.serve({
  port: 3004,
  async fetch(req) {
    try {
      return await router(req);
    } catch {
      return serverError();
    }
  },
});

console.log(`Orders service on :${server.port}`);
export { server };
