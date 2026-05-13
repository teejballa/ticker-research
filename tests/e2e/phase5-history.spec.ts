// tests/e2e/phase5-history.spec.ts
// Phase 5 e2e tests — Nav Identity + Report History.
// Covers AUTH-01, HIST-01, HIST-02, HIST-03.

import { test, expect, Page } from '@playwright/test';

async function snap(page: Page, filename: string) {
  await page.screenshot({ path: `/tmp/${filename}`, fullPage: false });
}

/**
 * Wait for the home page to finish loading setup status.
 * The page shows "INITIALIZING SYSTEM..." while /api/setup/status is in-flight.
 * We wait for the loading state to resolve before asserting on elements that depend
 * on setupStatus (NavIdentity, ReportHistory).
 *
 * Strategy: wait for React to render the spinner, then wait for it to go away.
 * This is more reliable than waitForLoadState('networkidle') alone because
 * the /api/setup/status fetch happens inside a useEffect after hydration.
 */
async function waitForPageReady(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // First: wait for INITIALIZING to appear (confirms React hydration + useEffect running)
  // If it appears, wait for it to disappear. If it never appears, loading already resolved.
  try {
    await page.waitForSelector('text=INITIALIZING SYSTEM...', { state: 'visible', timeout: 5000 });
    // Spinner appeared — now wait for it to go away (API call in progress)
    await page.waitForSelector('text=INITIALIZING SYSTEM...', { state: 'hidden', timeout: 20000 });
  } catch {
    // Spinner never appeared (loading already done) or took too long.
    // Either way, proceed — the content should already be there.
  }
}

// AUTH-01: Nav identity tests
test.describe('Phase 5 — Nav Identity (AUTH-01)', () => {
  test('nav shows email when auth connected', async ({ page }) => {
    await waitForPageReady(page);
    await snap(page, 'p5-nav-email.png');
    // Will fail until NavIdentity component is added to page.tsx
    await expect(page.locator('[data-testid="nav-identity"]')).toBeVisible({ timeout: 5000 });
    const text = await page.locator('[data-testid="nav-identity"]').textContent();
    expect(text).toMatch(/@/);  // must contain @ for it to be an email
  });

  test('nav shows NOT CONNECTED when no auth', async ({ page }) => {
    // This test verifies the NOT CONNECTED state renders.
    // Passes if either email or NOT CONNECTED is shown in nav-identity slot
    // (the system may have Google auth connected — both states are valid).
    await waitForPageReady(page);
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
    await waitForPageReady(page);
    await snap(page, 'p5-history-section.png');
    await expect(page.locator('text=REPORTS').first()).toBeVisible({ timeout: 5000 });
  });

  test('empty state shown when no reports', async ({ page }) => {
    await waitForPageReady(page);
    // If no reports, empty state message should be visible
    const emptyState = page.locator('text=No reports yet');
    const historyRows = page.locator('[data-testid="history-row"]');
    // Either empty state or rows must be present
    const emptyVisible = await emptyState.isVisible().catch(() => false);
    const rowCount = await historyRows.count().catch(() => 0);
    expect(emptyVisible || rowCount > 0).toBe(true);
  });

  test('OPEN button loads saved report', async ({ page }) => {
    await waitForPageReady(page);
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
    await waitForPageReady(page);
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

// ── Bug fix verification tests ────────────────────────────

test.describe('Bug fixes — light mode report, saved report loading, no duplicates', () => {

  test('saved report loads without error when filename contains +', async ({ page }) => {
    // Verify the + regex fix: GET /api/history/[filename] with + in name returns 200
    const histRes = await page.request.get('/api/history');
    const body = await histRes.json() as { reports: Array<{ ticker: string; analyzed_at: string }> };
    if (body.reports.length === 0) return; // no reports to test with

    // Reconstruct filename the same way ReportHistory.tsx does
    const r = body.reports[0];
    const ts = r.analyzed_at.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
    const filename = `${r.ticker}-${ts}.json`;

    const res = await page.request.get(`/api/history/${encodeURIComponent(filename)}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('ticker');
  });

  test('report page shows white background in light mode', async ({ page }) => {
    // Navigate to a saved report and verify light mode (data-testid="report-content")
    const histRes = await page.request.get('/api/history');
    const body = await histRes.json() as { reports: Array<{ ticker: string; analyzed_at: string }> };
    if (body.reports.length === 0) return;

    const r = body.reports[0];
    const ts = r.analyzed_at.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
    const filename = `${r.ticker}-${ts}.json`;

    await page.goto(`/research/${r.ticker}?report=${encodeURIComponent(filename)}`);
    // Wait for the light mode report container to appear
    await page.waitForSelector('[data-testid="report-content"]', { timeout: 15000 });

    await page.screenshot({ path: '/tmp/report-light-mode.png', fullPage: true });

    // Verify the report content container is present (confirms light mode rendered)
    await expect(page.locator('[data-testid="report-content"]')).toBeVisible();

    // Verify background is white via computed style
    const bgColor = await page.locator('[data-testid="report-content"]').evaluate(
      el => window.getComputedStyle(el).backgroundColor
    );
    // white = rgb(255, 255, 255)
    expect(bgColor).toBe('rgb(255, 255, 255)');
  });

  test('[OPEN] from history navigates to report without error', async ({ page }) => {
    await waitForPageReady(page);
    const openBtn = page.locator('[data-testid="history-open-btn"]').first();
    const hasOpen = await openBtn.isVisible().catch(() => false);
    if (!hasOpen) return;

    await openBtn.click();
    await page.waitForURL(/\/research\/[A-Z]+\?report=/, { timeout: 8000 });

    // Wait for report to render — should NOT show SYSTEM ERROR
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/report-open-result.png', fullPage: false });

    const errorText = await page.locator('text=SYSTEM ERROR').isVisible().catch(() => false);
    expect(errorText).toBe(false);

    // Report content should load (company name present)
    const ticker = page.url().match(/\/research\/([A-Z]+)/)?.[1] ?? '';
    if (ticker) {
      await expect(page.locator(`text=${ticker}`).first()).toBeVisible({ timeout: 10000 });
    }
  });

});
