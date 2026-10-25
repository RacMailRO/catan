import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
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
    hmr: {
      protocol: 'ws'
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  }
});
