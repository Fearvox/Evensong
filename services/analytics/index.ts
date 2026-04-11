import { createApp } from './app';
const app = createApp();
Bun.serve({ port: 3007, fetch: app });
console.log('Analytics service running on :3007');
