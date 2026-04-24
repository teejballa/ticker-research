// tests/e2e/db-persistence.spec.ts
// DB-QA-08: Seed report → history shows row → OPEN navigates with UUID (not filename) → report renders.
// Uses: direct DB seeding via POST /api/test/cleanup + NextAuth session cookie injection.
// No real Gemini call or full UI analysis flow — focused on the id-field fix from Plan 01.

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { test, expect } from '@playwright/test';
import { encode } from 'next-auth/jwt';

const TEST_USER_EMAIL = 'e2e-test@cipher.test';
const TEST_TICKER = 'TSLA';
const CLEANUP_SECRET = process.env.TEST_CLEANUP_SECRET ?? '';
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? '';

// Minimal fixture AnalysisResult for seeding directly into Neon
const FIXTURE_RESULT = {
  ticker: TEST_TICKER,
  company_name: 'Tesla Inc.',
  analyzed_at: new Date().toISOString(),
  market_sentiment: 'bullish' as const,
  sentiment_reasoning: 'E2E test fixture — DB persistence verification.',
  bullish_signals: [{ signal: 'E2E test signal', source_citation: 'Test fixture' }],
  bearish_signals: [{ signal: 'E2E risk signal', source_citation: 'Test fixture' }],
  assessment: {
    buy_pct: 60, hold_pct: 30, sell_pct: 10,
    buy_rationale: 'Test buy.', hold_rationale: 'Test hold.', sell_rationale: 'Test sell.',
  },
  confidence_level: 'High' as const,
  confidence_explanation: 'E2E fixture — confidence explanation.',
  sources_used: [{ name: 'E2E Test Source', key_fact: 'Test key fact for DB persistence QA' }],
  source_warnings: [],
};

test.describe('db-persistence — DB-QA-08', () => {
  let seededId: string;

  test.beforeAll(async ({ request }) => {
    // Seed fixture result directly into Neon — no UI analysis flow needed
    if (!CLEANUP_SECRET) throw new Error('TEST_CLEANUP_SECRET not set — check .env.local');
    if (!NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET not set — check .env.local');

    const res = await request.post('/api/test/cleanup', {
      headers: { 'x-test-cleanup-secret': CLEANUP_SECRET },
      data: { analysis: FIXTURE_RESULT },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { seeded: boolean; id: string };
    expect(body.seeded).toBe(true);
    expect(body.id).toBeTruthy();
    seededId = body.id;
  });

  test.afterAll(async ({ request }) => {
    // Clean up: delete all test user rows from Neon
    if (CLEANUP_SECRET) {
      await request.delete('/api/test/cleanup', {
        headers: { 'x-test-cleanup-secret': CLEANUP_SECRET },
      });
    }
  });

  test('history shows seeded report row → OPEN navigates with UUID → report renders (not 404)', async ({ browser }) => {
    // Inject NextAuth session cookie for the test user
    const ctx = await browser.newContext();

    const token = await encode({
      token: { email: TEST_USER_EMAIL, name: 'E2E Test User', sub: TEST_USER_EMAIL },
      secret: NEXTAUTH_SECRET,
    });
    await ctx.addCookies([{
      name: 'next-auth.session-token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }]);

    const page = await ctx.newPage();

    // Navigate to dashboard — ReportHistory fetches /api/history for the authenticated user
    await page.goto('/dashboard');

    // Wait for history to load (the seeded TSLA row must appear)
    await page.waitForSelector('[data-testid="history-row"]', { timeout: 15000 });

    // Find the TSLA row
    const tslaRow = page.locator('[data-testid="history-row"]').filter({ hasText: TEST_TICKER });
    await expect(tslaRow).toBeVisible();

    // Click [OPEN] — should use report.id (UUID), not a constructed filename
    const openBtn = tslaRow.locator('[data-testid="history-open-btn"]');
    await openBtn.click();

    // Verify URL contains the seeded UUID — not a filename like TSLA-2026-...
    await page.waitForURL(/\/research\/TSLA/, { timeout: 10000 });
    const url = page.url();
    expect(url).toContain(`report=${seededId}`);

    // Verify report page renders (not a 404 — main element present)
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    // Core assertion: URL must contain the seeded UUID (not a constructed filename like TSLA-2026-...)
    // This proves the id-field fix from Plan 01 — report.id is used as the nav key, not toFilename().
    expect(url).toContain(`report=${seededId}`);

    await ctx.close();
  });
});
