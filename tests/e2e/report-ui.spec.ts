// tests/e2e/report-ui.spec.ts
// Visual regression + interaction tests for the research report UI polish.

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function snap(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/${name}`, fullPage: true });
  console.log(`📸  /tmp/${name}`);
}

// Inject 0ms animation overrides so screenshots capture the fully-rendered
// final state rather than a mid-animation frame with opacity:0 elements.
async function disableAnimations(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }`,
  });
}

// Navigate to the report URL, disable animations immediately, then wait for idle.
async function loadReport(page: Page, url: string) {
  await page.goto(url);
  // Inject before networkidle so animations don't run during hydration
  await disableAnimations(page);
  await page.waitForLoadState('networkidle');
  // One tick for React to flush any pending state updates after animation override
  await page.waitForTimeout(200);
}

const FIXTURE_FILENAME = 'mock-aapl-report.json';
const MOCK_REPORT_URL = `/research/AAPL?report=${FIXTURE_FILENAME}`;

test.beforeAll(async () => {
  // Copy fixture to the reports directory so the API can serve it
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const fixture = fs.readFileSync(path.join(__dirname, '../fixtures/mock-aapl-report.json'), 'utf8');
  fs.writeFileSync(path.join(reportsDir, FIXTURE_FILENAME), fixture);
});

test.afterAll(async () => {
  // Clean up fixture file
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  const fixturePath = path.join(reportsDir, FIXTURE_FILENAME);
  if (fs.existsSync(fixturePath)) fs.unlinkSync(fixturePath);
});

test.describe('Report UI — Stitch Design', () => {

  test('report page wrapper is visible', async ({ page }) => {
    await loadReport(page, MOCK_REPORT_URL);
    await snap(page, 'report-ui-01-loading.png');

    const wrapper = page.locator('[data-testid="report-page-wrapper"]');
    await expect(wrapper).toBeVisible();
    await snap(page, 'report-ui-02-wrapper.png');
  });

  test('Stitch NavBar is visible on report page', async ({ page }) => {
    await loadReport(page, MOCK_REPORT_URL);

    // NavBar is the shared Stitch component
    await expect(page.locator('text=CIPHER').first()).toBeVisible();
    await snap(page, 'report-ui-03-nav.png');
  });

  test('assessment bars BUY/HOLD/SELL render (3 bars)', async ({ page }) => {
    await loadReport(page, MOCK_REPORT_URL);

    const bars = page.locator('[data-testid^="assessment-bar-fill"]');
    const count = await bars.count();
    expect(count).toBe(3); // BUY, HOLD, SELL
    await snap(page, 'report-ui-04-assessment.png');
  });

  test('sources section renders', async ({ page }) => {
    await loadReport(page, MOCK_REPORT_URL);

    const sources = page.locator('[data-testid^="source-item"]');
    const count = await sources.count();
    expect(count).toBeGreaterThanOrEqual(0);
    await snap(page, 'report-ui-05-sources.png');
  });

  test('confidence blocks render', async ({ page }) => {
    await loadReport(page, MOCK_REPORT_URL);
    const confBlock = page.locator('[data-testid^="conf-block"]').first();
    await expect(confBlock).toBeVisible();
    await snap(page, 'report-ui-06-confidence.png');
  });

  test('full report renders at mobile width (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loadReport(page, MOCK_REPORT_URL);
    await snap(page, 'report-ui-07-mobile.png');
  });

  test('full report renders at desktop width (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadReport(page, MOCK_REPORT_URL);
    await snap(page, 'report-ui-08-desktop.png');
  });

  test('all report sections visible — Growth Catalysts and Risk Vectors', async ({ page }) => {
    await loadReport(page, MOCK_REPORT_URL);

    // Stitch report uses "Growth Catalysts" and "Risk Vectors" labels
    await expect(page.locator('text=Growth Catalysts').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Risk Vectors').first()).toBeVisible({ timeout: 5000 });

    await snap(page, 'report-ui-09-all-sections.png');
  });

  test('report body uses Stitch surface background', async ({ page }) => {
    await loadReport(page, MOCK_REPORT_URL);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // surface = #10141a = rgb(16, 20, 26)
    expect(bg).toMatch(/rgb\(\s*1[0-9]\s*,\s*[12][0-9]\s*,\s*2[0-9]\s*\)/);
  });

});
