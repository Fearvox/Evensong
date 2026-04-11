import { createApp } from './app';
const app = createApp();
Bun.serve({ port: 3005, fetch: app });
console.log('Payments service running on :3005');
