import { createApp } from './app';
const app = createApp();
Bun.serve({ port: 3008, fetch: app });
console.log('Search service running on :3008');
