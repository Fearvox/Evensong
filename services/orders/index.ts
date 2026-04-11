import { createApp } from './app';
const app = createApp();
Bun.serve({ port: 3004, fetch: app });
console.log('Orders service running on :3004');
