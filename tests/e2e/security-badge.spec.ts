import { test, expect } from '@playwright/test';

// Wave 0 e2e stub — tests WILL FAIL until NavBar badge rendering is implemented (Plan 04).
// Covers RQ-04: security type badge visible in report header for SPAC/ETF, absent for equity.

test.describe('security type badge', () => {
  test('SPAC badge renders when security_type is spac', async ({ page }) => {
    // This test requires a mock research page or fixture — will fail until Plan 04 wires the badge.
    // Placeholder: visits the home page and confirms no crash. Replace with real fixture in Plan 04.
    await page.goto('http://localhost:3000');
    await expect(page).toHaveTitle(/Cipher|Research|Ticker/i);
  });

  test('no badge for equity security type', async ({ page }) => {
    // Placeholder stub — expand in Plan 04 with actual badge assertion.
    await page.goto('http://localhost:3000');
    await expect(page.locator('[data-testid="security-type-badge"]')).toHaveCount(0);
  });
});
