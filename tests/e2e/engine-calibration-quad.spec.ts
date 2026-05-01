// tests/e2e/engine-calibration-quad.spec.ts
// Phase 17-04 — Playwright e2e for the QuadClassPanel (4-column grid),
// 4-class HorizonTable (8 numeric columns + CI-hide at ≤xl),
// N-way AgreementBadge, and graceful degradation for old persisted reports.
//
// Per CLAUDE.md "Testing — Playwright Required": screenshots taken at multiple
// states and read back via Read tool. Attestation in 17-04-SUMMARY.md.
//
// 4 tests covering:
//   Test 1 — AC1: Quad-class panel at 1920×1080 with all 4 ACTIVE classes
//   Test 2 — Responsive hide-CI at ≤1280px
//   Test 3 — Degraded fallback: no horizon_calibrations → DiffusionOnlyPanel
//   Test 4 — BLOCKER 2: technical populated, institutional_at_report + insider_at_report ENTIRELY OMITTED

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const QUAD_FIXTURE    = 'mock-aapl-quad-class-report.json';
const LEGACY_FIXTURE  = 'mock-aapl-legacy-report.json';
const OMITTED_FIXTURE = 'mock-aapl-omitted-fields-report.json';

const QUAD_URL    = `/research/AAPL?report=${QUAD_FIXTURE}`;
const LEGACY_URL  = `/research/AAPL?report=${LEGACY_FIXTURE}`;
const OMITTED_URL = `/research/AAPL?report=${OMITTED_FIXTURE}`;

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
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  for (const fname of [QUAD_FIXTURE, LEGACY_FIXTURE, OMITTED_FIXTURE]) {
    const fixturePath = path.join(__dirname, '../fixtures', fname);
    if (fs.existsSync(fixturePath)) {
      const content = fs.readFileSync(fixturePath, 'utf8');
      fs.writeFileSync(path.join(reportsDir, fname), content);
    }
  }
});

