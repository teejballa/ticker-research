// tests/e2e/insights-institutional.spec.ts
// Phase 17-05 — Playwright e2e for the Institutional Pattern Library tab on /insights.
// AC4: /insights#institutional-library renders the new tab with 8×3 grid or empty state.

import { test, expect } from '@playwright/test';

test('institutional pattern library tab renders grid or empty state', async ({ page }) => {
  await page.goto('/insights#institutional-library');

  // Wait for the tab strip to be present.
  await page.waitForSelector('[role="tablist"][aria-label="Insights views"]', { timeout: 30_000 });

  // Tab should be selected (aria-selected="true").
  await expect(
    page.getByRole('tab', { name: /Institutional Pattern Library/i }),
  ).toHaveAttribute('aria-selected', 'true');

  // Grid renders (allow up to 10s for the API fetch + render) OR the empty state message.
  const grid = page.getByTestId('smart-money-grid');
  const empty = page.getByText(/No patterns yet/i);
  await expect(grid.or(empty)).toBeVisible({ timeout: 10_000 });

  // Section heading is visible.
  await expect(
    page.getByText('Institutional Pattern Library', { exact: false }).first(),
  ).toBeVisible();

  // Primary 30d horizon star visible (default horizon = 30).
  const horizonControl = page.locator('[role="tablist"][aria-label="Horizon"]');
  await expect(horizonControl).toBeVisible();
  await expect(horizonControl.getByText('30d★', { exact: false })).toBeVisible();

  // Screenshot for visual confirmation — MUST read back via Read tool; attested in SUMMARY.md.
  await page.screenshot({ path: 'test-results/insights-institutional.png', fullPage: true });
});

test('institutional library deep link survives reload', async ({ page }) => {
  await page.goto('/insights#institutional-library');
  await page.waitForSelector('[role="tablist"][aria-label="Insights views"]', { timeout: 30_000 });

  await page.reload();

  // After reload, the hash-based deep link should rehydrate to the same tab.
  await expect(
    page.getByRole('tab', { name: /Institutional Pattern Library/i }),
  ).toHaveAttribute('aria-selected', 'true');
});
