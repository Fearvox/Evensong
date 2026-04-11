import { createApp } from './app';
const app = createApp();
Bun.serve({ port: 3002, fetch: app });
console.log('Users service running on :3002');
