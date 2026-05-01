// tests/e2e/insights-insider.spec.ts
// Phase 17-05 — Playwright e2e for the Insider Pattern Library tab on /insights.
// AC4: /insights#insider-library renders the new tab with 8×3 grid or empty state.

import { test, expect } from '@playwright/test';

test('insider pattern library tab renders grid or empty state', async ({ page }) => {
  await page.goto('/insights#insider-library');

  // Wait for the tab strip to be present.
  await page.waitForSelector('[role="tablist"][aria-label="Insights views"]', { timeout: 30_000 });

  // Tab should be selected (aria-selected="true").
  await expect(
    page.getByRole('tab', { name: /Insider Pattern Library/i }),
  ).toHaveAttribute('aria-selected', 'true');

  // Grid renders (allow up to 10s for the API fetch + render) OR the empty state message.
  const grid = page.getByTestId('smart-money-grid');
  const empty = page.getByText(/No patterns yet/i);
  await expect(grid.or(empty)).toBeVisible({ timeout: 10_000 });

  // Section heading is visible.
  await expect(
    page.getByText('Insider Pattern Library', { exact: false }).first(),
  ).toBeVisible();

  // Primary 30d horizon star visible (default horizon = 30).
  const horizonControl = page.locator('[role="tablist"][aria-label="Horizon"]');
  await expect(horizonControl).toBeVisible();
  await expect(horizonControl.getByText('30d★', { exact: false })).toBeVisible();

  // Screenshot for visual confirmation — MUST read back via Read tool; attested in SUMMARY.md.
  await page.screenshot({ path: 'test-results/insights-insider.png', fullPage: true });
});

test('insider library deep link survives reload', async ({ page }) => {
  await page.goto('/insights#insider-library');
  await page.waitForSelector('[role="tablist"][aria-label="Insights views"]', { timeout: 30_000 });

  await page.reload();

  // After reload, the hash-based deep link should rehydrate to the same tab.
  await expect(
    page.getByRole('tab', { name: /Insider Pattern Library/i }),
  ).toHaveAttribute('aria-selected', 'true');
});
