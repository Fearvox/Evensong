import { createApp } from './app';
const app = createApp();
Bun.serve({ port: 3001, fetch: app });
console.log('Auth service running on :3001');
