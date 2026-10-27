import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Baked into the bundle at build time, so a RUNNING page can tell when the server has a
// newer deploy than the JS it's currently executing (which /api/version alone can't show —
// that endpoint is live/server-side and updates instantly regardless of which bundle the
// browser is actually running, including a stale cached one). scripts/generate-version.mjs
// writes version.json before this config is evaluated (see package.json's "build" script).
let buildShortHash = 'dev';
try {
  const versionPath = path.resolve(__dirname, '../../version.json');
  const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
  if (typeof versionData.shortHash === 'string') buildShortHash = versionData.shortHash;
} catch {
  // Local dev without a build-time version.json yet — fine, __BUILD_HASH__ stays 'dev'.
}

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(buildShortHash)
  },
  plugins: [react()],
  publicDir: path.resolve(__dirname, '../../poze'),
  resolve: {
    alias: {
      '@catan/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@catan/ai': path.resolve(__dirname, '../../packages/ai/src/index.ts'),
      '@catan/protocol': path.resolve(__dirname, '../../packages/protocol/src/index.ts')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
