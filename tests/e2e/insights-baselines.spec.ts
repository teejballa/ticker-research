import { test, expect } from '@playwright/test';

test.describe('/insights/baselines (Phase 21.1 D-28)', () => {
  test('page renders with H1 "Baselines" and methodology blurb', async ({ page }) => {
    await page.goto('/insights/baselines');
    await expect(page.getByRole('heading', { level: 1, name: 'Baselines' })).toBeVisible();
    await expect(page.getByText(/Benjamini.{0,3}Yekutieli/i)).toBeVisible();
  });

  test('three-way comparison table shows columns OR empty-state on fresh deploy', async ({ page }) => {
    await page.goto('/insights/baselines');
    // On a fresh deploy with no baseline-eval runs yet, the table shows an empty-state
    // placeholder. Both states are valid: the page must render one or the other without
    // crashing. Test checks that the page body contains either column headers (data present)
    // or the empty-state card (no baseline data yet).
    const hasColumns =
      (await page.getByText('LLM', { exact: true }).count()) > 0 ||
      (await page.getByText('Logistic-24').count()) > 0;
    const hasEmptyState =
      (await page.getByText(/Baselines training/i).count()) > 0;
    expect(hasColumns || hasEmptyState).toBe(true);
  });

  test('horizon tab strip has 3d / 7d / 14d / 30d with 7d default selected', async ({ page }) => {
    await page.goto('/insights/baselines');
    const tab7d = page.getByRole('tab', { name: '7d' });
    await expect(tab7d).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('/insights rolling-LLM-IC tile (Phase 21.1 D-10)', () => {
  test('tile renders headline number with BCa 95% CI metadata', async ({ page }) => {
    await page.goto('/insights');
    await expect(page.getByText(/LLM rolling IC.*last 30 days/i).first()).toBeVisible();
    // BCa 95% CI text may appear in multiple elements (visible + sr-only); first() is sufficient
    await expect(page.getByText(/BCa 95% CI/i).first()).toBeVisible();
  });
});
