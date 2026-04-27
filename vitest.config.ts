import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // tests/integration/** hits a real DATABASE_URL; opt in via `npm run test:integration`.
    exclude: ['tests/e2e/**', 'tests/integration/**', 'node_modules/**', '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
