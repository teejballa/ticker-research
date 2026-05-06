// Vitest config for live-database integration tests. Run via `npm run test:integration`.
// Each test loads .env.local internally so DATABASE_URL is available.
//
// Phase 18: Colocated `*.live.test.ts` specs under src/app/api/**/__tests__/ are
// also included here — they hit a real DATABASE_URL and are excluded from the
// fast unit run (see vitest.config.ts). Excluded from `npm test`, included in
// `npm run test:integration`.

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'tests/integration/**/*.test.ts',
      'src/app/api/**/__tests__/**/*.live.test.ts',
    ],
    exclude: ['node_modules/**', '.claude/**'],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
