// Phase 18-00 Wave 0 stub — covers CORE-ML-05 (ESS column + EXPLORATORY-WATCH badge).
// Wave 3 (Plan 18-08) will remove the test.skip(true, ...) guards and add real DOM
// assertions against /research/AAPL once EngineCalibrationPanel renders ESS.
// Convention mirrors tests/e2e/engine-calibration-panel.spec.ts.

import { test, expect } from '@playwright/test';

test.describe('[e2e] EngineCalibrationPanel — ESS column + EXPLORATORY-WATCH badge', () => {
  test('research/AAPL renders ESS=<number> instead of n=<number> in calibration panel', async ({ page }) => {
    test.skip(true, 'Wave 3 Plan 08 fills this in');
    await page.goto('/research/AAPL');
    await expect(page.getByText(/ESS=\d+\.\d/)).toBeVisible();
  });
  test('research/AAPL — cell with status=EXPLORATORY-WATCH renders "regime stability: watching" badge', async ({ page }) => {
    test.skip(true, 'Wave 3 Plan 08 fills this in');
    await page.goto('/research/AAPL');
    await expect(page.getByText('regime stability: watching')).toBeVisible();
  });
  test('research/AAPL — DOM contains literal "ESS=" at least 4 times (one per signal class card)', async ({ page }) => {
    test.skip(true, 'Wave 3 Plan 08 fills this in');
    await page.goto('/research/AAPL');
    const matches = await page.getByText(/ESS=/).count();
    expect(matches).toBeGreaterThanOrEqual(4);
  });
});