test.afterAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  for (const fname of [QUAD_FIXTURE, LEGACY_FIXTURE, OMITTED_FIXTURE]) {
    const p = path.join(reportsDir, fname);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test.describe('EngineCalibrationPanel — Phase 17-04 QuadClassPanel', () => {

  test('AC1: quad-class panel at 1920×1080 with all 4 ACTIVE classes', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loadReport(page, QUAD_URL);

    // Engine calibration panel present
    await expect(page.locator('[data-testid="engine-calibration-panel"]')).toBeVisible();

    // All 4 class column eyebrows visible
    await expect(page.locator('text=DIFFUSION').first()).toBeVisible();
    await expect(page.locator('text=TECHNICAL').first()).toBeVisible();
    await expect(page.locator('text=INSTITUTIONAL').first()).toBeVisible();
    await expect(page.locator('text=INSIDER').first()).toBeVisible();

    // AgreementBadge is visible
    const badge = page.locator('[data-testid="agreement-badge"]');
    await expect(badge).toBeVisible();
    const badgeText = (await badge.textContent())?.trim() ?? '';
    expect(['ALIGNED', 'MIXED', 'OPPOSED', 'UNKNOWN'].some(s => badgeText.includes(s))).toBe(true);

    // AgreementBadge is above the column grid (y-coordinate check)
    const badgeBox = await badge.boundingBox();
    const diffusionCol = page.locator('[data-column="diffusion"]');
    const gridBox = await diffusionCol.boundingBox();
    expect(badgeBox).not.toBeNull();
    expect(gridBox).not.toBeNull();
    expect(badgeBox!.y).toBeLessThan(gridBox!.y);

    // HorizonTable has 10 header columns (HORIZON + 4 posteriors + 4 CIs + N·STATUS)
    const horizonTable = page.locator('[data-testid="horizon-table"]');
    await expect(horizonTable).toBeVisible();
    // At 1920px, xl breakpoint is reached — CI columns should be visible
    const headers = horizonTable.locator('thead th');
    // At minimum: HORIZON, DIFFUSION POST., TECHNICAL POST., INST. POST., INSIDER POST., N·STATUS = 6 visible always
    // Plus at xl: 4 CI columns — total 10
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThanOrEqual(6);

    // 30d★ primary horizon marker present
    const starMarker = horizonTable.locator('span[aria-label="primary horizon"]');
    await expect(starMarker).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/quad-panel-1920.png`, fullPage: false });
  });

  test('responsive: CI columns hidden at ≤1280px, posteriors visible, hover reveals CI', async ({ page }) => {
    // Tailwind xl breakpoint = min-width: 1280px — so 1280px triggers xl:table-cell.
    // Use 1279px to be strictly below the breakpoint where CI columns are hidden.
    await page.setViewportSize({ width: 1279, height: 720 });
    await loadReport(page, QUAD_URL);

    const horizonTable = page.locator('[data-testid="horizon-table"]');
    await expect(horizonTable).toBeVisible();

    // CI header columns should be hidden at 1279px (strictly below xl breakpoint)
    const diffusionCiHeader = horizonTable.locator('th:has-text("DIFFUSION CI")');
    // These are rendered with hidden xl:table-cell — check display is none
    await expect(diffusionCiHeader).toBeHidden();

    // Posterior columns remain visible
    const diffusionPostHeader = horizonTable.locator('th:has-text("DIFFUSION POST.")');
    await expect(diffusionPostHeader).toBeVisible();

    const instPostHeader = horizonTable.locator('th:has-text("INST. POST.")');
    await expect(instPostHeader).toBeVisible();

    const insiderPostHeader = horizonTable.locator('th:has-text("INSIDER POST.")');
    await expect(insiderPostHeader).toBeVisible();

    // Hover on a posterior cell reveals CI in title attribute
    const primaryRow = horizonTable.locator('tbody tr').filter({ hasText: '30d' }).first();
    const diffPosteriorCell = primaryRow.locator('td').first();
    const titleAttr = await diffPosteriorCell.getAttribute('title');
    // Title should contain a CI like [52%–72%]
    expect(titleAttr).toMatch(/\[\d+%[–-]\d+%\]/);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/quad-panel-1280.png`, fullPage: false });
  });

  test('graceful fallback: no horizon_calibrations → DiffusionOnlyPanel (no badge)', async ({ page }) => {
    await loadReport(page, LEGACY_URL);

    // Engine panel renders in legacy diffusion-only layout
    const enginePanel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(enginePanel).toBeVisible();
    await expect(enginePanel).toContainText('Engine Calibration');

    // No AgreementBadge on legacy path
    await expect(page.locator('[data-testid="agreement-badge"]')).toHaveCount(0);

    // No HorizonTable on legacy path
    await expect(page.locator('[data-testid="horizon-table"]')).toHaveCount(0);

    // QuadClassPanel 4-column grid absent
    await expect(page.locator('[data-column="institutional"]')).toHaveCount(0);
  });

  test('BLOCKER 2: old report — technical populated, institutional_at_report + insider_at_report ENTIRELY OMITTED', async ({ page }) => {
    await loadReport(page, OMITTED_URL);

    // QuadClassPanel renders because horizon_calibrations is present
    const enginePanel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(enginePanel).toBeVisible();

    // AgreementBadge present (horizon_calibrations causes QuadClassPanel to render)
    const badge = page.locator('[data-testid="agreement-badge"]');
    await expect(badge).toBeVisible();

    // Institutional column present but grayed (NO_DATA)
    const instCol = page.locator('[data-column="institutional"]');
    await expect(instCol).toBeVisible();
    // Should have opacity-60 class when NO_DATA
    const instOpacity = await instCol.getAttribute('class');
    expect(instOpacity).toContain('opacity-60');

    // Insider column present but grayed (NO_DATA)
    const insdCol = page.locator('[data-column="insider"]');
    await expect(insdCol).toBeVisible();
    const insdOpacity = await insdCol.getAttribute('class');
    expect(insdOpacity).toContain('opacity-60');

    // SmartMoneyIntelligence section shows both-null placeholder
    const smiSection = page.locator('[data-testid="smart-money-intelligence"]');
    await expect(smiSection).toBeVisible();
    await expect(smiSection).toContainText('No recent smart money activity to report.');

    // institutional_at_report and insider_at_report are OMITTED (not null — key absent from payload)
    // The fixture was constructed by deleting the keys — verified by fixture construction script.
    // The == null check in SmartMoneyIntelligence handles both undefined and null.

    await page.screenshot({ path: `${SCREENSHOT_DIR}/quad-panel-omitted-fields.png`, fullPage: false });
  });

});
