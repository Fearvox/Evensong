import { createApp } from './app';
const app = createApp();
Bun.serve({ port: 3003, fetch: app });
console.log('Products service running on :3003');
