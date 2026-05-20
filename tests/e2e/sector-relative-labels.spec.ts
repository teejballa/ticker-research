// tests/e2e/sector-relative-labels.spec.ts
//
// Phase 21 — Sector-Relative Outcome Labels (21-0-01 TDD red-phase scaffolding).
//
// Two Playwright specs covering the UI swap that 21-4-07 ships:
//   1. EngineCalibrationPanel on /research/AAPL surfaces sector-relative as the
//      headline number AND keeps SPY-alpha as a smaller "vs market" diagnostic.
//   2. /insights Overview region copy reads "beat its sector" inside an actual
//      landmark (region/heading/tab), not anywhere on the page — prevents
//      21-4-07 from satisfying the test by tacking a summary line elsewhere.
//
// Both tests currently fail because the UI swap hasn't shipped. 21-4-07 drives
// them green. The Playwright config compiles this file as a test target.

import { test, expect } from '@playwright/test';

test.describe('Phase 21 — Sector-relative outcome labels in UI', () => {
  test('EngineCalibrationPanel surfaces sector-relative as headline + SPY-alpha as vs-market diagnostic on /research/[ticker]', async ({ page }) => {
    await page.goto('/research/AAPL');

    // Sector-relative headline visible (primary). Match either the literal
    // word "sector" or an SPDR ETF code in the headline label.
    await expect(
      page.locator('text=/vs (sector|XL[A-Z]+)/i').first()
    ).toBeVisible({ timeout: 10000 });

    // SPY-alpha secondary diagnostic visible (smaller, labeled "vs market").
    // Both labels MUST co-exist during the migration window — Phase 21
    // intentionally keeps SPY-alpha reachable as a diagnostic.
    await expect(page.locator('text=/vs market/i').first()).toBeVisible();
  });

  test('/insights Overview region copy reads "beat its sector" inside an actual Overview landmark, not anywhere on the page', async ({ page }) => {
    await page.goto('/insights');
    await page.waitForLoadState('networkidle');

    // LANDMARK-SCOPED assertion (anti "teach to the test"): the copy MUST
    // appear inside a real Overview region — accessible-name "overview"
    // matched via role. Falls back to a heading-scoped match if the region
    // role isn't present, but bare text-anywhere is NOT acceptable. 21-4-07's
    // InsightsDashboard copy edit must place "beat its sector" inside an
    // Overview region/heading/tooltip — not a tacked-on summary line at the
    // bottom of the body.
    const overviewRegion = page.getByRole('region', { name: /overview/i });
    const overviewHeading = page.getByRole('heading', { name: /overview/i });
    const overviewTab = page.getByRole('tab', { name: /overview/i });

    // Prefer region; fall back to the heading's parent section if the region
    // role isn't applied.
    if ((await overviewRegion.count()) > 0) {
      await expect(overviewRegion).toContainText(/beat its sector/i);
    } else if ((await overviewHeading.count()) > 0) {
      // Heading sits inside its section — assert the section's text contains
      // the copy.
      const section = overviewHeading.locator('xpath=ancestor::section[1]');
      await expect(section).toContainText(/beat its sector/i);
    } else if ((await overviewTab.count()) > 0) {
      // Activate the Overview tab; its tabpanel must contain the copy.
      await overviewTab.click();
      const tabpanel = page.getByRole('tabpanel', { name: /overview/i });
      await expect(tabpanel).toContainText(/beat its sector/i);
    } else {
      throw new Error(
        'Phase 21 21-4-07 must expose an Overview region/heading/tab. None found — fix the InsightsDashboard markup before this test can pass.'
      );
    }

    // Absence-of-"S&P 500" is still asserted at the page level (broader sweep
    // is fine here — we want to be sure the old copy is gone everywhere).
    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toMatch(/beat the S&P 500/i);
  });
});
