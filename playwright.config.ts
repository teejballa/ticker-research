import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Plan 20-C-04: spec lives at tests/playwright/ per plan path; existing
  // specs live under tests/e2e/. Both directories are discovered.
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'playwright/**/*.spec.ts'],
  timeout: 10 * 60 * 1000, // 10 min — full pipeline tests are slow
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },

    // Headed debug mode — run with: npx playwright test --project=debug
    // Slows down actions, shows browser, captures video, keeps open on failure.
    {
      name: 'debug',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: { slowMo: 400 },
        video: 'on',
        screenshot: 'on',
        trace: 'on',
      },
    },
  ],
  // Auto-start dev server when no BASE_URL override is provided
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run dev -- --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60 * 1000,
  },
});
