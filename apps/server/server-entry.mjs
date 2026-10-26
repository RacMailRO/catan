// Startup entry for hosts that run this app with plain `node` (e.g. cPanel's "Setup Node.js App",
// Phusion Passenger, LiteSpeed, or systemd/PM2).
//
// Automatically uses the pre-bundled production server (dist/server.mjs) when available,
// running directly with native Node.js and zero dependencies on runtime compilers (tsx / esbuild).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distBundle = path.resolve(__dirname, 'dist/server.mjs');

if (fs.existsSync(distBundle)) {
  await import('./dist/server.mjs');
} else {
  // Development fallback via tsx
  const { register } = await import('tsx/esm/api');
  register();
  await import('./src/cli-server.ts');
}
