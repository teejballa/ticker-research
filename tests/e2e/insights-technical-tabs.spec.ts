// tests/e2e/insights-technical-tabs.spec.ts
// Phase 16-05 — Playwright spec for the 4-tab strip on /insights and the
// new Technical Pattern Library + Horizon Brier tabs.

import { test, expect } from '@playwright/test';

test.describe('insights — Technical tabs', () => {
  test('renders 4 tabs in correct order with NEW markers on tabs 3 and 4', async ({ page }) => {
    await page.goto('/insights');

    // Wait for the dashboard to mount past the loading state.
    await page.waitForSelector('[role="tablist"][aria-label="Insights views"]', { timeout: 30_000 });

    const tabs = page.locator('[role="tablist"][aria-label="Insights views"] [role="tab"]');
    await expect(tabs).toHaveCount(4);

    const labels = await tabs.allInnerTexts();
    expect(labels[0]).toContain('Diffusion Library');
    expect(labels[1]).toContain('Live Diffusion Map');
    expect(labels[2]).toContain('Technical Pattern Library');
    expect(labels[3]).toContain('Horizon Brier');

    // Tabs 3 + 4 are NEW.
    expect(labels[2]).toContain('NEW');
    expect(labels[3]).toContain('NEW');
  });

  test('Technical Pattern Library tab shows 8 TechPattern rows with 30d★ as default horizon', async ({ page }) => {
    await page.goto('/insights#technical-library');
    await page.waitForSelector('[role="tablist"][aria-label="Insights views"]', { timeout: 30_000 });

    // Section header
    await expect(page.getByText('Technical Pattern Library — 30d horizon')).toBeVisible();

    // Default horizon button shows the 30d★ marker
    const horizonControl = page.locator('[role="tablist"][aria-label="Horizon"]');
    await expect(horizonControl).toBeVisible();
    await expect(horizonControl.getByText('30d★', { exact: false })).toBeVisible();

    // First-30-days notice copy is present verbatim
    await expect(
      page.getByText('Technical priors mature in ~30–60 days post-launch.', { exact: false }),
    ).toBeVisible();

    // 8 TechPattern row labels visible
    const expected = [
      'BREAKOUT UPTREND',
      'OVERBOUGHT UPTREND',
      'PULLBACK IN UPTREND',
      'CONSOLIDATION',
      'BREAKDOWN',
      'OVERSOLD DOWNTREND',
      'DEATH CROSS',
      'GOLDEN CROSS',
    ];
    for (const label of expected) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test('Horizon Brier tab renders chart or empty-state copy', async ({ page }) => {
    await page.goto('/insights#horizon-brier');
    await page.waitForSelector('[role="tablist"][aria-label="Insights views"]', { timeout: 30_000 });

    // Section header
    await expect(page.getByText('Brier score per ACTIVE TechPattern across horizons')).toBeVisible();

    // Either the chart SVG is visible OR the empty-state copy is shown.
    const empty = page.getByText('No ACTIVE technical patterns yet', { exact: false });
    const chart = page.locator('svg[aria-label="Brier score by horizon"]');
    await expect(empty.or(chart).first()).toBeVisible();
  });
});
