import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // tests/integration/** hits a real DATABASE_URL; opt in via `npm run test:integration`.
    // *.live.test.ts colocated under src/app/api/**/__tests__/ are also live-DB and excluded
    // from the fast unit run for the same reason (Phase 18 Wave 0 cron stubs).
    exclude: [
      'tests/e2e/**',
      'tests/integration/**',
      'node_modules/**',
      '.claude/**',
      'src/app/api/**/__tests__/**/*.live.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
