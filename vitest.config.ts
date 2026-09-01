import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';
import { parse as parseEnv } from 'dotenv';

// Make ONLY DATABASE_URL available to the unit run. Several modules import
// @/lib/db at eval time and throw when DATABASE_URL is unset, which otherwise
// fails those tests purely on environment rather than logic. We deliberately do
// NOT load the rest of .env.local (API keys) — doing so lets un-mocked fetchers
// make real network calls and flake the suite. Unit tests mock prisma, so no
// real DB connection is opened; this only satisfies the import-time guard.
if (!process.env.DATABASE_URL) {
  try {
    const parsed = parseEnv(readFileSync(path.resolve(__dirname, '.env.local')));
    if (parsed.DATABASE_URL) process.env.DATABASE_URL = parsed.DATABASE_URL;
  } catch {
    /* .env.local absent (e.g. CI) — DATABASE_URL is expected from the real env */
  }
}

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
      // tests/playwright/** are @playwright/test specs run via `npm run test:e2e`,
      // not vitest — exclude so vitest doesn't mis-collect them (they import
      // '@playwright/test', which throws under the vitest runner).
      'tests/playwright/**',
      'tests/integration/**',
      'node_modules/**',
      '.claude/**',
      'src/app/api/**/__tests__/**/*.live.test.ts',
      'src/lib/data/yahoo.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
