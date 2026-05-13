// tests/e2e/engine-calibration-panel.spec.ts
// Phase 16-04 — Playwright e2e for the dual-class EngineCalibrationPanel +
// graceful fallback for old persisted reports + Technical Signals card adjacency.
//
// Strategy: write two fixture reports to ~/.cipher/reports (the local-mode
// persistence directory the existing report-ui spec uses) and load each via
// the `?report=<filename>` URL param. No live network or DB required.
//
// Locked acceptance criteria from 16-04 Task 5:
//   - Test 1: DIFFUSION + TECHNICAL columns + agreement badge visible
//   - Test 2: Horizon table 5 rows visible, 30d★ marker present
//   - Test 3: Footer note '30 days is the primary horizon' visible
//   - Test 4: Technical Signals card BEFORE Engine Calibration in DOM order
//   - Test 5: Graceful fallback when horizon_calibrations absent (legacy fixture)

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DUAL_CLASS_FIXTURE = 'mock-aapl-dual-class-report.json';
const LEGACY_FIXTURE = 'mock-aapl-legacy-report.json';

const DUAL_URL = `/research/AAPL?report=${DUAL_CLASS_FIXTURE}`;
const LEGACY_URL = `/research/AAPL?report=${LEGACY_FIXTURE}`;

const SCREENSHOT_DIR = 'test-results';

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

async function loadReport(page: Page, url: string) {
  await page.goto(url);
  await disableAnimations(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
}

test.beforeAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  for (const fname of [DUAL_CLASS_FIXTURE, LEGACY_FIXTURE]) {
    const fixture = fs.readFileSync(path.join(__dirname, '../fixtures', fname), 'utf8');
    fs.writeFileSync(path.join(reportsDir, fname), fixture);
  }
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.afterAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  for (const fname of [DUAL_CLASS_FIXTURE, LEGACY_FIXTURE]) {
    const p = path.join(reportsDir, fname);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test.describe('EngineCalibrationPanel — Phase 16 dual-class layout', () => {

  test('renders DIFFUSION + TECHNICAL columns + agreement badge', async ({ page }) => {
    await loadReport(page, DUAL_URL);

    // Engine Calibration section is visible
    await expect(page.locator('[data-testid="engine-calibration-panel"]')).toBeVisible();

    // Phase 16: dual-class column eyebrows present
    await expect(page.locator('text=DIFFUSION').first()).toBeVisible();
    await expect(page.locator('text=TECHNICAL').first()).toBeVisible();

    // Agreement badge: one of the 4 locked states
    const badge = page.locator('[data-testid="agreement-badge"]');
    await expect(badge).toBeVisible();
    const badgeText = (await badge.textContent())?.trim() ?? '';
    expect(['ALIGNED', 'MIXED', 'OPPOSED', 'UNKNOWN'].some(s => badgeText.includes(s))).toBe(true);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/engine-calibration-dual-class.png`, fullPage: false });
  });

  test('horizon table renders 5 rows with 30d primary marker', async ({ page }) => {
    await loadReport(page, DUAL_URL);

    const horizonTable = page.locator('[data-testid="horizon-table"]');
    await expect(horizonTable).toBeVisible();

    // Header column labels present
    await expect(horizonTable.locator('text=HORIZON')).toBeVisible();

    // 5 rows total — 7d, 14d, 30d, 60d, 90d (3d intentionally omitted)
    const rows = horizonTable.locator('tbody tr');
    await expect(rows).toHaveCount(5);

    // 30d row carries the ★ marker (rendered as a separate <span> with text-primary)
    const starMarker = horizonTable.locator('span[aria-label="primary horizon"]');
    await expect(starMarker).toBeVisible();
    expect((await starMarker.textContent())?.trim()).toBe('★');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/engine-calibration-horizon-table.png`, fullPage: false });
  });

  test('footer note mentions 30 days as primary horizon', async ({ page }) => {
    await loadReport(page, DUAL_URL);
    const panel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(panel).toContainText('30 days is the primary horizon');
  });

  test('Technical Signals card renders BEFORE EngineCalibrationPanel in DOM order', async ({ page }) => {
    await loadReport(page, DUAL_URL);

    const techCard = page.locator('[data-testid="technical-signals-card"]');
    const enginePanel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(techCard).toBeVisible();
    await expect(enginePanel).toBeVisible();

    // DOM ordering check via bounding boxes
    const techBox = await techCard.boundingBox();
    const engineBox = await enginePanel.boundingBox();
    expect(techBox).not.toBeNull();
    expect(engineBox).not.toBeNull();
    expect(techBox!.y).toBeLessThan(engineBox!.y);

    // Tech card has the locked TECHNICAL SIGNALS heading
    await expect(techCard).toContainText('TECHNICAL SIGNALS');
  });

  test('graceful fallback when horizon_calibrations absent', async ({ page }) => {
    // Use the legacy fixture (no horizon_calibrations, no technical_at_report)
    await loadReport(page, LEGACY_URL);

    // Engine panel still renders (legacy diffusion-only layout)
    const enginePanel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(enginePanel).toBeVisible();
    await expect(enginePanel).toContainText('Calibration vs. S&P 500');

    // Dual-class shell must NOT render — agreement badge absent
    await expect(page.locator('[data-testid="agreement-badge"]')).toHaveCount(0);

    // Horizon table absent
    await expect(page.locator('[data-testid="horizon-table"]')).toHaveCount(0);

    // Technical Signals card absent (no technical_at_report)
    await expect(page.locator('[data-testid="technical-signals-card"]')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/engine-calibration-degraded.png`, fullPage: false });
  });
});
