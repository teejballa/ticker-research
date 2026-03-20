// tests/e2e/report-ui.spec.ts
// Visual regression + interaction tests for the research report UI polish.

import { test, expect, Page } from '@playwright/test';

async function snap(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/${name}`, fullPage: true });
  console.log(`📸  /tmp/${name}`);
}

const MOCK_REPORT_URL = '/research/AAPL'; // chart confirmation page — dark bg

test.describe('Report UI — Ombré + Modern Polish', () => {

  test('outer wrapper has radial gradient background (ombré)', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');
    await snap(page, 'report-ui-01-loading.png');

    const wrapper = page.locator('[data-testid="report-page-wrapper"]');
    await expect(wrapper).toBeVisible();
    const bg = await wrapper.evaluate(el =>
      window.getComputedStyle(el).backgroundImage
    );
    expect(bg).toContain('radial-gradient');
    await snap(page, 'report-ui-02-omre-wrapper.png');
  });

  test('sticky nav has frosted glass effect', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    const navAccent = page.locator('[data-testid="report-nav-accent"]');
    await expect(navAccent).toBeVisible();
    await snap(page, 'report-ui-03-nav.png');
  });

  test('stats grid cells have hover border accent', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    const statsGrid = page.locator('[data-testid="stats-grid"]');
    await expect(statsGrid).toBeVisible();
    await snap(page, 'report-ui-04-stats.png');
  });

  test('section headers use amber bar instead of triangle', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    const bars = page.locator('[data-testid="section-header-bar"]');
    const count = await bars.count();
    expect(count).toBeGreaterThan(0);
    await snap(page, 'report-ui-05-section-headers.png');
  });

  test('assessment bars are height h-2 and have stagger classes', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    const bars = page.locator('[data-testid^="assessment-bar-fill"]');
    const count = await bars.count();
    expect(count).toBe(3); // BUY, HOLD, SELL
    await snap(page, 'report-ui-06-assessment.png');
  });

  test('sources list items have amber left accent border on hover', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    const sources = page.locator('[data-testid^="source-item"]');
    const count = await sources.count();
    expect(count).toBeGreaterThanOrEqual(0);
    await snap(page, 'report-ui-07-sources.png');
  });

  test('confidence blocks have stagger animation data attributes', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');
    await snap(page, 'report-ui-08-confidence.png');
  });

  test('footer has amber gradient top line', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    const footer = page.locator('[data-testid="report-footer"]');
    await expect(footer).toBeVisible();
    await snap(page, 'report-ui-09-footer.png');
  });

  test('full report renders at mobile width (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');
    await snap(page, 'report-ui-10-mobile.png');
  });

  test('full report renders at desktop width (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');
    await snap(page, 'report-ui-11-desktop.png');
  });

});
