// Vitest config for live-database integration tests. Run via `npm run test:integration`.
// Each test loads .env.local internally so DATABASE_URL is available.

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules/**', '.claude/**'],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
