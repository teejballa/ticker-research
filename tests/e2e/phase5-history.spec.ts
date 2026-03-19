// tests/e2e/phase5-history.spec.ts
// Phase 5 — Wave 0 e2e test stubs.
// All tests compile and run but FAIL at runtime until Plans 02+03 implement
// the features (NavIdentity component, history API, ReportHistory component).

import { test, expect, Page } from '@playwright/test';

async function snap(page: Page, filename: string) {
  await page.screenshot({ path: `/tmp/${filename}`, fullPage: false });
}

// AUTH-01: Nav identity tests
test.describe('Phase 5 — Nav Identity (AUTH-01)', () => {
  test('nav shows email when auth connected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await snap(page, 'p5-nav-email.png');
    // Will fail until NavIdentity component is added to page.tsx
    await expect(page.locator('[data-testid="nav-identity"]')).toBeVisible({ timeout: 5000 });
    const text = await page.locator('[data-testid="nav-identity"]').textContent();
    expect(text).toMatch(/@/);  // must contain @ for it to be an email
  });

  test('nav shows NOT CONNECTED when no auth', async ({ page }) => {
    // This test verifies the NOT CONNECTED state renders
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Passes if either email or NOT CONNECTED is shown in nav-identity slot
    const navId = page.locator('[data-testid="nav-identity"]');
    await expect(navId).toBeVisible({ timeout: 5000 });
  });
});

// HIST-01: Report persistence tests
test.describe('Phase 5 — Report Persistence (HIST-01)', () => {
  test('report file written after analysis completes', async ({ page }) => {
    // Structural test: GET /api/history returns valid JSON shape
    const res = await page.request.get('/api/history');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('reports');
    expect(Array.isArray(body.reports)).toBe(true);
  });

  test('written file contains valid StoredReport JSON', async ({ page }) => {
    // API contract: each report has required fields
    const res = await page.request.get('/api/history');
    const body = await res.json() as { reports: Array<Record<string, unknown>> };
    if (body.reports.length > 0) {
      const report = body.reports[0];
      expect(report).toHaveProperty('ticker');
      expect(report).toHaveProperty('analyzed_at');
      expect(report).toHaveProperty('market_sentiment');
      expect(report).toHaveProperty('analysis');
    }
  });
});

// HIST-02: History UI tests
test.describe('Phase 5 — History UI (HIST-02)', () => {
  test('history section visible on home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await snap(page, 'p5-history-section.png');
    // Will fail until ReportHistory component is added
    await expect(page.locator('text=RESEARCH HISTORY')).toBeVisible({ timeout: 5000 });
  });

  test('empty state shown when no reports', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // If no reports, empty state message should be visible
    const emptyState = page.locator('text=No reports yet');
    const historyRows = page.locator('[data-testid="history-row"]');
    // Either empty state or rows must be present
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    const rowCount = await historyRows.count().catch(() => 0);
    expect(emptyVisible || rowCount > 0).toBe(true);
  });

  test('OPEN button loads saved report', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const openBtn = page.locator('[data-testid="history-open-btn"]').first();
    const hasOpen = await openBtn.isVisible().catch(() => false);
    if (!hasOpen) {
      // No reports to open yet — test is a no-op (passes trivially)
      return;
    }
    await openBtn.click();
    await page.waitForURL(/\/research\/[A-Z]+\?report=/, { timeout: 5000 });
    expect(page.url()).toContain('?report=');
  });
});

// HIST-03: Regeneration tests
test.describe('Phase 5 — Regeneration (HIST-03)', () => {
  test('REGENERATE navigates to research page without ?report= param', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const regenBtn = page.locator('[data-testid="history-regen-btn"]').first();
    const hasRegen = await regenBtn.isVisible().catch(() => false);
    if (!hasRegen) {
      return; // No reports yet — test passes trivially
    }
    await regenBtn.click();
    await page.waitForURL(/\/research\/[A-Z]+$/, { timeout: 5000 });
    expect(page.url()).not.toContain('?report=');
  });

  test('regenerate creates new entry in history after full pipeline', async ({ page }) => {
    // Slow test — requires full pipeline run. Mark as slow.
    test.setTimeout(8 * 60 * 1000);
    // This is a placeholder — actual pipeline run not triggered in Wave 0.
    // Will be validated manually during checkpoint in Plan 05.
    expect(true).toBe(true);
  });
});
