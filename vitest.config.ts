import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@catan/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@catan/ai': path.resolve(__dirname, 'packages/ai/src/index.ts'),
      '@catan/protocol': path.resolve(__dirname, 'packages/protocol/src/index.ts')
    }
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: false,
    testTimeout: 20000
  }
});
