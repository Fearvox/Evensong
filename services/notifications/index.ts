import { createApp } from './app';
const app = createApp();
Bun.serve({ port: 3006, fetch: app });
console.log('Notifications service running on :3006');
